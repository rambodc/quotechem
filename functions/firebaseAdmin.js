import admin from 'firebase-admin';

try {
  admin.app();
} catch {
  admin.initializeApp();
}

export const db = admin.firestore();
export const auth = admin.auth();
export const storage = admin.storage();
export { admin };
