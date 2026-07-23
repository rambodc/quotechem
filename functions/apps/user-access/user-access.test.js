import test from 'node:test';
import assert from 'node:assert/strict';
import * as functionExports from '../../index.js';
import * as userHelpers from './helpers.js';
import { normalizeMiniAppIds } from '../../core/auth.js';

const __testables = { ...userHelpers, normalizeMiniAppIds };

test('temporary password validation accepts six characters', () => {
  assert.equal(__testables.isValidTemporaryPassword('123456'), true);
});

test('temporary password validation rejects shorter values', () => {
  assert.equal(__testables.isValidTemporaryPassword('12345'), false);
});

test('managed mini app normalization includes access-managed apps only', () => {
  assert.deepEqual(__testables.normalizeMiniAppIds(['quotes', 'drilling-programs', 'uniquem', 'account']), ['uniquem']);
});

test('admin user email input is normalized and validated', () => {
  assert.equal(__testables.normalizeAdminUserEmailInput(' Riley@Example.COM '), 'riley@example.com');
  assert.throws(() => __testables.normalizeAdminUserEmailInput('not-an-email'), /Valid email is required/);
});

test('admin user email conflict detection ignores the same user only', () => {
  assert.equal(__testables.emailBelongsToAnotherUser({ uid: 'user-1' }, 'user-1'), false);
  assert.equal(__testables.emailBelongsToAnotherUser({ uid: 'user-2' }, 'user-1'), true);
  assert.equal(__testables.emailBelongsToAnotherUser(null, 'user-1'), false);
});

test('invite action status helpers allow pending and expired only', () => {
  assert.equal(__testables.canEditInviteStatus('pending'), true);
  assert.equal(__testables.canEditInviteStatus('expired'), true);
  assert.equal(__testables.canEditInviteStatus('accepted'), false);
  assert.equal(__testables.canEditInviteStatus('cancelled'), false);
  assert.equal(__testables.canResendInviteStatus('pending'), true);
  assert.equal(__testables.canResendInviteStatus('expired'), true);
  assert.equal(__testables.canResendInviteStatus('accepted'), false);
  assert.equal(__testables.canResendInviteStatus('cancelled'), false);
});

test('invite acceptance identity comes from invite record only', () => {
  assert.deepEqual(__testables.inviteIdentity({ firstName: ' Invited ', lastName: ' Person ' }), {
    firstName: 'Invited',
    lastName: 'Person',
  });
});

test('legacy direct user creation function is not exported', () => {
  assert.equal(Object.hasOwn(functionExports, 'adminCreateUser'), false);
});

test('invite management functions are exported and template admin endpoints are removed', () => {
  assert.equal(Object.hasOwn(functionExports, 'adminUpdateInvite'), true);
  assert.equal(Object.hasOwn(functionExports, 'adminCancelInvite'), true);
  assert.equal(Object.hasOwn(functionExports, 'adminListEmailTemplates'), false);
  assert.equal(Object.hasOwn(functionExports, 'adminSaveEmailTemplate'), false);
  assert.equal(Object.hasOwn(functionExports, 'adminSendTestEmail'), false);
});

test('removed quote and RFQ functions are not exported', () => {
  for (const name of [
    'createPublicSession',
    'chatPublicAssistant',
    'finalizePublicSession',
    'adminDashboardSummary',
    'adminListLeads',
    'adminGetLeadDetail',
    'adminUpdateLead',
    'adminAddLeadNote',
    'adminListCustomers',
    'adminGetCustomerTimeline',
  ]) {
    assert.equal(Object.hasOwn(functionExports, name), false);
  }
});
