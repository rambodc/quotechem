import { randomUUID } from 'node:crypto';
import { db } from '../../core/firebase.js';
import { COLLECTIONS as C, handler, id, now, qty, text } from './helpers.js';
import { workspace } from './workspace.js';

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
