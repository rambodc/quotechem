import { randomUUID } from 'node:crypto';
import { admin, db, storage } from '../../core/firebase.js';
import { miniAppHandler } from '../../core/http.js';

const ITEMS = 'uniquemItems';
const ADJUSTMENTS = 'uniquemStockAdjustments';
const PAGE_SIZE = 50;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const handler = (work) => miniAppHandler('uniquem', async (...args) => { if (!(await db.collection('uniquemSchema').doc('manual-inventory-v1').get()).exists) invalid('Uniquem upgrade is in progress. Try again shortly.', 503); return work(...args); });
const clean = (value, max = 2000) => String(value ?? '').trim().slice(0, max);
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
export const normalizeItemName = (value) => clean(value, 160).normalize('NFKC').toLocaleLowerCase('en-CA');

function invalid(message, status = 400) { throw Object.assign(new Error(message), { status }); }
function iso(value) { return value?.toDate ? value.toDate().toISOString() : value || null; }
function mapItem(doc) { const value = doc.data() || {}; return { ...value, productId: value.productId || doc.id, createdAt: iso(value.createdAt), updatedAt: iso(value.updatedAt), stockUpdatedAt: iso(value.stockUpdatedAt) }; }

export function normalizePackaging(rows) {
  if (!Array.isArray(rows)) invalid('Packaging must be a list.');
  if (rows.length > 20) invalid('An item may have at most 20 packaging types.');
  const normalized = rows.map((row, index) => {
    const type = clean(row?.type, 20).toLowerCase();
    if (!['tote', 'drum', 'pail', 'other'].includes(type)) invalid(`Packaging ${index + 1} has an invalid type.`);
    const customLabel = type === 'other' ? clean(row?.customLabel, 60) : '';
    if (type === 'other' && !customLabel) invalid(`Packaging ${index + 1} requires a custom label.`);
    const quantityPerPackage = Number(row?.quantityPerPackage); const packagesPerPallet = Number(row?.packagesPerPallet);
    if (!finite(quantityPerPackage) || quantityPerPackage <= 0) invalid(`Packaging ${index + 1} quantity per package must be positive.`);
    if (!finite(packagesPerPallet) || packagesPerPallet <= 0) invalid(`Packaging ${index + 1} packages per pallet must be positive.`);
    return { packagingId: clean(row?.packagingId, 80) || randomUUID(), type, customLabel, quantityPerPackage, packagesPerPallet, isPrimary: row?.isPrimary === true };
  });
  if (normalized.length && normalized.filter((row) => row.isPrimary).length !== 1) invalid('Choose exactly one primary 3D packaging type.');
  return normalized;
}

export function itemPayload(body = {}, creating = false) {
  const item = clean(body.item, 160); if (!item) invalid('Item name is required.');
  const unitOfMeasure = clean(body.unitOfMeasure, 20); if (!['Each', 'Liters'].includes(unitOfMeasure)) invalid('U/M must be Each or Liters.');
  const active = body.active !== false;
  const color = clean(body.color, 20).toLowerCase(); if (!/^#[0-9a-f]{6}$/.test(color)) invalid('Choose a valid inventory color.');
  const result = { item, normalizedItem: normalizeItemName(item), description: clean(body.description), unitOfMeasure, active, activeStatus: active ? 'Active' : 'Inactive', color, packaging: normalizePackaging(body.packaging || []) };
  if (creating) { const quantityOnHand = Number(body.quantityOnHand); if (!finite(quantityOnHand) || quantityOnHand < 0) invalid('Opening Quantity On Hand must be zero or greater.'); result.quantityOnHand = quantityOnHand; }
  return result;
}

async function allItems() { const snap = await db.collection(ITEMS).limit(5000).get(); return snap.docs.map(mapItem).sort((a, b) => a.item.localeCompare(b.item)); }
async function ensureUnique(normalizedItem, exceptId = '') { const snap = await db.collection(ITEMS).where('normalizedItem', '==', normalizedItem).limit(2).get(); if (snap.docs.some((doc) => doc.id !== exceptId)) invalid('An item with this name already exists.', 409); }

export const listUniquemItems = handler(async (req) => {
  const query = clean(req.body?.query, 160).toLowerCase(); const status = clean(req.body?.status, 20); const cursor = clean(req.body?.cursor, 160);
  const filtered = (await allItems()).filter((item) => (!query || `${item.item} ${item.description}`.toLowerCase().includes(query)) && (!status || (status === 'active') === item.active));
  const start = cursor ? Math.max(0, filtered.findIndex((item) => item.productId === cursor) + 1) : 0; const items = filtered.slice(start, start + PAGE_SIZE);
  return { items, nextCursor: start + PAGE_SIZE < filtered.length ? items.at(-1)?.productId : null, total: filtered.length };
});

export const saveUniquemItem = handler(async (req, user) => {
  const productId = clean(req.body?.productId, 160); const creating = !productId; const value = itemPayload(req.body, creating); await ensureUnique(value.normalizedItem, productId);
  const now = admin.firestore.FieldValue.serverTimestamp(); const ref = db.collection(ITEMS).doc(productId || randomUUID());
  if (creating) await ref.create({ productId: ref.id, ...value, image: null, lastAssemblyComponents: [], createdAt: now, createdBy: user.uid, createdByEmail: user.email || '', updatedAt: now, updatedBy: user.uid });
  else await db.runTransaction(async (tx) => { const snap = await tx.get(ref); if (!snap.exists) invalid('Item no longer exists.', 404); tx.update(ref, { ...value, updatedAt: now, updatedBy: user.uid }); });
  return { item: mapItem(await ref.get()) };
});

function imageDimensions(buffer, contentType) {
  if (contentType === 'image/png' && buffer.length >= 24) return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  if (contentType === 'image/jpeg') { for (let offset = 2; offset + 9 < buffer.length;) { if (buffer[offset] !== 0xff) return null; const marker = buffer[offset + 1]; const length = buffer.readUInt16BE(offset + 2); if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) }; offset += 2 + length; } }
  if (contentType === 'image/webp' && buffer.subarray(12,16).toString() === 'VP8X') return { width: 1 + buffer.readUIntLE(24,3), height: 1 + buffer.readUIntLE(27,3) };
  return null;
}

