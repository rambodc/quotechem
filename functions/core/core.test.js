import test from 'node:test';
import assert from 'node:assert/strict';
import { authenticateRequest, normalizeMiniAppIds, requireMiniAppAccess } from './auth.js';
import { jsonError, preflight, setCors } from './http.js';

function responseStub() {
  return {
    headers: {},
    statusCode: 0,
    body: null,
    set(name, value) {
      this.headers[name] = value;
      return this;
    },
    status(value) {
      this.statusCode = value;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
    send(value) {
      this.body = value;
      return this;
    },
  };
}

test('shared CORS helper exposes GET, POST, and preflight headers', () => {
  const response = responseStub();
  setCors(response);
  assert.equal(response.headers['Access-Control-Allow-Origin'], '*');
  assert.equal(response.headers['Access-Control-Allow-Methods'], 'GET, POST, OPTIONS');
});

test('shared preflight helper returns an empty 204 response', () => {
  const response = responseStub();
  assert.equal(preflight({ method: 'OPTIONS' }, response), true);
  assert.equal(response.statusCode, 204);
  assert.equal(response.body, '');
});

test('shared JSON error helper preserves status and extra details', () => {
  const response = responseStub();
  jsonError(response, 409, 'Conflict', { code: 'duplicate' });
  assert.equal(response.statusCode, 409);
  assert.deepEqual(response.body, { ok: false, error: 'Conflict', code: 'duplicate' });
});

test('shared authentication rejects missing bearer tokens', async () => {
  await assert.rejects(() => authenticateRequest({ headers: {} }), (error) => error.status === 401);
  await assert.rejects(() => requireMiniAppAccess({ headers: {} }, 'uniquem'), (error) => error.status === 401);
});

test('shared mini-app normalization includes QuoteChem and drops unknown IDs', () => {
  assert.deepEqual(normalizeMiniAppIds(['quotechem', 'uniquem', 'unknown-app', 'quotechem']), ['quotechem', 'uniquem']);
});
