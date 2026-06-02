import { auth } from '../firebase';

export function endpointBase() {
  const explicit = process.env.REACT_APP_QUOTECHEM_API_BASE?.trim();
  if (explicit) return explicit.replace(/\/$/, '');

  const projectId = process.env.REACT_APP_FIREBASE_PROJECT_ID?.trim();
  if (projectId) return `https://us-central1-${projectId}.cloudfunctions.net`;

  return '';
}

export async function postJson(path, payload = {}, options = {}) {
  const allowAppError = Boolean(options.allowAppError);
  const authed = Boolean(options.authed);
  const base = endpointBase();
  if (!base) throw new Error('Missing API base URL.');

  const headers = { 'Content-Type': 'application/json' };
  if (authed) {
    const user = auth.currentUser;
    if (!user) throw new Error('You must be signed in.');
    const token = await user.getIdToken();
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${base}/${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || (data?.ok === false && !allowAppError)) {
    throw new Error(data?.error || `Request failed (${response.status})`);
  }

  return data;
}
