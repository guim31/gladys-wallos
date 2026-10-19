// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with strings, blanks or `undefined`.
//
// Select values are strings in the manifest (stored by Gladys as typed); the
// normalized config holds numbers.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// Minutes between two readings. Subscriptions change a few times a year and
// the due dates by the day: one hour is plenty (the brief of the project).
export const REFRESH_INTERVALS = ['15', '30', '60', '180', '360'];

// Days before the payment of the "payment due" trigger. 0 is the day itself.
export const PAYMENT_DAYS = ['0', '1', '3', '7'];

export const DEFAULT_CONFIG = {
  url: '',
  api_key: '',
  allow_self_signed: false,
  refresh_interval: '60',
  language: 'fr',
};

/**
 * The base URL of Wallos, from what the user typed: scheme added when
 * missing, a trailing `/api`, page name and slashes removed, credentials
 * refused (they would end up in logs). `null` when it cannot be a URL.
 */
export function parseUrl(text) {
  let value = String(text ?? '').trim();
  if (value === '') {
    return null;
  }
  if (!/^https?:\/\//i.test(value)) {
    value = `http://${value}`;
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.username || url.password || url.search || url.hash) {
    return null;
  }
  const path = url.pathname
    .replace(/\/[^/]+\.php$/i, '')
    .replace(/\/+$/, '')
    .replace(/\/api$/i, '');
  return `${url.protocol}//${url.host}${path}`;
}

const pick = (value, allowed, fallback) =>
  allowed.includes(String(value)) ? Number(value) : Number(fallback);

/**
 * @param {Record<string, unknown>} raw the configuration returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const typedUrl = String(source.url ?? '').trim();
  return {
    url: parseUrl(typedUrl),
    // A URL typed but not understood, told apart from no URL at all.
    invalidUrl: typedUrl !== '' && parseUrl(typedUrl) === null,
    apiKey: String(source.api_key ?? '').trim(),
    insecure: source.allow_self_signed === true || source.allow_self_signed === 'true',
    refreshMinutes: pick(
      source.refresh_interval,
      REFRESH_INTERVALS,
      DEFAULT_CONFIG.refresh_interval,
    ),
    language: LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language,
  };
}
