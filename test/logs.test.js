// -----------------------------------------------------------------------------
// What the integration writes to `docker logs`: at info, only the lifecycle
// (the start, Wallos lost and back, a scene trigger, a user action), never one
// line per refresh cycle; a failure that repeats at every cycle is logged
// once, plus one line when it is over. Money is private: no amount, no name,
// no API key and no server address, even at debug.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CONFIG,
  URL_BASE,
  captureLogs,
  createAll,
  createApi,
  createWorld,
  cycle,
} from './helpers/world.js';

const strip = (line) => line.text.replace(/^\[[^\]]+\] /, '');

async function world(t, options = {}) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

test('the start is one info line, then one per scene trigger, with ids only', async (t) => {
  const lines = captureLogs(t, 'info');
  await world(t);
  assert.deepEqual(lines.map(strip), [
    '[INFO] [wallos] Started: Wallos read every 60 min',
    '[INFO] [wallos] Scene trigger: Subscription #4 due in 0 day(s)',
    '[INFO] [wallos] Scene trigger: Subscription #1 due in 1 day(s)',
    '[INFO] [wallos] Scene trigger: Subscription #2 due in 3 day(s)',
    '[INFO] [wallos] Scene trigger: Subscription #5 due in 7 day(s)',
  ]);
});

test('normal refresh cycles write nothing at info', async (t) => {
  const w = await world(t);
  await createAll(w);
  const lines = captureLogs(t, 'info');
  w.api.subscription(1).price = 12;
  for (let i = 0; i < 4; i += 1) {
    await cycle(w);
  }
  assert.deepEqual(lines, []);
});

test('Wallos down at every cycle: one warning, then one line at recovery', async (t) => {
  const api = createApi();
  const w = await world(t, { api });
  const lines = captureLogs(t, 'info');
  api.down = 502;
  for (let i = 0; i < 4; i += 1) {
    await cycle(w);
  }
  assert.deepEqual(lines.map(strip), ['[WARN] [wallos] Wallos answered HTTP 502']);
  api.down = false;
  await cycle(w);
  assert.deepEqual(lines.slice(1).map(strip), ['[INFO] [wallos] Wallos answers again']);
});

test('even at debug: no amount, no name, no API key, no address', async (t) => {
  const lines = captureLogs(t, 'debug');
  const api = createApi();
  const w = await world(t, { api });
  await createAll(w);
  await cycle(w);
  await w.fake.action('check_now', {});
  await w.fake.sceneAction('read_payments', {});
  await w.fake.widgetGet('upcoming', { language: 'fr', settings: {} });
  api.down = 'network';
  await cycle(w);
  await w.fake.configUpdated({ ...CONFIG, api_key: 'wrong-key' });
  const text = lines.map((line) => line.text).join('\n');
  assert.ok(lines.length > 5);
  for (const secret of [
    CONFIG.api_key,
    'wrong-key',
    URL_BASE,
    '192.0.2.10',
    'Netflix',
    'Box internet',
    'Spotify',
    '13.49',
    '29.99',
    '76.42',
    '76,42',
  ]) {
    assert.ok(!text.includes(secret), `"${secret}" in the logs`);
  }
});
