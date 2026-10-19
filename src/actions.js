// -----------------------------------------------------------------------------
// The scene action `read_payments` and the configuration action `check_now`.
// They read Wallos again when the last cycle is older than one interval, and
// answer with a sentence a scene can send by message or read aloud.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { upcoming } from './monitor.js';
import { PHRASES, STATUS, formatAmount, render, when } from './texts.js';
import { localDay } from './wallos.js';

const logger = createLogger({ name: 'wallos-actions' });

export const SCENE_ACTIONS = { PAYMENTS: 'read_payments' };
export const CONFIG_ACTION = 'check_now';
export const PAYMENT_WINDOWS = ['7', '14', '31'];

/** The snapshot, or the reason there is none, thrown in the language of the configuration. */
async function snapshotOf(monitor) {
  const snapshot = await monitor.fresh();
  if (!snapshot || monitor.problem) {
    const problem = monitor.problem ?? 'unreachable';
    // The last values are better than nothing for a reading, but not a refused key.
    if (!snapshot || problem !== 'unreachable') {
      throw new Error(STATUS[monitor.config.language][problem]);
    }
  }
  return snapshot;
}

/**
 * Scene action: the payments due within `days` (7 by default), soonest
 * first. Outputs `text`, `count` and `total` (in the main currency).
 */
export async function readPayments(monitor, fields = {}) {
  const snapshot = await snapshotOf(monitor);
  const language = monitor.config.language;
  const phrases = PHRASES[language];
  const window = PAYMENT_WINDOWS.includes(String(fields.days)) ? Number(fields.days) : 7;
  const today = localDay(monitor.now());
  const due = upcoming(snapshot, today).filter((item) => item.days <= window);
  // The total counts each subscription once, converted to the main currency.
  const total =
    Math.round(due.reduce((sum, item) => sum + (item.price ?? 0) / item.rate, 0) * 100) / 100 || 0;
  if (due.length === 0) {
    return { text: phrases.noPayment({ days: window }), count: 0, total: 0 };
  }
  const parts = due.map((item) =>
    phrases.payment({
      name: item.name,
      amount: formatAmount(item.price, item.currency, language),
      when: when(item.days, language),
    }),
  );
  parts.push(phrases.total({ amount: formatAmount(total, snapshot.currency, language) }));
  return { text: `${parts.join('. ')}.`, count: due.length, total };
}

/** Configuration action: a reading now, and what Wallos holds, in every language. */
export async function checkNow(monitor) {
  const snapshot = await monitor.fresh(true);
  if (monitor.problem || !snapshot) {
    logger.info(`Connection test: failed (${monitor.problem ?? 'unreachable'})`);
    return render(STATUS, monitor.problem ?? 'unreachable');
  }
  logger.info('Connection test: Wallos answers');
  return Object.fromEntries(
    Object.entries(STATUS).map(([language, table]) => [
      language,
      table.summary({
        version: snapshot.version,
        count: snapshot.summary.activeCount,
        monthly: formatAmount(snapshot.summary.monthlyCost, snapshot.currency, language),
      }),
    ]),
  );
}
