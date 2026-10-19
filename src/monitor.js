// -----------------------------------------------------------------------------
// The monitor: reads Wallos every `refresh_interval` minutes, publishes the
// devices and their states, fires the scene trigger and serves the widget and
// the actions.
//
// Devices are published with should_poll: false: the container runs its own
// timer (the core only polls up to one minute, and see the 5.2.0 trap in
// CLAUDE.md). Only the devices added in Gladys get states.
//
// Trigger payment_due: a payment of an active subscription is due in 0, 1, 3
// or 7 days; one event per subscription, payment date and number of days, on
// that day only (a level already past is not news). It covers every active
// subscription of Wallos, added to Gladys or not: the user already chose in
// Wallos what to follow, and the `device` filter of the trigger narrows it to
// one subscription added to Gladys. What was fired is kept under /data: a
// restart fires nothing twice.
//
// Money is private: the logs only ever hold counts, ids and day counts, never
// an amount, a name, the API key or the address of the server.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { PAYMENT_DAYS } from './config.js';
import { DEVICE_TYPES, SUMMARY_ID, buildDevice, deviceIds } from './devices.js';
import { PHRASES, STATUS, formatAmount, formatDay, render, when } from './texts.js';
import {
  NotWallosError,
  UnauthorizedError,
  WallosClient,
  daysBetween,
  isCertificateError,
  localDay,
} from './wallos.js';

const logger = createLogger({ name: 'wallos' });

export const WIDGET_KEY = 'upcoming';
export const TRIGGERS = { PAYMENT: 'payment_due' };

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

export const DEFAULT_TIMINGS = {
  heartbeatMs: 12 * HOUR,
  // requestWidgetRefresh is rate-limited to one call every 10 s by the core.
  widgetRefreshMs: 10000,
};

const DAYS = PAYMENT_DAYS.map(Number);

/**
 * The active subscriptions with a payment from `today` on, soonest first,
 * each with its `days` before the payment: their next payment only.
 */
export function upcoming(snapshot, today) {
  return (snapshot?.subscriptions ?? [])
    .filter((item) => item.nextDue !== null && item.nextDue >= today)
    .map((item) => ({ ...item, days: daysBetween(today, item.nextDue) }))
    .sort((a, b) => a.days - b.days || a.name.localeCompare(b.name));
}

