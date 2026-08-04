import { pathToFileURL } from 'node:url';

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

export async function resetAssemblyData(database, firestoreAdmin) {
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

async function resetAssemblyDataRest(token, projectId = 'quotechemfb') {
  if (!token) throw new Error('FIRESTORE_ACCESS_TOKEN is required.');
  const root = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const request = async (url, options = {}) => {
    const response = await fetch(url, { ...options, headers });
    if (response.status === 404 && options.allowNotFound) return null;
    if (!response.ok) throw new Error(`Firestore REST ${response.status}: ${await response.text()}`);
    return response.status === 204 ? null : response.json();
  };
  const list = async (collection) => {
    const documents = []; let pageToken = '';
    do {
      const suffix = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '';
      const result = await request(`${root}/${collection}?pageSize=300${suffix}`);
      documents.push(...(result.documents || [])); pageToken = result.nextPageToken || '';
    } while (pageToken);
    return documents;
  };

  const schema = await request(`${root}/uniquemAssemblySettings/schema`, { allowNotFound: true });
  if (schema?.fields?.version?.stringValue === SCHEMA_VERSION) return { skipped: true, reason: 'percentage schema is already ready' };

  const deleted = {};
  for (const collection of RESET_COLLECTIONS) {
    const documents = await list(collection);
    for (const document of documents) await request(`https://firestore.googleapis.com/v1/${document.name}`, { method: 'DELETE' });
    deleted[collection] = documents.length;
  }

  const items = await list('uniquemItems');
  for (let offset = 0; offset < items.length; offset += 400) {
    const writes = items.slice(offset, offset + 400).map((document) => ({
      update: { name: document.name, fields: { assemblyAdjustment: { integerValue: '0' } } },
      updateMask: { fieldPaths: ['assemblyAdjustment', 'assemblyUpdatedAt', 'assemblyUpdatedBy', 'assemblyReconciledAt', 'assemblyReconciledBy', 'assemblyReconciledImportId'] },
    }));
    await request(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:commit`, { method: 'POST', body: JSON.stringify({ writes }) });
  }

  await request(`${root}/uniquemAssemblySettings/schema?updateMask.fieldPaths=version&updateMask.fieldPaths=resetAt&updateMask.fieldPaths=resetBy&updateMask.fieldPaths=deleted&updateMask.fieldPaths=resetItems`, { method: 'PATCH', body: JSON.stringify({ fields: { version: { stringValue: SCHEMA_VERSION }, resetAt: { timestampValue: new Date().toISOString() }, resetBy: { stringValue: 'github-actions' }, deleted: { mapValue: { fields: Object.fromEntries(Object.entries(deleted).map(([key, value]) => [key, { integerValue: String(value) }])) } }, resetItems: { integerValue: String(items.length) } } }) });
  return { skipped: false, deleted, resetItems: items.length };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  resetAssemblyDataRest(process.env.FIRESTORE_ACCESS_TOKEN, process.env.GOOGLE_CLOUD_PROJECT).then((result) => {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    process.exit(0);
  }).catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exit(1);
  });
}
