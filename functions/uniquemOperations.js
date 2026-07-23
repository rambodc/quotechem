import { randomUUID } from 'node:crypto';
import { onRequest } from 'firebase-functions/v2/https';
import { admin, db, storage } from './firebaseAdmin.js';

const REGION = 'us-central1';
const C = {
  products: 'uniquemProducts', warehouses: 'uniquemWarehousesV2', batches: 'uniquemInventoryBatches',
  ledger: 'uniquemInventoryLedger', receipts: 'uniquemReceiptsV2', shipments: 'uniquemShipments',
  recipes: 'uniquemRecipesV2', runs: 'uniquemProductionRuns', attachments: 'uniquemAttachments',
};
const now = () => admin.firestore.FieldValue.serverTimestamp();
const text = (value, max = 500) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const id = (value) => text(value, 120).replace(/[^a-zA-Z0-9._-]/g, '');
const qty = (value, label = 'Quantity') => {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw Object.assign(new Error(`${label} must be greater than zero.`), { status: 400 });
  return Math.round(number * 1000) / 1000;
};
const signedQty = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number === 0) throw Object.assign(new Error('Adjustment quantity cannot be zero.'), { status: 400 });
  return Math.round(number * 1000) / 1000;
};
const iso = (value) => value?.toDate?.().toISOString?.() || (typeof value === 'string' ? value : null);

function cors(res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

async function access(req) {
  const authHeader = text(req.headers?.authorization || req.headers?.Authorization, 5000);
  if (!authHeader.toLowerCase().startsWith('bearer ')) throw Object.assign(new Error('Missing Bearer token'), { status: 401 });
  let decoded;
  try { decoded = await admin.auth().verifyIdToken(authHeader.slice(7).trim()); }
  catch { throw Object.assign(new Error('Invalid authentication token'), { status: 401 }); }
  const snap = await db.collection('users').doc(decoded.uid).get();
  const profile = snap.data() || {};
  if (profile.role !== 'admin' && !profile.enabledMiniApps?.includes('uniquem')) throw Object.assign(new Error('Forbidden'), { status: 403 });
  return { uid: decoded.uid, email: decoded.email || profile.email || '' };
}

function handler(work) {
  return onRequest({ region: REGION }, async (req, res) => {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(204).send('');
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
    try { return res.status(200).json({ ok: true, ...(await work(req, await access(req))) }); }
    catch (error) { return res.status(Number(error?.status) || 500).json({ ok: false, error: error?.message || 'Request failed' }); }
  });
}

const mapDoc = (doc) => {
  const data = doc.data() || {};
  return Object.fromEntries(Object.entries({ ...data, id: doc.id }).map(([key, value]) => [key, value?.toDate ? value.toDate().toISOString() : value]));
};
const readAll = async (collection, limit = 1000) => (await db.collection(collection).limit(limit).get()).docs.map(mapDoc);

async function workspace() {
  const [products, warehouses, batches, ledger, receipts, shipments, recipes, productionRuns, attachmentDocs] = await Promise.all([
    readAll(C.products, 500), readAll(C.warehouses, 200), readAll(C.batches, 2000), readAll(C.ledger, 2000),
    readAll(C.receipts, 1000), readAll(C.shipments, 1000), readAll(C.recipes, 500), readAll(C.runs, 1000),
    db.collection(C.attachments).where('status', '==', 'active').limit(2000).get(),
  ]);
  const attachments = attachmentDocs.docs.map(mapDoc).map((item) => ({ ...item, attachmentId: item.attachmentId || item.id }));
  const attachmentsByEntity = {};
  for (const item of attachments) (attachmentsByEntity[`${item.entityType}:${item.entityId}`] ||= []).push(item);
  const activeProducts = products.filter((item) => item.status !== 'archived').sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const activeBatches = batches.filter((item) => Number(item.packageQuantity) > 0);
  return {
    products: activeProducts,
    warehouses: warehouses.sort((a, b) => String(a.name).localeCompare(String(b.name))),
    batches: activeBatches,
    ledger: ledger.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))),
    receipts: receipts.sort((a, b) => String(b.receivedDate || '').localeCompare(String(a.receivedDate || ''))),
    shipments: shipments.sort((a, b) => String(b.shippingDate || '').localeCompare(String(a.shippingDate || ''))),
    recipes: recipes.sort((a, b) => String(a.name).localeCompare(String(b.name))),
    productionRuns: productionRuns.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))),
    attachments, attachmentsByEntity,
    dashboard: {
      productCount: activeProducts.length, warehouseCount: warehouses.length, inventoryPositions: activeBatches.length,
      totalPackages: activeBatches.reduce((sum, item) => sum + Number(item.packageQuantity || 0), 0),
      draftShipments: shipments.filter((item) => item.status === 'draft').length,
      draftProductionRuns: productionRuns.filter((item) => item.status === 'draft').length,
    },
  };
}

