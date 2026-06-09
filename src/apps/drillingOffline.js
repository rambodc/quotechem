export const OFFLINE_DRILLING_ROUTE = '/offline/drilling-fluids-report';
export const OFFLINE_CACHE_NAME = 'quotechem-drilling-fluids-v2';
export const PREPARED_USER_KEY = 'quotechem:offline-drilling-user';

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

export function warmDrillingOfflineCache() {
  if (!('caches' in window)) return Promise.resolve(false);
  const sameOriginAssets = performance
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
  const urls = Array.from(new Set(['/', OFFLINE_DRILLING_ROUTE, '/manifest.json', ...sameOriginAssets]));
  return window.caches
    .open(OFFLINE_CACHE_NAME)
    .then((cache) => cache.addAll(urls))
    .then(() => true)
    .catch(() => false);
}
