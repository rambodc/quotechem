import { onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import admin from 'firebase-admin';

try { admin.app(); } catch { admin.initializeApp(); }
const db = admin.firestore();

function randomTag() {
  return Math.floor(10_000_000 + Math.random() * 90_000_000);
}

export const generateUserTag = onCall({
  region: 'us-central1',
  maxInstances: 10,
}, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new Error('unauthenticated');
  }

  const userRef = db.doc(`users/${uid}`);
  const existingSnap = await userRef.get();
  const existingTag = existingSnap.exists ? existingSnap.get('userTag') : null;
  if (existingTag) {
    return { userTag: String(existingTag), existed: true };
  }

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = String(randomTag());
    const tagRef = db.doc(`userTags/${candidate}`);
    try {
      await db.runTransaction(async (tx) => {
        const tagSnap = await tx.get(tagRef);
        if (tagSnap.exists) throw new Error('collision');

        const timestamp = admin.firestore.FieldValue.serverTimestamp();
        tx.set(tagRef, { uid, createdAt: timestamp });
        tx.set(userRef, {
          userTag: candidate,
          userTagCreatedAt: timestamp,
          updatedAt: timestamp,
        }, { merge: true });
      });

      logger.info('[generateUserTag] Allocated tag', { uid, candidate });
      return { userTag: candidate, existed: false };
    } catch (err) {
      if (err?.message === 'collision') continue;
      logger.error('[generateUserTag] Failed to allocate tag', err);
      throw err;
    }
  }

  throw new Error('allocation_failed');
});
