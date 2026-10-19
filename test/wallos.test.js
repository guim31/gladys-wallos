// -----------------------------------------------------------------------------
// The pure pieces: the address typed by the user, amounts, calendar days, the
// monthly cost formula of Wallos, and the parsing of the recorded answers.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig, parseUrl } from '../src/config.js';
import {
  CYCLES,
  NotWallosError,
  UnauthorizedError,
  WallosClient,
  amountOf,
  daysBetween,
  parseCurrencies,
  parseSubscription,
  pricePerMonth,
} from '../src/wallos.js';
import { fixture } from './helpers/world.js';

test('the address: scheme added, /api, page and slashes removed, credentials refused', () => {
  assert.equal(parseUrl('192.0.2.10:8282'), 'http://192.0.2.10:8282');
  assert.equal(parseUrl(' https://wallos.example.org/ '), 'https://wallos.example.org');
  assert.equal(parseUrl('http://192.0.2.10/wallos/api/'), 'http://192.0.2.10/wallos');
  assert.equal(parseUrl('http://192.0.2.10/wallos/index.php'), 'http://192.0.2.10/wallos');
  assert.equal(parseUrl('http://user:pass@192.0.2.10'), null);
  assert.equal(parseUrl('http://192.0.2.10/?api_key=x'), null);
  assert.equal(parseUrl('not a url at all'), null);
  assert.equal(parseUrl(''), null);
});

test('the configuration is normalized', () => {
  assert.deepEqual(normalizeConfig({}), {
    url: null,
    invalidUrl: false,
    apiKey: '',
    insecure: false,
    refreshMinutes: 60,
    language: 'fr',
  });
  const config = normalizeConfig({
    url: 'http://u:p@host',
    api_key: ' abc ',
    allow_self_signed: true,
    refresh_interval: '360',
    language: 'de',
  });
  assert.equal(config.invalidUrl, true);
  assert.equal(config.apiKey, 'abc');
  assert.equal(config.insecure, true);
  assert.equal(config.refreshMinutes, 360);
  assert.equal(normalizeConfig({ refresh_interval: '5' }).refreshMinutes, 60);
});

test('amounts and calendar days', () => {
  assert.equal(amountOf(13.49), 13.49);
  // number_format of PHP, as get_monthly_cost.php answers.
  assert.equal(amountOf('1,234.56'), 1234.56);
  assert.ok(Object.is(amountOf(-0.001), 0));
  assert.equal(amountOf(null), null);
  assert.equal(amountOf('n/a'), null);
  // Across the change to winter time (25/10/2026) a day is still a day.
  assert.equal(daysBetween('2026-10-24', '2026-10-26'), 2);
  assert.equal(daysBetween('2026-10-19', '2027-03-01'), 133);
});

test('the monthly price, as the statistics of Wallos compute it', () => {
  assert.equal(pricePerMonth(CYCLES.DAY, 1, 1), 30);
  assert.equal(pricePerMonth(CYCLES.WEEK, 2, 10), 21.75);
  assert.equal(pricePerMonth(CYCLES.MONTH, 3, 30), 10);
  assert.equal(pricePerMonth(CYCLES.YEAR, 1, 120), 10);
  assert.equal(pricePerMonth(CYCLES.ONCE, 1, 59), 0);
  // A frequency of 0 is taken as 1, never a division by zero.
  assert.equal(pricePerMonth(CYCLES.MONTH, 0, 9), 9);
});

test('the recorded answers: currencies and subscriptions', () => {
  const currencies = parseCurrencies(fixture('wallos/get_currencies.json'));
  assert.equal(currencies.main, 'EUR');
  assert.deepEqual(currencies.byId['2'], { code: 'USD', rate: 1.08 });
  const raw = fixture('wallos/get_subscriptions.json').subscriptions;
  const parsed = raw.map((item) => parseSubscription(item, currencies));
  assert.equal(parsed.filter(Boolean).length, 6, 'the inactive one is left out');
  const domain = parsed.find((item) => item?.name === 'Domain name');
  assert.deepEqual(domain, {
    id: '3',
    name: 'Domain name',
    price: 15,
    currency: 'USD',
    cycle: CYCLES.YEAR,
    frequency: 1,
    nextDue: '2027-03-01',
    category: 'Services cloud',
    rate: 1.08,
    monthly: 1.16,
  });
});

const answer =
  (body, status = 200) =>
  async () => ({
    status,
    headers: {},
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
const client = (request) => new WallosClient({ url: 'http://192.0.2.10', apiKey: 'k', request });

test('a wrong key is told apart from another server', async () => {
  await assert.rejects(
    client(answer(fixture('wallos/invalid_key.json'))).version(),
    UnauthorizedError,
  );
  await assert.rejects(client(answer('<html>login</html>')).version(), NotWallosError);
  await assert.rejects(client(answer({ hello: 1 })).version(), NotWallosError);
  await assert.rejects(client(answer('', 302)).version(), NotWallosError);
  await assert.rejects(client(answer('', 403)).version(), UnauthorizedError);
});

test('an unreachable server: the reason, never the address', async () => {
  const request = async () => {
    throw Object.assign(new Error('connect ECONNREFUSED 192.0.2.10:80'), { code: 'ECONNREFUSED' });
  };
  await assert.rejects(client(request).version(), (err) => {
    assert.equal(err.message, 'Wallos unreachable (ECONNREFUSED)');
    return true;
  });
});
