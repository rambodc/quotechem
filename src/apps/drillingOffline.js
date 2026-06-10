export const OFFLINE_DRILLING_ROUTE = '/offline/drilling-fluids-report';
export const OFFLINE_CACHE_NAME = 'quotechem-drilling-fluids-v2';
export const PREPARED_USER_KEY = 'quotechem:offline-drilling-user';
export const DRILLING_MANIFEST_PATH = '/drilling-fluids-manifest.json';

export function readPreparedDrillingUser() {
  try {
    const raw = window.localStorage.getItem(PREPARED_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writePreparedDrillingUser(user) {
  const preparedUser = {
    uid: user?.id || user?.firebaseUid || '',
    email: user?.email || '',
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    preparedAt: new Date().toISOString(),
  };
  try {
    window.localStorage.setItem(PREPARED_USER_KEY, JSON.stringify(preparedUser));
  } catch {}
  return preparedUser;
}

export function registerDrillingOfflineWorker() {
  if (!('serviceWorker' in navigator)) return Promise.resolve(false);
  return navigator.serviceWorker.register('/drilling-fluids-sw.js').then(() => true).catch(() => false);
}

export function activateDrillingManifest() {
  const manifest = document.querySelector('link[rel="manifest"]');
  if (!manifest) return () => {};
  const previousHref = manifest.getAttribute('href');
  manifest.setAttribute('href', DRILLING_MANIFEST_PATH);
  return () => {
    if (previousHref) manifest.setAttribute('href', previousHref);
  };
}

function sameOriginAssetUrls() {
  if (!('performance' in window)) return [];
  return performance
    .getEntriesByType('resource')
    .map((entry) => entry.name)
    .filter((name) => {
      try {
        const url = new URL(name);
        return url.origin === window.location.origin && (url.pathname.startsWith('/static/') || url.pathname.startsWith('/assets/') || url.pathname === '/manifest.json');
      } catch {
        return false;
      }
    });
}

export function drillingOfflineUrls() {
  return Array.from(new Set(['/', OFFLINE_DRILLING_ROUTE, DRILLING_MANIFEST_PATH, ...sameOriginAssetUrls()]));
}

export function warmDrillingOfflineCache() {
  if (!('caches' in window)) return Promise.resolve(false);
  const urls = drillingOfflineUrls();
  return window.caches
    .open(OFFLINE_CACHE_NAME)
    .then((cache) => cache.addAll(urls))
    .then(() => true)
    .catch(() => false);
}

function testIndexedDb() {
  return new Promise((resolve) => {
    if (!('indexedDB' in window)) {
      resolve(false);
      return;
    }

    const request = window.indexedDB.open('quotechem-offline-readiness', 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('checks')) db.createObjectStore('checks');
    };
    request.onsuccess = () => {
      request.result.close();
      resolve(true);
    };
    request.onerror = () => resolve(false);
  });
}

async function serviceWorkerReady() {
  if (!('serviceWorker' in navigator)) return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    return Boolean(registration?.active || navigator.serviceWorker.controller);
  } catch {
    return false;
  }
}

async function cacheHasRequiredUrls() {
  if (!('caches' in window)) return { offlinePageCached: false, assetsCached: false };
  try {
    const cache = await window.caches.open(OFFLINE_CACHE_NAME);
    const required = drillingOfflineUrls();
    const matches = await Promise.all(required.map((url) => cache.match(url)));
    return {
      offlinePageCached: Boolean(await cache.match(OFFLINE_DRILLING_ROUTE)),
      assetsCached: matches.every(Boolean),
    };
  } catch {
    return { offlinePageCached: false, assetsCached: false };
  }
}

export async function verifyDrillingOfflineReadiness() {
  const accountPrepared = Boolean(readPreparedDrillingUser()?.uid);
  const storageReady = await testIndexedDb();
  const serviceWorkerActive = await serviceWorkerReady();
  const cacheState = await cacheHasRequiredUrls();
  const ready = accountPrepared && storageReady && serviceWorkerActive && cacheState.offlinePageCached && cacheState.assetsCached;

  return {
    ready,
    accountPrepared,
    storageReady,
    serviceWorkerActive,
    offlinePageCached: cacheState.offlinePageCached,
    assetsCached: cacheState.assetsCached,
  };
}

export async function prepareDrillingOfflineApp(user) {
  writePreparedDrillingUser(user);
  await registerDrillingOfflineWorker();
  await warmDrillingOfflineCache();
  return verifyDrillingOfflineReadiness();
}
