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
  'archiveUniquem3DModel',
  'archiveUniquemAttachment',
  'completeUniquemProductionRun',
  'completeUniquemShipment',
  'createUniquem3DModel',
  'createUniquemAttachmentUpload',
  'createUniquemReceipt',
  'deleteUniquemProduct',
  'deleteUniquemProductionRun',
  'deleteUniquemRecipe',
  'deleteUniquemShipment',
  'deleteUniquemWarehouse',
  'generateUniquem3DScene',
  'getUniquem3DModel',
  'listUniquem3DModels',
  'listUniquemAttachments',
  'listUniquemWorkspace',
  'previewInvite',
  'restoreUniquem3DModelVersion',
  'reviseUniquem3DModel',
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
