import { onRequest } from 'firebase-functions/v2/https';
import { requireMiniAppAccess } from './auth.js';

export const REGION = 'us-central1';

export function setCors(res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export function preflight(req, res) {
  if (req.method !== 'OPTIONS') return false;
  setCors(res);
  res.status(204).send('');
  return true;
}

export function jsonError(res, status, message, extra = {}) {
  setCors(res);
  return res.status(status).json({ ok: false, error: message, ...extra });
}

export function miniAppHandler(appId, work, options = {}) {
  return onRequest({ region: REGION, ...options }, async (req, res) => {
    setCors(res);
    if (req.method === 'OPTIONS') return res.status(204).send('');
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
    try {
      const user = await requireMiniAppAccess(req, appId);
      return res.status(200).json({ ok: true, ...(await work(req, user)) });
    } catch (error) {
      return res.status(Number(error?.status) || 500).json({ ok: false, error: error?.message || 'Request failed' });
    }
  });
}