export const listUniquemWorkspace = handler(async () => workspace());

export const saveUniquemWarehouseV2 = handler(async (req, user) => {
  const name = text(req.body?.name, 120);
  if (!name) throw Object.assign(new Error('Warehouse name is required.'), { status: 400 });
  const warehouseId = id(req.body?.warehouseId) || randomUUID();
  const locations = [...new Set((Array.isArray(req.body?.locations) ? req.body.locations : []).map((x) => text(x, 80)).filter(Boolean))];
  if (!locations.includes('Main')) locations.unshift('Main');
  const ref = db.collection(C.warehouses).doc(warehouseId);
  const existing = await ref.get();
  await ref.set({ warehouseId, name, locations, createdAt: existing.exists ? existing.data().createdAt || now() : now(), updatedAt: now(), updatedBy: user.uid });
  return workspace();
});

export const deleteUniquemWarehouse = handler(async (req) => {
  const warehouseId = id(req.body?.warehouseId);
  if (!warehouseId) throw Object.assign(new Error('Warehouse is required.'), { status: 400 });
  const [batches, ledger] = await Promise.all([
    db.collection(C.batches).where('warehouseId', '==', warehouseId).limit(1).get(),
    db.collection(C.ledger).where('warehouseId', '==', warehouseId).limit(1).get(),
  ]);
  if (!batches.empty || !ledger.empty) throw Object.assign(new Error('This warehouse has inventory history and cannot be deleted.'), { status: 409 });
  await db.collection(C.warehouses).doc(warehouseId).delete();
  return workspace();
});

export const adjustUniquemInventoryV2 = handler(async (req, user) => {
  const batchId = id(req.body?.batchId);
  const quantity = signedQty(req.body?.packageQuantity);
  const reason = text(req.body?.reason, 800);
  if (!batchId || !reason) throw Object.assign(new Error('Batch and reason are required.'), { status: 400 });
  await db.runTransaction(async (tx) => {
    const ref = db.collection(C.batches).doc(batchId);
    const snap = await tx.get(ref);
    if (!snap.exists) throw Object.assign(new Error('Inventory batch was not found.'), { status: 404 });
    const current = Number(snap.data().packageQuantity || 0);
    if (current + quantity < -0.0001) throw Object.assign(new Error('Adjustment exceeds available inventory.'), { status: 409 });
    const ledgerId = randomUUID();
    tx.update(ref, { packageQuantity: Math.round((current + quantity) * 1000) / 1000, updatedAt: now() });
    tx.set(db.collection(C.ledger).doc(ledgerId), { ledgerId, type: 'adjustment', batchId, productId: snap.data().productId, warehouseId: snap.data().warehouseId, location: snap.data().location, packageQuantity: quantity, reason, createdAt: now(), createdBy: user.uid });
  });
  return workspace();
});

export const createUniquemReceipt = handler(async (req, user) => {
  const productId = id(req.body?.productId); const warehouseId = id(req.body?.warehouseId);
  const packageQuantity = qty(req.body?.packageQuantity, 'Package quantity');
  if (!productId || !warehouseId) throw Object.assign(new Error('Product and warehouse are required.'), { status: 400 });
  const receiptId = randomUUID(); const batchId = randomUUID(); const ledgerId = randomUUID();
  const receipt = {
    receiptId, batchId, productId, warehouseId, location: text(req.body?.location, 80) || 'Main', packageQuantity,
    lotNumber: text(req.body?.lotNumber, 120), supplier: text(req.body?.supplier, 160), supplierReference: text(req.body?.supplierReference, 160),
    receivedDate: text(req.body?.receivedDate, 20) || new Date().toISOString().slice(0, 10), expiryDate: text(req.body?.expiryDate, 20),
    notes: text(req.body?.notes, 1500), status: 'posted', createdAt: now(), createdBy: user.uid,
  };
  await db.runTransaction(async (tx) => {
    const [product, warehouse] = await Promise.all([tx.get(db.collection(C.products).doc(productId)), tx.get(db.collection(C.warehouses).doc(warehouseId))]);
    if (!product.exists || !warehouse.exists) throw Object.assign(new Error('Product or warehouse was not found.'), { status: 404 });
    tx.set(db.collection(C.receipts).doc(receiptId), receipt);
    tx.set(db.collection(C.batches).doc(batchId), { batchId, productId, warehouseId, location: receipt.location, lotNumber: receipt.lotNumber, expiryDate: receipt.expiryDate, sourceType: 'receipt', sourceId: receiptId, packageQuantity, createdAt: now(), updatedAt: now() });
    tx.set(db.collection(C.ledger).doc(ledgerId), { ledgerId, type: 'receiving', batchId, productId, warehouseId, location: receipt.location, packageQuantity, referenceId: receiptId, createdAt: now(), createdBy: user.uid });
  });
  return { receiptId, batchId, ...(await workspace()) };
});

