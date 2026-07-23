import { randomUUID } from 'node:crypto';
import { db } from '../../core/firebase.js';
import { COLLECTIONS as C, handler, id, now, signedQty, text } from './helpers.js';
import { workspace } from './workspace.js';

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
