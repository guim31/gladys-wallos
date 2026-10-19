// -----------------------------------------------------------------------------
// The one function that talks to the network: an HTTP(S) request, on node:http /
// node:https. The Wallos API reads its key from the query string or from a
// form body: the client POSTs a form, so the key never shows in the access
// logs of a reverse proxy (src/wallos.js). Only the read endpoints are called:
// the integration never writes to Wallos. Not on fetch: fetch cannot accept the
// self-signed certificate of one server only, node:https can, per request.
//
// The client takes this function as a parameter: the tests replace it with an
// in-memory Wallos (test/helpers/world.js).
// -----------------------------------------------------------------------------

import http from 'node:http';
import https from 'node:https';

// A household's subscriptions are a few tens of KB.
const MAX_BODY_BYTES = 4 * 1024 * 1024;

/**
 * @param {string} url absolute URL
 * @param {object} [options]
 * @param {string} [options.method] GET (default) or POST
 * @param {Record<string, string>} [options.headers]
 * @param {string} [options.body] request body (a form, for POST)
 * @param {boolean} [options.insecure] accept a certificate that does not verify (HTTPS only)
 * @param {number} [options.timeoutMs]
 * @returns {Promise<{ status: number, headers: Record<string, string>, body: string }>}
 */
export function httpRequest(
  url,
  { method = 'GET', headers = {}, body, insecure = false, timeoutMs = 15_000 } = {},
) {
  const target = new URL(url);
  const isHttps = target.protocol === 'https:';
  const requestHeaders = { accept: 'application/json', ...headers };
  if (body !== undefined) {
    requestHeaders['content-length'] = String(Buffer.byteLength(body));
  }

  return new Promise((resolve, reject) => {
    const request = (isHttps ? https : http).request(
      target,
      {
        method,
        headers: requestHeaders,
        timeout: timeoutMs,
        ...(isHttps ? { rejectUnauthorized: !insecure } : {}),
      },
      (response) => {
        const chunks = [];
        let size = 0;
        response.on('data', (chunk) => {
          size += chunk.length;
          if (size > MAX_BODY_BYTES) {
            request.destroy(new Error('Response too large'));
            return;
          }
          chunks.push(chunk);
        });
        response.on('end', () =>
          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          }),
        );
        response.on('error', reject);
      },
    );
    // `timeout` is socket inactivity only: a server trickling bytes would hold
    // a cycle forever without this overall deadline.
    const deadline = setTimeout(() => {
      const error = new Error(`Timed out after ${timeoutMs} ms`);
      error.code = 'ETIMEDOUT';
      request.destroy(error);
    }, timeoutMs);
    deadline.unref?.();
    request.on('close', () => clearTimeout(deadline));
    request.on('timeout', () => {
      const error = new Error(`Timed out after ${timeoutMs} ms`);
      error.code = 'ETIMEDOUT';
      request.destroy(error);
    });
    request.on('error', reject);
    request.end(body);
  });
}