function shipmentInput(body = {}) {
  const rawLines = (Array.isArray(body.lines) ? body.lines : []).map((line) => ({ batchId: id(line.batchId), packageQuantity: qty(line.packageQuantity, 'Shipment quantity') })).filter((line) => line.batchId);
  const totals = new Map(); for (const line of rawLines) totals.set(line.batchId, Math.round(((totals.get(line.batchId) || 0) + line.packageQuantity) * 1000) / 1000);
  const lines = [...totals].map(([batchId, packageQuantity]) => ({ batchId, packageQuantity }));
  if (!lines.length) throw Object.assign(new Error('Add at least one inventory item.'), { status: 400 });
  return { customer: text(body.customer, 160), destination: text(body.destination, 300), shippingDate: text(body.shippingDate, 20) || new Date().toISOString().slice(0, 10), referenceNumber: text(body.referenceNumber, 120), notes: text(body.notes, 1500), lines };
}

export const saveUniquemShipment = handler(async (req, user) => {
  const shipmentId = id(req.body?.shipmentId) || randomUUID(); const ref = db.collection(C.shipments).doc(shipmentId); const old = await ref.get();
  if (old.exists && old.data().status !== 'draft') throw Object.assign(new Error('Completed shipments cannot be edited.'), { status: 409 });
  await ref.set({ shipmentId, ...shipmentInput(req.body), status: 'draft', createdAt: old.exists ? old.data().createdAt || now() : now(), updatedAt: now(), updatedBy: user.uid });
  return { shipmentId, ...(await workspace()) };
});

export const deleteUniquemShipment = handler(async (req) => {
  const ref = db.collection(C.shipments).doc(id(req.body?.shipmentId)); const snap = await ref.get();
  if (!snap.exists) throw Object.assign(new Error('Shipment not found.'), { status: 404 });
  if (snap.data().status !== 'draft') throw Object.assign(new Error('Completed shipments cannot be deleted.'), { status: 409 });
  await ref.delete(); return workspace();
});

export const completeUniquemShipment = handler(async (req, user) => {
  const shipmentId = id(req.body?.shipmentId); const shipmentRef = db.collection(C.shipments).doc(shipmentId);
  await db.runTransaction(async (tx) => {
    const shipment = await tx.get(shipmentRef);
    if (!shipment.exists || shipment.data().status !== 'draft') throw Object.assign(new Error('Draft shipment not found.'), { status: 409 });
    const lines = shipment.data().lines || [];
    const batchRefs = lines.map((line) => db.collection(C.batches).doc(line.batchId));
    const batchSnaps = await Promise.all(batchRefs.map((ref) => tx.get(ref)));
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]; const batchRef = batchRefs[index]; const batch = batchSnaps[index]; const requested = qty(line.packageQuantity);
      if (!batch.exists || Number(batch.data().packageQuantity || 0) + 0.0001 < requested) throw Object.assign(new Error('Shipment exceeds currently available inventory.'), { status: 409 });
      tx.update(batchRef, { packageQuantity: Math.round((Number(batch.data().packageQuantity) - requested) * 1000) / 1000, updatedAt: now() });
      const ledgerId = randomUUID();
      tx.set(db.collection(C.ledger).doc(ledgerId), { ledgerId, type: 'shipping', batchId: line.batchId, productId: batch.data().productId, warehouseId: batch.data().warehouseId, location: batch.data().location, packageQuantity: -requested, referenceId: shipmentId, createdAt: now(), createdBy: user.uid });
    }
    tx.update(shipmentRef, { status: 'completed', completedAt: now(), completedBy: user.uid, updatedAt: now() });
  });
  return workspace();
});

