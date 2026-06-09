const DB_NAME = 'quotechem-offline';
const DB_VERSION = 1;
const STORE_NAME = 'drillingFluidReports';

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('Offline storage is not available in this browser.'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'localId' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Unable to open offline storage.'));
  });
}

function withStore(mode, callback) {
  return openDatabase().then(
    (db) =>
      new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, mode);
        const store = transaction.objectStore(STORE_NAME);
        const request = callback(store);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('Offline storage request failed.'));
        transaction.oncomplete = () => db.close();
        transaction.onerror = () => {
          db.close();
          reject(transaction.error || new Error('Offline storage transaction failed.'));
        };
      })
  );
}

export async function listDrillingFluidReports() {
  const items = await withStore('readonly', (store) => store.getAll());
  return items.sort((a, b) => String(b.localUpdatedAt || '').localeCompare(String(a.localUpdatedAt || '')));
}

export function getDrillingFluidReport(localId) {
  return withStore('readonly', (store) => store.get(localId));
}

export function saveDrillingFluidReport(report) {
  return withStore('readwrite', (store) => store.put(report));
}

export async function updateDrillingFluidReport(localId, patch) {
  const existing = await getDrillingFluidReport(localId);
  if (!existing) throw new Error('Local report was not found.');
  const updated = { ...existing, ...patch, localUpdatedAt: new Date().toISOString() };
  await saveDrillingFluidReport(updated);
  return updated;
}