export const uploadUniquemItemImage = handler(async (req, user) => {
  const productId = clean(req.body?.productId, 160); const contentType = clean(req.body?.contentType, 40).toLowerCase(); const dataUrl = clean(req.body?.dataUrl, MAX_IMAGE_BYTES * 2);
  if (!IMAGE_TYPES.has(contentType) || !dataUrl.startsWith(`data:${contentType};base64,`)) invalid('Use a JPG, PNG, or WebP image.');
  const buffer = Buffer.from(dataUrl.split(',')[1] || '', 'base64'); if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) invalid('Processed image must be 2 MB or smaller.');
  const dimensions = imageDimensions(buffer, contentType); if (!dimensions || dimensions.width !== dimensions.height || dimensions.width > 500 || dimensions.width < 32) invalid('Image must be square and between 32 and 500 pixels.');
  const ref = db.collection(ITEMS).doc(productId); const snap = await ref.get(); if (!snap.exists) invalid('Item no longer exists.', 404);
  const extension = contentType === 'image/jpeg' ? 'jpg' : contentType.split('/')[1]; const path = `uniquem/item-images/${productId}/${randomUUID()}.${extension}`; const token = randomUUID();
  await storage.bucket().file(path).save(buffer, { contentType, resumable: false, metadata: { metadata: { firebaseStorageDownloadTokens: token, uploadedBy: user.uid } } });
  const oldPath = snap.data()?.image?.path; const image = { path, token, contentType, width: dimensions.width, height: dimensions.height, url: `https://firebasestorage.googleapis.com/v0/b/${storage.bucket().name}/o/${encodeURIComponent(path)}?alt=media&token=${token}` };
  await ref.update({ image, updatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedBy: user.uid }); if (oldPath) await storage.bucket().file(oldPath).delete({ ignoreNotFound: true });
  return { image };
});

export const adjustUniquemItemStock = handler(async (req, user) => {
  const productId = clean(req.body?.productId, 160); const mode = clean(req.body?.mode, 20); const amount = Number(req.body?.amount); const reason = clean(req.body?.reason, 500);
  if (!['add','remove','set'].includes(mode) || !finite(amount) || amount < 0 || (mode !== 'set' && amount === 0)) invalid('Enter a valid stock adjustment.'); if (!reason) invalid('Adjustment reason is required.');
  let item;
  await db.runTransaction(async (tx) => { const ref = db.collection(ITEMS).doc(productId); const snap = await tx.get(ref); if (!snap.exists) invalid('Item no longer exists.', 404); const current = Number(snap.data().quantityOnHand) || 0; const next = mode === 'set' ? amount : current + (mode === 'add' ? amount : -amount); if (next < 0) invalid('Manual adjustments cannot make inventory negative.'); const delta = next - current; const now = admin.firestore.FieldValue.serverTimestamp(); const adjustmentId = randomUUID(); tx.update(ref, { quantityOnHand: next, stockUpdatedAt: now, stockUpdatedBy: user.uid, updatedAt: now, updatedBy: user.uid }); tx.create(db.collection(ADJUSTMENTS).doc(adjustmentId), { adjustmentId, productId, item: snap.data().item, mode, requestedAmount: amount, previousQuantity: current, delta, resultingQuantity: next, reason, createdAt: now, createdBy: user.uid, createdByEmail: user.email || '' }); item = { ...snap.data(), productId, quantityOnHand: next }; });
  return { item };
});

export const __testables = { itemPayload, normalizePackaging, imageDimensions };
