import test from 'node:test';
import assert from 'node:assert/strict';
import * as functions from './index.js';

const EXPECTED_EXPORTS = [
  'acceptInvite',
  'adjustUniquemInventory',
  'adminCancelInvite',
  'adminInviteUser',
  'adminListUsers',
  'adminResendInvite',
  'adminUpdateInvite',
  'adminUpdateUserAccess',
  'archiveThreeDModel',
  'archiveUniquemAttachment',
  'completeUniquemProductionRun',
  'completeUniquemShipment',
  'createThreeDModel',
  'createUniquemAttachmentUpload',
  'createUniquemReceipt',
  'deleteUniquemProduct',
  'deleteUniquemProductionRun',
  'deleteUniquemRecipe',
  'deleteUniquemShipment',
  'deleteUniquemWarehouse',
  'generateThreeDScene',
  'getThreeDModel',
  'listThreeDModels',
  'listUniquemAttachments',
  'listUniquemWorkspace',
  'previewInvite',
  'restoreThreeDModelVersion',
  'reviseThreeDModel',
  'runStartupDiagnostics',
  'saveUniquemAttachment',
  'saveUniquemProduct',
  'saveUniquemProductionRun',
  'saveUniquemRecipe',
  'saveUniquemShipment',
  'saveUniquemWarehouse',
];

test('deployment entry point exposes the exact production Function contract', () => {
  assert.deepEqual(Object.keys(functions).sort(), EXPECTED_EXPORTS);
});
