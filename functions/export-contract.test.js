import test from 'node:test';
import assert from 'node:assert/strict';
import * as functions from './index.js';

const EXPECTED_EXPORTS = [
  'acceptInvite',
  'adminCancelInvite',
  'adminInviteUser',
  'adminListUsers',
  'adminResendInvite',
  'adminUpdateInvite',
  'adminUpdateUserAccess',
  'applyUniquemItemImport',
  'archiveThreeDModel',
  'createThreeDModel',
  'generateThreeDScene',
  'getThreeDModel',
  'getUniquemInventory',
  'listThreeDModels',
  'listUniquemItems',
  'previewInvite',
  'previewUniquemItemImport',
  'restoreThreeDModelVersion',
  'reviseThreeDModel',
  'runStartupDiagnostics',
  'saveUniquemInventoryLayout',
];

test('deployment entry point exposes the exact production Function contract', () => {
  assert.deepEqual(Object.keys(functions).sort(), EXPECTED_EXPORTS);
});
