import React, { useContext, useEffect, useMemo, useState } from 'react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { FiCheckCircle, FiCloud, FiDroplet, FiSave, FiUploadCloud, FiWifiOff } from 'react-icons/fi';
import { UserContext } from '../App';
import { db } from '../firebase';
import { listDrillingFluidReports, saveDrillingFluidReport, updateDrillingFluidReport } from './drillingFluidsStore';
import './DrillingFluidsReport.css';

const emptyPayload = {
  reportDate: '',
  wellName: '',
  rigName: '',
  mudEngineer: '',
  measuredDepth: '',
  mudType: '',
  density: '',
  funnelViscosity: '',
  plasticViscosity: '',
  yieldPoint: '',
  ph: '',
  notes: '',
};

const OFFLINE_CACHE_NAME = 'quotechem-drilling-fluids-v1';

const fields = [
  { name: 'reportDate', label: 'Report date', type: 'date' },
  { name: 'wellName', label: 'Well name' },
  { name: 'rigName', label: 'Rig name' },
  { name: 'mudEngineer', label: 'Mud engineer' },
  { name: 'measuredDepth', label: 'Measured depth', placeholder: '12,450 ft' },
  { name: 'mudType', label: 'Mud type', placeholder: 'Water-based mud' },
  { name: 'density', label: 'Density', placeholder: '10.2 ppg' },
  { name: 'funnelViscosity', label: 'Funnel viscosity', placeholder: '48 sec/qt' },
  { name: 'plasticViscosity', label: 'Plastic viscosity', placeholder: '22 cP' },
  { name: 'yieldPoint', label: 'Yield point', placeholder: '18 lb/100 ft2' },
  { name: 'ph', label: 'pH', placeholder: '9.5' },
];

