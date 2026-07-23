import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { admin, db } from '../../core/firebase.js';
import { REGION, jsonError, preflight, setCors } from '../../core/http.js';
import { MINI_APP_IDS, normalizeMiniAppIds, requireAdmin } from '../../core/auth.js';
import { asString, normalizeEmail, normalizeRole } from '../../core/values.js';
import {
  mapUserDoc,
  findUserByEmail,
  normalizeAdminUserEmailInput,
  emailBelongsToAnotherUser,
  publicInvite,
} from './helpers.js';

const INVITATION_COLLECTION = 'invitations';
export const adminListUsers = onRequest({ region: REGION }, async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  try {
    await requireAdmin(req);
    const [snap, inviteSnap] = await Promise.all([
      db.collection('users').orderBy('email', 'asc').limit(250).get(),
      db.collection(INVITATION_COLLECTION).orderBy('updatedAt', 'desc').limit(100).get(),
    ]);
    const items = snap.docs.map(mapUserDoc);
    const invites = inviteSnap.docs.map((doc) => ({ ...publicInvite(doc.data() || {}), inviteId: doc.id }));

    setCors(res);
    res.status(200).json({ ok: true, items, invites, miniApps: MINI_APP_IDS });
  } catch (error) {
    const status = Number(error?.status) || 500;
    logger.error('[adminListUsers] failed', { error: error?.message || String(error) });
    return jsonError(res, status, status === 403 ? 'Forbidden' : 'Failed to list users');
  }
});

export const adminUpdateUserAccess = onRequest({ region: REGION }, async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  try {
    const adminUser = await requireAdmin(req);
    const uid = asString(req.body?.uid);
    const role = normalizeRole(req.body?.role);
    const firstName = asString(req.body?.firstName).slice(0, 80);
    const lastName = asString(req.body?.lastName).slice(0, 80);
    const enabledMiniApps = normalizeMiniAppIds(req.body?.enabledMiniApps) || [];
    if (!uid) return jsonError(res, 400, 'uid is required');

    const userRef = db.collection('users').doc(uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) return jsonError(res, 404, 'User not found');
    const existingUserData = userSnap.data() || {};
    const email = normalizeAdminUserEmailInput(req.body?.email || existingUserData.email);
    const currentEmail = normalizeEmail(existingUserData.email);
    const emailChanged = email !== currentEmail;

    if (emailChanged) {
      const existingEmailUser = await findUserByEmail(email);
      if (emailBelongsToAnotherUser(existingEmailUser, uid)) {
        return jsonError(res, 409, 'Email is already assigned to another user');
      }
      await admin.auth().updateUser(uid, { email, emailVerified: false });
    }

    await userRef.set(
      {
        email,
        role,
        firstName,
        lastName,
        enabledMiniApps,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: adminUser.uid,
      },
      { merge: true }
    );

    const updatedSnap = await userRef.get();
    setCors(res);
    res.status(200).json({ ok: true, user: mapUserDoc(updatedSnap) });
  } catch (error) {
    const status = Number(error?.status) || 500;
    logger.error('[adminUpdateUserAccess] failed', { error: error?.message || String(error) });
    return jsonError(res, status, status === 403 ? 'Forbidden' : 'Failed to update user access');
  }
});