export class Monitor {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK fake)
   * @param {object} options.store see src/store.js
   * @param {Function} [options.request] httpRequest (the tests pass a fake Wallos)
   * @param {boolean} [options.timers] false: no background timer (tests drive the cycles)
   * @param {Function} [options.now] clock in ms
   * @param {object} [options.timings] overrides of DEFAULT_TIMINGS
   */
  constructor({ gladys, store, request, timers = true, now, timings }) {
    this.gladys = gladys;
    this.store = store;
    this.request = request;
    this.timers = timers;
    this.now = now ?? (() => Date.now());
    this.timings = { ...DEFAULT_TIMINGS, ...timings };
    this.config = null;
    this.client = null;
    this.data = emptyData();
    this.snapshot = null;
    this.problem = null;
    this.lastSuccessAt = null;
    this.lastCycleAt = -Infinity;
    this.discovered = null;
    this.statusMessage = undefined;
    this.cycleTimer = null;
    this.running = null;
    this.lastRefreshAt = -Infinity;
    this.refreshTimer = null;
    this.signature = null;
    this.stopped = false;
    // Keys of the failures already logged, so a repeated one is not logged again.
    this.failing = new Set();
  }

  /** Log a failure once (warn or error), then at debug until `recovered(key)`. */
  failed(key, level, message) {
    if (this.failing.has(key)) {
      logger.debug(message);
      return;
    }
    this.failing.add(key);
    logger[level](message);
  }

  /** One line when a failure logged by `failed(key)` is over. */
  recovered(key, message) {
    if (this.failing.delete(key)) {
      logger.info(message);
    }
  }

  // --- Lifecycle -------------------------------------------------------------

  async start(config) {
    const saved = await this.store.load();
    if (saved?.version === 1) {
      const valid = (value) => value && typeof value === 'object' && !Array.isArray(value);
      this.data = { ...emptyData(), payments: valid(saved.payments) ? saved.payments : {} };
    }
    this.configure(config);
    logger.info(`Started: Wallos read every ${config.refreshMinutes} min`);
    this.schedule();
    this.runCycle();
  }

  configure(config) {
    this.config = config;
    this.client =
      config.url && config.apiKey
        ? new WallosClient({
            url: config.url,
            apiKey: config.apiKey,
            insecure: config.insecure,
            ...(this.request ? { request: this.request } : {}),
          })
        : null;
    if (!this.client) {
      this.problem = config.invalidUrl ? 'invalidUrl' : config.url ? 'noKey' : 'noUrl';
      logger.warn(
        config.invalidUrl
          ? 'The address of Wallos is not understood'
          : 'Address or API key of Wallos missing',
      );
    }
  }

  /** Reconnection: Gladys may have restarted, publish everything again. */
  async resync(config) {
    if (connectionOf(config) !== connectionOf(this.config)) {
      // The configuration changed while Gladys was away.
      await this.reconfigure(config);
      return;
    }
    this.config = config;
    this.discovered = null;
    await this.publishDiscovered();
    this.statusMessage = undefined;
    await this.updateConnectionStatus();
    this.gladys.forgetPublishedStates?.();
    await this.publishStates();
    this.requestRefresh();
  }

  async reconfigure(config) {
    await this.running;
    this.problem = null;
    this.failing.delete('wallos');
    logger.info('Configuration saved');
    if (connectionOf(config) !== connectionOf(this.config)) {
      // Another server or user: its data must not be shown under the old one.
      this.snapshot = null;
      this.signature = null;
      this.lastSuccessAt = null;
    }
    this.configure(config);
    // The language may have changed: the names of the next devices with it.
    this.discovered = null;
    this.schedule();
    await this.runCycle();
    this.requestRefresh();
  }

  async stop() {
    this.stopped = true;
    clearInterval(this.cycleTimer);
    clearTimeout(this.refreshTimer);
    this.cycleTimer = null;
    await this.running?.catch(() => {});
    await this.store.flush();
  }

  schedule() {
    if (!this.timers || this.stopped) {
      return;
    }
    clearInterval(this.cycleTimer);
    this.cycleTimer = setInterval(() => this.runCycle(), this.config.refreshMinutes * MINUTE);
    this.cycleTimer.unref?.();
  }

  // --- Devices ----------------------------------------------------------------

  /** Every object of the last snapshot with its type: [{ type, item, ids }]. */
  entries() {
    if (!this.snapshot) {
      return [];
    }
    return [
      {
        type: DEVICE_TYPES.SUMMARY,
        item: this.snapshot.summary,
        ids: deviceIds(this.gladys, DEVICE_TYPES.SUMMARY, SUMMARY_ID),
      },
      ...this.snapshot.subscriptions.map((item) => ({
        type: DEVICE_TYPES.SUBSCRIPTION,
        item,
        ids: deviceIds(this.gladys, DEVICE_TYPES.SUBSCRIPTION, item.id),
      })),
    ];
  }

  isCreated(externalId) {
    return (this.gladys.devices ?? []).some((device) => device.external_id === externalId);
  }

  /** Whether an external id is a device of this integration. */
  owns(externalId) {
    return this.entries().some((entry) => entry.ids.device === externalId);
  }

  // --- Cycles -----------------------------------------------------------------

  runCycle() {
    if (this.running || this.stopped) {
      return this.running;
    }
    this.running = this.cycle()
      .catch((err) => this.failed('cycle', 'error', `Refresh cycle failed: ${err.message}`))
      .finally(() => {
        this.running = null;
      });
    return this.running;
  }

  async cycle() {
    const now = this.now();
    this.lastCycleAt = now;
    if (!this.client) {
      await this.updateConnectionStatus();
      return;
    }
    try {
      this.snapshot = await this.client.snapshot();
      this.problem = null;
      this.lastSuccessAt = this.now();
      this.recovered('wallos', 'Wallos answers again');
    } catch (err) {
      this.problem = problemOf(err);
      this.failed('wallos', 'warn', err.message);
      await this.updateConnectionStatus();
      return;
    }
    logger.debug(`Refresh cycle: ${this.snapshot.subscriptions.length} active subscription(s)`);
    this.recovered('cycle', 'Refresh cycles work again');
    await this.publishDiscovered();
    await this.publishStates();
    await this.checkTriggers(localDay(now));
    this.store.save(this.data);
    await this.updateConnectionStatus();
    const signature = JSON.stringify(this.snapshot);
    if (signature !== this.signature) {
      this.signature = signature;
      this.requestRefresh();
    }
  }

  async publishDiscovered() {
    if (!this.config || !this.snapshot) {
      return;
    }
    const devices = this.entries().map(({ type, item }) =>
      buildDevice(this.gladys, type, item, this.config.language),
    );
    const signature = JSON.stringify(devices);
    if (signature === this.discovered) {
      return;
    }
    try {
      await this.gladys.publishDiscoveredDevices(devices);
      this.discovered = signature;
      this.recovered('discovery', 'Publishing the devices works again');
    } catch (err) {
      this.failed('discovery', 'warn', `Publishing the devices failed: ${err.message}`);
    }
  }

  /** The states of one object; absent values are not sent. */
  statesOf(type, item, ids, today) {
    const states = [];
    const add = (key, state) => {
      if (state !== null && state !== undefined) {
        states.push({ device_feature_external_id: ids[key], state });
      }
    };
    const addText = (key, text) => {
      // A text state is never empty, or the core ignores it.
      if (text) {
        states.push({ device_feature_external_id: ids[key], text });
      }
    };
    if (type === DEVICE_TYPES.SUMMARY) {
      const next = upcoming(this.snapshot, today)[0];
      add('monthly_cost', item.monthlyCost);
      add('yearly_cost', item.yearlyCost);
      add('active_count', item.activeCount);
      add('days_next', next?.days);
      addText(
        'next_name',
        // "–" rather than nothing: the last name would stay shown otherwise.
        next ? `${next.name} · ${formatDay(next.nextDue, this.config.language)}` : '–',
      );
      return states;
    }
    add('price', item.price);
    // A payment date in the past (auto-renewal off, or the cron of Wallos not
    // run yet): no day count rather than a negative one.
    if (item.nextDue !== null && item.nextDue >= today) {
      add('days_left', daysBetween(today, item.nextDue));
    }
    if (item.nextDue !== null) {
      addText('next_due', formatDay(item.nextDue, this.config.language));
    }
    return states;
  }

  async publishStates() {
    if (!this.snapshot) {
      return;
    }
    const today = localDay(this.now());
    const states = this.entries()
      .filter(({ ids }) => this.isCreated(ids.device))
      .flatMap(({ type, item, ids }) => this.statesOf(type, item, ids, today));
    if (states.length === 0) {
      return;
    }
    try {
      await this.gladys.publishChangedStates(states, { heartbeat: this.timings.heartbeatMs });
      this.recovered('publish', 'Publishing the states works again');
    } catch (err) {
      // Sent again at the next cycle (the SDK forgets what Gladys refused).
      this.failed('publish', 'warn', `Publishing the states failed: ${err.message}`);
    }
  }

  async updateConnectionStatus() {
    const connected = this.problem === null && this.lastSuccessAt !== null;
    const message = this.problem ? render(STATUS, this.problem) : undefined;
    const key = JSON.stringify([connected, message]);
    if (key === this.statusMessage) {
      return;
    }
    this.statusMessage = key;
    await this.gladys.setConnectionStatus(connected, message).catch(() => {});
  }

  // --- Scene triggers -----------------------------------------------------------

  async checkTriggers(today) {
    const language = this.config.language;
    const phrases = PHRASES[language];
    // On the day of each level, once per payment date.
    const payments = this.data.payments;
    for (const [key, due] of Object.entries(payments)) {
      if (due < today) {
        delete payments[key];
      }
    }
    for (const item of upcoming(this.snapshot, today)) {
      const key = `${item.id}|${item.nextDue}|${item.days}`;
      if (!DAYS.includes(item.days) || payments[key]) {
        continue;
      }
      const amount = formatAmount(item.price, item.currency, language);
      const sent = await this.fire(
        TRIGGERS.PAYMENT,
        `Subscription #${item.id} due in ${item.days} day(s)`,
        {
          device: deviceIds(this.gladys, DEVICE_TYPES.SUBSCRIPTION, item.id).device,
          days: String(item.days),
          name: item.name,
          price: item.price ?? 0,
          currency: item.currency ?? '',
          due_date: item.nextDue,
          text: phrases.paymentDue({ name: item.name, amount, when: when(item.days, language) }),
        },
      );
      if (sent) {
        payments[key] = item.nextDue;
      }
    }
  }

  async fire(key, line, data) {
    try {
      await this.gladys.publishSceneEvent(key, data);
      // Ids and day counts only: names and amounts stay out of the logs. After
      // the event: a retried event is not logged again at every cycle.
      logger.info(`Scene trigger: ${line}`);
      this.recovered('scene', 'Scene triggers work again');
      return true;
    } catch (err) {
      this.failed('scene', 'warn', `Firing the scene trigger failed: ${err.message}`);
      return false;
    }
  }

  // --- Gladys events --------------------------------------------------------------

  async onDeviceCreated(device) {
    if (!this.owns(device?.external_id)) {
      return;
    }
    // The SDK forgot the states of the device: everything is published again.
    await this.publishStates();
    this.requestRefresh();
  }

  /** onPoll fallback: should_poll is false, but a Gladys polling anyway gets an answer. */
  async poll(device) {
    if (!this.owns(device?.external_id)) {
      return;
    }
    if (this.now() - this.lastCycleAt >= (this.config.refreshMinutes * MINUTE) / 2) {
      await this.runCycle();
    } else {
      await this.publishStates();
    }
  }

  /** The snapshot, read again if the last cycle is older than one interval (or `force`). */
  async fresh(force = false) {
    await this.running;
    if (force || this.now() - this.lastCycleAt >= this.config.refreshMinutes * MINUTE) {
      await this.runCycle();
    }
    return this.snapshot;
  }

  // --- Widget -------------------------------------------------------------------

  requestRefresh() {
    if (this.stopped) {
      return;
    }
    const now = this.now();
    const wait = this.lastRefreshAt + this.timings.widgetRefreshMs - now;
    if (wait <= 0) {
      this.lastRefreshAt = now;
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
    } else if (this.timers && !this.refreshTimer) {
      this.refreshTimer = setTimeout(() => {
        this.refreshTimer = null;
        this.requestRefresh();
      }, wait);
      this.refreshTimer.unref?.();
    }
  }
}

/** What identifies the server and the reading pace of a configuration. */
const connectionOf = (config) =>
  config && JSON.stringify([config.url, config.apiKey, config.insecure, config.refreshMinutes]);

/** The STATUS key of a failed reading. */
export function problemOf(err) {
  if (err instanceof UnauthorizedError) {
    return 'unauthorized';
  }
  if (err instanceof NotWallosError) {
    return 'notWallos';
  }
  if (isCertificateError(err)) {
    return 'certificate';
  }
  return 'unreachable';
}

function emptyData() {
  return { version: 1, payments: {} };
}
