import { randomUUID } from 'node:crypto';
import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { admin, db } from '../../core/firebase.js';
import { REGION, jsonError, preflight, setCors } from '../../core/http.js';
import { defaultEnabledMiniAppsForRole, normalizeMiniAppIds, requireAdmin } from '../../core/auth.js';
import { asString, isEmail, normalizeEmail, normalizeRole } from '../../core/values.js';
import { EMAIL_SECRETS, sendTemplatedEmail } from '../../services/email.js';
import {
  isValidTemporaryPassword,
  getEmailTemplateOverride,
  tokenHash,
  makeInviteToken,
  baseUrlFromRequest,
  adminDisplayName,
  findUserByEmail,
  applyUserAccess,
  normalizeAdminUserEmailInput,
  canEditInviteStatus,
  canResendInviteStatus,
  inviteIdentity,
  publicInvite,
  loadInviteByToken,
  INVITE_TTL_MS,
} from './helpers.js';

const INVITATION_COLLECTION = 'invitations';
export const adminInviteUser = onRequest({ region: REGION, secrets: EMAIL_SECRETS }, async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  try {
    const adminUser = await requireAdmin(req);
    const email = normalizeEmail(req.body?.email);
    const role = normalizeRole(req.body?.role);
    const firstName = asString(req.body?.firstName).slice(0, 80);
    const lastName = asString(req.body?.lastName).slice(0, 80);
    const enabledMiniApps = normalizeMiniAppIds(req.body?.enabledMiniApps) || defaultEnabledMiniAppsForRole(role);
    if (!isEmail(email)) return jsonError(res, 400, 'Valid email is required');

    const inviterName = await adminDisplayName(adminUser.uid, adminUser.email);
    const existing = await findUserByEmail(email);
    const baseUrl = baseUrlFromRequest(req);

    if (existing?.uid) {
      await applyUserAccess({
        uid: existing.uid,
        email,
        firstName: firstName || existing.user?.firstName || '',
        lastName: lastName || existing.user?.lastName || '',
        role,
        enabledMiniApps,
        adminUid: adminUser.uid,
      });
      const emailResult = await sendTemplatedEmail({
        templateId: 'existingUserAccess',
        to: email,
        data: {
          inviterName,
          signInUrl: `${baseUrl}/signin`,
        },
        override: await getEmailTemplateOverride('existingUserAccess'),
      });
      const snap = await db.collection('users').doc(existing.uid).get();
      setCors(res);
      res.status(200).json({ ok: true, mode: 'existing', user: mapUserDoc(snap), emailMessageId: emailResult.messageId });
      return;
    }

    const pendingSnap = await db.collection(INVITATION_COLLECTION).where('email', '==', email).where('status', '==', 'pending').limit(1).get();
    const inviteId = pendingSnap.empty ? randomUUID() : pendingSnap.docs[0].id;
    const token = makeInviteToken();
    const inviteUrl = `${baseUrl}/invite/${token}`;
    const now = admin.firestore.FieldValue.serverTimestamp();
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    const invitePayload = {
      inviteId,
      email,
      firstName,
      lastName,
      role,
      enabledMiniApps,
      status: 'pending',
      tokenHash: tokenHash(token),
      inviteUrl,
      createdBy: pendingSnap.empty ? adminUser.uid : pendingSnap.docs[0].data()?.createdBy || adminUser.uid,
      updatedBy: adminUser.uid,
      updatedAt: now,
      expiresAt,
      ...(pendingSnap.empty ? { createdAt: now } : { resentAt: now, resentBy: adminUser.uid }),
    };
    await db.collection(INVITATION_COLLECTION).doc(inviteId).set(invitePayload, { merge: true });
    const emailResult = await sendTemplatedEmail({
      templateId: 'userInvite',
      to: email,
      data: {
        inviterName,
        inviteUrl,
      },
      override: await getEmailTemplateOverride('userInvite'),
    });

    setCors(res);
    res.status(200).json({ ok: true, mode: 'invited', invite: publicInvite(invitePayload), emailMessageId: emailResult.messageId });
  } catch (error) {
    const status = Number(error?.status) || 500;
    logger.error('[adminInviteUser] failed', { error: error?.message || String(error) });
    return jsonError(res, status, status === 403 ? 'Forbidden' : asString(error?.message || String(error)) || 'Failed to send invite');
  }
});

