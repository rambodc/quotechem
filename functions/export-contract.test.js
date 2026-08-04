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
  'archiveUniquemAssemblyRecipe',
  'createThreeDModel',
  'discardUniquemPalletTextureDraft',
  'generateThreeDScene',
  'generateUniquemPalletTexture',
  'getThreeDModel',
  'getUniquemAssemblyWorkspace',
  'getUniquemInventory',
  'getUniquemPalletTexture',
  'listThreeDModels',
  'listUniquemItems',
  'postUniquemAssemblyBuild',
  'previewInvite',
  'previewUniquemItemImport',
  'removeUniquemPalletTexture',
  'restoreThreeDModelVersion',
  'reverseUniquemAssemblyBuild',
  'reviseThreeDModel',
  'runStartupDiagnostics',
  'saveUniquemAssemblyRecipe',
  'saveUniquemInventoryLayout',
  'uploadUniquemPalletTextureSources',
];

test('deployment entry point exposes the exact production Function contract', () => {
  assert.deepEqual(Object.keys(functions).sort(), EXPECTED_EXPORTS);
});
