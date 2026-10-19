// -----------------------------------------------------------------------------
// Wallos client: the API of Wallos (`/api/.../*.php`) with the API key of the
// user (Wallos → Profile → API key), sent in a POST form so it never shows in
// an access log. Read endpoints only. One snapshot reads, in this order:
//
//   status/version.php                 version (and a check of the key)
//   currencies/get_currencies.php      main currency, codes and exchange rates
//   subscriptions/get_subscriptions.php every subscription of the user
//
// `subscriptions/get_monthly_cost.php` is not used: on Wallos 5.10.0 it adds
// a one-time payment to every month before its date (the cycle 5 falls back
// on "+1 month"). The monthly cost is computed here with the formula of the
// Wallos statistics page (getPricePerMonth), converted with its rates.
//
// Wallos answers HTTP 200 even to a wrong key, with `success: false` and the
// title "Invalid API key". Shapes recorded on Wallos 5.10.0:
// test/fixtures/wallos. Nothing of an answer is logged (see src/monitor.js).
// -----------------------------------------------------------------------------

import { httpRequest } from './http.js';

export class UnauthorizedError extends Error {}
export class NotWallosError extends Error {}

/** A request that did not reach Wallos, with a reason fit for the logs. */
export class UnreachableError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

const CERTIFICATE_CODES = new Set([
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'CERT_HAS_EXPIRED',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

/** Whether an error is a certificate the user could choose to trust. */
export const isCertificateError = (err) => CERTIFICATE_CODES.has(err?.code);

// Payment cycles of Wallos (table `cycles`).
export const CYCLES = { DAY: 1, WEEK: 2, MONTH: 3, YEAR: 4, ONCE: 5 };

const round2 = (value) => Math.round(value * 100) / 100 || 0;

/**
 * A number of an amount, null when absent or not a number. Wallos sends
 * numbers, but `number_format` strings ("1,234.56") on some endpoints.
 */
export function amountOf(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const number = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''));
  // `|| 0`: no -0 published for a rounded -0.001.
  return Number.isFinite(number) ? round2(number) : null;
}

/** The calendar day (YYYY-MM-DD) of a Wallos date. */
export const dayOf = (value) =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;