export const adminResendInvite = onRequest({ region: REGION, secrets: EMAIL_SECRETS }, async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  try {
    const adminUser = await requireAdmin(req);
    const inviteId = normalizeDocId(req.body?.inviteId);
    if (!inviteId) return jsonError(res, 400, 'inviteId is required');
    const ref = db.collection(INVITATION_COLLECTION).doc(inviteId);
    const snap = await ref.get();
    if (!snap.exists) return jsonError(res, 404, 'Invite not found');
    const invite = snap.data() || {};
    if (!canResendInviteStatus(invite.status)) {
      return jsonError(res, 400, 'Only pending or expired invites can be resent');
    }

    const token = makeInviteToken();
    const inviteUrl = `${baseUrlFromRequest(req)}/invite/${token}`;
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    const now = admin.firestore.FieldValue.serverTimestamp();
    await ref.set(
      {
        status: 'pending',
        tokenHash: tokenHash(token),
        inviteUrl,
        expiresAt,
        resentAt: now,
        resentBy: adminUser.uid,
        updatedAt: now,
        updatedBy: adminUser.uid,
      },
      { merge: true }
    );
    const emailResult = await sendTemplatedEmail({
      templateId: 'userInvite',
      to: invite.email,
      data: {
        inviterName: await adminDisplayName(adminUser.uid, adminUser.email),
        inviteUrl,
      },
      override: await getEmailTemplateOverride('userInvite'),
    });

    setCors(res);
    res.status(200).json({ ok: true, emailMessageId: emailResult.messageId });
  } catch (error) {
    const status = Number(error?.status) || 500;
    logger.error('[adminResendInvite] failed', { error: error?.message || String(error) });
    return jsonError(res, status, status === 403 ? 'Forbidden' : asString(error?.message || String(error)) || 'Failed to resend invite');
  }
});

export const adminUpdateInvite = onRequest({ region: REGION }, async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  try {
    const adminUser = await requireAdmin(req);
    const inviteId = normalizeDocId(req.body?.inviteId);
    if (!inviteId) return jsonError(res, 400, 'inviteId is required');

    const ref = db.collection(INVITATION_COLLECTION).doc(inviteId);
    const snap = await ref.get();
    if (!snap.exists) return jsonError(res, 404, 'Invite not found');
    const invite = snap.data() || {};
    if (!canEditInviteStatus(invite.status)) {
      return jsonError(res, 400, 'Only pending or expired invites can be edited');
    }

    const email = normalizeAdminUserEmailInput(req.body?.email || invite.email);
    const existing = await findUserByEmail(email);
    if (existing?.uid) return jsonError(res, 409, 'Email is already assigned to a user');

    const role = normalizeRole(req.body?.role || invite.role);
    const enabledMiniApps = normalizeMiniAppIds(req.body?.enabledMiniApps) || defaultEnabledMiniAppsForRole(role);
    const patch = {
      email,
      firstName: asString(req.body?.firstName).slice(0, 80),
      lastName: asString(req.body?.lastName).slice(0, 80),
      role,
      enabledMiniApps,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: adminUser.uid,
    };
    await ref.set(patch, { merge: true });
    const updatedSnap = await ref.get();
    setCors(res);
    res.status(200).json({ ok: true, invite: { ...publicInvite(updatedSnap.data() || {}), inviteId } });
  } catch (error) {
    const status = Number(error?.status) || 500;
    logger.error('[adminUpdateInvite] failed', { error: error?.message || String(error) });
    return jsonError(res, status, status === 403 ? 'Forbidden' : asString(error?.message || String(error)) || 'Failed to update invite');
  }
});

