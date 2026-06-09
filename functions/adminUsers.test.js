import test from 'node:test';
import assert from 'node:assert/strict';
import { __testables } from './publicQuoteChat.js';

test('temporary password validation accepts six characters', () => {
  assert.equal(__testables.isValidTemporaryPassword('123456'), true);
});

test('temporary password validation rejects shorter values', () => {
  assert.equal(__testables.isValidTemporaryPassword('12345'), false);
});

test('managed mini app normalization includes quotes and drilling fluids only', () => {
  assert.deepEqual(__testables.normalizeMiniAppIds(['quotes', 'drilling-fluids-report', 'account']), [
    'quotes',
    'drilling-fluids-report',
  ]);
});
