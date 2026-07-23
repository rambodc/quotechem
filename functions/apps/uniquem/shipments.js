import { randomUUID } from 'node:crypto';
import { db } from '../../core/firebase.js';
import { COLLECTIONS as C, handler, id, now, qty, text } from './helpers.js';
import { workspace } from './workspace.js';

export function shipmentInput(body = {}) {
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
