import test from 'node:test';
import assert from 'node:assert/strict';
import { RESET_COLLECTIONS, SCHEMA_VERSION, resetAssemblyData } from './reset-assembly-percentage.js';

const DELETE = Symbol('delete');

function fakeFirestore(seed) {
  const data = new Map(Object.entries(seed).map(([name, docs]) => [name, new Map(Object.entries(docs))]));
  const ref = (collection, id) => ({ collection, id });
  const snapshot = (collection, limit) => {
    const docs = [...(data.get(collection) || new Map()).entries()].slice(0, limit).map(([id, value]) => ({ id, ref: ref(collection, id), data: () => value }));
    return { docs, size: docs.length, empty: docs.length === 0 };
  };
  const database = {
    collection(name) {
      if (!data.has(name)) data.set(name, new Map());
      return {
        limit(count) { return { get: async () => snapshot(name, count) }; },
        doc(id) { return { ...ref(name, id), get: async () => { const value = data.get(name).get(id); return { data: () => value }; }, set: async (value) => data.get(name).set(id, value) }; },
      };
    },
    batch() {
      const operations = [];
      return {
        delete(document) { operations.push(() => data.get(document.collection).delete(document.id)); },
        update(document, patch) { operations.push(() => { const current = data.get(document.collection).get(document.id); for (const [key, value] of Object.entries(patch)) value === DELETE ? delete current[key] : current[key] = value; }); },
        async commit() { operations.forEach((operation) => operation()); },
      };
    },
  };
  return { database, data };
}

const fakeAdmin = { firestore: { FieldValue: { delete: () => DELETE, serverTimestamp: () => 'server-time' } } };

test('percentage reset deletes legacy assembly data, clears adjustments, and cannot run twice', async () => {
  const seed = Object.fromEntries(RESET_COLLECTIONS.map((name) => [name, { old: { legacy: true } }]));
  seed.uniquemItems = { one: { assemblyAdjustment: 25, assemblyUpdatedAt: 'old', item: 'One' } };
  const { database, data } = fakeFirestore(seed);
  const first = await resetAssemblyData(database, fakeAdmin);
  assert.equal(first.skipped, false);
  for (const name of RESET_COLLECTIONS) assert.equal(data.get(name).size, 0);
  assert.deepEqual(data.get('uniquemItems').get('one'), { assemblyAdjustment: 0, item: 'One' });
  assert.equal(data.get('uniquemAssemblySettings').get('schema').version, SCHEMA_VERSION);
  assert.equal((await resetAssemblyData(database, fakeAdmin)).skipped, true);
});
