import { randomUUID } from 'node:crypto';
import { db } from '../../core/firebase.js';
import { COLLECTIONS as C, handler, id, now, text } from './helpers.js';
import { workspace } from './workspace.js';

export const saveUniquemWarehouse = handler(async (req, user) => {
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
