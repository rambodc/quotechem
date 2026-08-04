import { pathToFileURL } from 'node:url';
import { admin, db } from '../core/firebase.js';

export const RESET_COLLECTIONS = [
  'uniquemAssemblyRecipes',
  'uniquemAssemblyRecipeRevisions',
  'uniquemAssemblyBuilds',
  'uniquemAssemblyReconciliations',
];
export const SCHEMA_VERSION = 'percentage-v1';

async function deleteCollection(name, database) {
  let deleted = 0;
  while (true) {
    const snapshot = await database.collection(name).limit(400).get();
    if (snapshot.empty) return deleted;
    const batch = database.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    deleted += snapshot.size;
  }
}

export async function resetAssemblyData(database = db, firestoreAdmin = admin) {
  const schemaRef = database.collection('uniquemAssemblySettings').doc('schema');
  const existing = await schemaRef.get();
  if (existing.data()?.version === SCHEMA_VERSION) return { skipped: true, reason: 'percentage schema is already ready' };

  const deleted = {};
  for (const name of RESET_COLLECTIONS) deleted[name] = await deleteCollection(name, database);

  const items = await database.collection('uniquemItems').limit(1000).get();
  for (let offset = 0; offset < items.docs.length; offset += 400) {
    const batch = database.batch();
    for (const doc of items.docs.slice(offset, offset + 400)) batch.update(doc.ref, {
      assemblyAdjustment: 0,
      assemblyUpdatedAt: firestoreAdmin.firestore.FieldValue.delete(),
      assemblyUpdatedBy: firestoreAdmin.firestore.FieldValue.delete(),
      assemblyReconciledAt: firestoreAdmin.firestore.FieldValue.delete(),
      assemblyReconciledBy: firestoreAdmin.firestore.FieldValue.delete(),
      assemblyReconciledImportId: firestoreAdmin.firestore.FieldValue.delete(),
    });
    await batch.commit();
  }

  await schemaRef.set({ version: SCHEMA_VERSION, resetAt: firestoreAdmin.firestore.FieldValue.serverTimestamp(), resetBy: 'github-actions', deleted, resetItems: items.size });
  return { skipped: false, deleted, resetItems: items.size };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  resetAssemblyData().then((result) => {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    process.exit(0);
  }).catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exit(1);
  });
}
