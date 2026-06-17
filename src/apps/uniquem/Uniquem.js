import React, { useEffect, useMemo, useState } from 'react';
import { FiArchive, FiBox, FiClipboard, FiDollarSign, FiLayers, FiPackage, FiPlus, FiRefreshCw, FiTruck } from 'react-icons/fi';
import { postJson } from '../../lib/api';
import Warehouse3D from './Warehouse3D';
import Uniquem3DCreator from './Uniquem3DCreator';
import './Uniquem.css';

const EMPTY_DATA = {
  products: [],
  warehouses: [],
  lots: [],
  movements: [],
  recipes: [],
  blendJobs: [],
  prices: [],
  balances: [],
  dashboard: {
    productCount: 0,
    lotCount: 0,
    onHandPositions: 0,
    openBlendJobs: 0,
    lowStock: [],
    expiringLots: [],
  },
};

const PAGE_META = {
  dashboard: { title: 'Dashboard', eyebrow: 'Operations', icon: FiClipboard },
  products: { title: 'Products', eyebrow: 'Catalog', icon: FiPackage },
  inventory: { title: 'Inventory', eyebrow: 'Stock control', icon: FiArchive },
  receive: { title: 'Receive Stock', eyebrow: 'Incoming chemicals', icon: FiTruck },
  blending: { title: 'Blending', eyebrow: 'Production', icon: FiLayers },
  movements: { title: 'Movements', eyebrow: 'Traceability ledger', icon: FiRefreshCw },
  'price-list': { title: 'Price List', eyebrow: 'Pricing', icon: FiDollarSign },
  shipping: { title: 'Shipping', eyebrow: 'Fulfillment planning', icon: FiBox },
  orders: { title: 'Orders', eyebrow: 'Commercial planning', icon: FiClipboard },
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function asMoney(price) {
  if (!price) return '-';
  return `${price.currency || 'CAD'} ${Number(price.price || 0).toFixed(2)} / ${price.unit || 'unit'}`;
}

function byId(items, key) {
  return new Map((items || []).map((item) => [item[key], item]));
}

function productLabel(product) {
  if (!product) return 'Unknown product';
  return product.sku ? `${product.name} (${product.sku})` : product.name;
}

function formatQty(quantity, unit) {
  return `${Number(quantity || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })} ${unit || ''}`.trim();
}

function getProductImage(product) {
  return (product?.media || []).find((item) => item.kind === 'image' && item.url)?.url || '';
}

function UniquemShell({ page, data, loading, error, onRefresh, children }) {
  const meta = PAGE_META[page] || PAGE_META.dashboard;
  const Icon = meta.icon;
  return (
    <section className="uniquem-ops-page">
      <header className="uniquem-ops-head">
        <div>
          <p>{meta.eyebrow}</p>
          <h1>
            <Icon aria-hidden="true" />
            {meta.title}
          </h1>
        </div>
        <button type="button" onClick={onRefresh} disabled={loading}>
          <FiRefreshCw aria-hidden="true" />
          Refresh
        </button>
      </header>
      {error ? <div className="uniquem-alert">{error}</div> : null}
      {loading ? <div className="uniquem-loading">Loading Uniquem operations...</div> : children}
    </section>
  );
}

function StatGrid({ data }) {
  const stats = [
    ['Active products', data.dashboard.productCount],
    ['Active lots', data.dashboard.lotCount],
    ['Stock positions', data.dashboard.onHandPositions],
    ['Open blend jobs', data.dashboard.openBlendJobs],
  ];
  return (
    <div className="uniquem-stat-grid">
      {stats.map(([label, value]) => (
        <div className="uniquem-stat" key={label}>
          <span>{label}</span>
          <strong>{value || 0}</strong>
        </div>
      ))}
    </div>
  );
}

function DashboardPage({ data, lookups }) {
  return (
    <div className="uniquem-stack">
      <StatGrid data={data} />
      <div className="uniquem-grid two">
        <Panel title="Low Stock">
          <DataTable
            empty="No low stock products."
            columns={['Product', 'On hand', 'Reorder']}
            rows={(data.dashboard.lowStock || []).map((item) => [
              item.name,
              formatQty(item.quantity, item.unit),
              formatQty(item.reorderPoint, item.unit),
            ])}
          />
        </Panel>
        <Panel title="Expiring Lots">
          <DataTable
            empty="No lots expiring in the next 60 days."
            columns={['Lot', 'Product', 'Expiry']}
            rows={(data.dashboard.expiringLots || []).map((lot) => [
              lot.lotNumber,
              productLabel(lookups.products.get(lot.productId)),
              lot.expiryDate || '-',
            ])}
          />
        </Panel>
      </div>
      <Panel title="Recent Movements">
        <MovementTable movements={data.movements.slice(0, 8)} lookups={lookups} />
      </Panel>
    </div>
  );
}

function Panel({ title, action, children }) {
  return (
    <section className="uniquem-panel">
      <header>
        <h2>{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}

function DataTable({ columns, rows, empty }) {
  if (!rows.length) return <p className="uniquem-empty">{empty}</p>;
  return (
    <div className="uniquem-table-wrap">
      <table className="uniquem-table">
        <thead>
          <tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.join('-')}-${index}`}>
              {row.map((cell, cellIndex) => <td key={`${cell}-${cellIndex}`}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProductForm({ onSubmit, products }) {
  const [form, setForm] = useState({ name: '', sku: '', type: 'raw', unit: 'L', reorderPoint: '', description: '', imageUrl: '' });
  const submit = (event) => {
    event.preventDefault();
    onSubmit({
      ...form,
      reorderPoint: Number(form.reorderPoint || 0),
      media: form.imageUrl ? [{ kind: 'image', name: `${form.name} image`, url: form.imageUrl }] : [],
    });
    setForm({ name: '', sku: '', type: 'raw', unit: 'L', reorderPoint: '', description: '', imageUrl: '' });
  };
  return (
    <form className="uniquem-form compact" onSubmit={submit}>
      <input required placeholder="Product name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
      <input placeholder="SKU" value={form.sku} onChange={(event) => setForm({ ...form, sku: event.target.value })} />
      <select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>
        <option value="raw">Raw chemical</option>
        <option value="blend">Blend</option>
        <option value="finished">Finished product</option>
        <option value="packaging">Packaging</option>
        <option value="supply">Supply</option>
      </select>
      <select value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })}>
        {['L', 'kg', 'gal', 'drum', 'tote', 'bag'].map((unit) => <option key={unit}>{unit}</option>)}
      </select>
      <input type="number" step="0.001" min="0" placeholder="Reorder point" value={form.reorderPoint} onChange={(event) => setForm({ ...form, reorderPoint: event.target.value })} />
      <input placeholder="Image URL now, uploads later" value={form.imageUrl} onChange={(event) => setForm({ ...form, imageUrl: event.target.value })} />
      <input className="wide" placeholder="Description / SDS notes" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
      <button type="submit">
        <FiPlus aria-hidden="true" />
        Add product
      </button>
      {products.length ? <span className="uniquem-form-note">{products.length} products in catalog</span> : null}
    </form>
  );
}

function ProductsPage({ data, onProduct }) {
  return (
    <div className="uniquem-stack">
      <Panel title="Create Product">
        <ProductForm onSubmit={onProduct} products={data.products} />
      </Panel>
      <div className="uniquem-product-grid">
        {data.products.length ? data.products.map((product) => (
          <article className="uniquem-product-card" key={product.productId}>
            <div className="uniquem-product-thumb">
              {getProductImage(product) ? <img src={getProductImage(product)} alt="" /> : <FiPackage aria-hidden="true" />}
            </div>
            <div>
              <strong>{product.name}</strong>
              <span>{product.sku || 'No SKU'} · {product.type} · {product.unit}</span>
              <p>{product.description || 'SDS, labels, files, and 3D attachments can be added to this product record later.'}</p>
            </div>
          </article>
        )) : <p className="uniquem-empty">No products yet. Create the first chemical or finished product.</p>}
      </div>
    </div>
  );
}

function InventoryPage({ data, lookups, onWarehouse, onAdjustment, onTransfer }) {
  const [filter, setFilter] = useState('');
  const balances = data.balances.filter((item) => productLabel(lookups.products.get(item.productId)).toLowerCase().includes(filter.toLowerCase()));
  return (
    <div className="uniquem-stack">
      <div className="uniquem-grid two">
        <Panel title="Add Warehouse / Location">
          <WarehouseForm onSubmit={onWarehouse} />
        </Panel>
        <Panel title="Quick Adjustment">
          <AdjustmentForm data={data} lookups={lookups} onSubmit={onAdjustment} />
        </Panel>
      </div>
      <Panel
        title="On-Hand Inventory"
        action={<input className="uniquem-filter" placeholder="Filter products" value={filter} onChange={(event) => setFilter(event.target.value)} />}
      >
        <DataTable
          empty="No inventory has been received yet."
          columns={['Product', 'Lot', 'Warehouse', 'Location', 'Quantity']}
          rows={balances.map((item) => [
            productLabel(lookups.products.get(item.productId)),
            lookups.lots.get(item.lotId)?.lotNumber || item.lotId,
            lookups.warehouses.get(item.warehouseId)?.name || item.warehouseId,
            item.location,
            formatQty(item.quantity, item.unit),
          ])}
        />
      </Panel>
      <Panel title="Transfer Stock">
        <TransferForm data={data} lookups={lookups} onSubmit={onTransfer} />
      </Panel>
    </div>
  );
}

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

function ReceivePage({ data, onReceive }) {
  const [form, setForm] = useState({
    productId: '',
    warehouseId: '',
    location: 'Main',
    quantity: '',
    unit: 'L',
    lotNumber: '',
    supplier: '',
    supplierLot: '',
    receivedAt: today(),
    expiryDate: '',
    notes: '',
  });
  const selectedProduct = data.products.find((item) => item.productId === form.productId);
  useEffect(() => {
    if (selectedProduct && form.unit !== selectedProduct.unit) setForm((current) => ({ ...current, unit: selectedProduct.unit }));
  }, [selectedProduct, form.unit]);

  return (
    <Panel title="Receive Incoming Chemicals">
      <form className="uniquem-form receive" onSubmit={(event) => {
        event.preventDefault();
        onReceive({ ...form, quantity: Number(form.quantity || 0) });
        setForm((current) => ({ ...current, quantity: '', lotNumber: '', supplierLot: '', notes: '' }));
      }}>
        <SelectField label="Product" required value={form.productId} onChange={(value) => setForm({ ...form, productId: value })} items={data.products} idKey="productId" labelFn={productLabel} />
        <SelectField label="Warehouse" required value={form.warehouseId} onChange={(value) => setForm({ ...form, warehouseId: value })} items={data.warehouses} idKey="warehouseId" labelFn={(item) => item.name} />
        <TextField label="Location" value={form.location} onChange={(value) => setForm({ ...form, location: value })} />
        <TextField label="Quantity" required type="number" step="0.001" min="0.001" value={form.quantity} onChange={(value) => setForm({ ...form, quantity: value })} />
        <TextField label="Unit" value={form.unit} onChange={(value) => setForm({ ...form, unit: value })} />
        <TextField label="Internal lot" value={form.lotNumber} onChange={(value) => setForm({ ...form, lotNumber: value })} />
        <TextField label="Supplier" value={form.supplier} onChange={(value) => setForm({ ...form, supplier: value })} />
        <TextField label="Supplier lot" value={form.supplierLot} onChange={(value) => setForm({ ...form, supplierLot: value })} />
        <TextField label="Received date" type="date" value={form.receivedAt} onChange={(value) => setForm({ ...form, receivedAt: value })} />
        <TextField label="Expiry date" type="date" value={form.expiryDate} onChange={(value) => setForm({ ...form, expiryDate: value })} />
        <label className="wide">
          Notes
          <textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
        </label>
        <button type="submit">Receive inventory</button>
      </form>
    </Panel>
  );
}

function TextField({ label, onChange, ...props }) {
  return (
    <label>
      {label}
      <input {...props} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function SelectField({ label, items, idKey, labelFn, onChange, required, value }) {
  return (
    <label>
      {label}
      <select required={required} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Select...</option>
        {items.map((item) => <option key={item[idKey]} value={item[idKey]}>{labelFn(item)}</option>)}
      </select>
    </label>
  );
}

function AdjustmentForm({ data, lookups, onSubmit }) {
  const [form, setForm] = useState({ productId: '', lotId: '', warehouseId: '', location: 'Main', quantity: '', unit: 'L', reason: '' });
  return (
    <form className="uniquem-form" onSubmit={(event) => {
      event.preventDefault();
      onSubmit({ ...form, quantity: Number(form.quantity || 0) });
      setForm({ productId: '', lotId: '', warehouseId: '', location: 'Main', quantity: '', unit: 'L', reason: '' });
    }}>
      <SelectField label="Product" required value={form.productId} onChange={(value) => setForm({ ...form, productId: value })} items={data.products} idKey="productId" labelFn={productLabel} />
      <SelectField label="Lot" required value={form.lotId} onChange={(value) => setForm({ ...form, lotId: value })} items={data.lots.filter((lot) => !form.productId || lot.productId === form.productId)} idKey="lotId" labelFn={(lot) => lot.lotNumber} />
      <SelectField label="Warehouse" required value={form.warehouseId} onChange={(value) => setForm({ ...form, warehouseId: value })} items={data.warehouses} idKey="warehouseId" labelFn={(item) => item.name} />
      <input placeholder="Location" value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} />
      <input required type="number" step="0.001" placeholder="+/- quantity" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} />
      <input placeholder="Reason" required value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} />
      <button type="submit">Post adjustment</button>
      {form.lotId ? <span className="uniquem-form-note">Lot product: {productLabel(lookups.products.get(lookups.lots.get(form.lotId)?.productId))}</span> : null}
    </form>
  );
}

function TransferForm({ data, onSubmit }) {
  const [form, setForm] = useState({ productId: '', lotId: '', fromWarehouseId: '', fromLocation: 'Main', toWarehouseId: '', toLocation: 'Main', quantity: '', unit: 'L', reason: 'Inventory transfer' });
  return (
    <form className="uniquem-form compact" onSubmit={(event) => {
      event.preventDefault();
      onSubmit({ ...form, quantity: Number(form.quantity || 0) });
      setForm({ productId: '', lotId: '', fromWarehouseId: '', fromLocation: 'Main', toWarehouseId: '', toLocation: 'Main', quantity: '', unit: 'L', reason: 'Inventory transfer' });
    }}>
      <SelectField label="Product" required value={form.productId} onChange={(value) => setForm({ ...form, productId: value })} items={data.products} idKey="productId" labelFn={productLabel} />
      <SelectField label="Lot" required value={form.lotId} onChange={(value) => setForm({ ...form, lotId: value })} items={data.lots.filter((lot) => !form.productId || lot.productId === form.productId)} idKey="lotId" labelFn={(lot) => lot.lotNumber} />
      <SelectField label="From" required value={form.fromWarehouseId} onChange={(value) => setForm({ ...form, fromWarehouseId: value })} items={data.warehouses} idKey="warehouseId" labelFn={(item) => item.name} />
      <input placeholder="From location" value={form.fromLocation} onChange={(event) => setForm({ ...form, fromLocation: event.target.value })} />
      <SelectField label="To" required value={form.toWarehouseId} onChange={(value) => setForm({ ...form, toWarehouseId: value })} items={data.warehouses} idKey="warehouseId" labelFn={(item) => item.name} />
      <input placeholder="To location" value={form.toLocation} onChange={(event) => setForm({ ...form, toLocation: event.target.value })} />
      <input required type="number" step="0.001" min="0.001" placeholder="Quantity" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} />
      <input placeholder="Reason" value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} />
      <button type="submit">Transfer</button>
    </form>
  );
}

function BlendingPage({ data, lookups, onRecipe, onBlendJob, onCompleteJob, onCancelJob }) {
  return (
    <div className="uniquem-stack">
      <div className="uniquem-grid two">
        <Panel title="Create Recipe">
          <RecipeForm data={data} onSubmit={onRecipe} />
        </Panel>
        <Panel title="Create Blend Job">
          <BlendJobForm data={data} onSubmit={onBlendJob} />
        </Panel>
      </div>
      <Panel title="Blend Jobs">
        <div className="uniquem-job-list">
          {data.blendJobs.length ? data.blendJobs.map((job) => (
            <article className="uniquem-job" key={job.jobId}>
              <div>
                <strong>{job.name}</strong>
                <span>{productLabel(lookups.products.get(job.outputProductId))} · {formatQty(job.outputQuantity, job.outputUnit)} · {job.status}</span>
              </div>
              {job.status === 'planned' ? (
                <div>
                  <button type="button" onClick={() => onCompleteJob(job.jobId)}>Complete</button>
                  <button type="button" onClick={() => onCancelJob(job.jobId)}>Cancel</button>
                </div>
              ) : null}
            </article>
          )) : <p className="uniquem-empty">No blend jobs yet.</p>}
        </div>
      </Panel>
    </div>
  );
}

function RecipeForm({ data, onSubmit }) {
  const [form, setForm] = useState({ name: '', outputProductId: '', outputQuantity: '1', outputUnit: 'L', inputProductId: '', inputQuantity: '1', inputUnit: 'L', instructions: '' });
  return (
    <form className="uniquem-form" onSubmit={(event) => {
      event.preventDefault();
      onSubmit({
        name: form.name,
        outputProductId: form.outputProductId,
        outputQuantity: Number(form.outputQuantity || 1),
        outputUnit: form.outputUnit,
        instructions: form.instructions,
        inputs: [{ productId: form.inputProductId, quantity: Number(form.inputQuantity || 1), unit: form.inputUnit }],
      });
      setForm({ name: '', outputProductId: '', outputQuantity: '1', outputUnit: 'L', inputProductId: '', inputQuantity: '1', inputUnit: 'L', instructions: '' });
    }}>
      <input required placeholder="Recipe name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
      <SelectField label="Output product" required value={form.outputProductId} onChange={(value) => setForm({ ...form, outputProductId: value })} items={data.products} idKey="productId" labelFn={productLabel} />
      <input type="number" min="0.001" step="0.001" value={form.outputQuantity} onChange={(event) => setForm({ ...form, outputQuantity: event.target.value })} />
      <input value={form.outputUnit} onChange={(event) => setForm({ ...form, outputUnit: event.target.value })} />
      <SelectField label="Input product" required value={form.inputProductId} onChange={(value) => setForm({ ...form, inputProductId: value })} items={data.products} idKey="productId" labelFn={productLabel} />
      <input type="number" min="0.001" step="0.001" value={form.inputQuantity} onChange={(event) => setForm({ ...form, inputQuantity: event.target.value })} />
      <textarea className="wide" placeholder="Blend instructions" value={form.instructions} onChange={(event) => setForm({ ...form, instructions: event.target.value })} />
      <button type="submit">Save recipe</button>
    </form>
  );
}

function BlendJobForm({ data, onSubmit }) {
  const [form, setForm] = useState({ name: '', outputProductId: '', outputLotNumber: '', outputQuantity: '', outputUnit: 'L', warehouseId: '', location: 'Main', inputBalanceKey: '', inputQuantity: '' });
  const balanceOptions = data.balances.map((balance) => ({
    key: [balance.productId, balance.lotId, balance.warehouseId, balance.location, balance.unit].join('|'),
    balance,
  }));
  return (
    <form className="uniquem-form" onSubmit={(event) => {
      event.preventDefault();
      const option = balanceOptions.find((item) => item.key === form.inputBalanceKey);
      if (!option) return;
      onSubmit({
        name: form.name,
        outputProductId: form.outputProductId,
        outputLotNumber: form.outputLotNumber,
        outputQuantity: Number(form.outputQuantity || 0),
        outputUnit: form.outputUnit,
        warehouseId: form.warehouseId,
        location: form.location,
        inputs: [{ ...option.balance, quantity: Number(form.inputQuantity || 0) }],
      });
      setForm({ name: '', outputProductId: '', outputLotNumber: '', outputQuantity: '', outputUnit: 'L', warehouseId: '', location: 'Main', inputBalanceKey: '', inputQuantity: '' });
    }}>
      <input required placeholder="Job name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
      <SelectField label="Output product" required value={form.outputProductId} onChange={(value) => setForm({ ...form, outputProductId: value })} items={data.products} idKey="productId" labelFn={productLabel} />
      <input placeholder="Output lot" value={form.outputLotNumber} onChange={(event) => setForm({ ...form, outputLotNumber: event.target.value })} />
      <input required type="number" min="0.001" step="0.001" placeholder="Output qty" value={form.outputQuantity} onChange={(event) => setForm({ ...form, outputQuantity: event.target.value })} />
      <input value={form.outputUnit} onChange={(event) => setForm({ ...form, outputUnit: event.target.value })} />
      <SelectField label="Output warehouse" required value={form.warehouseId} onChange={(value) => setForm({ ...form, warehouseId: value })} items={data.warehouses} idKey="warehouseId" labelFn={(item) => item.name} />
      <select required value={form.inputBalanceKey} onChange={(event) => setForm({ ...form, inputBalanceKey: event.target.value })}>
        <option value="">Select input lot...</option>
        {balanceOptions.map(({ key, balance }) => (
          <option key={key} value={key}>{balance.lotId} · {formatQty(balance.quantity, balance.unit)}</option>
        ))}
      </select>
      <input required type="number" min="0.001" step="0.001" placeholder="Input qty" value={form.inputQuantity} onChange={(event) => setForm({ ...form, inputQuantity: event.target.value })} />
      <button type="submit">Create blend job</button>
    </form>
  );
}

function MovementTable({ movements, lookups }) {
  return (
    <DataTable
      empty="No stock movements yet."
      columns={['Date', 'Type', 'Product', 'Lot', 'Warehouse', 'Qty']}
      rows={movements.map((item) => [
        item.createdAt ? item.createdAt.slice(0, 10) : '-',
        item.type,
        productLabel(lookups.products.get(item.productId)),
        lookups.lots.get(item.lotId)?.lotNumber || item.lotId,
        lookups.warehouses.get(item.warehouseId)?.name || item.warehouseId,
        formatQty(item.quantity, item.unit),
      ])}
    />
  );
}

function MovementsPage({ data, lookups }) {
  return (
    <Panel title="Immutable Stock Ledger">
      <MovementTable movements={data.movements} lookups={lookups} />
    </Panel>
  );
}

function PriceListPage({ data, lookups, onPrice }) {
  const [form, setForm] = useState({ productId: '', price: '', currency: 'CAD', unit: 'L', effectiveDate: today(), notes: '' });
  return (
    <div className="uniquem-stack">
      <Panel title="Add Price">
        <form className="uniquem-form compact" onSubmit={(event) => {
          event.preventDefault();
          onPrice({ ...form, price: Number(form.price || 0) });
          setForm({ productId: '', price: '', currency: 'CAD', unit: 'L', effectiveDate: today(), notes: '' });
        }}>
          <SelectField label="Product" required value={form.productId} onChange={(value) => setForm({ ...form, productId: value })} items={data.products} idKey="productId" labelFn={productLabel} />
          <input required type="number" min="0.01" step="0.01" placeholder="Price" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} />
          <input placeholder="Currency" value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value })} />
          <input placeholder="Unit" value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })} />
          <input type="date" value={form.effectiveDate} onChange={(event) => setForm({ ...form, effectiveDate: event.target.value })} />
          <input placeholder="Notes" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
          <button type="submit">Save price</button>
        </form>
      </Panel>
      <Panel title="Active Price List">
        <DataTable
          empty="No prices yet."
          columns={['Product', 'Price', 'Effective', 'Status']}
          rows={data.prices.map((item) => [
            productLabel(lookups.products.get(item.productId)),
            asMoney(item),
            item.effectiveDate || '-',
            item.status,
          ])}
        />
      </Panel>
    </div>
  );
}

function FuturePage({ type }) {
  const title = type === 'shipping' ? 'Shipping' : 'Orders';
  const Icon = type === 'shipping' ? FiTruck : FiClipboard;
  return (
    <div className="uniquem-future">
      <Icon aria-hidden="true" />
      <div>
        <h2>{title} will connect to inventory next.</h2>
        <p>Inventory, lot traceability, blending, and pricing are now the foundation. This page is reserved for reservations, shipments, customer orders, and future invoice documents.</p>
      </div>
    </div>
  );
}

export default function Uniquem({ page }) {
  const [data, setData] = useState(EMPTY_DATA);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await postJson('listUniquemOperations', {}, { authed: true });
      setData({ ...EMPTY_DATA, ...response, dashboard: { ...EMPTY_DATA.dashboard, ...(response.dashboard || {}) } });
    } catch (err) {
      setError(err?.message || 'Failed to load Uniquem operations.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (page !== '3d' && page !== '3d-creator') load();
  }, [page]);

  const lookups = useMemo(() => ({
    products: byId(data.products, 'productId'),
    warehouses: byId(data.warehouses, 'warehouseId'),
    lots: byId(data.lots, 'lotId'),
  }), [data]);

  const mutate = async (endpoint, payload) => {
    setError('');
    try {
      const response = await postJson(endpoint, payload, { authed: true });
      if (response.products || response.movements || response.balances) {
        setData({ ...EMPTY_DATA, ...response, dashboard: { ...EMPTY_DATA.dashboard, ...(response.dashboard || {}) } });
      } else {
        await load();
      }
    } catch (err) {
      setError(err?.message || 'Uniquem operation failed.');
    }
  };

  if (page === '3d') return <Warehouse3D />;
  if (page === '3d-creator') return <Uniquem3DCreator />;

  const normalizedPage = PAGE_META[page] ? page : 'dashboard';
  const pageContent = {
    dashboard: <DashboardPage data={data} lookups={lookups} />,
    products: <ProductsPage data={data} onProduct={(payload) => mutate('saveUniquemProduct', payload)} />,
    inventory: <InventoryPage data={data} lookups={lookups} onWarehouse={(payload) => mutate('saveUniquemWarehouse', payload)} onAdjustment={(payload) => mutate('adjustUniquemInventory', payload)} onTransfer={(payload) => mutate('transferUniquemInventory', payload)} />,
    receive: <ReceivePage data={data} onReceive={(payload) => mutate('receiveUniquemInventory', payload)} />,
    blending: <BlendingPage data={data} lookups={lookups} onRecipe={(payload) => mutate('saveUniquemRecipe', payload)} onBlendJob={(payload) => mutate('createUniquemBlendJob', payload)} onCompleteJob={(jobId) => mutate('completeUniquemBlendJob', { jobId })} onCancelJob={(jobId) => mutate('cancelUniquemBlendJob', { jobId })} />,
    movements: <MovementsPage data={data} lookups={lookups} />,
    'price-list': <PriceListPage data={data} lookups={lookups} onPrice={(payload) => mutate('saveUniquemPrice', payload)} />,
    shipping: <FuturePage type="shipping" />,
    orders: <FuturePage type="orders" />,
  }[normalizedPage];

  return (
    <UniquemShell page={normalizedPage} data={data} loading={loading} error={error} onRefresh={load}>
      {pageContent}
    </UniquemShell>
  );
}
