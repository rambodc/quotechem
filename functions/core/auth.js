import { admin, db } from './firebase.js';
import { asString, normalizeRole } from './values.js';

export const MINI_APP_IDS = ['quotechem', 'uniquem', 'three-d', 'user-access', 'account'];
export const ACCESS_MANAGED_MINI_APP_IDS = ['quotechem', 'uniquem', 'three-d'];

export function normalizeMiniAppIds(value) {
  if (!Array.isArray(value)) return null;
  const seen = new Set();
  for (const item of value) {
    const id = asString(item);
    if (ACCESS_MANAGED_MINI_APP_IDS.includes(id)) seen.add(id);
  }
  return Array.from(seen);
}

export function defaultEnabledMiniAppsForRole(role) {
  return normalizeRole(role) === 'admin' ? [...ACCESS_MANAGED_MINI_APP_IDS] : [];
}

export async function authenticateRequest(req) {
  const header = asString(req.headers?.authorization || req.headers?.Authorization);
  if (!header.toLowerCase().startsWith('bearer ') || !header.slice(7).trim()) {
    throw Object.assign(new Error('Missing Bearer token'), { status: 401 });
  }

  try {
    const decoded = await admin.auth().verifyIdToken(header.slice(7).trim());
    const userSnap = await db.collection('users').doc(decoded.uid).get();
    const userData = userSnap.data() || {};
    return {
      uid: decoded.uid,
      email: asString(decoded.email) || asString(userData.email),
      role: normalizeRole(userData.role),
      enabledMiniApps: Array.isArray(userData.enabledMiniApps) ? userData.enabledMiniApps : null,
    };
  } catch (error) {
    if (error?.status) throw error;
    throw Object.assign(new Error('Invalid authentication token'), { status: 401, cause: error });
  }
}

export async function requireAdmin(req) {
  const user = await authenticateRequest(req);
  if (user.role !== 'admin') throw Object.assign(new Error('Forbidden'), { status: 403 });
  return user;
}

export async function requireMiniAppAccess(req, appId) {
  const user = await authenticateRequest(req);
  if (user.role !== 'admin' && !user.enabledMiniApps?.includes(appId)) {
    throw Object.assign(new Error('Forbidden'), { status: 403 });
  }
  return user;
}
