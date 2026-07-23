import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { admin, db, storage } from '../../core/firebase.js';
import { requireMiniAppAccess } from '../../core/auth.js';
import { REGION, jsonError, preflight, setCors } from '../../core/http.js';
import { asString, normalizeDocId } from '../../core/values.js';
import { normalizeUniquemQuantity, normalizeUniquemStatus, toUniquemIso } from './helpers.js';

const ensureUniquemAccess = (req) => requireMiniAppAccess(req, 'uniquem');

const UNIQUEM_PRODUCT_COLLECTION = 'uniquemProducts';

function normalizeUniquemProduct(input = {}) {
  const name = asString(input.name).slice(0, 160);
  if (!name) {
    const err = new Error('Product name is required.');
    err.status = 400;
    throw err;
  }
  const packageTypes = ['Bag', 'Pail', 'Drum', 'Tote', 'Box/Case', 'Other'];
  const packageType = packageTypes.includes(asString(input.packageType)) ? asString(input.packageType) : '';
  if (!packageType) {
    const err = new Error('Packaging type is required.');
    err.status = 400;
    throw err;
  }
  const packageAmount = normalizeUniquemQuantity(input.packageAmount);
  if (packageAmount <= 0) {
    const err = new Error('Package amount must be greater than zero.');
    err.status = 400;
    throw err;
  }
  const measurementUnit = ['kg', 'L'].includes(asString(input.measurementUnit)) ? asString(input.measurementUnit) : '';
  if (!measurementUnit) {
    const err = new Error('Measurement unit must be kg or L.');
    err.status = 400;
    throw err;
  }
  const packagesPerPallet = input.packagesPerPallet === null || input.packagesPerPallet === '' || input.packagesPerPallet === undefined
    ? null
    : Number(input.packagesPerPallet);
  if (packagesPerPallet !== null && (!Number.isInteger(packagesPerPallet) || packagesPerPallet <= 0)) {
    const err = new Error('Packages per pallet must be a whole number greater than zero.');
    err.status = 400;
    throw err;
  }
  return {
    name,
    description: asString(input.description).slice(0, 1200),
    packageType,
    packageAmount,
    measurementUnit,
    packagesPerPallet,
    status: 'active',
  };
}

function mapUniquemProductDoc(doc) {
  const data = doc.data() || {};
  return {
    productId: asString(data.productId) || doc.id,
    name: asString(data.name),
    description: asString(data.description),
    packageType: asString(data.packageType),
    packageAmount: normalizeUniquemQuantity(data.packageAmount),
    measurementUnit: asString(data.measurementUnit),
    packagesPerPallet: data.packagesPerPallet === null || data.packagesPerPallet === undefined ? null : Number(data.packagesPerPallet),
    status: normalizeUniquemStatus(data.status),
    createdAt: toUniquemIso(data.createdAt),
    updatedAt: toUniquemIso(data.updatedAt),
  };
}

export const saveUniquemProduct = onRequest({ region: REGION }, async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  try {
    const user = await ensureUniquemAccess(req);
    const product = normalizeUniquemProduct(req.body || {});
    const productId = normalizeDocId(req.body?.productId) || randomUUID();
    const ref = db.collection(UNIQUEM_PRODUCT_COLLECTION).doc(productId);
    const snap = await ref.get();
    const now = admin.firestore.FieldValue.serverTimestamp();
    await ref.set(
      {
        productId,
        ...product,
        createdAt: snap.exists ? snap.data()?.createdAt || now : now,
        updatedAt: now,
        updatedBy: user.uid,
        updatedByEmail: user.email,
      },
      { merge: false }
    );
    setCors(res);
    res.status(200).json({ ok: true, product: mapUniquemProductDoc(await ref.get()) });
  } catch (error) {
    const status = Number(error?.status) || 500;
    logger.error('[saveUniquemProduct] failed', { error: error?.message || String(error) });
    return jsonError(res, status, status === 403 ? 'Forbidden' : asString(error?.message || String(error)) || 'Failed to save product');
  }
});

export const __testables = { normalizeUniquemProduct };

import { COLLECTIONS as C, handler, id, now } from './helpers.js';
import { workspace } from './workspace.js';

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
