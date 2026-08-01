import { createHash, randomUUID } from 'node:crypto';
import { admin, db } from '../../core/firebase.js';
import { miniAppHandler } from '../../core/http.js';
import { catalogRevision } from './items.js';

const ITEMS = 'uniquemItems';
const LAYOUTS = 'uniquemInventoryLayouts';
const CURRENT_LAYOUT = 'current';
const ROW_GAP = 1.4;
const MAX_LOADS = 2500;
const COLORS = ['#0f766e', '#2563eb', '#7c3aed', '#c2410c', '#be123c', '#4d7c0f', '#0369a1', '#a16207'];
const handler = (work) => miniAppHandler('uniquem', work);

function invalid(message, status = 400) {
  throw Object.assign(new Error(message), { status });
}

const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const normalizedUnit = (value) => String(value || '').trim().toLocaleLowerCase('en-CA');
const positiveQuantity = (item) => finite(item?.quantityOnHand) && item.quantityOnHand > 0;

export function deterministicColor(productId = '') {
  let hash = 0;
  for (const char of String(productId)) hash = ((hash * 31) + char.charCodeAt(0)) >>> 0;
  return COLORS[hash % COLORS.length];
}

export function inferPackaging(item = {}, override = null) {
  const quantity = positiveQuantity(item) ? item.quantityOnHand : 0;
  const unit = normalizedUnit(item.unitOfMeasure);
  const description = String(item.description || '');
  const configured = override && typeof override === 'object' ? override : {};
  const representation = configured.representation === 'tote' || configured.representation === 'pallet'
    ? configured.representation
    : unit === 'litre (l)' ? 'tote' : 'pallet';

  if (representation === 'tote') {
    const capacity = finite(configured.capacityPerTote) && configured.capacityPerTote > 0 ? configured.capacityPerTote : 1000;
    return { representation, capacity, packageLabel: configured.packageLabel || 'litres', inferred: !configured.capacityPerTote, resolved: true, source: configured.capacityPerTote ? 'override' : 'unit' };
  }

  if (finite(configured.unitsPerPallet) && configured.unitsPerPallet > 0) {
    return { representation, capacity: configured.unitsPerPallet, packageLabel: configured.packageLabel || 'units', inferred: false, resolved: true, source: 'override' };
  }

  // QuickBooks descriptions vary widely: "40 x 25kg bags/Pallet", "48 x 11.3 kg bag)/Pallet",
  // and "32 x 19 L/Pail" all mean that the first integer is the pallet unit count.
  const match = description.match(/(?:^|[(\s])(\d{1,4})\s*[x×]\s*\d+(?:\.\d+)?\s*(?:kg|l)?\s*\/?\s*(bags?|pails?|boxes?|units?)\b/i);
  if (match) {
    const label = match[2].toLocaleLowerCase('en-CA').replace(/s$/, '');
    return { representation, capacity: Number(match[1]), packageLabel: `${label}s`, inferred: true, resolved: true, source: 'description' };
  }

  return { representation: 'pallet', capacity: null, packageLabel: configured.packageLabel || (unit === 'kilogram (kg)' ? 'kilograms' : 'units'), inferred: false, resolved: false, source: 'placeholder', warning: 'Packaging quantity could not be inferred. Configure this product to calculate pallets.' };
}

export function calculateInventoryProduct(item, setting = {}) {
  const visibleByStock = item.activeStatus === 'Active' && positiveQuantity(item);
  if (!visibleByStock) {
    return { productId: item.productId, item: item.item, visible: false, hiddenReason: item.activeStatus !== 'Active' ? 'Not-active in QuickBooks' : 'Quantity On Hand is zero or blank' };
  }
  if (setting.visible === false) {
    const restorable = calculateInventoryProduct(item, { ...setting, visible: true });
    return { ...restorable, visible: false, canShow: true, hiddenReason: 'Hidden from 3D by a user' };
  }
  const packaging = inferPackaging(item, setting.packaging);
  const loadCount = packaging.resolved ? Math.ceil(item.quantityOnHand / packaging.capacity) : 1;
  if (loadCount > MAX_LOADS) invalid(`${item.item} would create more than ${MAX_LOADS} loads. Configure a larger package capacity.`);
  const remainder = packaging.resolved ? item.quantityOnHand % packaging.capacity : null;
  const finalLoadQuantity = packaging.resolved ? (remainder || packaging.capacity) : item.quantityOnHand;
  const partial = packaging.resolved && remainder > 0;
  const stackLimit = 3;
  const stackCount = Math.ceil(loadCount / stackLimit);
  const columns = Math.max(1, Math.ceil(Math.sqrt(stackCount)));
  const rows = Math.max(1, Math.ceil(stackCount / columns));
  return {
    productId: item.productId,
    item: item.item,
    description: item.description || null,
    type: item.type || null,
    quantityOnHand: item.quantityOnHand,
    unitOfMeasure: item.unitOfMeasure || null,
    visible: true,
    color: setting.color || deterministicColor(item.productId),
    position: null,
    rotation: 0,
    packaging,
    loadCount,
    columns,
    rows,
    stackCount,
    stackLimit,
    partial,
    finalLoadQuantity,
    finalLoadPercent: packaging.resolved ? Math.round((finalLoadQuantity / packaging.capacity) * 1000) / 10 : null,
    footprint: { width: Math.max(1.2, columns * 1.35), depth: Math.max(1.2, rows * 1.35) },
  };
}

function rotatedFootprint(product) {
  return product.rotation % 180 === 0 ? product.footprint : { width: product.footprint.depth, depth: product.footprint.width };
}

export function rowsOverlap(left, right) {
  const a = rotatedFootprint(left); const b = rotatedFootprint(right);
  return Math.abs(left.position.x - right.position.x) < (a.width + b.width) / 2 + ROW_GAP / 2
    && Math.abs(left.position.z - right.position.z) < (a.depth + b.depth) / 2 + ROW_GAP / 2;
}

export function autoPlaceProducts(products = []) {
  if (!products.length) return [];
  const totalArea = products.reduce((sum, product) => sum + (product.footprint.width + ROW_GAP) * (product.footprint.depth + ROW_GAP), 0);
  const widest = products.reduce((max, product) => Math.max(max, product.footprint.width), 0);
  const targetWidth = Math.max(widest, 24, Math.ceil(Math.sqrt(totalArea) * 1.35));
  let cursorX = 0; let cursorZ = 0; let shelfDepth = 0;
  const placed = products.map((product) => {
    if (cursorX > 0 && cursorX + product.footprint.width > targetWidth) { cursorX = 0; cursorZ += shelfDepth + ROW_GAP; shelfDepth = 0; }
    const next = { ...product, position: { x: cursorX + product.footprint.width / 2, z: cursorZ + product.footprint.depth / 2 }, rotation: 0 };
    cursorX += product.footprint.width + ROW_GAP;
    shelfDepth = Math.max(shelfDepth, product.footprint.depth);
    return next;
  });
  const minX = Math.min(...placed.map((product) => product.position.x - product.footprint.width / 2));
  const maxX = Math.max(...placed.map((product) => product.position.x + product.footprint.width / 2));
  const minZ = Math.min(...placed.map((product) => product.position.z - product.footprint.depth / 2));
  const maxZ = Math.max(...placed.map((product) => product.position.z + product.footprint.depth / 2));
  const centreX = (minX + maxX) / 2; const centreZ = (minZ + maxZ) / 2;
  return placed.map((product) => ({ ...product, position: { x: product.position.x - centreX, z: product.position.z - centreZ } }));
}

function safeSetting(value = {}, productId) {
  const color = String(value.color || '');
  if (!/^#[0-9a-f]{6}$/i.test(color)) invalid(`Invalid color for ${productId}.`);
  const packaging = value.packaging && typeof value.packaging === 'object' ? value.packaging : null;
  let normalizedPackaging = null;
  if (packaging) {
    if (!['tote', 'pallet'].includes(packaging.representation)) invalid(`Invalid representation for ${productId}.`);
    for (const key of ['capacityPerTote', 'unitsPerPallet']) if (packaging[key] != null && (!finite(packaging[key]) || packaging[key] <= 0)) invalid(`Invalid packaging capacity for ${productId}.`);
    const capacityKey = packaging.representation === 'tote' ? 'capacityPerTote' : 'unitsPerPallet';
    if (!finite(packaging[capacityKey]) || packaging[capacityKey] <= 0) invalid(`Packaging capacity is required for ${productId}.`);
    normalizedPackaging = {
      representation: packaging.representation,
      packageLabel: String(packaging.packageLabel || 'units').trim().slice(0, 40) || 'units',
      ...(packaging.representation === 'tote' ? { capacityPerTote: packaging.capacityPerTote } : { unitsPerPallet: packaging.unitsPerPallet }),
    };
  }
  return { color: color.toLowerCase(), visible: value.visible !== false, packaging: normalizedPackaging };
}

function revision(items, layout = {}) {
  return createHash('sha256').update(JSON.stringify({ catalog: catalogRevision(items), layoutRevision: layout.layoutRevision || '' })).digest('hex');
}

function mapItem(doc) {
  const data = doc.data() || {};
  return { ...data, productId: data.productId || doc.id };
}

export function buildInventory(items = [], layout = {}) {
  const settings = layout.products || {};
  const calculated = items.map((item) => calculateInventoryProduct(item, settings[item.productId] || {}));
  const visible = autoPlaceProducts(calculated.filter((item) => item.visible).sort((a, b) => a.item.localeCompare(b.item)));
  const hidden = calculated.filter((item) => !item.visible).sort((a, b) => a.item.localeCompare(b.item));
  const maxX = visible.reduce((max, item) => Math.max(max, Math.abs(item.position.x) + rotatedFootprint(item).width / 2), 10);
  const maxZ = visible.reduce((max, item) => Math.max(max, Math.abs(item.position.z) + rotatedFootprint(item).depth / 2), 10);
  return { products: visible, hiddenProducts: hidden, floor: { width: Math.ceil((maxX * 2 + 8) / 5) * 5, depth: Math.ceil((maxZ * 2 + 8) / 5) * 5 } };
}

async function loadInventory(tx = null) {
  const itemQuery = db.collection(ITEMS).limit(1000);
  const layoutRef = db.collection(LAYOUTS).doc(CURRENT_LAYOUT);
  const [itemSnap, layoutSnap] = await Promise.all([tx ? tx.get(itemQuery) : itemQuery.get(), tx ? tx.get(layoutRef) : layoutRef.get()]);
  const items = itemSnap.docs.map(mapItem);
  const layout = layoutSnap.exists ? layoutSnap.data() : {};
  return { items, layout, layoutRef, ...buildInventory(items, layout), revision: revision(items, layout) };
}

function defaultSavedSetting(product) {
  return { color: product.color, visible: true, packaging: null };
}

async function ensureAutomaticPlacements(user) {
  let changed = false;
  await db.runTransaction(async (tx) => {
    const loaded = await loadInventory(tx);
    const retained = { ...(loaded.layout.products || {}) };
    for (const product of loaded.products) {
      if (!retained[product.productId]) { retained[product.productId] = defaultSavedSetting(product); changed = true; }
    }
    if (!changed) return;
    tx.set(loaded.layoutRef, { products: retained, layoutRevision: randomUUID(), updatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedBy: user.uid, updatedByEmail: user.email || '' }, { merge: false });
  });
  return changed;
}

export const getUniquemInventory = handler(async (req, user) => {
  await ensureAutomaticPlacements(user);
  const loaded = await loadInventory();
  return { products: loaded.products, hiddenProducts: loaded.hiddenProducts, floor: loaded.floor, revision: loaded.revision, updatedAt: loaded.layout.updatedAt?.toDate?.().toISOString() || null, updatedByEmail: loaded.layout.updatedByEmail || '' };
});

export const saveUniquemInventoryLayout = handler(async (req, user) => {
  const expectedRevision = String(req.body?.revision || '');
  const incoming = req.body?.products;
  if (!expectedRevision || !incoming || typeof incoming !== 'object' || Array.isArray(incoming)) invalid('A reviewed inventory layout is required.');
  await db.runTransaction(async (tx) => {
    const loaded = await loadInventory(tx);
    if (loaded.revision !== expectedRevision) invalid('Inventory or layout changed while you were editing. Reload and try again.', 409);
    const itemsById = new Map(loaded.items.map((item) => [item.productId, item]));
    const retained = { ...(loaded.layout.products || {}) };
    for (const [productId, value] of Object.entries(incoming)) {
      if (!itemsById.has(productId)) invalid(`Unknown inventory item ${productId}.`, 409);
      retained[productId] = safeSetting(value, productId);
    }
    const calculated = buildInventory(loaded.items, { products: retained }).products;
    for (let left = 0; left < calculated.length; left += 1) for (let right = left + 1; right < calculated.length; right += 1) {
      if (rowsOverlap(calculated[left], calculated[right])) invalid(`${calculated[left].item} overlaps ${calculated[right].item}. Move one row before saving.`, 409);
    }
    const layoutRevision = randomUUID();
    tx.set(loaded.layoutRef, { products: retained, layoutRevision, updatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedBy: user.uid, updatedByEmail: user.email || '' }, { merge: false });
  });
  const loaded = await loadInventory();
  return { products: loaded.products, hiddenProducts: loaded.hiddenProducts, floor: loaded.floor, revision: loaded.revision, updatedAt: loaded.layout.updatedAt?.toDate?.().toISOString() || null, updatedByEmail: loaded.layout.updatedByEmail || user.email || '' };
});

export const __testables = { safeSetting, revision, rotatedFootprint, defaultSavedSetting };
