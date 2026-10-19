// -----------------------------------------------------------------------------
// The `upcoming` widget and the scene and configuration actions, on the
// recorded Wallos answers: what is shown and told, in the language asked,
// within the budget of the core.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { CONFIG, createApi, createWorld, cycle } from './helpers/world.js';

const plain = (value) => JSON.parse(JSON.stringify(value).replace(/[\u00a0\u202f]/g, ' '));

async function world(t, options = {}) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

const content = async (w, language = 'en') => {
  const { success, data } = await w.fake.widgetGet('upcoming', { language, settings: {} });
  assert.equal(success, true);
  return data.content;
};

test('the widget shows the costs and the next payments, within the core budget', async (t) => {
  const w = await world(t);
  for (const language of ['en', 'fr', 'de', 'es']) {
    assert.deepEqual(validateWidgetContent(await content(w, language)), [], language);
  }
  const data = plain(await content(w, 'fr'));
  const status = data.components.find((c) => c.type === 'status');
  assert.deepEqual(
    status.items.map((item) => [item.label, item.value]),
    [
      ['Coût mensuel', '76,42 €'],
      ['Coût annuel estimé', '917,04 €'],
    ],
  );
  const list = data.components.find((c) => c.type === 'card-list');
  assert.deepEqual(
    list.items.map((item) => [item.title, item.subtitle, item.badge.text, item.badge.color]),
    [
      ['Box internet', '29,99 € · 19/10/2026', "aujourd'hui", 'danger'],
      ['Netflix', '13,49 € · 20/10/2026', 'demain', 'warning'],
      ['Spotify', '11,12 € · 22/10/2026', 'dans 3 j', 'warning'],
      ['Gym', '9,50 € · 26/10/2026', 'dans 7 j', 'neutral'],
      ['Concert ticket', '59,00 € · 15/11/2026', 'dans 27 j', 'neutral'],
      ['Domain name', '15,00 $ · 01/03/2027', 'dans 133 j', 'neutral'],
    ],
  );
  assert.equal(list.items[0].description, 'Factures et services');
  assert.match(data.components.at(-1).text, /^Wallos · Lu le 19\/10 14:00/);
});

test('the widget without any payment to come, and before any answer', async (t) => {
  const api = createApi();
  api.body('subscriptions/get_subscriptions.php').subscriptions = [];
  const w = await world(t, { api });
  const data = await content(w, 'en');
  assert.equal(data.components[1].text, 'No upcoming payment');
  const down = await world(t, { config: { ...CONFIG, api_key: 'wrong' } });
  assert.deepEqual((await content(down, 'de')).components, [
    { type: 'text', variant: 'heading', text: 'Wallos antwortet nicht' },
  ]);
});

test('read_payments: the payments within the chosen days, soonest first, and the total', async (t) => {
  const w = await world(t, { config: { ...CONFIG, language: 'en' } });
  let { data } = await w.fake.sceneAction('read_payments', { days: '7' });
  assert.deepEqual(plain(data.outputs), {
    text: 'Box internet: €29.99 today. Netflix: €13.49 tomorrow. Spotify: €11.12 in 3 days. Gym: €9.50 in 7 days. Total: €64.10.',
    count: 4,
    total: 64.1,
  });
  ({ data } = await w.fake.sceneAction('read_payments', { days: '31' }));
  // Up to 19/11: Box internet twice (19/10, 19/11), Netflix and Spotify once,
  // Gym twice (26/10, 09/11; 23/11 is out), the Concert ticket once.
  assert.equal(data.outputs.count, 7);
  assert.equal(data.outputs.total, 162.59);
});

test('read_payments converts the total to the main currency', async (t) => {
  const api = createApi();
  api.subscription(3).next_payment = '2026-10-21';
  const w = await world(t, { api });
  const { data } = await w.fake.sceneAction('read_payments', {});
  // 64.10 € + 15 $ / 1.08.
  assert.equal(data.outputs.total, 77.99);
  assert.match(
    plain(data.outputs).text,
    /Domain name : 15,00 \$ dans 2 jours\. .*Total : 77,99 €\.$/,
  );
});

test('read_payments with nothing to come, in Spanish', async (t) => {
  const api = createApi();
  api.body('subscriptions/get_subscriptions.php').subscriptions = [];
  const w = await world(t, { api, config: { ...CONFIG, language: 'es' } });
  const { data } = await w.fake.sceneAction('read_payments', { days: '14' });
  assert.deepEqual(data.outputs, {
    text: 'Ningún pago en los próximos 14 días.',
    count: 0,
    total: 0,
  });
});

test('a scene action reads Wallos again when the last reading is old', async (t) => {
  const w = await world(t);
  const requests = w.api.requests.length;
  await w.fake.sceneAction('read_payments', {});
  assert.equal(w.api.requests.length, requests, 'fresh enough');
  w.api.subscription(4).price = 31.99;
  w.clock.advance(61 * 60 * 1000);
  const { data } = await w.fake.sceneAction('read_payments', {});
  assert.match(plain(data.outputs).text, /^Box internet : 31,99 €/);
});

test('a scene action fails with the reason when the key is refused', async (t) => {
  const w = await world(t, { config: { ...CONFIG, api_key: 'wrong' } });
  const { success, error } = await w.fake.sceneAction('read_payments', {});
  assert.equal(success, false);
  assert.match(String(error?.message ?? error), /refuse la clé/);
});

test('check_now tests the connection and says what Wallos holds', async (t) => {
  const w = await world(t);
  await cycle(w, 1);
  const { data } = await w.fake.action('check_now', {});
  assert.equal(
    plain(data.message).fr,
    'Connecté à Wallos 5.10.0 : 6 abonnement(s) actif(s), 76,42 € par mois.',
  );
  assert.equal(
    plain(data.message).en,
    'Connected to Wallos 5.10.0: 6 active subscription(s), €76.42 per month.',
  );
  w.api.down = 'network';
  const failed = await w.fake.action('check_now', {});
  assert.match(JSON.stringify(failed.data), /does not answer/);
});
