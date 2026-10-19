// -----------------------------------------------------------------------------
// The HTTP helper against a local server on 127.0.0.1 (the loopback only):
// the answer, the body limit and the overall deadline.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { httpRequest } from '../src/http.js';

async function serve(t, handler) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  return `http://127.0.0.1:${server.address().port}`;
}

test('a GET with the headers given, and its answer', async (t) => {
  const url = await serve(t, (req, res) => {
    res.end(JSON.stringify({ method: req.method, auth: req.headers.authorization }));
  });
  const response = await httpRequest(`${url}/api/status/version.php`, {
    headers: { authorization: 'Bearer x' },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(response.body), { method: 'GET', auth: 'Bearer x' });
});

test('a POST carries its form body', async (t) => {
  const url = await serve(t, (req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => res.end(JSON.stringify({ method: req.method, body })));
  });
  const response = await httpRequest(`${url}/api/status/version.php`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'api_key=k%26',
  });
  assert.deepEqual(JSON.parse(response.body), { method: 'POST', body: 'api_key=k%26' });
});

test('a server trickling bytes is cut by the overall deadline', async (t) => {
  const url = await serve(t, (req, res) => {
    const timer = setInterval(() => res.write(' '), 50);
    res.on('close', () => clearInterval(timer));
  });
  const started = Date.now();
  await assert.rejects(httpRequest(url, { timeoutMs: 400 }), { code: 'ETIMEDOUT' });
  assert.ok(Date.now() - started < 2000);
});

test('a body over 4 MB is refused', async (t) => {
  const url = await serve(t, (req, res) => {
    res.end(Buffer.alloc(5 * 1024 * 1024, 32));
  });
  await assert.rejects(httpRequest(url), /Response too large/);
});
