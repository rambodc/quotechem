import React, { useEffect, useMemo, useState } from 'react';
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import { FiArchive, FiBox, FiClipboard, FiDollarSign, FiLayers, FiPackage, FiRefreshCw, FiTruck } from 'react-icons/fi';
import { storage } from '../../firebase';
import { postJson } from '../../lib/api';
import BlendingPage from './BlendingPage';
import DashboardPage from './DashboardPage';
import FuturePage from './FuturePage';
import InventoryPage from './InventoryPage';
import MovementsPage from './MovementsPage';
import PriceListPage from './PriceListPage';
import ProductsPage from './ProductsPage';
import ReceivePage from './ReceivePage';
import Warehouse3D from './Warehouse3D';
import Uniquem3DCreator from './Uniquem3DCreator';
import { byId, EMPTY_DATA } from './UniquemShared';
import './Uniquem.css';

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

function mergeOperationsData(response) {
  return { ...EMPTY_DATA, ...response, dashboard: { ...EMPTY_DATA.dashboard, ...(response.dashboard || {}) } };
}

function inferAttachmentContentType(file) {
  if (file?.type) return file.type;
  const name = (file?.name || '').toLowerCase();
  if (name.endsWith('.pdf')) return 'application/pdf';
  if (name.endsWith('.csv')) return 'text/csv';
  if (name.endsWith('.txt')) return 'text/plain';
  if (name.endsWith('.doc')) return 'application/msword';
  if (name.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (name.endsWith('.xls')) return 'application/vnd.ms-excel';
  if (name.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (/\.(jpe?g|png|gif|webp|heic|bmp)$/i.test(name)) return 'image/*';
  if (/\.(mp4|mov|webm|m4v)$/i.test(name)) return 'video/*';
  return 'application/octet-stream';
}

function UniquemShell({ page, loading, error, status, onRefresh, children }) {
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
      {status ? <div className="uniquem-success">{status}</div> : null}
      {loading ? <div className="uniquem-loading">Loading Uniquem operations...</div> : children}
    </section>
  );
}

export default function Uniquem({ page }) {
  const [data, setData] = useState(EMPTY_DATA);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await postJson('listUniquemOperations', {}, { authed: true });
      setData(mergeOperationsData(response));
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
    setStatus('');
    try {
      const response = await postJson(endpoint, payload, { authed: true });
      if (response.products || response.movements || response.balances || response.attachments) {
        setData(mergeOperationsData(response));
      } else {
        await load();
      }
      return response;
    } catch (err) {
      setError(err?.message || 'Uniquem operation failed.');
      return null;
    }
  };

  const uploadAttachment = async ({ file, entityType, entityId, kind }) => {
    if (!file || !entityType || !entityId) return null;
    setError('');
    setStatus(`Uploading ${file.name}...`);
    try {
      const contentType = inferAttachmentContentType(file);
      const prepared = await postJson(
        'createUniquemAttachmentUpload',
        { entityType, entityId, kind, fileName: file.name, contentType, size: file.size },
        { authed: true }
      );
      const ref = storageRef(storage, prepared.path);
      await uploadBytes(ref, file, { contentType });
      const url = await getDownloadURL(ref);
      const saved = await postJson(
        'saveUniquemAttachment',
        {
          attachmentId: prepared.attachmentId,
          entityType,
          entityId,
          kind,
          name: file.name,
          fileName: file.name,
          contentType,
          size: file.size,
          path: prepared.path,
          url,
        },
        { authed: true }
      );
      setData(mergeOperationsData(saved));
      setStatus(`${file.name} uploaded.`);
      return saved;
    } catch (err) {
      setError(err?.message || 'Attachment upload failed.');
      return null;
    }
  };

  const archiveAttachment = (attachmentId) => mutate('archiveUniquemAttachment', { attachmentId });

  if (page === '3d') return <Warehouse3D />;
  if (page === '3d-creator') return <Uniquem3DCreator />;

  const normalizedPage = PAGE_META[page] ? page : 'dashboard';
  const pageContent = {
    dashboard: <DashboardPage data={data} lookups={lookups} />,
    products: (
      <ProductsPage
        data={data}
        lookups={lookups}
        onProduct={(payload) => mutate('saveUniquemProduct', payload)}
        onArchiveProduct={(productId) => mutate('archiveUniquemProduct', { productId })}
        onUploadAttachment={uploadAttachment}
        onArchiveAttachment={archiveAttachment}
      />
    ),
    inventory: (
      <InventoryPage
        data={data}
        lookups={lookups}
        onWarehouse={(payload) => mutate('saveUniquemWarehouse', payload)}
        onAdjustment={(payload) => mutate('adjustUniquemInventory', payload)}
        onTransfer={(payload) => mutate('transferUniquemInventory', payload)}
        onUploadAttachment={uploadAttachment}
        onArchiveAttachment={archiveAttachment}
      />
    ),
    receive: <ReceivePage data={data} onReceive={(payload) => mutate('receiveUniquemInventory', payload)} onUploadReceiptFile={uploadAttachment} />,
    blending: (
      <BlendingPage
        data={data}
        lookups={lookups}
        onRecipe={(payload) => mutate('saveUniquemRecipe', payload)}
        onBlendJob={(payload) => mutate('createUniquemBlendJob', payload)}
        onCompleteJob={(jobId) => mutate('completeUniquemBlendJob', { jobId })}
        onCancelJob={(jobId) => mutate('cancelUniquemBlendJob', { jobId })}
        onUploadAttachment={uploadAttachment}
        onArchiveAttachment={archiveAttachment}
      />
    ),
    movements: <MovementsPage data={data} lookups={lookups} />,
    'price-list': <PriceListPage data={data} lookups={lookups} onPrice={(payload) => mutate('saveUniquemPrice', payload)} />,
    shipping: <FuturePage type="shipping" />,
    orders: <FuturePage type="orders" />,
  }[normalizedPage];

  return (
    <UniquemShell page={normalizedPage} loading={loading} error={error} status={status} onRefresh={load}>
      {pageContent}
    </UniquemShell>
  );
}
