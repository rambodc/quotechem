export function asString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeEmail(value) {
  return asString(value).toLowerCase();
}

export function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

export function normalizeRole(value) {
  return asString(value).toLowerCase() === 'admin' ? 'admin' : 'user';
}

export function normalizeDocId(value) {
  return asString(value).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 90);
}

export function readSecret(secretRef) {
  try {
    return asString(secretRef.value());
  } catch {
    return '';
  }
}

export function toIso(value) {
  return value?.toDate?.().toISOString?.() || (typeof value === 'string' ? value : null);
}
