import test from 'node:test';
import assert from 'node:assert/strict';
import * as functions from './index.js';

const EXPECTED_EXPORTS = [
  'acceptInvite',
  'adjustUniquemItemStock',
  'adminCancelInvite',
  'adminInviteUser',
  'adminListUsers',
  'adminResendInvite',
  'adminUpdateInvite',
  'adminUpdateUserAccess',
  'archiveThreeDModel',
  'createThreeDModel',
  'generateThreeDScene',
  'getThreeDModel',
  'getUniquemAssemblyWorkspace',
  'getUniquemInventory',
  'listThreeDModels',
  'listUniquemItems',
  'postUniquemAssemblyBuild',
  'previewInvite',
  'quotechemAbandon',
  'quotechemChat',
  'quotechemComplete',
  'quotechemGetAttachment',
  'quotechemGetRequest',
  'quotechemListRequests',
  'quotechemResume',
  'quotechemUpdateStage',
  'restoreThreeDModelVersion',
  'reverseUniquemAssemblyBuild',
  'reviseThreeDModel',
  'runStartupDiagnostics',
  'saveUniquemItem',
  'uploadUniquemItemImage',
];

test('deployment entry point exposes the exact production Function contract', () => {
  assert.deepEqual(Object.keys(functions).sort(), EXPECTED_EXPORTS);
});
