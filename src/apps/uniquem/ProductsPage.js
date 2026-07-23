import React, { useEffect, useMemo, useState } from 'react';
import { FiEdit2, FiPackage, FiPlus, FiX } from 'react-icons/fi';
import {
  AttachmentList,
  AttachmentUpload,
  entityAttachments,
  getProductImage,
  ProductThumb,
} from './UniquemShared';

const PACKAGE_TYPES = ['Bag', 'Pail', 'Drum', 'Tote', 'Box/Case', 'Other'];
const MEASUREMENT_UNITS = ['kg', 'L'];
const EMPTY_PRODUCT = {
  name: '',
  description: '',
  packageType: 'Bag',
  packageAmount: '',
  measurementUnit: 'kg',
  packagesPerPallet: '',
};

function pluralizePackage(type, count) {
  if (Number(count) === 1) return type.toLowerCase();
  if (type === 'Box/Case') return 'boxes/cases';
  return `${type.toLowerCase()}s`;
}

export function packagingSummary(product) {
  const amount = Number(product?.packageAmount || 0);
  const perPallet = Number(product?.packagesPerPallet || 0);
  if (!amount || !product?.packageType || !product?.measurementUnit) return '';
  const parts = [`${amount.toLocaleString()} ${product.measurementUnit} per ${product.packageType.toLowerCase()}`];
  if (perPallet) {
    parts.push(`${perPallet.toLocaleString()} ${pluralizePackage(product.packageType, perPallet)} per pallet`);
    parts.push(`${(amount * perPallet).toLocaleString()} ${product.measurementUnit} per pallet`);
  }
  return parts.join(' • ');
}

function productToDraft(product) {
  if (!product) return { ...EMPTY_PRODUCT };
  return {
    productId: product.productId,
    name: product.name || '',
    description: product.description || '',
    packageType: product.packageType || 'Bag',
    packageAmount: String(product.packageAmount || ''),
    measurementUnit: product.measurementUnit || 'kg',
    packagesPerPallet: product.packagesPerPallet ? String(product.packagesPerPallet) : '',
  };
}

