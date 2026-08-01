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
  'approveUniquemPalletTexture',
  'archiveThreeDModel',
  'createThreeDModel',
  'discardUniquemPalletTextureDraft',
  'generateThreeDScene',
  'generateUniquemPalletTexture',
  'getThreeDModel',
  'getUniquemInventory',
  'listThreeDModels',
  'listUniquemItems',
  'previewInvite',
  'previewUniquemItemImport',
  'removeUniquemPalletTexture',
  'restoreThreeDModelVersion',
  'reviseThreeDModel',
  'runStartupDiagnostics',
  'saveUniquemInventoryLayout',
  'uploadUniquemPalletTextureSources',
];

test('deployment entry point exposes the exact production Function contract', () => {
  assert.deepEqual(Object.keys(functions).sort(), EXPECTED_EXPORTS);
});
