// src/firebase.js
import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
import { getStorage, ref } from 'firebase/storage';

// Prefer env-driven config so we can point the app at any project
// In CI, these are injected per-branch from GitHub Environment secrets.
const required = [
  'REACT_APP_FIREBASE_API_KEY',
  'REACT_APP_FIREBASE_AUTH_DOMAIN',
  'REACT_APP_FIREBASE_PROJECT_ID',
  'REACT_APP_FIREBASE_STORAGE_BUCKET',
  'REACT_APP_FIREBASE_MESSAGING_SENDER_ID',
  'REACT_APP_FIREBASE_APP_ID',
];

required.forEach((k) => {
  if (!process.env[k]) {
    // Fail fast in development builds so we never accidentally point to prod defaults
    // For production builds via CI, these are required and come from secrets
    console.warn(`Missing env var ${k}. Did you configure GitHub Environment secrets?`);
  }
});

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID,
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, 'us-central1');
// Prefer env-driven bucket; fall back to the dev bucket for safety in this branch
const FORCED_BUCKET =
  process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || 'showmaster1-f1a9f.firebasestorage.app';
export const storage = getStorage(app, `gs://${FORCED_BUCKET}`);

// Tiny debug helper: prints the storage root used at runtime
export function logStorageDebug() {
  try {
    // eslint-disable-next-line no-console
    console.log('[storage] app.options.storageBucket =', app.options?.storageBucket);
    // eslint-disable-next-line no-console
    console.log('[storage] ref(storage).toString() =', ref(storage).toString());
  } catch {}
}

// Optional App Check (Enterprise) initialization if a site key is provided.
// This helps if Storage/App Check enforcement is enabled.
try {
  const siteKey = process.env.REACT_APP_APPCHECK_SITE_KEY;
  if (siteKey) {
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
  }
} catch (err) {
  // Non-fatal; continue without App Check
  console.warn('App Check init skipped or failed:', err?.message || err);
}
export default app;
