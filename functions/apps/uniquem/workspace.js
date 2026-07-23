import { db } from '../../core/firebase.js';
import { COLLECTIONS as C, handler } from './helpers.js';

export const mapDoc = (doc) => {
  const data = doc.data() || {};
  return Object.fromEntries(Object.entries({ ...data, id: doc.id }).map(([key, value]) => [key, value?.toDate ? value.toDate().toISOString() : value]));
};

export const readAll = async (collection, limit = 1000) => (await db.collection(collection).limit(limit).get()).docs.map(mapDoc);

export async function workspace() {
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
