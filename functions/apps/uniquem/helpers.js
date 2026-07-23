export const COLLECTIONS = {
  products: 'uniquemProducts', warehouses: 'uniquemWarehouses', batches: 'uniquemInventoryBatches',
  ledger: 'uniquemInventoryLedger', receipts: 'uniquemReceipts', shipments: 'uniquemShipments',
  recipes: 'uniquemRecipes', runs: 'uniquemProductionRuns', attachments: 'uniquemAttachments',
};

export function normalizeUniquemQuantity(value, { allowNegative = false, fallback = 0 } = {}) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  const rounded = Math.round(num * 1000) / 1000;
  if (allowNegative) return Math.max(-100000000, Math.min(100000000, rounded));
  return Math.max(0, Math.min(100000000, rounded));
}

export function normalizeUniquemStatus(value, allowed = ['active', 'archived'], fallback = 'active') {
  const status = asString(value).toLowerCase();
  return allowed.includes(status) ? status : fallback;
}

export function toUniquemIso(value) {
  return toIso(value);
}

import { miniAppHandler } from '../../core/http.js';
import { admin } from '../../core/firebase.js';
import { asString } from '../../core/values.js';

export const now = () => admin.firestore.FieldValue.serverTimestamp();

export const text = (value, max = 500) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

export const id = (value) => text(value, 120).replace(/[^a-zA-Z0-9._-]/g, '');

export const qty = (value, label = 'Quantity') => {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw Object.assign(new Error(`${label} must be greater than zero.`), { status: 400 });
  return Math.round(number * 1000) / 1000;
};

export const signedQty = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number === 0) throw Object.assign(new Error('Adjustment quantity cannot be zero.'), { status: 400 });
  return Math.round(number * 1000) / 1000;
};

export const iso = (value) => value?.toDate?.().toISOString?.() || (typeof value === 'string' ? value : null);

export const handler = (work) => miniAppHandler('uniquem', work);
