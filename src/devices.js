// -----------------------------------------------------------------------------
// The Gladys devices built from what Wallos answers (src/wallos.js):
//
//   summary       one, "Wallos": monthly cost and estimated yearly cost of the
//                 active subscriptions (main currency), number of active
//                 subscriptions, days before the next payment and its name;
//   subscription  one per active subscription: price of one payment, days
//                 before the next payment, and that date in words.
//
// The platform id of a subscription is the id Wallos gives it: renaming a
// subscription keeps its device. Every feature is read-only, with
// should_poll: false: the readings run in the container (src/monitor.js).
//
// Couples checked against the Gladys front in test/gladys-rules.test.js.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CATEGORIES,
  DEVICE_FEATURE_TYPES as TYPES,
  DEVICE_FEATURE_UNITS as UNITS,
} from '@gladysassistant/integration-sdk';
import { NAMES } from './texts.js';

export const DEVICE_TYPES = {
  SUMMARY: 'summary',
  SUBSCRIPTION: 'subscription',
};

// The platform id of the one summary device.
export const SUMMARY_ID = 'wallos';

export const FEATURE_KEYS = {
  summary: ['monthly_cost', 'yearly_cost', 'active_count', 'days_next', 'next_name'],
  subscription: ['price', 'days_left', 'next_due'],
};

// Display bounds only (the core never applies them).
const MAX_AMOUNT = 1e12;
const MAX_COUNT = 100000;
const MAX_DAYS = 3660;

const CURRENCY_UNITS = { EUR: UNITS.EURO, USD: UNITS.DOLLAR, GBP: UNITS.POUND_STERLING };

/** The unit of an amount in this currency, or undefined. */
export const unitOf = (currency) => CURRENCY_UNITS[currency];

/** The platform id of an object: its Wallos id, kept to safe characters. */
export const platformIdOf = (id) => String(id).replace(/[^A-Za-z0-9-]/g, '_');

/** External ids of the device of an object and of its features. */
export function deviceIds(gladys, type, id) {
  const ids = gladys.externalIds(type, platformIdOf(id));
  return {
    device: ids.device,
    ...Object.fromEntries(FEATURE_KEYS[type].map((key) => [key, ids.feature(key)])),
  };
}

const feature = (name, externalId, category, type, extra) => ({
  name,
  external_id: externalId,
  category,
  type,
  read_only: true,
  has_feedback: false,
  ...extra,
});

/** The name of a device: the name in Wallos, with the currency when no unit says it. */
const nameOf = (name, currency) => (currency && !unitOf(currency) ? `${name} (${currency})` : name);

/**
 * The discovery payload of an object.
 * @param {object} gladys
 * @param {string} type one of DEVICE_TYPES
 * @param {object} item the summary or a subscription (src/wallos.js)
 * @param {string} language of the feature names
 */
export function buildDevice(gladys, type, item, language = 'fr') {
  const ids = deviceIds(gladys, type, type === DEVICE_TYPES.SUMMARY ? SUMMARY_ID : item.id);
  const names = NAMES[language] ?? NAMES.fr;
  const unit = unitOf(item.currency);
  const money = (key) =>
    feature(names[key], ids[key], CATEGORIES.CURRENCY, TYPES.CURRENCY.DECIMAL, {
      keep_history: true,
      min: 0,
      max: MAX_AMOUNT,
      ...(unit ? { unit } : {}),
    });
  const days = (key) =>
    feature(names[key], ids[key], CATEGORIES.DURATION, TYPES.DURATION.INTEGER, {
      unit: UNITS.DAYS,
      keep_history: false,
      min: 0,
      max: MAX_DAYS,
    });
  const text = (key) =>
    feature(names[key], ids[key], CATEGORIES.TEXT, TYPES.TEXT.TEXT, {
      keep_history: false,
      min: 0,
      max: 0,
    });
  const features =
    type === DEVICE_TYPES.SUMMARY
      ? [
          money('monthly_cost'),
          money('yearly_cost'),
          feature(
            names.active_count,
            ids.active_count,
            CATEGORIES.COUNTER_SENSOR,
            TYPES.SENSOR.INTEGER,
            { keep_history: true, min: 0, max: MAX_COUNT },
          ),
          days('days_next'),
          text('next_name'),
        ]
      : [money('price'), days('days_left'), text('next_due')];
  return {
    name: type === DEVICE_TYPES.SUMMARY ? 'Wallos' : nameOf(item.name, item.currency),
    external_id: ids.device,
    model: type === DEVICE_TYPES.SUMMARY ? 'Wallos' : 'Wallos subscription',
    should_poll: false,
    params: [],
    features,
  };
}
