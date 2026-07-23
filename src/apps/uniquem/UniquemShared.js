import React from 'react';
import { FiFileText, FiImage, FiPackage, FiVideo } from 'react-icons/fi';

export const EMPTY_DATA = {
  products: [],
  warehouses: [],
  batches: [],
  ledger: [],
  receipts: [],
  shipments: [],
  recipes: [],
  productionRuns: [],
  attachments: [],
  attachmentsByEntity: {},
  dashboard: {
    productCount: 0,
    warehouseCount: 0,
    inventoryPositions: 0,
    totalPackages: 0,
    draftShipments: 0,
    draftProductionRuns: 0,
  },
};

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function asMoney(price) {
  if (!price) return '-';
  return `${price.currency || 'CAD'} ${Number(price.price || 0).toFixed(2)} / ${price.unit || 'unit'}`;
}

export function byId(items, key) {
  return new Map((items || []).map((item) => [item[key], item]));
}

export function productLabel(product) {
  if (!product) return 'Unknown product';
  return product.name;
}

export function formatQty(quantity, unit) {
  return `${Number(quantity || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })} ${unit || ''}`.trim();
}

export function packageSummary(product, packageQuantity) {
  const packages = Number(packageQuantity || 0);
  const amount = packages * Number(product?.packageAmount || 0);
  const pallets = product?.packagesPerPallet ? packages / Number(product.packagesPerPallet) : null;
  return `${formatQty(packages, 'packages')} • ${pallets == null ? 'No pallet configuration' : formatQty(pallets, 'pallets')} • ${formatQty(amount, product?.measurementUnit)}`;
}

export function Drawer({ title, busy, onClose, children }) {
  React.useEffect(() => {
    const close = (event) => { if (event.key === 'Escape' && !busy) onClose(); };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [busy, onClose]);
  return (
    <div className="uniquem-product-drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <aside className="uniquem-product-drawer" aria-label={title}>
        <div className="uniquem-product-drawer-head"><div><span>Uniquem</span><h2>{title}</h2></div><button type="button" onClick={onClose} disabled={busy} aria-label="Close">×</button></div>
        {children}
      </aside>
    </div>
  );
}

export function entityKey(entityType, entityId) {
  return `${entityType}:${entityId}`;
}

export function entityAttachments(data, entityType, entityId) {
  return data.attachmentsByEntity?.[entityKey(entityType, entityId)] || [];
}

export function getProductImage(product, data) {
  const uploaded = entityAttachments(data, 'product', product?.productId).find((item) => item.kind === 'image' && item.url);
  return uploaded?.url || '';
}

export function getBalance(data, target) {
  return data.balances
    .filter(
      (item) =>
        item.productId === target.productId &&
        item.lotId === target.lotId &&
        item.warehouseId === target.warehouseId &&
        (item.location || 'Main') === (target.location || 'Main')
    )
    .reduce((sum, item) => sum + Number(item.quantity || 0), 0);
}

export function Panel({ title, action, children }) {
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

export function DataTable({ columns, rows, empty }) {
  if (!rows.length) return <p className="uniquem-empty">{empty}</p>;
  return (
    <div className="uniquem-table-wrap">
      <table className="uniquem-table">
        <thead>
          <tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.map((cell) => (typeof cell === 'string' ? cell : index)).join('-')}-${index}`}>
              {row.map((cell, cellIndex) => <td key={`${cellIndex}-${index}`}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TextField({ label, onChange, ...props }) {
  return (
    <label>
      {label}
      <input {...props} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

export function SelectField({ label, items, idKey, labelFn, onChange, required, value }) {
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

export function AttachmentIcon({ attachment }) {
  if (attachment.contentType?.startsWith('image/')) return <FiImage aria-hidden="true" />;
  if (attachment.contentType?.startsWith('video/')) return <FiVideo aria-hidden="true" />;
  return <FiFileText aria-hidden="true" />;
}

export function AttachmentList({ attachments, onArchive, actionLabel = 'Archive' }) {
  if (!attachments.length) return <p className="uniquem-empty">No files attached.</p>;
  return (
    <div className="uniquem-attachment-list">
      {attachments.map((attachment) => (
        <article className="uniquem-attachment" key={attachment.attachmentId}>
          <AttachmentIcon attachment={attachment} />
          <div>
            <a href={attachment.url} target="_blank" rel="noreferrer">{attachment.name || attachment.fileName}</a>
            <span>{attachment.kind} - {attachment.contentType || 'file'} - {attachment.uploadedAt ? attachment.uploadedAt.slice(0, 10) : 'new'}</span>
          </div>
          {onArchive ? <button type="button" onClick={() => onArchive(attachment.attachmentId)}>{actionLabel}</button> : null}
        </article>
      ))}
    </div>
  );
}

export function AttachmentUpload({ label, entityType, entityId, kind, accept, onUpload, disabled }) {
  return (
    <label className="uniquem-file-action">
      <span>{label}</span>
      <input
        type="file"
        accept={accept}
        disabled={disabled || !entityId}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onUpload({ file, entityType, entityId, kind });
          event.target.value = '';
        }}
      />
    </label>
  );
}

export function MovementTable({ movements, lookups }) {
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

export function ProductThumb({ product, data }) {
  const image = getProductImage(product, data);
  return (
    <div className="uniquem-product-thumb">
      {image ? <img src={image} alt="" /> : <FiPackage aria-hidden="true" />}
    </div>
  );
}
