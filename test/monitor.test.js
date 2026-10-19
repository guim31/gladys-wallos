// -----------------------------------------------------------------------------
// The refresh cycle against the recorded Wallos answers: devices, states of the
// devices added in Gladys, connection status, the scene trigger, the
// container's own timer, and what is kept under /data.
//
// The fixtures (Wallos 5.10.0, read on 19/10/2026): Box internet 29.99 € due
// today, Netflix 13.49 € tomorrow, Spotify 11.12 € in 3 days (monthly), Gym
// 9.50 € every 2 weeks in 7 days, Domain name 15 $ yearly (rate 1.08), a
// one-time Concert ticket 59 € on 15/11, and an inactive Old magazine.
// -----------------------------------------------------------------------------

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  API_KEY,
  CONFIG,
  createAll,
  createApi,
  createWorld,
  cycle,
  deviceOf,
  featureId,
} from './helpers/world.js';
import { registerHandlers } from '../src/app.js';
import { Store } from '../src/store.js';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';

async function world(t, options = {}) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

const last = (w, type, id, key) => w.fake.lastState(featureId(deviceOf(w, type, id), key));
// Intl separates thousands and currencies with narrow no-break spaces.
const plain = (value) => JSON.parse(JSON.stringify(value).replace(/[\u00a0\u202f]/g, ' '));
const events = (w) => plain(w.fake.sceneEvents.filter((event) => event.key === 'payment_due'));
const isSubscription = (id) => (device) => device.external_id.endsWith(`:subscription:${id}`);

test('the requests are POST forms carrying the key, never in the URL', async (t) => {
  const w = await world(t);
  assert.deepEqual(w.api.routes(), [
    'status/version.php',
    'currencies/get_currencies.php',
    'subscriptions/get_subscriptions.php',
  ]);
  for (const { url, options } of w.api.requests) {
    assert.equal(options.method, 'POST');
    assert.equal(new URLSearchParams(options.body).get('api_key'), API_KEY);
    assert.equal(url.search, '');
  }
  assert.equal(w.fake.connectionStatus.connected, true);
});

test('the inactive subscription is left out; names and units', async (t) => {
  const w = await world(t);
  assert.equal(deviceOf(w, 'subscription', 6), undefined, 'inactive');
  assert.equal(deviceOf(w, 'subscription', 1).name, 'Netflix');
  assert.equal(featureId(deviceOf(w, 'subscription', 1), 'price').endsWith(':price'), true);
  assert.equal(deviceOf(w, 'subscription', 1).features[0].unit, 'euro');
  assert.equal(deviceOf(w, 'subscription', 3).features[0].unit, 'dollar');
  assert.equal(deviceOf(w, 'summary', 'wallos').name, 'Wallos');
});

test('only the devices added in Gladys get states, with the values of Wallos', async (t) => {
  const w = await world(t);
  assert.equal(w.fake.states.length, 0);
  await createAll(w);
  // 29.99 + 13.49 + 11.12 + 9.50 × 4.35 / 2 + 15 / 12 / 1.08 (+ 0 for the one-time).
  assert.equal(last(w, 'summary', 'wallos', 'monthly_cost'), 76.42);
  assert.equal(last(w, 'summary', 'wallos', 'yearly_cost'), 917.04);
  assert.equal(last(w, 'summary', 'wallos', 'active_count'), 6);
  assert.equal(last(w, 'summary', 'wallos', 'days_next'), 0);
  assert.equal(last(w, 'summary', 'wallos', 'next_name'), 'Box internet · 19/10/2026');
  assert.equal(last(w, 'subscription', 1, 'price'), 13.49);
  assert.equal(last(w, 'subscription', 1, 'days_left'), 1);
  assert.equal(last(w, 'subscription', 1, 'next_due'), '20/10/2026');
  assert.equal(last(w, 'subscription', 3, 'days_left'), 133);
  assert.equal(last(w, 'subscription', 7, 'days_left'), 27);
});

test('a payment date in the past: no day count, the date stays', async (t) => {
  const api = createApi();
  api.subscription(1).next_payment = '2026-10-10';
  const w = await world(t, { api });
  await createAll(w, isSubscription(1));
  assert.equal(last(w, 'subscription', 1, 'days_left'), undefined);
  assert.equal(last(w, 'subscription', 1, 'next_due'), '10/10/2026');
});

test('an unchanged cycle publishes nothing, a new price publishes only it', async (t) => {
  const w = await world(t);
  await createAll(w, isSubscription(1));
  const before = w.fake.states.length;
  await cycle(w);
  assert.equal(w.fake.states.length, before);
  w.api.subscription(1).price = 15.99;
  await cycle(w);
  assert.deepEqual(
    w.fake.states.slice(before).map((s) => [s.device_feature_external_id, s.state]),
    [[featureId(deviceOf(w, 'subscription', 1), 'price'), 15.99]],
  );
});

test('the container reads Wallos on its own timer, without onPoll', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const api = createApi();
  const gladys = createFakeGladys({ config: CONFIG });
  const app = registerHandlers(gladys, {
    store: new Store(mkdtempSync(join(tmpdir(), 'gladys-wallos-'))),
    request: api.request,
  });
  t.after(() => app.stop());
  await gladys.connect();
  await app.ready;
  await app.monitor.running;
  const first = api.requests.length;
  // One hour by default.
  t.mock.timers.tick(60 * 60 * 1000);
  await app.monitor.running;
  assert.equal(api.requests.length, first * 2);
  assert.equal(
    gladys.fake.discoveredDevices.every((device) => device.should_poll === false),
    true,
  );
});