export const adminCancelInvite = onRequest({ region: REGION }, async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  try {
    const adminUser = await requireAdmin(req);
    const inviteId = normalizeDocId(req.body?.inviteId);
    if (!inviteId) return jsonError(res, 400, 'inviteId is required');
    const ref = db.collection(INVITATION_COLLECTION).doc(inviteId);
    const snap = await ref.get();
    if (!snap.exists) return jsonError(res, 404, 'Invite not found');
    const invite = snap.data() || {};
    if (asString(invite.status) === 'accepted') return jsonError(res, 400, 'Accepted invites cannot be cancelled');

    await ref.set(
      {
        status: 'cancelled',
        cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
        cancelledBy: adminUser.uid,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: adminUser.uid,
      },
      { merge: true }
    );
    setCors(res);
    res.status(200).json({ ok: true });
  } catch (error) {
    const status = Number(error?.status) || 500;
    logger.error('[adminCancelInvite] failed', { error: error?.message || String(error) });
    return jsonError(res, status, status === 403 ? 'Forbidden' : asString(error?.message || String(error)) || 'Failed to cancel invite');
  }
});

export const previewInvite = onRequest({ region: REGION }, async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  try {
    const { invite } = await loadInviteByToken(req.body?.token);
    setCors(res);
    res.status(200).json({ ok: true, invite: publicInvite(invite) });
  } catch (error) {
    const status = Number(error?.status) || 500;
    logger.error('[previewInvite] failed', { error: error?.message || String(error) });
    return jsonError(res, status, asString(error?.message || String(error)) || 'Unable to load invite');
  }
});

export const acceptInvite = onRequest({ region: REGION }, async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  let createdAuthUser = null;
  try {
    const { doc: inviteDoc, invite } = await loadInviteByToken(req.body?.token);
    const { firstName, lastName } = inviteIdentity(invite);
    const password = asString(req.body?.password);
    if (!firstName) return jsonError(res, 400, 'First name is required');
    if (!lastName) return jsonError(res, 400, 'Last name is required');
    if (!isValidTemporaryPassword(password)) return jsonError(res, 400, 'Password must be at least 6 characters');

    const email = normalizeEmail(invite.email);
    const existing = await findUserByEmail(email);
    if (existing?.uid) return jsonError(res, 409, 'This email is already registered. Sign in instead.');

    createdAuthUser = await admin.auth().createUser({
      email,
      password,
      emailVerified: false,
      displayName: `${firstName} ${lastName}`.trim(),
      disabled: false,
    });

    const now = admin.firestore.FieldValue.serverTimestamp();
    await db.collection('users').doc(createdAuthUser.uid).set(
      {
        uid: createdAuthUser.uid,
        email,
        role: normalizeRole(invite.role),
        enabledMiniApps: normalizeMiniAppIds(invite.enabledMiniApps) || defaultEnabledMiniAppsForRole(invite.role),
        firstName,
        lastName,
        primaryAuthUid: createdAuthUser.uid,
        createdAt: now,
        updatedAt: now,
        createdBy: asString(invite.createdBy),
      },
      { merge: true }
    );
    await inviteDoc.ref.set(
      {
        status: 'accepted',
        acceptedAt: now,
        acceptedBy: createdAuthUser.uid,
        updatedAt: now,
      },
      { merge: true }
    );

    let customToken = '';
    try {
      customToken = await admin.auth().createCustomToken(createdAuthUser.uid);
    } catch (error) {
      logger.error('[acceptInvite] custom token failed', { error: error?.message || String(error) });
    }

    setCors(res);
    res.status(200).json({ ok: true, uid: createdAuthUser.uid, email, customToken, requiresSignIn: !customToken });
  } catch (error) {
    if (createdAuthUser?.uid) {
      await admin.auth().deleteUser(createdAuthUser.uid).catch(() => {});
    }
    const status = Number(error?.status) || (error?.code === 'auth/email-already-exists' ? 409 : 500);
    logger.error('[acceptInvite] failed', { error: error?.message || String(error) });
    return jsonError(res, status, asString(error?.message || String(error)) || 'Failed to accept invite');
  }
});