/** Today in the time zone of Gladys (TZ), as YYYY-MM-DD. */
export function localDay(ms) {
  const date = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Whole days from `from` to `to` (both YYYY-MM-DD). */
export function daysBetween(from, to) {
  const ms = (day) => {
    const [y, m, d] = day.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((ms(to) - ms(from)) / 86400000);
}

/**
 * The price of one payment brought to a month, as the statistics page of
 * Wallos computes it: 30 days, 4.35 weeks, 1/12 year; nothing for a one-time
 * payment.
 */
export function pricePerMonth(cycle, frequency, price) {
  const every = Number(frequency) > 0 ? Number(frequency) : 1;
  switch (Number(cycle)) {
    case CYCLES.DAY:
      return (price * 30) / every;
    case CYCLES.WEEK:
      return (price * 4.35) / every;
    case CYCLES.MONTH:
      return price / every;
    case CYCLES.YEAR:
      return price / (12 * every);
    default:
      return 0;
  }
}

/**
 * The currencies of the user: `{ main, byId: { 1: { code, rate } } }`.
 * Rates are relative to the main currency (Fixer, base main), 1 until set.
 */
export function parseCurrencies(body) {
  const byId = {};
  for (const currency of Array.isArray(body?.currencies) ? body.currencies : []) {
    const rate = Number(currency.rate);
    byId[String(currency.id)] = {
      code: typeof currency.code === 'string' ? currency.code.toUpperCase() : null,
      rate: Number.isFinite(rate) && rate > 0 ? rate : 1,
    };
  }
  return {
    main: byId[String(body?.main_currency)]?.code ?? null,
    mainId: body?.main_currency,
    byId,
  };
}

/**
 * An active subscription; null for an inactive one or one without a name.
 * `monthly` is its cost per month in the main currency, converted as Wallos
 * converts (price / rate of its currency).
 */
export function parseSubscription(raw, currencies) {
  if (!raw || Number(raw.inactive) === 1 || raw.inactive === true) {
    return null;
  }
  const price = amountOf(raw.price);
  const currency = currencies.byId[String(raw.currency_id)];
  const cycle = Number(raw.cycle);
  const frequency = Number(raw.frequency) > 0 ? Number(raw.frequency) : 1;
  let monthly = null;
  if (price !== null) {
    monthly = pricePerMonth(cycle, frequency, price);
    if (String(raw.currency_id) !== String(currencies.mainId) && currency) {
      monthly /= currency.rate;
    }
    monthly = round2(monthly);
  }
  return {
    id: String(raw.id),
    name: String(raw.name ?? '').trim() || `#${raw.id}`,
    price,
    currency: currency?.code ?? null,
    cycle,
    frequency,
    nextDue: dayOf(raw.next_payment),
    category: typeof raw.category_name === 'string' ? raw.category_name : null,
    // To bring one payment to the main currency (1 for the main currency).
    rate: String(raw.currency_id) === String(currencies.mainId) ? 1 : (currency?.rate ?? 1),
    monthly,
  };
}

/** The summary of the active subscriptions, in the main currency. */
export function summarize(subscriptions, mainCurrency) {
  const monthly = round2(subscriptions.reduce((sum, item) => sum + (item.monthly ?? 0), 0));
  return {
    currency: mainCurrency,
    monthlyCost: monthly,
    yearlyCost: round2(monthly * 12),
    activeCount: subscriptions.length,
  };
}

export class WallosClient {
  /**
   * @param {object} options
   * @param {string} options.url base URL, without /api
   * @param {string} options.apiKey API key of the user
   * @param {boolean} [options.insecure] accept a self-signed certificate
   * @param {Function} [options.request] httpRequest (the tests pass a fake)
   */
  constructor({ url, apiKey, insecure = false, request = httpRequest }) {
    this.url = url;
    this.apiKey = apiKey;
    this.insecure = insecure;
    this.request = request;
  }

  async call(path, params = {}) {
    const body = new URLSearchParams({ ...params, api_key: this.apiKey }).toString();
    let response;
    try {
      response = await this.request(`${this.url}/api/${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
        insecure: this.insecure,
      });
    } catch (err) {
      const code = err?.code ?? err?.cause?.code;
      // Never the URL: it is the address of the user's server.
      throw new UnreachableError(`Wallos unreachable (${code ?? err.message})`, code);
    }
    if (response.status === 401 || response.status === 403) {
      throw new UnauthorizedError(`Wallos refused the request (HTTP ${response.status})`);
    }
    if ((response.status >= 300 && response.status < 400) || response.status === 404) {
      // A redirection (to the login page, or http → https) or another path.
      throw new NotWallosError(`Wallos answered HTTP ${response.status}: not its API`);
    }
    if (response.status !== 200) {
      throw new UnreachableError(`Wallos answered HTTP ${response.status}`, response.status);
    }
    let json;
    try {
      json = JSON.parse(response.body);
    } catch {
      throw new NotWallosError('The answer is not JSON: not the API of Wallos');
    }
    if (!json || typeof json !== 'object' || typeof json.success !== 'boolean') {
      throw new NotWallosError('The answer is not shaped like the API of Wallos');
    }
    if (!json.success) {
      if (/api key/i.test(String(json.title))) {
        throw new UnauthorizedError('Wallos refused the API key');
      }
      throw new NotWallosError(`Wallos refused the request of ${path}`);
    }
    return json;
  }

  async version() {
    const body = await this.call('status/version.php');
    return { version: String(body.version_number ?? body.version ?? '?') };
  }

  /** Everything the integration shows, read now. */
  async snapshot() {
    const { version } = await this.version();
    const currencies = parseCurrencies(await this.call('currencies/get_currencies.php'));
    const body = await this.call('subscriptions/get_subscriptions.php');
    if (!Array.isArray(body.subscriptions)) {
      throw new NotWallosError('No subscription list in the answer');
    }
    const subscriptions = body.subscriptions
      .map((raw) => parseSubscription(raw, currencies))
      .filter(Boolean);
    return {
      version,
      currency: currencies.main,
      subscriptions,
      summary: summarize(subscriptions, currencies.main),
    };
  }
}
