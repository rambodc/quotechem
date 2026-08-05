import admin from 'firebase-admin';
import { GoogleAuth } from 'google-auth-library';

const googleAuth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
const credential = {
  async getAccessToken() {
    const client = await googleAuth.getClient(); const token = await client.getAccessToken();
    return { access_token: token.token, expires_in: 3500 };
  },
};
admin.initializeApp({ credential, projectId: process.env.GOOGLE_CLOUD_PROJECT || 'quotechemfb', storageBucket: 'quotechemfb.firebasestorage.app' });
const db = admin.firestore(); const storage = admin.storage();

const MARKER = db.collection('uniquemSchema').doc('manual-inventory-v1');
const collections = [
  'uniquemItems', 'uniquemItemImports', 'uniquemAssemblyReconciliations',
  'uniquemAssemblyRecipes', 'uniquemAssemblyRecipeRevisions', 'uniquemAssemblyBuilds',
  'uniquemStockAdjustments', 'uniquemInventoryLayouts', 'uniquemInventoryTextures',
];

async function clearCollection(name) {
  let removed = 0;
  for (;;) {
    const snap = await db.collection(name).limit(400).get();
    if (snap.empty) return removed;
    const batch = db.batch(); snap.docs.forEach((doc) => batch.delete(doc.ref)); await batch.commit(); removed += snap.size;
  }
}

if ((await MARKER.get()).exists) {
  process.stdout.write('Uniquem manual-inventory-v1 reset already completed.\n');
  process.exit(0);
}

for (const name of collections) process.stdout.write(`${name}: ${await clearCollection(name)} documents removed.\n`);
await storage.bucket().deleteFiles({ prefix: 'uniquem/' });
await MARKER.create({ schema: 'manual-inventory-v1', ready: true, resetAt: admin.firestore.FieldValue.serverTimestamp(), resetBy: 'production-workflow' });
process.stdout.write('Uniquem manual-inventory-v1 readiness marker written.\n');
