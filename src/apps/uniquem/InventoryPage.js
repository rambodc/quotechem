import React, { useMemo, useState } from 'react';
import { DataTable, Drawer, packageSummary, Panel, productLabel } from './UniquemShared';

const locations = (warehouse) => warehouse?.locations?.length ? warehouse.locations : ['Main'];

function WarehouseDrawer({ warehouse, busy, onClose, onSave, onDelete }) {
  const [name, setName] = useState(warehouse?.name || ''); const [locationText, setLocationText] = useState((warehouse?.locations || ['Main']).join(', '));
  return <Drawer title={warehouse ? 'Edit warehouse' : 'Create warehouse'} busy={busy} onClose={onClose}><form className="uniquem-product-drawer-form" onSubmit={(event) => { event.preventDefault(); onSave({ warehouseId: warehouse?.warehouseId, name, locations: locationText.split(',').map((item) => item.trim()).filter(Boolean) }); }}>
    <label>Name<input required value={name} onChange={(event) => setName(event.target.value)} /></label>
    <label>Locations<input value={locationText} onChange={(event) => setLocationText(event.target.value)} placeholder="Main, Bay 1, Tank Farm" /><small>Main is always included.</small></label>
    <button type="submit" disabled={busy}>Save warehouse</button>{warehouse ? <button type="button" className="uniquem-danger" disabled={busy} onClick={onDelete}>Delete warehouse</button> : null}
  </form></Drawer>;
}

function AdjustmentDrawer({ batch, product, busy, onClose, onSave }) {
  const [quantity, setQuantity] = useState(''); const [reason, setReason] = useState('');
  return <Drawer title="Inventory adjustment" busy={busy} onClose={onClose}><form className="uniquem-product-drawer-form" onSubmit={(event) => { event.preventDefault(); onSave({ batchId: batch.batchId, packageQuantity: Number(quantity), reason }); }}>
    <div className="uniquem-preview"><strong>{productLabel(product)}</strong><span>Available: {packageSummary(product, batch.packageQuantity)}</span></div>
    <label>Package correction<input required type="number" step="0.001" value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="Use + or -" /></label>
    <label>Reason<textarea required value={reason} onChange={(event) => setReason(event.target.value)} /></label><button type="submit" disabled={busy}>Post adjustment</button>
  </form></Drawer>;
}

function BatchDrawer({ batch, data, lookups, onClose }) {
  const product = lookups.products.get(batch.productId); const history = data.ledger.filter((entry) => entry.batchId === batch.batchId);
  return <Drawer title="Inventory batch" onClose={onClose}><div className="uniquem-product-view"><h3>{productLabel(product)}</h3><p>{packageSummary(product, batch.packageQuantity)}</p><div className="uniquem-meta-grid"><span>Warehouse: <strong>{lookups.warehouses.get(batch.warehouseId)?.name}</strong></span><span>Location: <strong>{batch.location}</strong></span><span>Lot: <strong>{batch.lotNumber || 'Not provided'}</strong></span><span>Batch ID: <strong>{batch.batchId}</strong></span></div><Panel title="Ledger history"><DataTable empty="No history." columns={['Date', 'Type', 'Packages', 'Reason']} rows={history.map((entry) => [entry.createdAt?.slice(0, 10) || '-', entry.type, entry.packageQuantity, entry.reason || '-'])} /></Panel></div></Drawer>;
}

export default function InventoryPage({ data, lookups, mutate }) {
  const [filters, setFilters] = useState({ query: '', productId: '', warehouseId: '', location: '' }); const [drawer, setDrawer] = useState(null); const [busy, setBusy] = useState(false);
  const rows = useMemo(() => data.batches.filter((batch) => {
    const term = `${productLabel(lookups.products.get(batch.productId))} ${batch.lotNumber || ''} ${batch.location}`.toLowerCase();
    return term.includes(filters.query.toLowerCase()) && (!filters.productId || batch.productId === filters.productId) && (!filters.warehouseId || batch.warehouseId === filters.warehouseId) && (!filters.location || batch.location === filters.location);
  }), [data.batches, filters, lookups]);
  const run = async (endpoint, payload) => { setBusy(true); const result = await mutate(endpoint, payload); setBusy(false); if (result) setDrawer(null); };
  return <div className="uniquem-stack"><Panel title="Available inventory" action={<div className="uniquem-detail-actions"><button type="button" onClick={() => setDrawer({ type: 'warehouse' })}>Create warehouse</button></div>}>
    <div className="uniquem-filter-grid"><input placeholder="Search product, lot, location" value={filters.query} onChange={(e) => setFilters({ ...filters, query: e.target.value })} /><select value={filters.productId} onChange={(e) => setFilters({ ...filters, productId: e.target.value })}><option value="">All products</option>{data.products.map((p) => <option key={p.productId} value={p.productId}>{p.name}</option>)}</select><select value={filters.warehouseId} onChange={(e) => setFilters({ ...filters, warehouseId: e.target.value, location: '' })}><option value="">All warehouses</option>{data.warehouses.map((w) => <option key={w.warehouseId} value={w.warehouseId}>{w.name}</option>)}</select><select value={filters.location} onChange={(e) => setFilters({ ...filters, location: e.target.value })}><option value="">All locations</option>{[...new Set(data.warehouses.flatMap(locations))].map((l) => <option key={l}>{l}</option>)}</select></div>
    <DataTable empty="No inventory matches these filters." columns={['Product', 'Warehouse', 'Location', 'Lot', 'Available', '']} rows={rows.map((batch) => { const product = lookups.products.get(batch.productId); return [<button className="uniquem-link-button" type="button" onClick={() => setDrawer({ type: 'batch', batch })}>{productLabel(product)}</button>, lookups.warehouses.get(batch.warehouseId)?.name, batch.location, batch.lotNumber || '-', packageSummary(product, batch.packageQuantity), <button type="button" onClick={() => setDrawer({ type: 'adjust', batch })}>Adjust</button>]; })} />
  </Panel><Panel title="Warehouses"><DataTable empty="No warehouses yet." columns={['Name', 'Locations', '']} rows={data.warehouses.map((warehouse) => [warehouse.name, locations(warehouse).join(', '), <button type="button" onClick={() => setDrawer({ type: 'warehouse', warehouse })}>Edit</button>])} /></Panel>
  {drawer?.type === 'warehouse' ? <WarehouseDrawer warehouse={drawer.warehouse} busy={busy} onClose={() => setDrawer(null)} onSave={(payload) => run('saveUniquemWarehouse', payload)} onDelete={() => window.confirm('Permanently delete this unused warehouse?') && run('deleteUniquemWarehouse', { warehouseId: drawer.warehouse.warehouseId })} /> : null}
  {drawer?.type === 'adjust' ? <AdjustmentDrawer batch={drawer.batch} product={lookups.products.get(drawer.batch.productId)} busy={busy} onClose={() => setDrawer(null)} onSave={(payload) => run('adjustUniquemInventory', payload)} /> : null}
  {drawer?.type === 'batch' ? <BatchDrawer batch={drawer.batch} data={data} lookups={lookups} onClose={() => setDrawer(null)} /> : null}</div>;
}
