import { randomUUID } from 'node:crypto';
import { db } from '../../core/firebase.js';
import { COLLECTIONS as C, handler, id, now, qty, text } from './helpers.js';
import { workspace } from './workspace.js';

export function runInput(body = {}) {
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
