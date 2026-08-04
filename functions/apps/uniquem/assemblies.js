import { randomUUID } from 'node:crypto';
import { admin, db } from '../../core/firebase.js';
import { miniAppHandler, REGION } from '../../core/http.js';
import { onRequest } from 'firebase-functions/v2/https';
import { resetAssemblyData } from '../../scripts/reset-assembly-percentage.js';

const ITEMS = 'uniquemItems';
const RECIPES = 'uniquemAssemblyRecipes';
const REVISIONS = 'uniquemAssemblyRecipeRevisions';
const BUILDS = 'uniquemAssemblyBuilds';
const SETTINGS = 'uniquemAssemblySettings';
const PERCENTAGE_SCHEMA = 'percentage-v1';
const RESET_TOKEN = 'pct-v1-4f53a9b8-8090-4c43-b619-743c0cf466da';
const MAX_COMPONENTS = 100;
const baseHandler = (work) => miniAppHandler('uniquem', work);
const handler = (work) => baseHandler(async (...args) => {
  const ready = await db.collection(SETTINGS).doc('schema').get();
  if (ready.data()?.version !== PERCENTAGE_SCHEMA) invalid('Assembly is being upgraded to percentage recipes. Try again shortly.', 503);
  return work(...args);
});

function invalid(message, status = 400) { throw Object.assign(new Error(message), { status }); }
const clean = (value, max = 500) => String(value ?? '').trim().slice(0, max);
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const quantity = (value, label) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) invalid(`${label} must be greater than zero.`);
  return number;
};
const isoDate = (value) => {
  const text = clean(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`))) invalid('Build date is invalid.');
  return text;
};
const timestampValue = (value) => value?.toDate ? value.toDate().toISOString() : value || null;
const mapDoc = (doc) => {
  const value = { ...(doc.data() || {}) };
  for (const key of ['createdAt', 'updatedAt', 'postedAt', 'reversedAt', 'archivedAt']) if (value[key]) value[key] = timestampValue(value[key]);
  return value;
};
const itemView = (doc) => {
  const item = doc.data() || {};
  const quickBooksQuantity = finite(item.quantityOnHand) ? item.quantityOnHand : 0;
  const assemblyAdjustment = finite(item.assemblyAdjustment) ? item.assemblyAdjustment : 0;
  return { productId: item.productId || doc.id, item: item.item || '', type: item.type || '', activeStatus: item.activeStatus || '', unitOfMeasure: item.unitOfMeasure || '', quickBooksQuantity, assemblyAdjustment, availableQuantity: quickBooksQuantity + assemblyAdjustment };
};

export function normalizeComponents(components, outputProductId) {
  if (!Array.isArray(components) || !components.length) invalid('Add at least one component.');
  if (components.length > MAX_COMPONENTS) invalid(`An assembly may contain at most ${MAX_COMPONENTS} components.`);
  const seen = new Set();
  return components.map((component, index) => {
    const productId = clean(component?.productId, 160);
    if (!productId) invalid(`Component ${index + 1} must select an item.`);
    if (productId === outputProductId) invalid('The finished item cannot also be a component.');
    if (seen.has(productId)) invalid('Each component item may appear only once.');
    seen.add(productId);
    const percentage = quantity(component?.percentage, `Component ${index + 1} percentage`);
    if (percentage > 100) invalid(`Component ${index + 1} percentage cannot exceed 100%.`);
    return { productId, percentage };
  });
}

export function percentageTotal(components = []) {
  return components.reduce((total, component) => total + component.percentage, 0);
}

export function isCompletePercentage(total) {
  return Math.abs(total - 100) < 0.0001;
}

export function calculatedComponents(components, outputQuantity) {
  const output = quantity(outputQuantity, 'Output quantity');
  return components.map((component) => ({ ...component, quantity: output * component.percentage / 100 }));
}

export function buildMovements(outputProductId, outputQuantity, components) {
  return [...components.map((component) => ({ productId: component.productId, quantity: -component.quantity, role: 'component' })), { productId: outputProductId, quantity: outputQuantity, role: 'output' }];
}

function recipePayload(body, itemsById) {
  const name = clean(body?.name, 160);
  const outputProductId = clean(body?.outputProductId, 160);
  if (!name) invalid('Recipe name is required.');
  const output = itemsById.get(outputProductId);
  if (!output || output.activeStatus !== 'Active') invalid('Select an active finished item.', 409);
  const components = normalizeComponents(body?.components, outputProductId);
  for (const component of components) {
    const item = itemsById.get(component.productId);
    if (!item || item.activeStatus !== 'Active') invalid('Every component must be an active catalog item.', 409);
  }
  return { name, outputProductId, outputItem: output.item, outputUnitOfMeasure: output.unitOfMeasure, percentageTotal: percentageTotal(components), components: components.map((component) => ({ ...component, item: itemsById.get(component.productId).item, unitOfMeasure: itemsById.get(component.productId).unitOfMeasure })) };
}

async function itemSnapshot(tx = null) {
  const query = db.collection(ITEMS).limit(1000);
  return tx ? tx.get(query) : query.get();
}

async function workspace() {
  const [itemsSnap, recipesSnap, buildsSnap] = await Promise.all([
    itemSnapshot(), db.collection(RECIPES).limit(500).get(), db.collection(BUILDS).limit(500).get(),
  ]);
  const recipes = recipesSnap.docs.map(mapDoc).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const builds = buildsSnap.docs.map(mapDoc).sort((a, b) => String(b.postedAt || '').localeCompare(String(a.postedAt || '')));
  return { items: itemsSnap.docs.map(itemView).sort((a, b) => a.item.localeCompare(b.item)), recipes, builds };
}

export const getUniquemAssemblyWorkspace = handler(async () => workspace());

export const resetUniquemAssemblyPercentageSchema = onRequest({ region: REGION }, async (req, res) => {
  if (req.method !== 'POST' || req.get('X-Assembly-Reset-Token') !== RESET_TOKEN) return res.status(404).send('Not found');
  try { return res.status(200).json({ ok: true, ...(await resetAssemblyData(db, admin)) }); }
  catch (error) { return res.status(500).json({ ok: false, error: error.message || 'Reset failed' }); }
});

export const saveUniquemAssemblyRecipe = handler(async (req, user) => {
  const recipeId = clean(req.body?.recipeId, 160) || randomUUID();
  const expectedRevision = req.body?.expectedRevision == null ? null : clean(req.body.expectedRevision, 160);
  await db.runTransaction(async (tx) => {
    const [itemsSnap, currentSnap] = await Promise.all([itemSnapshot(tx), tx.get(db.collection(RECIPES).doc(recipeId))]);
    const itemsById = new Map(itemsSnap.docs.map((doc) => [doc.id, itemView(doc)]));
    const payload = recipePayload(req.body, itemsById);
    const current = currentSnap.exists ? currentSnap.data() || {} : null;
    if (current && expectedRevision !== current.revision) invalid('This recipe changed while you were editing. Reload and try again.', 409);
    if (!current && expectedRevision) invalid('This recipe no longer exists.', 409);
    const revision = randomUUID(); const now = admin.firestore.FieldValue.serverTimestamp(); const revisionNumber = (current?.revisionNumber || 0) + 1;
    const saved = { recipeId, ...payload, status: 'Active', revision, revisionNumber, createdAt: current?.createdAt || now, createdBy: current?.createdBy || user.uid, createdByEmail: current?.createdByEmail || user.email || '', updatedAt: now, updatedBy: user.uid, updatedByEmail: user.email || '' };
    tx.set(db.collection(RECIPES).doc(recipeId), saved, { merge: false });
    tx.create(db.collection(REVISIONS).doc(revision), { ...saved, savedAt: now, savedBy: user.uid, savedByEmail: user.email || '' });
  });
  return workspace();
});

export const archiveUniquemAssemblyRecipe = handler(async (req, user) => {
  const recipeId = clean(req.body?.recipeId, 160); const expectedRevision = clean(req.body?.expectedRevision, 160);
  if (!recipeId || !expectedRevision) invalid('A reviewed recipe is required.');
  await db.runTransaction(async (tx) => {
    const ref = db.collection(RECIPES).doc(recipeId); const snap = await tx.get(ref);
    if (!snap.exists) invalid('Recipe not found.', 404);
    const current = snap.data() || {}; if (current.revision !== expectedRevision) invalid('This recipe changed while you were editing.', 409);
    if (current.status === 'Archived') return;
    const revision = randomUUID(); const now = admin.firestore.FieldValue.serverTimestamp(); const revisionNumber = (current.revisionNumber || 0) + 1;
    const archived = { ...current, status: 'Archived', revision, revisionNumber, archivedAt: now, archivedBy: user.uid, archivedByEmail: user.email || '', updatedAt: now, updatedBy: user.uid, updatedByEmail: user.email || '' };
    tx.set(ref, archived, { merge: false });
    tx.create(db.collection(REVISIONS).doc(revision), { ...archived, savedAt: now, savedBy: user.uid, savedByEmail: user.email || '' });
  });
  return workspace();
});

export const postUniquemAssemblyBuild = handler(async (req, user) => {
  const recipeId = clean(req.body?.recipeId, 160); const recipeRevision = clean(req.body?.recipeRevision, 160);
  if (!recipeId || !recipeRevision) invalid('Select a current assembly recipe.');
  const buildId = randomUUID();
  await db.runTransaction(async (tx) => {
    const [itemsSnap, recipeSnap] = await Promise.all([itemSnapshot(tx), tx.get(db.collection(RECIPES).doc(recipeId))]);
    if (!recipeSnap.exists) invalid('Recipe not found.', 404);
    const recipe = recipeSnap.data() || {};
    if (recipe.status !== 'Active' || recipe.revision !== recipeRevision) invalid('This recipe changed. Reload it before posting.', 409);
    const itemsById = new Map(itemsSnap.docs.map((doc) => [doc.id, itemView(doc)]));
    const outputQuantity = quantity(req.body?.outputQuantity, 'Output quantity');
    const percentages = normalizeComponents(req.body?.components, recipe.outputProductId);
    const components = calculatedComponents(percentages, outputQuantity);
    const referenced = [recipe.outputProductId, ...components.map((item) => item.productId)];
    for (const productId of referenced) if (!itemsById.has(productId)) invalid('A selected assembly item no longer exists.', 409);
    const recipeById = new Map(recipe.components.map((item) => [item.productId, item.percentage]));
    const movements = buildMovements(recipe.outputProductId, outputQuantity, components);
    const shortages = movements.filter((move) => move.quantity < 0 && itemsById.get(move.productId).availableQuantity + move.quantity < 0).map((move) => ({ productId: move.productId, item: itemsById.get(move.productId).item, available: itemsById.get(move.productId).availableQuantity, required: -move.quantity, projected: itemsById.get(move.productId).availableQuantity + move.quantity }));
    if (shortages.length && req.body?.acknowledgeShortage !== true) invalid(`Insufficient inventory for ${shortages.map((item) => item.item).join(', ')}. Confirm the shortage to post.`, 409);
    const now = admin.firestore.FieldValue.serverTimestamp();
    for (const move of movements) tx.update(db.collection(ITEMS).doc(move.productId), { assemblyAdjustment: admin.firestore.FieldValue.increment(move.quantity), assemblyUpdatedAt: now, assemblyUpdatedBy: user.uid });
    const componentSnapshots = components.map((component) => ({ ...component, item: itemsById.get(component.productId).item, unitOfMeasure: itemsById.get(component.productId).unitOfMeasure, recipePercentage: recipeById.get(component.productId) || 0, percentageVariance: component.percentage - (recipeById.get(component.productId) || 0) }));
    tx.create(db.collection(BUILDS).doc(buildId), { buildId, kind: 'build', status: 'Posted', recipeId, recipeRevision, recipeSnapshot: recipe, buildDate: isoDate(req.body?.buildDate), reference: clean(req.body?.reference, 160), notes: clean(req.body?.notes, 2000), outputProductId: recipe.outputProductId, outputItem: itemsById.get(recipe.outputProductId).item, outputUnitOfMeasure: itemsById.get(recipe.outputProductId).unitOfMeasure, outputQuantity, percentageTotal: percentageTotal(components), components: componentSnapshots, movements, shortages, postedAt: now, postedBy: user.uid, postedByEmail: user.email || '' });
  });
  return workspace();
});

export const reverseUniquemAssemblyBuild = handler(async (req, user) => {
  const buildId = clean(req.body?.buildId, 160); if (!buildId) invalid('Select a build to reverse.');
  const reason = clean(req.body?.reason, 500); if (!reason) invalid('A reversal reason is required.');
  const reversalId = randomUUID();
  await db.runTransaction(async (tx) => {
    const [itemsSnap, buildSnap] = await Promise.all([itemSnapshot(tx), tx.get(db.collection(BUILDS).doc(buildId))]);
    if (!buildSnap.exists) invalid('Build not found.', 404);
    const build = buildSnap.data() || {}; if (build.kind !== 'build' || build.status !== 'Posted' || build.reversalId) invalid('This build cannot be reversed.', 409);
    const itemsById = new Map(itemsSnap.docs.map((doc) => [doc.id, itemView(doc)]));
    const movements = (build.movements || []).map((move) => ({ ...move, quantity: -move.quantity }));
    for (const move of movements) if (!itemsById.has(move.productId)) invalid('An item used by this build no longer exists.', 409);
    const shortages = movements.filter((move) => itemsById.get(move.productId).availableQuantity + move.quantity < 0).map((move) => ({ productId: move.productId, item: itemsById.get(move.productId).item, available: itemsById.get(move.productId).availableQuantity, change: move.quantity, projected: itemsById.get(move.productId).availableQuantity + move.quantity }));
    if (shortages.length && req.body?.acknowledgeShortage !== true) invalid(`Reversal would make ${shortages.map((item) => item.item).join(', ')} negative. Confirm to continue.`, 409);
    const now = admin.firestore.FieldValue.serverTimestamp();
    for (const move of movements) tx.update(db.collection(ITEMS).doc(move.productId), { assemblyAdjustment: admin.firestore.FieldValue.increment(move.quantity), assemblyUpdatedAt: now, assemblyUpdatedBy: user.uid });
    tx.update(buildSnap.ref, { status: 'Reversed', reversalId, reversedAt: now, reversedBy: user.uid, reversedByEmail: user.email || '', reversalReason: reason });
    tx.create(db.collection(BUILDS).doc(reversalId), { buildId: reversalId, kind: 'reversal', status: 'Posted', reversesBuildId: buildId, buildDate: isoDate(req.body?.buildDate), reference: build.reference || '', notes: reason, outputProductId: build.outputProductId, outputItem: build.outputItem, movements, shortages, postedAt: now, postedBy: user.uid, postedByEmail: user.email || '' });
  });
  return workspace();
});

export const __testables = { quantity, isoDate, recipePayload };
