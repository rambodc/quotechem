import { createHash, randomBytes } from 'node:crypto';
import { admin, db } from '../../core/firebase.js';
import { asString, isEmail, normalizeEmail, normalizeRole, toIso } from '../../core/values.js';
import { defaultEnabledMiniAppsForRole, normalizeMiniAppIds } from '../../core/auth.js';
import { DEFAULT_EMAIL_TEMPLATE_IDS, getDefaultEmailTemplate } from '../../services/email.js';

const INVITATION_COLLECTION = 'invitations';
const EMAIL_TEMPLATE_COLLECTION = 'emailTemplates';

export function isValidTemporaryPassword(value) {
  return asString(value).length >= 6;
}

export function mapUserDoc(doc) {
  const data = doc.data() || {};
  const role = normalizeRole(data.role);
  return {
    uid: asString(data.uid) || doc.id,
    email: asString(data.email),
    role,
    firstName: asString(data.firstName),
    lastName: asString(data.lastName),
    profilePhotoUrl: asString(data.profilePhotoUrl),
    profilePhotoThumbUrl: asString(data.profilePhotoThumbUrl),
    enabledMiniApps: normalizeMiniAppIds(data.enabledMiniApps) || defaultEnabledMiniAppsForRole(role),
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
    createdBy: asString(data.createdBy),
  };
}

export function mapEmailTemplateDoc(doc) {
  const data = doc.data() || {};
  const defaults = getDefaultEmailTemplate(doc.id) || {};
  return {
    templateId: doc.id,
    label: asString(data.label) || defaults.label || doc.id,
    description: asString(data.description) || defaults.description || '',
    subject: asString(data.subject) || defaults.subject || '',
    text: typeof data.text === 'string' ? data.text : defaults.text || '',
    html: typeof data.html === 'string' ? data.html : defaults.html || '',
    actionLabel: typeof data.actionLabel === 'string' ? data.actionLabel : defaults.actionLabel || '',
    actionUrlKey: typeof data.actionUrlKey === 'string' ? data.actionUrlKey : defaults.actionUrlKey || '',
    footer: typeof data.footer === 'string' ? data.footer : defaults.footer || '',
    customized: doc.exists,
    updatedAt: toIso(data.updatedAt),
    updatedBy: asString(data.updatedBy),
  };
}

export async function getEmailTemplateOverride(templateId) {
  const id = asString(templateId);
  if (!id || !DEFAULT_EMAIL_TEMPLATE_IDS.includes(id)) return null;
  const snap = await db.collection(EMAIL_TEMPLATE_COLLECTION).doc(id).get();
  return snap.exists ? mapEmailTemplateDoc(snap) : null;
}

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function tokenHash(token) {
  return createHash('sha256').update(String(token || '')).digest('hex');
}

export function makeInviteToken() {
  return randomBytes(32).toString('hex');
}

export function baseUrlFromRequest(req) {
  const configured = asString(process.env.APP_BASE_URL || process.env.QUOTECHEM_APP_BASE_URL).replace(/\/$/, '');
  if (configured) return configured;
  const origin = asString(req.headers?.origin || req.headers?.Origin).replace(/\/$/, '');
  return origin || 'https://quotechem.com';
}

export async function adminDisplayName(uid, fallbackEmail = '') {
  const snap = await db.collection('users').doc(uid).get();
  const data = snap.data() || {};
  return `${asString(data.firstName)} ${asString(data.lastName)}`.trim() || asString(data.email) || fallbackEmail || 'A QuoteChem admin';
}

export async function findUserByEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  try {
    const authUser = await admin.auth().getUserByEmail(normalized);
    const userSnap = await db.collection('users').doc(authUser.uid).get();
    return {
      uid: authUser.uid,
      email: normalized,
      authUser,
      user: userSnap.exists ? userSnap.data() || {} : {},
    };
  } catch (error) {
    if (error?.code !== 'auth/user-not-found') throw error;
  }

  const snap = await db.collection('users').where('email', '==', normalized).limit(1).get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { uid: doc.id, email: normalized, authUser: null, user: doc.data() || {} };
}

export async function applyUserAccess({ uid, email, firstName = '', lastName = '', role = 'user', enabledMiniApps = [], adminUid = '' }) {
  const now = admin.firestore.FieldValue.serverTimestamp();
  const normalizedRole = normalizeRole(role);
  const ref = db.collection('users').doc(uid);
  const snap = await ref.get();
  const existing = snap.data() || {};
  await ref.set(
    {
      uid,
      email: normalizeEmail(email),
      role: normalizedRole,
      enabledMiniApps: normalizeMiniAppIds(enabledMiniApps) || defaultEnabledMiniAppsForRole(normalizedRole),
      firstName: asString(firstName).slice(0, 80) || asString(existing.firstName),
      lastName: asString(lastName).slice(0, 80) || asString(existing.lastName),
      primaryAuthUid: uid,
      ...(snap.exists ? {} : { createdAt: now, createdBy: adminUid }),
      updatedAt: now,
      updatedBy: adminUid,
    },
    { merge: true }
  );
}

export function normalizeAdminUserEmailInput(value) {
  const email = normalizeEmail(value);
  if (!isEmail(email)) {
    const err = new Error('Valid email is required');
    err.status = 400;
    throw err;
  }
  return email;
}

export function emailBelongsToAnotherUser(existingUser, uid) {
  return Boolean(existingUser?.uid && existingUser.uid !== uid);
}

export function inviteStatus(value) {
  return asString(value) || 'pending';
}

export function canEditInviteStatus(value) {
  return ['pending', 'expired'].includes(inviteStatus(value));
}

export function canResendInviteStatus(value) {
  return ['pending', 'expired'].includes(inviteStatus(value));
}

export function inviteIdentity(invite = {}) {
  return {
    firstName: asString(invite.firstName).slice(0, 80),
    lastName: asString(invite.lastName).slice(0, 80),
  };
}

export function publicInvite(invite = {}) {
  return {
    inviteId: asString(invite.inviteId),
    email: asString(invite.email),
    status: inviteStatus(invite.status),
    expiresAt: invite.expiresAt?.toMillis?.() || invite.expiresAt?.getTime?.() || null,
    firstName: asString(invite.firstName),
    lastName: asString(invite.lastName),
    role: normalizeRole(invite.role),
    enabledMiniApps: normalizeMiniAppIds(invite.enabledMiniApps) || defaultEnabledMiniAppsForRole(invite.role),
  };
}

export async function loadInviteByToken(token) {
  const hash = tokenHash(token);
  if (!hash) {
    const err = new Error('Invite token is required');
    err.status = 400;
    throw err;
  }
  const snap = await db.collection(INVITATION_COLLECTION).where('tokenHash', '==', hash).limit(1).get();
  if (snap.empty) {
    const err = new Error('Invite not found');
    err.status = 404;
    throw err;
  }
  const doc = snap.docs[0];
  const invite = doc.data() || {};
  if (inviteStatus(invite.status) === 'accepted') {
    const err = new Error('Invite already accepted');
    err.status = 409;
    throw err;
  }
  if (inviteStatus(invite.status) === 'cancelled') {
    const err = new Error('Invite cancelled');
    err.status = 410;
    throw err;
  }
  if (inviteStatus(invite.status) === 'expired' || (invite.expiresAt?.toMillis?.() && invite.expiresAt.toMillis() < Date.now())) {
    await doc.ref.set({ status: 'expired', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true }).catch(() => {});
    const err = new Error('Invite expired');
    err.status = 410;
    throw err;
  }
  return { doc, invite };
}
