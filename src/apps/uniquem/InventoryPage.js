import React, { useMemo, useState } from 'react';
import {
  AttachmentList,
  AttachmentUpload,
  DataTable,
  entityAttachments,
  formatQty,
  getBalance,
  MovementTable,
  Panel,
  productLabel,
  SelectField,
} from './UniquemShared';

function WarehouseForm({ onSubmit }) {
  const [form, setForm] = useState({ name: '', code: '', locations: 'Main' });
  return (
    <form className="uniquem-form" onSubmit={(event) => {
      event.preventDefault();
      onSubmit({ ...form, locations: form.locations.split(',').map((item) => item.trim()).filter(Boolean) });
      setForm({ name: '', code: '', locations: 'Main' });
    }}>
      <input required placeholder="Warehouse name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
      <input placeholder="Code" value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} />
      <input placeholder="Locations, comma separated" value={form.locations} onChange={(event) => setForm({ ...form, locations: event.target.value })} />
      <button type="submit">Save warehouse</button>
    </form>
  );
}

function AdjustmentForm({ data, onSubmit }) {
  const [form, setForm] = useState({ productId: '', lotId: '', warehouseId: '', location: 'Main', quantity: '', unit: 'L', reason: '' });
  const lots = data.lots.filter((lot) => !form.productId || lot.productId === form.productId);
  const available = form.lotId && form.warehouseId ? getBalance(data, form) : 0;
  return (
    <form className="uniquem-form" onSubmit={(event) => {
      event.preventDefault();
      onSubmit({ ...form, quantity: Number(form.quantity || 0) });
      setForm({ productId: '', lotId: '', warehouseId: '', location: 'Main', quantity: '', unit: 'L', reason: '' });
    }}>
      <SelectField label="Product" required value={form.productId} onChange={(value) => setForm({ ...form, productId: value, lotId: '' })} items={data.products} idKey="productId" labelFn={productLabel} />
      <SelectField label="Lot" required value={form.lotId} onChange={(value) => setForm({ ...form, lotId: value })} items={lots} idKey="lotId" labelFn={(lot) => lot.lotNumber} />
      <SelectField label="Warehouse" required value={form.warehouseId} onChange={(value) => setForm({ ...form, warehouseId: value })} items={data.warehouses} idKey="warehouseId" labelFn={(item) => item.name} />
      <input placeholder="Location" value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} />
      <input required type="number" step="0.001" placeholder="+/- quantity" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} />
      <input placeholder="Reason" required value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} />
      <button type="submit">Post adjustment</button>
      <span className="uniquem-form-note">Available: {formatQty(available, form.unit)}</span>
    </form>
  );
}

function TransferForm({ data, onSubmit }) {
  const [form, setForm] = useState({ productId: '', lotId: '', fromWarehouseId: '', fromLocation: 'Main', toWarehouseId: '', toLocation: 'Main', quantity: '', unit: 'L', reason: 'Inventory transfer' });
  const lots = data.lots.filter((lot) => !form.productId || lot.productId === form.productId);
  const available = form.lotId && form.fromWarehouseId ? getBalance(data, { productId: form.productId, lotId: form.lotId, warehouseId: form.fromWarehouseId, location: form.fromLocation }) : 0;
  return (
    <form className="uniquem-form compact" onSubmit={(event) => {
      event.preventDefault();
      onSubmit({ ...form, quantity: Number(form.quantity || 0) });
      setForm({ productId: '', lotId: '', fromWarehouseId: '', fromLocation: 'Main', toWarehouseId: '', toLocation: 'Main', quantity: '', unit: 'L', reason: 'Inventory transfer' });
    }}>
      <SelectField label="Product" required value={form.productId} onChange={(value) => setForm({ ...form, productId: value, lotId: '' })} items={data.products} idKey="productId" labelFn={productLabel} />
      <SelectField label="Lot" required value={form.lotId} onChange={(value) => setForm({ ...form, lotId: value })} items={lots} idKey="lotId" labelFn={(lot) => lot.lotNumber} />
      <SelectField label="From" required value={form.fromWarehouseId} onChange={(value) => setForm({ ...form, fromWarehouseId: value })} items={data.warehouses} idKey="warehouseId" labelFn={(item) => item.name} />
      <input placeholder="From location" value={form.fromLocation} onChange={(event) => setForm({ ...form, fromLocation: event.target.value })} />
      <SelectField label="To" required value={form.toWarehouseId} onChange={(value) => setForm({ ...form, toWarehouseId: value })} items={data.warehouses} idKey="warehouseId" labelFn={(item) => item.name} />
      <input placeholder="To location" value={form.toLocation} onChange={(event) => setForm({ ...form, toLocation: event.target.value })} />
      <input required type="number" step="0.001" min="0.001" max={available || undefined} placeholder="Quantity" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} />
      <input placeholder="Reason" value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} />
      <button type="submit">Transfer</button>
      <span className="uniquem-form-note">Available: {formatQty(available, form.unit)}</span>
    </form>
  );
}

