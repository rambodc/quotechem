import React, { useEffect, useMemo, useState } from 'react';
import { FiArchive, FiEdit2, FiPlus } from 'react-icons/fi';
import {
  asMoney,
  AttachmentList,
  AttachmentUpload,
  DataTable,
  entityAttachments,
  formatQty,
  getProductImage,
  Panel,
  ProductThumb,
  productLabel,
} from './UniquemShared';

const EMPTY_PRODUCT = { name: '', sku: '', type: 'raw', unit: 'L', reorderPoint: '', description: '', imageUrl: '' };

function ProductForm({ initialProduct, onSubmit, onCancel }) {
  const [form, setForm] = useState(EMPTY_PRODUCT);
  useEffect(() => {
    if (initialProduct) {
      setForm({
        productId: initialProduct.productId,
        name: initialProduct.name || '',
        sku: initialProduct.sku || '',
        type: initialProduct.type || 'raw',
        unit: initialProduct.unit || 'L',
        reorderPoint: String(initialProduct.reorderPoint || ''),
        description: initialProduct.description || '',
        imageUrl: '',
      });
    } else {
      setForm(EMPTY_PRODUCT);
    }
  }, [initialProduct]);

  const submit = (event) => {
    event.preventDefault();
    onSubmit({
      ...form,
      reorderPoint: Number(form.reorderPoint || 0),
      media: form.imageUrl ? [{ kind: 'image', name: `${form.name} image`, url: form.imageUrl }] : initialProduct?.media || [],
    });
    if (!initialProduct) setForm(EMPTY_PRODUCT);
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
      <input placeholder="Image URL fallback" value={form.imageUrl} onChange={(event) => setForm({ ...form, imageUrl: event.target.value })} />
      <input className="wide" placeholder="Description / SDS notes" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
      <button type="submit">
        <FiPlus aria-hidden="true" />
        {initialProduct ? 'Save product' : 'Add product'}
      </button>
      {initialProduct && onCancel ? <button type="button" onClick={onCancel}>Cancel edit</button> : null}
    </form>
  );
}

function ProductDetail({ data, lookups, product, onEdit, onArchive, onUpload, onArchiveAttachment }) {
  if (!product) return <p className="uniquem-empty">Select a product to view inventory, prices, and files.</p>;
  const balances = data.balances.filter((item) => item.productId === product.productId);
  const prices = data.prices.filter((item) => item.productId === product.productId);
  const attachments = entityAttachments(data, 'product', product.productId);
  return (
    <div className="uniquem-detail">
      <header className="uniquem-detail-head">
        <ProductThumb product={product} data={data} />
        <div>
          <h3>{productLabel(product)}</h3>
          <p>{product.type} - {product.unit} - reorder {formatQty(product.reorderPoint, product.unit)}</p>
        </div>
        <div className="uniquem-detail-actions">
          <button type="button" onClick={() => onEdit(product)}><FiEdit2 aria-hidden="true" /> Edit</button>
          <button type="button" onClick={() => onArchive(product.productId)}><FiArchive aria-hidden="true" /> Archive</button>
        </div>
      </header>
      <p>{product.description || 'No product notes yet.'}</p>
      <div className="uniquem-grid two">
        <Panel title="Inventory by Lot">
          <DataTable
            empty="No stock on hand for this product."
            columns={['Lot', 'Warehouse', 'Location', 'Quantity']}
            rows={balances.map((item) => [
              lookups.lots.get(item.lotId)?.lotNumber || item.lotId,
              lookups.warehouses.get(item.warehouseId)?.name || item.warehouseId,
              item.location,
              formatQty(item.quantity, item.unit),
            ])}
          />
        </Panel>
        <Panel title="Price History">
          <DataTable
            empty="No prices for this product."
            columns={['Price', 'Effective', 'Status']}
            rows={prices.map((price) => [asMoney(price), price.effectiveDate || '-', price.status])}
          />
        </Panel>
      </div>
      <Panel title="Product Files">
        <div className="uniquem-file-toolbar">
          <AttachmentUpload label="Main image" entityType="product" entityId={product.productId} kind="image" accept="image/*" onUpload={onUpload} />
          <AttachmentUpload label="SDS" entityType="product" entityId={product.productId} kind="sds" accept="application/pdf,image/*" onUpload={onUpload} />
          <AttachmentUpload label="Label" entityType="product" entityId={product.productId} kind="label" accept="application/pdf,image/*" onUpload={onUpload} />
          <AttachmentUpload label="Spec / file" entityType="product" entityId={product.productId} kind="spec" accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,image/*,video/*" onUpload={onUpload} />
        </div>
        <AttachmentList attachments={attachments} onArchive={onArchiveAttachment} />
      </Panel>
      {getProductImage(product, data) ? <img className="uniquem-detail-image" src={getProductImage(product, data)} alt="" /> : null}
    </div>
  );
}

export default function ProductsPage({ data, lookups, onProduct, onArchiveProduct, onUploadAttachment, onArchiveAttachment }) {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [editing, setEditing] = useState(null);
  const filteredProducts = useMemo(() => {
    const term = query.toLowerCase();
    return data.products.filter((product) => `${product.name} ${product.sku} ${product.type}`.toLowerCase().includes(term));
  }, [data.products, query]);
  const selectedProduct = data.products.find((product) => product.productId === selectedId) || filteredProducts[0] || null;

  return (
    <div className="uniquem-stack">
      <Panel title={editing ? 'Edit Product' : 'Create Product'} action={<input className="uniquem-filter" placeholder="Search products" value={query} onChange={(event) => setQuery(event.target.value)} />}>
        <ProductForm initialProduct={editing} onSubmit={onProduct} onCancel={() => setEditing(null)} />
      </Panel>
      <div className="uniquem-product-grid">
        {filteredProducts.length ? filteredProducts.map((product) => (
          <button type="button" className={`uniquem-product-card ${selectedProduct?.productId === product.productId ? 'active' : ''}`} key={product.productId} onClick={() => setSelectedId(product.productId)}>
            <ProductThumb product={product} data={data} />
            <span>
              <strong>{product.name}</strong>
              <em>{product.sku || 'No SKU'} - {product.type} - {product.unit}</em>
              <small>{entityAttachments(data, 'product', product.productId).length} files</small>
            </span>
          </button>
        )) : <p className="uniquem-empty">No products match this search.</p>}
      </div>
      <Panel title="Product Detail">
        <ProductDetail
          data={data}
          lookups={lookups}
          product={selectedProduct}
          onEdit={setEditing}
          onArchive={onArchiveProduct}
          onUpload={onUploadAttachment}
          onArchiveAttachment={onArchiveAttachment}
        />
      </Panel>
    </div>
  );
}