function ProductFields({ draft, onChange, errors }) {
  const update = (patch) => onChange({ ...draft, ...patch });
  return (
    <div className="uniquem-product-fields">
      <label>
        <span>Name</span>
        <input autoFocus required value={draft.name} onChange={(event) => update({ name: event.target.value })} />
        {errors.name ? <small className="uniquem-field-error">{errors.name}</small> : null}
      </label>
      <label>
        <span>Packaging</span>
        <select value={draft.packageType} onChange={(event) => update({ packageType: event.target.value })}>
          {PACKAGE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
        </select>
      </label>
      <div className="uniquem-product-field-row">
        <label>
          <span>Amount per package</span>
          <input required type="number" min="0.001" step="0.001" value={draft.packageAmount} onChange={(event) => update({ packageAmount: event.target.value })} />
          {errors.packageAmount ? <small className="uniquem-field-error">{errors.packageAmount}</small> : null}
        </label>
        <label>
          <span>Unit</span>
          <select value={draft.measurementUnit} onChange={(event) => update({ measurementUnit: event.target.value })}>
            {MEASUREMENT_UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
          </select>
        </label>
      </div>
      <label>
        <span>Packages per pallet <em>Optional</em></span>
        <input type="number" min="1" step="1" value={draft.packagesPerPallet} onChange={(event) => update({ packagesPerPallet: event.target.value })} />
        {errors.packagesPerPallet ? <small className="uniquem-field-error">{errors.packagesPerPallet}</small> : null}
      </label>
      <label>
        <span>Description <em>Optional</em></span>
        <textarea rows="5" value={draft.description} onChange={(event) => update({ description: event.target.value })} />
      </label>
      {draft.packageAmount ? <div className="uniquem-package-preview"><strong>Packaging summary</strong><span>{packagingSummary(draft)}</span></div> : null}
    </div>
  );
}

function validateProduct(draft) {
  const errors = {};
  if (!draft.name.trim()) errors.name = 'Product name is required.';
  if (!(Number(draft.packageAmount) > 0)) errors.packageAmount = 'Enter an amount greater than zero.';
  if (draft.packagesPerPallet !== '' && (!Number.isInteger(Number(draft.packagesPerPallet)) || Number(draft.packagesPerPallet) <= 0)) {
    errors.packagesPerPallet = 'Enter a whole number greater than zero.';
  }
  return errors;
}

function ProductDrawer({ mode, product, data, onClose, onSave, onDelete, onUpload, onArchiveAttachment, onCreatedWithUploadFailure }) {
  const [draft, setDraft] = useState(() => productToDraft(product));
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [queuedFiles, setQueuedFiles] = useState([]);
  const attachments = product ? entityAttachments(data, 'product', product.productId) : [];
  const files = attachments.filter((item) => item.kind !== 'image');
  const imageUrl = product ? getProductImage(product, data) : '';
  useEffect(() => setDraft(productToDraft(product)), [product, mode]);
  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [busy, onClose]);

  const submit = async (event) => {
    event.preventDefault();
    const nextErrors = validateProduct(draft);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setBusy(true);
    const saved = await onSave({
      ...draft,
      name: draft.name.trim(),
      description: draft.description.trim(),
      packageAmount: Number(draft.packageAmount),
      packagesPerPallet: draft.packagesPerPallet === '' ? null : Number(draft.packagesPerPallet),
    });
    if (saved && mode === 'create') {
      const productId = saved.product?.productId;
      let failed = false;
      for (const item of queuedFiles) if (!(await onUpload({ ...item, entityType: 'product', entityId: productId }, item.kind === 'image'))) failed = true;
      setBusy(false);
      if (failed) { onCreatedWithUploadFailure(saved.product); return; }
    } else setBusy(false);
    if (saved) onClose();
  };

  const runFileAction = async (action) => {
    setBusy(true);
    await action();
    setBusy(false);
  };

  return (
    <div className="uniquem-product-drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <aside className="uniquem-product-drawer" aria-label={`${mode === 'create' ? 'Create' : mode === 'edit' ? 'Edit' : 'View'} product`}>
      <div className="uniquem-product-drawer-head">
        <div><span>Products</span><h2>{mode === 'create' ? 'Create Product' : mode === 'edit' ? 'Edit Product' : product?.name}</h2></div>
        <button type="button" onClick={onClose} disabled={busy} aria-label="Close"><FiX aria-hidden="true" /></button>
      </div>

      {mode === 'view' ? (
        <div className="uniquem-product-view">
          {imageUrl ? <img src={imageUrl} alt="" className="uniquem-product-hero-image" /> : <div className="uniquem-product-image-placeholder"><FiPackage aria-hidden="true" /></div>}
          <section><h3>Packaging</h3><p>{packagingSummary(product)}</p></section>
          <section><h3>Description</h3><p>{product.description || 'No description provided.'}</p></section>
          <section><h3>Files</h3><AttachmentList attachments={files} /></section>
        </div>
      ) : (
        <form className="uniquem-product-drawer-form" onSubmit={submit} noValidate>
          <ProductFields draft={draft} onChange={setDraft} errors={errors} />
          {mode === 'edit' ? (
            <section className="uniquem-product-files">
              <h3>Product image and files</h3>
              {imageUrl ? <img src={imageUrl} alt="" className="uniquem-product-edit-image" /> : null}
              <div className="uniquem-file-toolbar">
                <AttachmentUpload label={imageUrl ? 'Replace main image' : 'Add main image'} entityType="product" entityId={product.productId} kind="image" accept="image/*" disabled={busy} onUpload={(payload) => runFileAction(() => onUpload(payload, true))} />
                <AttachmentUpload label="Add SDS" entityType="product" entityId={product.productId} kind="sds" accept="application/pdf,image/*" disabled={busy} onUpload={(payload) => runFileAction(() => onUpload(payload))} />
                <AttachmentUpload label="Add label" entityType="product" entityId={product.productId} kind="label" accept="application/pdf,image/*" disabled={busy} onUpload={(payload) => runFileAction(() => onUpload(payload))} />
                <AttachmentUpload label="Add specification" entityType="product" entityId={product.productId} kind="spec" accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,image/*" disabled={busy} onUpload={(payload) => runFileAction(() => onUpload(payload))} />
                <AttachmentUpload label="Add other file" entityType="product" entityId={product.productId} kind="other" accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,image/*,video/*" disabled={busy} onUpload={(payload) => runFileAction(() => onUpload(payload))} />
              </div>
              <AttachmentList attachments={files} actionLabel="Remove" onArchive={(id) => runFileAction(() => onArchiveAttachment(id))} />
            </section>
          ) : (
            <section className="uniquem-product-files">
              <h3>Product image and files</h3>
              <p>Select files now. The product will be created first, then its files will upload.</p>
              <div className="uniquem-file-toolbar">
                {[['Main image', 'image', 'image/*'], ['SDS', 'sds', 'application/pdf,image/*'], ['Label', 'label', 'application/pdf,image/*'], ['Specification', 'spec', '.pdf,.doc,.docx,.xls,.xlsx,.csv,image/*'], ['Other file', 'other', '.pdf,.doc,.docx,.xls,.xlsx,.csv,image/*,video/*']].map(([label, kind, accept]) => (
                  <label className="uniquem-file-action" key={kind}><span>{label}</span><input type="file" accept={accept} onChange={(event) => { const file = event.target.files?.[0]; if (file) setQueuedFiles([...queuedFiles.filter((item) => kind !== 'image' || item.kind !== 'image'), { file, kind }]); }} /></label>
                ))}
              </div>
              {queuedFiles.length ? <small>{queuedFiles.length} file(s) queued.</small> : null}
            </section>
          )}
          <button type="submit" className="uniquem-product-save" disabled={busy}>{busy ? 'Saving...' : mode === 'create' ? 'Create product' : 'Save changes'}</button>
          {mode === 'edit' ? <button type="button" className="uniquem-danger" disabled={busy} onClick={async () => { if (!window.confirm('Permanently delete this product?')) return; setBusy(true); const deleted = await onDelete(product.productId); setBusy(false); if (deleted) onClose(); }}>Delete product</button> : null}
        </form>
      )}
    </aside></div>
  );
}

export default function ProductsPage({ data, onProduct, onDeleteProduct, onUploadAttachment, onArchiveAttachment }) {
  const [query, setQuery] = useState('');
  const [drawer, setDrawer] = useState(null);
  const filteredProducts = useMemo(() => {
    const term = query.trim().toLowerCase();
    return data.products.filter((product) => `${product.name} ${product.packageType} ${product.measurementUnit}`.toLowerCase().includes(term));
  }, [data.products, query]);

  const upload = async (payload, replaceImage = false) => {
    if (replaceImage) {
      const oldImages = entityAttachments(data, 'product', payload.entityId).filter((item) => item.kind === 'image');
      for (const image of oldImages) await onArchiveAttachment(image.attachmentId);
    }
    return onUploadAttachment(payload);
  };

  return (
    <div className="uniquem-products-page">
      <header className="uniquem-products-toolbar">
        <div><h2>Product catalog</h2><p>Manage product packaging, images, and documents.</p></div>
        <button type="button" onClick={() => setDrawer({ mode: 'create', product: null })}><FiPlus aria-hidden="true" /> Create Product</button>
      </header>
      <label className="uniquem-product-search"><span className="sr-only">Search products</span><input placeholder="Search products" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <div className="uniquem-product-list">
        {filteredProducts.map((product) => (
          <article key={product.productId} className="uniquem-product-row" role="button" tabIndex="0" onClick={() => setDrawer({ mode: 'view', product })} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setDrawer({ mode: 'view', product }); }}>
            <ProductThumb product={product} data={data} />
            <div className="uniquem-product-row-copy"><strong>{product.name}</strong><span>{packagingSummary(product)}</span></div>
            <button type="button" onClick={(event) => { event.stopPropagation(); setDrawer({ mode: 'edit', product }); }}><FiEdit2 aria-hidden="true" /> Edit</button>
          </article>
        ))}
        {!filteredProducts.length ? <div className="uniquem-products-empty"><FiPackage aria-hidden="true" /><h3>{data.products.length ? 'No products match your search' : 'No products yet'}</h3><p>{data.products.length ? 'Try a different product name or packaging type.' : 'Create your first product to get started.'}</p></div> : null}
      </div>
      {drawer ? <ProductDrawer mode={drawer.mode} product={drawer.product} data={data} onClose={() => setDrawer(null)} onSave={onProduct} onDelete={onDeleteProduct} onUpload={upload} onArchiveAttachment={onArchiveAttachment} onCreatedWithUploadFailure={(product) => setDrawer({ mode: 'edit', product })} /> : null}
    </div>
  );
}