function LotDetail({ data, lookups, lot, onUploadAttachment, onArchiveAttachment }) {
  if (!lot) return <p className="uniquem-empty">Select a lot from inventory to view traceability and files.</p>;
  const balances = data.balances.filter((item) => item.lotId === lot.lotId);
  const movements = data.movements.filter((item) => item.lotId === lot.lotId || item.referenceId === lot.sourceBlendJobId);
  const attachments = entityAttachments(data, 'lot', lot.lotId);
  return (
    <div className="uniquem-detail">
      <header className="uniquem-detail-head">
        <div>
          <h3>{lot.lotNumber}</h3>
          <p>{productLabel(lookups.products.get(lot.productId))} - {lot.status}</p>
        </div>
      </header>
      <DataTable
        empty="No active balance for this lot."
        columns={['Warehouse', 'Location', 'Quantity']}
        rows={balances.map((balance) => [
          lookups.warehouses.get(balance.warehouseId)?.name || balance.warehouseId,
          balance.location,
          formatQty(balance.quantity, balance.unit),
        ])}
      />
      <div className="uniquem-meta-grid">
        <span>Supplier: <strong>{lot.supplier || '-'}</strong></span>
        <span>Supplier lot: <strong>{lot.supplierLot || '-'}</strong></span>
        <span>Received: <strong>{lot.receivedAt || '-'}</strong></span>
        <span>Expiry: <strong>{lot.expiryDate || '-'}</strong></span>
        <span>Source blend: <strong>{lot.sourceBlendJobId || '-'}</strong></span>
      </div>
      <Panel title="Lot / Receipt Files">
        <div className="uniquem-file-toolbar">
          <AttachmentUpload label="Receiving photo" entityType="lot" entityId={lot.lotId} kind="image" accept="image/*" onUpload={onUploadAttachment} />
          <AttachmentUpload label="Delivery ticket" entityType="lot" entityId={lot.lotId} kind="delivery-ticket" accept=".pdf,image/*" onUpload={onUploadAttachment} />
          <AttachmentUpload label="COA / SDS copy" entityType="lot" entityId={lot.lotId} kind="coa" accept=".pdf,.doc,.docx,image/*" onUpload={onUploadAttachment} />
        </div>
        <AttachmentList attachments={attachments} onArchive={onArchiveAttachment} />
      </Panel>
      <Panel title="Lot Movement History">
        <MovementTable movements={movements} lookups={lookups} />
      </Panel>
    </div>
  );
}

export default function InventoryPage({ data, lookups, onWarehouse, onAdjustment, onTransfer, onUploadAttachment, onArchiveAttachment }) {
  const [filters, setFilters] = useState({ query: '', productId: '', warehouseId: '', status: '', expiry: '' });
  const [selectedLotId, setSelectedLotId] = useState('');
  const balances = useMemo(() => {
    const term = filters.query.toLowerCase();
    return data.balances.filter((item) => {
      const product = lookups.products.get(item.productId);
      const lot = lookups.lots.get(item.lotId);
      if (filters.productId && item.productId !== filters.productId) return false;
      if (filters.warehouseId && item.warehouseId !== filters.warehouseId) return false;
      if (filters.status && lot?.status !== filters.status) return false;
      if (filters.expiry === 'expiring' && !lot?.expiryDate) return false;
      if (filters.expiry === 'expiring') {
        const expiry = new Date(lot.expiryDate);
        if (!Number.isFinite(expiry.getTime()) || expiry > new Date(Date.now() + 1000 * 60 * 60 * 24 * 60)) return false;
      }
      return `${productLabel(product)} ${lot?.lotNumber || ''} ${item.location}`.toLowerCase().includes(term);
    });
  }, [data.balances, filters, lookups]);
  const selectedLot = data.lots.find((lot) => lot.lotId === selectedLotId) || data.lots.find((lot) => lot.lotId === balances[0]?.lotId) || null;

  return (
    <div className="uniquem-stack">
      <div className="uniquem-grid two">
        <Panel title="Add Warehouse / Location">
          <WarehouseForm onSubmit={onWarehouse} />
        </Panel>
        <Panel title="Quick Adjustment">
          <AdjustmentForm data={data} onSubmit={onAdjustment} />
        </Panel>
      </div>
      <Panel title="On-Hand Inventory">
        <div className="uniquem-filter-grid">
          <input className="uniquem-filter" placeholder="Search product, lot, location" value={filters.query} onChange={(event) => setFilters({ ...filters, query: event.target.value })} />
          <select value={filters.productId} onChange={(event) => setFilters({ ...filters, productId: event.target.value })}>
            <option value="">All products</option>
            {data.products.map((product) => <option key={product.productId} value={product.productId}>{productLabel(product)}</option>)}
          </select>
          <select value={filters.warehouseId} onChange={(event) => setFilters({ ...filters, warehouseId: event.target.value })}>
            <option value="">All warehouses</option>
            {data.warehouses.map((warehouse) => <option key={warehouse.warehouseId} value={warehouse.warehouseId}>{warehouse.name}</option>)}
          </select>
          <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
            <option value="">All lot statuses</option>
            <option value="active">Active</option>
            <option value="hold">Hold</option>
            <option value="archived">Archived</option>
          </select>
          <select value={filters.expiry} onChange={(event) => setFilters({ ...filters, expiry: event.target.value })}>
            <option value="">Any expiry</option>
            <option value="expiring">Expiring within 60 days</option>
          </select>
        </div>
        <DataTable
          empty="No inventory matches these filters."
          columns={['Product', 'Lot', 'Warehouse', 'Location', 'Quantity']}
          rows={balances.map((item) => [
            productLabel(lookups.products.get(item.productId)),
            <button type="button" className="uniquem-link-button" onClick={() => setSelectedLotId(item.lotId)}>{lookups.lots.get(item.lotId)?.lotNumber || item.lotId}</button>,
            lookups.warehouses.get(item.warehouseId)?.name || item.warehouseId,
            item.location,
            formatQty(item.quantity, item.unit),
          ])}
        />
      </Panel>
      <Panel title="Transfer Stock">
        <TransferForm data={data} onSubmit={onTransfer} />
      </Panel>
      <Panel title="Lot Detail">
        <LotDetail data={data} lookups={lookups} lot={selectedLot} onUploadAttachment={onUploadAttachment} onArchiveAttachment={onArchiveAttachment} />
      </Panel>
    </div>
  );
}
