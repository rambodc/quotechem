import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import { FiArchive, FiBox, FiClipboard, FiPackage, FiRefreshCw, FiTruck } from 'react-icons/fi';
import { storage } from '../../firebase';
import { postJson } from '../../lib/api';
import DashboardPage from './DashboardPage';
import InventoryPage from './InventoryPage';
import ProductsPage from './ProductsPage';
import ReceivingPage from './ReceivingPage';
import ShippingPage from './ShippingPage';
import ProductionPage from './ProductionPage';
import { byId, EMPTY_DATA } from './UniquemShared';
import './Uniquem.css';

const PAGE_META = {
  dashboard: { title: 'Dashboard', eyebrow: 'Operations', icon: FiClipboard },
  products: { title: 'Products', eyebrow: 'Catalog', icon: FiPackage },
  inventory: { title: 'Inventory', eyebrow: 'Package ledger', icon: FiArchive },
  receiving: { title: 'Receiving', eyebrow: 'Incoming inventory', icon: FiTruck },
  shipping: { title: 'Shipping', eyebrow: 'Outgoing inventory', icon: FiBox },
  production: { title: 'Production', eyebrow: 'Recipes and runs', icon: FiRefreshCw },
};

const mergeData = (response = {}) => ({ ...EMPTY_DATA, ...response, dashboard: { ...EMPTY_DATA.dashboard, ...(response.dashboard || {}) } });

function contentType(file) {
  if (file?.type) return file.type;
  if (/\.(jpe?g|png|gif|webp|heic)$/i.test(file?.name || '')) return 'image/*';
  if (/\.pdf$/i.test(file?.name || '')) return 'application/pdf';
  return 'application/octet-stream';
}

function Shell({ page, loading, error, status, onRefresh, children }) {
  const meta = PAGE_META[page] || PAGE_META.dashboard; const Icon = meta.icon;
  return <section className="uniquem-ops-page">
    <header className="uniquem-ops-head"><div><p>{meta.eyebrow}</p><h1><Icon aria-hidden="true" />{meta.title}</h1></div><button type="button" onClick={onRefresh} disabled={loading}><FiRefreshCw aria-hidden="true" />Refresh</button></header>
    {error ? <div className="uniquem-alert">{error}</div> : null}{status ? <div className="uniquem-success">{status}</div> : null}
    {loading ? <div className="uniquem-loading">Loading Uniquem operations...</div> : children}
  </section>;
}

export default function Uniquem({ page }) {
  const [data, setData] = useState(EMPTY_DATA); const [loading, setLoading] = useState(false);
  const [error, setError] = useState(''); const [status, setStatus] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setData(mergeData(await postJson('listUniquemWorkspace', {}, { authed: true }))); }
    catch (err) { setError(err?.message || 'Failed to load Uniquem operations.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const lookups = useMemo(() => ({ products: byId(data.products, 'productId'), warehouses: byId(data.warehouses, 'warehouseId'), batches: byId(data.batches, 'batchId') }), [data]);
  const mutate = async (endpoint, payload) => {
    setError(''); setStatus('');
    try {
      const response = await postJson(endpoint, payload, { authed: true });
      if (Array.isArray(response.batches) || Array.isArray(response.receipts)) setData(mergeData(response)); else await load();
      return response;
    }
    catch (err) { setError(err?.message || 'Uniquem operation failed.'); return null; }
  };
  const uploadAttachment = async ({ file, entityType, entityId, kind }) => {
    setError(''); setStatus(`Uploading ${file.name}...`);
    try {
      const type = contentType(file);
      const prepared = await postJson('createUniquemAttachmentUpload', { entityType, entityId, kind, fileName: file.name, contentType: type, size: file.size }, { authed: true });
      const target = storageRef(storage, prepared.path); await uploadBytes(target, file, { contentType: type });
      await postJson('saveUniquemAttachment', { attachmentId: prepared.attachmentId, entityType, entityId, kind, name: file.name, fileName: file.name, contentType: type, size: file.size, path: prepared.path, url: await getDownloadURL(target) }, { authed: true });
      await load(); setStatus(`${file.name} uploaded.`); return true;
    } catch (err) { setError(err?.message || 'Attachment upload failed.'); return null; }
  };
  const removeAttachment = async (attachmentId) => mutate('archiveUniquemAttachment', { attachmentId });
  const normalized = PAGE_META[page] ? page : 'dashboard';
  const common = { data, lookups, mutate, uploadAttachment, removeAttachment };
  const content = {
    dashboard: <DashboardPage {...common} />,
    products: <ProductsPage data={data} onProduct={(payload) => mutate('saveUniquemProduct', payload)} onDeleteProduct={(productId) => mutate('deleteUniquemProduct', { productId })} onUploadAttachment={uploadAttachment} onArchiveAttachment={removeAttachment} />,
    inventory: <InventoryPage {...common} />,
    receiving: <ReceivingPage {...common} />,
    shipping: <ShippingPage {...common} />,
    production: <ProductionPage {...common} />,
  }[normalized];
  return <Shell page={normalized} loading={loading} error={error} status={status} onRefresh={load}>{content}</Shell>;
}