function createLocalId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `dfr-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function registerOfflineWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/drilling-fluids-sw.js').catch(() => {});
}

function warmDrillingOfflineCache() {
  if (!('caches' in window)) return;
  const sameOriginAssets = performance
    .getEntriesByType('resource')
    .map((entry) => entry.name)
    .filter((name) => {
      try {
        const url = new URL(name);
        return url.origin === window.location.origin && (url.pathname.startsWith('/static/') || url.pathname.startsWith('/assets/') || url.pathname === '/manifest.json');
      } catch {
        return false;
      }
    });
  const urls = Array.from(new Set(['/', '/apps/drilling-fluids-report', '/manifest.json', ...sameOriginAssets]));
  window.caches.open(OFFLINE_CACHE_NAME).then((cache) => cache.addAll(urls)).catch(() => {});
}

function statusLabel(status) {
  if (status === 'synced') return 'Synced';
  if (status === 'upload_failed') return 'Upload failed';
  if (status === 'pending_upload') return 'Pending upload';
  return 'Saved locally';
}

export default function DrillingFluidsReport() {
  const appUser = useContext(UserContext);
  const [payload, setPayload] = useState(emptyPayload);
  const [localId, setLocalId] = useState('');
  const [reports, setReports] = useState([]);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [localState, setLocalState] = useState('Unsaved');

  const pendingReports = useMemo(() => reports.filter((report) => report.status === 'pending_upload' || report.status === 'upload_failed'), [reports]);

  const loadReports = async () => {
    try {
      setReports(await listDrillingFluidReports());
    } catch (err) {
      setError(err?.message || 'Unable to load local reports.');
    }
  };

  useEffect(() => {
    registerOfflineWorker();
    warmDrillingOfflineCache();
    loadReports();

    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const updateField = (name, value) => {
    setPayload((prev) => ({ ...prev, [name]: value }));
    setLocalState('Unsaved');
    setMessage('');
    setError('');
  };

  const saveLocal = async () => {
    setSaving(true);
    setMessage('');
    setError('');

    try {
      const now = new Date().toISOString();
      const id = localId || createLocalId();
      await saveDrillingFluidReport({
        localId: id,
        status: 'pending_upload',
        payload,
        localCreatedAt: reports.find((report) => report.localId === id)?.localCreatedAt || now,
        localUpdatedAt: now,
        syncedAt: '',
        firestoreId: '',
      });
      setLocalId(id);
      setLocalState('Pending upload');
      setMessage('Saved locally on this device.');
      await loadReports();
    } catch (err) {
      setError(err?.message || 'Unable to save locally.');
    } finally {
      setSaving(false);
    }
  };

  const uploadReport = async (report) => {
    await setDoc(
      doc(db, 'drillingFluidReports', report.localId),
      {
        createdBy: appUser?.id || appUser?.firebaseUid || '',
        createdByEmail: appUser?.email || '',
        source: 'offline-drilling-fluids-report',
        payload: report.payload,
        localId: report.localId,
        localCreatedAt: report.localCreatedAt,
        localUpdatedAt: report.localUpdatedAt,
        uploadedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    const syncedAt = new Date().toISOString();
    return updateDrillingFluidReport(report.localId, {
      status: 'synced',
      syncedAt,
      firestoreId: report.localId,
    });
  };

  const uploadPending = async () => {
    setMessage('');
    setError('');

    if (!online) {
      setError('You are offline. Upload will be available when internet returns.');
      return;
    }

    const reportsToUpload = pendingReports.length > 0 ? pendingReports : localId ? reports.filter((report) => report.localId === localId && report.status !== 'synced') : [];
    if (reportsToUpload.length === 0) {
      setMessage('No pending reports to upload.');
      return;
    }

    setUploading(true);
    let uploaded = 0;
    try {
      for (const report of reportsToUpload) {
        try {
          await uploadReport(report);
          uploaded += 1;
        } catch {
          await updateDrillingFluidReport(report.localId, { status: 'upload_failed' }).catch(() => {});
        }
      }
      await loadReports();
      setLocalState(uploaded > 0 ? 'Synced' : 'Upload failed');
      if (uploaded === reportsToUpload.length) setMessage(`${uploaded} report${uploaded === 1 ? '' : 's'} uploaded.`);
      else setError(`${uploaded} of ${reportsToUpload.length} reports uploaded. Failed reports remain on this device.`);
    } finally {
      setUploading(false);
    }
  };

  const editReport = (report) => {
    setLocalId(report.localId);
    setPayload({ ...emptyPayload, ...report.payload });
    setLocalState(statusLabel(report.status));
    setMessage('');
    setError('');
  };

  const newReport = () => {
    setLocalId('');
    setPayload(emptyPayload);
    setLocalState('Unsaved');
    setMessage('');
    setError('');
  };

  if (appUser?.offlineProfileUnavailable && !online) {
    return (
      <section className="drilling-report-page">
        <div className="drilling-offline-block">
          <FiWifiOff size={34} />
          <h1>Open online first</h1>
          <p>Open this mini app online once so QuoteChem can cache your access and report page for offline use.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="drilling-report-page" aria-labelledby="drilling-report-title">
      <header className="drilling-report-head">
        <div>
          <p>Offline Mini App</p>
          <h1 id="drilling-report-title">Drilling Fluids Report</h1>
        </div>
        <span className={`network-badge ${online ? 'online' : 'offline'}`}>
          {online ? <FiCloud size={16} /> : <FiWifiOff size={16} />}
          {online ? 'Online' : 'Offline'}
        </span>
      </header>

      <div className="drilling-status-row">
        <span className="local-status">
          <FiCheckCircle size={16} />
          {localState}
        </span>
        <span>{pendingReports.length} pending upload</span>
      </div>

      {message ? <p className="drilling-message success">{message}</p> : null}
      {error ? <p className="drilling-message error">{error}</p> : null}

      <div className="drilling-layout">
        <form className="drilling-form" onSubmit={(event) => event.preventDefault()}>
          <div className="drilling-form-grid">
            {fields.map((field) => (
              <label key={field.name}>
                <span>{field.label}</span>
                <input
                  type={field.type || 'text'}
                  value={payload[field.name]}
                  placeholder={field.placeholder || ''}
                  onChange={(event) => updateField(field.name, event.target.value)}
                />
              </label>
            ))}
          </div>

          <label className="notes-field">
            <span>Notes</span>
            <textarea value={payload.notes} placeholder="Add treatments, observations, or follow-up items." onChange={(event) => updateField('notes', event.target.value)} />
          </label>

          <div className="drilling-actions">
            <button type="button" className="secondary" onClick={newReport}>
              New report
            </button>
            <button type="button" className="primary" onClick={saveLocal} disabled={saving}>
              <FiSave size={16} />
              {saving ? 'Saving...' : 'Save locally'}
            </button>
            <button type="button" className="primary upload" onClick={uploadPending} disabled={!online || uploading}>
              <FiUploadCloud size={16} />
              {uploading ? 'Uploading...' : 'Upload'}
            </button>
          </div>
        </form>

        <aside className="local-report-list" aria-label="Local drilling fluid reports">
          <div className="list-head">
            <span className="drilling-report-icon small">
              <FiDroplet size={18} aria-hidden />
            </span>
            <div>
              <h2>Local reports</h2>
              <p>Saved on this device</p>
            </div>
          </div>

          {reports.length === 0 ? <p className="empty-list">No local reports yet.</p> : null}
          {reports.map((report) => (
            <article key={report.localId} className={`local-report-card ${report.status}`}>
              <div>
                <strong>{report.payload?.wellName || 'Untitled well'}</strong>
                <span>{report.payload?.reportDate || 'No date'} · {statusLabel(report.status)}</span>
              </div>
              {report.status !== 'synced' ? (
                <button type="button" className="text-btn" onClick={() => editReport(report)}>
                  Edit
                </button>
              ) : (
                <span className="synced-tag">Synced</span>
              )}
            </article>
          ))}
        </aside>
      </div>
    </section>
  );
}