function recipeInput(body = {}) {
  const outputProductId = id(body.outputProductId); const name = text(body.name, 160);
  const ingredients = (Array.isArray(body.ingredients) ? body.ingredients : []).map((item) => ({ productId: id(item.productId), amount: qty(item.amount, 'Ingredient amount') })).filter((item) => item.productId);
  if (!name || !outputProductId || !ingredients.length) throw Object.assign(new Error('Recipe name, output product, and ingredients are required.'), { status: 400 });
  return { name, outputProductId, ingredients, notes: text(body.notes, 1500) };
}

export const saveUniquemRecipeV2 = handler(async (req, user) => {
  const recipeId = id(req.body?.recipeId) || randomUUID(); const ref = db.collection(C.recipes).doc(recipeId); const old = await ref.get();
  await ref.set({ recipeId, ...recipeInput(req.body), createdAt: old.exists ? old.data().createdAt || now() : now(), updatedAt: now(), updatedBy: user.uid });
  return { recipeId, ...(await workspace()) };
});

export const deleteUniquemRecipeV2 = handler(async (req) => {
  const recipeId = id(req.body?.recipeId); const used = await db.collection(C.runs).where('recipeId', '==', recipeId).limit(1).get();
  if (!used.empty) throw Object.assign(new Error('This recipe is used by production history and cannot be deleted.'), { status: 409 });
  await db.collection(C.recipes).doc(recipeId).delete(); return workspace();
});

function runInput(body = {}) {
  const recipeId = id(body.recipeId); const outputPackages = qty(body.outputPackages, 'Output packages'); const warehouseId = id(body.warehouseId);
  const rawAllocations = (Array.isArray(body.allocations) ? body.allocations : []).map((item) => ({ batchId: id(item.batchId), packageQuantity: qty(item.packageQuantity, 'Input quantity') })).filter((item) => item.batchId);
  const totals = new Map(); for (const item of rawAllocations) totals.set(item.batchId, Math.round(((totals.get(item.batchId) || 0) + item.packageQuantity) * 1000) / 1000);
  const allocations = [...totals].map(([batchId, packageQuantity]) => ({ batchId, packageQuantity }));
  if (!recipeId || !warehouseId || !allocations.length) throw Object.assign(new Error('Recipe, output warehouse, and input allocations are required.'), { status: 400 });
  return { recipeId, outputPackages, warehouseId, location: text(body.location, 80) || 'Main', outputLotNumber: text(body.outputLotNumber, 120), notes: text(body.notes, 1500), allocations };
}

export const saveUniquemProductionRun = handler(async (req, user) => {
  const runId = id(req.body?.runId) || randomUUID(); const ref = db.collection(C.runs).doc(runId); const old = await ref.get();
  if (old.exists && old.data().status !== 'draft') throw Object.assign(new Error('Completed production runs cannot be edited.'), { status: 409 });
  await ref.set({ runId, ...runInput(req.body), status: 'draft', createdAt: old.exists ? old.data().createdAt || now() : now(), updatedAt: now(), updatedBy: user.uid });
  return { runId, ...(await workspace()) };
});

export const deleteUniquemProductionRun = handler(async (req) => {
  const ref = db.collection(C.runs).doc(id(req.body?.runId)); const snap = await ref.get();
  if (!snap.exists || snap.data().status !== 'draft') throw Object.assign(new Error('Only draft production runs can be deleted.'), { status: 409 });
  await ref.delete(); return workspace();
});

