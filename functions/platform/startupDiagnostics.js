import { randomUUID } from 'node:crypto';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { admin, auth, db, storage } from '../core/firebase.js';

async function testFirestore(uid, runId) {
  const ref = db.collection('diagnostics').doc(uid).collection('runs').doc(runId);
  await ref.set({
    uid,
    runId,
    source: 'runStartupDiagnostics',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  const snap = await ref.get();
  return {
    ok: snap.exists,
    path: ref.path,
  };
}

async function testStorage(uid, runId) {
  const bucket = storage.bucket();
  const objectPath = `diagnostics/${uid}/${runId}.txt`;
  const file = bucket.file(objectPath);
  await file.save(`quotechem diagnostics ${runId}\nuid=${uid}\n`, {
    contentType: 'text/plain',
    resumable: false,
    metadata: { cacheControl: 'no-cache' },
  });
  const [exists] = await file.exists();
  return {
    ok: exists,
    bucket: bucket.name,
    objectPath,
  };
}

async function testAuth(uid) {
  const user = await auth.getUser(uid);
  return {
    ok: Boolean(user.uid),
    uid: user.uid,
    email: user.email || null,
    emailVerified: Boolean(user.emailVerified),
    disabled: Boolean(user.disabled),
  };
}

export const runStartupDiagnostics = onCall({ region: 'us-central1' }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'You must be signed in to run diagnostics.');
  }

  const uid = request.auth.uid;
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const client = request.data?.client || {};
  const hasAppCheck = Boolean(request.app);

  logger.info('[runStartupDiagnostics] started', { runId, uid, hasAppCheck, client });

  const results = {};

  try {
    results.firestore = await testFirestore(uid, runId);
  } catch (error) {
    results.firestore = { ok: false, error: error?.message || String(error) };
    logger.error('[runStartupDiagnostics] firestore_failed', { runId, uid, error: results.firestore.error });
  }

  try {
    results.storage = await testStorage(uid, runId);
  } catch (error) {
    results.storage = { ok: false, error: error?.message || String(error) };
    logger.error('[runStartupDiagnostics] storage_failed', { runId, uid, error: results.storage.error });
  }

  try {
    results.auth = await testAuth(uid);
  } catch (error) {
    results.auth = { ok: false, error: error?.message || String(error) };
    logger.error('[runStartupDiagnostics] auth_failed', { runId, uid, error: results.auth.error });
  }

  results.appCheck = { ok: hasAppCheck, tokenPresent: hasAppCheck };

  const ok = Object.values(results).every((entry) => entry?.ok !== false);

  const response = {
    ok,
    runId,
    startedAt,
    finishedAt: new Date().toISOString(),
    projectId: process.env.GCLOUD_PROJECT || null,
    uid,
    results,
  };

  if (ok) {
    logger.info('[runStartupDiagnostics] completed', response);
  } else {
    logger.error('[runStartupDiagnostics] completed_with_failures', response);
  }

  return response;
});