test('onDeviceCreated publishes the states of the new device and refreshes the widget', async (t) => {
  const w = await world(t);
  const refreshes = w.fake.widgetRefreshes.length;
  w.clock.advance(20000);
  await w.fake.deviceCreated(deviceOf(w, 'subscription', 2));
  assert.equal(last(w, 'subscription', 2, 'price'), 11.12);
  assert.equal(w.fake.widgetRefreshes.length, refreshes + 1);
});

test('payment due: every active subscription, on the day of each level, once', async (t) => {
  const w = await world(t);
  // Nothing added in Gladys: the trigger covers every active subscription.
  assert.deepEqual(
    events(w).map((e) => [e.data.name, e.data.days]),
    [
      ['Box internet', '0'],
      ['Netflix', '1'],
      ['Spotify', '3'],
      ['Gym', '7'],
    ],
  );
  assert.deepEqual(events(w)[1].data, {
    device: deviceOf(w, 'subscription', 1).external_id,
    days: '1',
    name: 'Netflix',
    price: 13.49,
    currency: 'EUR',
    due_date: '2026-10-20',
    text: 'Netflix : 13,49 € à payer demain.',
  });
  await cycle(w);
  assert.equal(events(w).length, 4, 'once');
  await cycle(w, 24 * 60);
  assert.deepEqual(
    events(w)
      .slice(4)
      .map((e) => [e.data.name, e.data.days, e.data.text]),
    [['Netflix', '0', "Netflix : 13,49 € à payer aujourd'hui."]],
  );
});

test('the trigger speaks the language of the configuration', async (t) => {
  const w = await world(t, { config: { ...CONFIG, language: 'de' } });
  assert.equal(events(w)[1].data.text, 'Netflix: 13,49 € fällig morgen.');
});

test('what was fired survives a restart', async (t) => {
  const first = await createWorld();
  await first.app.stop();
  assert.equal(events(first).length, 4);
  const again = await world(t, { dataDir: first.dataDir });
  await cycle(again);
  assert.equal(events(again).length, 0);
});

test('a failed scene event is sent again at the next cycle', async (t) => {
  const api = createApi();
  const gladys = createFakeGladys({ config: CONFIG });
  const original = gladys.publishSceneEvent.bind(gladys);
  let fail = true;
  t.mock.method(gladys, 'publishSceneEvent', async (...args) => {
    if (fail) {
      throw new Error('HTTP 429');
    }
    return original(...args);
  });
  const app = registerHandlers(gladys, {
    store: new Store(mkdtempSync(join(tmpdir(), 'gladys-wallos-'))),
    request: api.request,
    timers: false,
    now: () => Date.parse('2026-10-19T14:00:00+02:00'),
  });
  t.after(() => app.stop());
  await gladys.connect();
  await app.ready;
  await app.monitor.running;
  assert.equal(gladys.fake.sceneEvents.length, 0);
  fail = false;
  await app.monitor.runCycle();
  assert.equal(gladys.fake.sceneEvents.length, 4);
});

test('connection status: key refused, unreachable, certificate, then back', async (t) => {
  const w = await world(t, { config: { ...CONFIG, api_key: 'wrong' } });
  assert.equal(w.fake.connectionStatus.connected, false);
  assert.match(w.fake.connectionStatus.message.fr, /refuse la clé/);
  assert.deepEqual(w.fake.discoveredDevices, []);

  await w.fake.configUpdated(CONFIG);
  assert.equal(w.fake.connectionStatus.connected, true);
  const devices = w.fake.discoveredDevices.length;

  w.api.down = 'network';
  await cycle(w);
  assert.equal(w.fake.connectionStatus.connected, false);
  assert.match(w.fake.connectionStatus.message.en, /does not answer/);
  assert.equal(w.fake.discoveredDevices.length, devices, 'the devices stay');

  w.api.down = 'certificate';
  await cycle(w);
  assert.match(w.fake.connectionStatus.message.en, /self-signed certificate/);

  w.api.down = false;
  await cycle(w);
  assert.equal(w.fake.connectionStatus.connected, true);
});

test('no address or no key: the status says so, nothing is requested', async (t) => {
  const w = await world(t, { config: {} });
  assert.equal(w.api.requests.length, 0);
  assert.match(w.fake.connectionStatus.message.en, /Enter the address/);
  const k = await world(t, { config: { url: CONFIG.url } });
  assert.equal(k.api.requests.length, 0);
  assert.match(k.fake.connectionStatus.message.en, /API key/);
});

test('a reconnection publishes the devices and the states again', async (t) => {
  const w = await world(t);
  await createAll(w);
  const before = w.fake.states.length;
  await w.gladys.disconnect();
  await w.gladys.connect();
  assert.ok(w.fake.states.length > before);
});

test('"Update" in the Discover tab publishes the states again', async (t) => {
  const w = await world(t);
  const [device] = await createAll(w, isSubscription(1));
  const before = w.fake.states.length;
  await w.fake.deviceUpdated(device);
  assert.equal(w.fake.states.length, before + 3);
});

test('a redirection (the login page) is not taken for a server down', async (t) => {
  const api = createApi();
  api.down = 302;
  const w = await world(t, { api });
  assert.match(w.fake.connectionStatus.message.en, /does not answer like the API/);
});

test('another server: the data of the previous one is dropped', async (t) => {
  const w = await world(t);
  assert.ok(w.monitor.snapshot);
  w.api.down = 'network';
  await w.fake.configUpdated({ ...CONFIG, url: 'http://192.0.2.99:8282' });
  assert.equal(w.monitor.snapshot, null);
});