export const completeUniquemProductionRun = handler(async (req, user) => {
  const runId = id(req.body?.runId); const runRef = db.collection(C.runs).doc(runId);
  await db.runTransaction(async (tx) => {
    const runSnap = await tx.get(runRef);
    if (!runSnap.exists || runSnap.data().status !== 'draft') throw Object.assign(new Error('Draft production run not found.'), { status: 409 });
    const run = runSnap.data(); const recipeSnap = await tx.get(db.collection(C.recipes).doc(run.recipeId));
    if (!recipeSnap.exists) throw Object.assign(new Error('Recipe was not found.'), { status: 404 });
    const recipe = recipeSnap.data(); const consumed = new Map(); const allocations = run.allocations || [];
    const batchRefs = allocations.map((allocation) => db.collection(C.batches).doc(allocation.batchId));
    const batchSnaps = await Promise.all(batchRefs.map((ref) => tx.get(ref)));
    const productIds = [...new Set(batchSnaps.filter((snap) => snap.exists).map((snap) => snap.data().productId))];
    const productSnaps = await Promise.all(productIds.map((productId) => tx.get(db.collection(C.products).doc(productId))));
    const products = new Map(productIds.map((productId, index) => [productId, productSnaps[index]]));
    for (let index = 0; index < allocations.length; index += 1) {
      const allocation = allocations[index]; const batchRef = batchRefs[index]; const batchSnap = batchSnaps[index]; const amount = qty(allocation.packageQuantity);
      if (!batchSnap.exists || Number(batchSnap.data().packageQuantity || 0) + 0.0001 < amount) throw Object.assign(new Error('Production input exceeds available inventory.'), { status: 409 });
      const productSnap = products.get(batchSnap.data().productId);
      consumed.set(batchSnap.data().productId, (consumed.get(batchSnap.data().productId) || 0) + amount * Number(productSnap.data()?.packageAmount || 0));
      tx.update(batchRef, { packageQuantity: Math.round((Number(batchSnap.data().packageQuantity) - amount) * 1000) / 1000, updatedAt: now() });
      const ledgerId = randomUUID(); tx.set(db.collection(C.ledger).doc(ledgerId), { ledgerId, type: 'production-input', batchId: allocation.batchId, productId: batchSnap.data().productId, warehouseId: batchSnap.data().warehouseId, location: batchSnap.data().location, packageQuantity: -amount, referenceId: runId, createdAt: now(), createdBy: user.uid });
    }
    const required = new Map((recipe.ingredients || []).map((ingredient) => [ingredient.productId, Number(ingredient.amount) * Number(run.outputPackages)]));
    for (const [productId, amount] of consumed) if (!required.has(productId) || Math.abs(amount - required.get(productId)) > 0.001) throw Object.assign(new Error('Selected inputs must exactly satisfy the recipe.'), { status: 409 });
    for (const [productId, amount] of required) if (Math.abs((consumed.get(productId) || 0) - amount) > 0.001) throw Object.assign(new Error('Selected inputs must exactly satisfy the recipe.'), { status: 409 });
    const batchId = randomUUID(); const ledgerId = randomUUID();
    tx.set(db.collection(C.batches).doc(batchId), { batchId, productId: recipe.outputProductId, warehouseId: run.warehouseId, location: run.location, lotNumber: run.outputLotNumber, sourceType: 'production', sourceId: runId, packageQuantity: run.outputPackages, createdAt: now(), updatedAt: now() });
    tx.set(db.collection(C.ledger).doc(ledgerId), { ledgerId, type: 'production-output', batchId, productId: recipe.outputProductId, warehouseId: run.warehouseId, location: run.location, packageQuantity: run.outputPackages, referenceId: runId, createdAt: now(), createdBy: user.uid });
    tx.update(runRef, { status: 'completed', outputBatchId: batchId, completedAt: now(), completedBy: user.uid, updatedAt: now() });
  });
  return workspace();
});

export const deleteUniquemProduct = handler(async (req) => {
  const productId = id(req.body?.productId);
  const refs = await Promise.all([
    db.collection(C.batches).where('productId', '==', productId).limit(1).get(), db.collection(C.ledger).where('productId', '==', productId).limit(1).get(),
    db.collection(C.receipts).where('productId', '==', productId).limit(1).get(), db.collection(C.recipes).where('outputProductId', '==', productId).limit(1).get(),
  ]);
  const ingredientRecipes = (await readAll(C.recipes, 500)).some((recipe) => recipe.ingredients?.some((item) => item.productId === productId));
  if (refs.some((snap) => !snap.empty) || ingredientRecipes) throw Object.assign(new Error('This product has inventory or transaction history and cannot be deleted.'), { status: 409 });
  const attachmentSnap = await db.collection(C.attachments).where('entityType', '==', 'product').where('entityId', '==', productId).get();
  for (const doc of attachmentSnap.docs) { const path = text(doc.data().path, 500); if (path) await storage.bucket().file(path).delete({ ignoreNotFound: true }); await doc.ref.delete(); }
  await db.collection(C.products).doc(productId).delete(); return workspace();
});

export const __testables = { qty, signedQty, shipmentInput, recipeInput, runInput };
