import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiCheckCircle, FiDownload, FiDroplet, FiExternalLink, FiRefreshCw, FiShare2, FiWifiOff } from 'react-icons/fi';
import { UserContext } from '../App';
import {
  OFFLINE_DRILLING_ROUTE,
  activateDrillingManifest,
  prepareDrillingOfflineApp,
  readPreparedDrillingUser,
  verifyDrillingOfflineReadiness,
} from './drillingOffline';
import './DrillingFluidsReport.css';

const emptyChecks = {
  accountPrepared: false,
  serviceWorkerActive: false,
  offlinePageCached: false,
  assetsCached: false,
  storageReady: false,
  ready: false,
};

function CheckRow({ label, ok }) {
  return (
    <li className={ok ? 'ok' : ''}>
      {ok ? <FiCheckCircle size={16} /> : <FiWifiOff size={16} />}
      <span>{label}</span>
    </li>
  );
}

function detectIos() {
  const userAgent = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export default function DrillingFluidsReport() {
  const appUser = useContext(UserContext);
  const [checks, setChecks] = useState(emptyChecks);
  const [preparing, setPreparing] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [preparedUser, setPreparedUser] = useState(() => readPreparedDrillingUser());
  const isIos = useMemo(() => detectIos(), []);

  const status = preparing ? 'Preparing' : checks.ready ? 'Offline ready' : Object.values(checks).some(Boolean) ? 'Needs attention' : 'Not ready';

  const refreshChecks = useCallback(async () => {
    const nextChecks = await verifyDrillingOfflineReadiness();
    setChecks(nextChecks);
    setPreparedUser(readPreparedDrillingUser());
    return nextChecks;
  }, []);

  const prepareOfflinePage = useCallback(async () => {
    setPreparing(true);
    const nextChecks = await prepareDrillingOfflineApp(appUser);
    setChecks(nextChecks);
    setPreparedUser(readPreparedDrillingUser());
    setPreparing(false);
  }, [appUser]);

  const installApp = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice.catch(() => null);
    setInstallPrompt(null);
  };

  useEffect(() => activateDrillingManifest(), []);

  useEffect(() => {
    refreshChecks();
  }, [refreshChecks]);

  useEffect(() => {
    const onInstallPrompt = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    window.addEventListener('beforeinstallprompt', onInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onInstallPrompt);
  }, []);

  return (
    <section className="drilling-report-page launch-page" aria-labelledby="drilling-report-title">
      <div className="drilling-launch-card">
        <span className="drilling-report-icon">
          <FiDroplet size={34} aria-hidden />
        </span>
        <p>Offline PWA Setup</p>
        <h1 id="drilling-report-title">Testing Offline</h1>
        <span>
          Prepare this field report once while online. QuoteChem will verify the offline page, app files, account ownership, and device storage before marking it ready.
        </span>

        <div className={`offline-ready-panel ${checks.ready ? 'ready' : ''}`}>
          {checks.ready ? <FiCheckCircle size={18} /> : <FiWifiOff size={18} />}
          <div>
            <strong>{status}</strong>
            <span>
              {preparedUser?.email ? `Prepared for ${preparedUser.email}` : 'Prepare from this signed-in account before field use.'}
            </span>
          </div>
        </div>

        <ul className="offline-checklist" aria-label="Offline readiness checklist">
          <CheckRow label="Account prepared" ok={checks.accountPrepared} />
          <CheckRow label="Service worker active" ok={checks.serviceWorkerActive} />
          <CheckRow label="Offline page cached" ok={checks.offlinePageCached} />
          <CheckRow label="App files cached" ok={checks.assetsCached} />
          <CheckRow label="Local storage ready" ok={checks.storageReady} />
        </ul>

        <div className="install-panel">
          <div>
            <strong>{installPrompt ? 'Install app available' : isIos ? 'Install on iPhone or iPad' : 'Install instructions'}</strong>
            <span>
              {installPrompt
                ? 'Use the browser install prompt for a dedicated Testing Offline app.'
                : isIos
                  ? 'Tap Share, then Add to Home Screen after the page is offline ready.'
                  : 'If your browser does not show Install, bookmark or pin the offline report after it is ready.'}
            </span>
          </div>
          {installPrompt ? (
            <button type="button" className="secondary compact" onClick={installApp}>
              <FiDownload size={15} />
              Install app
            </button>
          ) : (
            <span className="manual-install">
              <FiShare2 size={15} />
              Add to Home Screen
            </span>
          )}
        </div>

        <div className="drilling-actions launch-actions">
          <button type="button" className="primary" onClick={prepareOfflinePage} disabled={preparing}>
            <FiDownload size={16} />
            {preparing ? 'Preparing...' : 'Prepare Offline App'}
          </button>
          <button type="button" className="secondary" onClick={refreshChecks}>
            <FiRefreshCw size={16} />
            Check readiness
          </button>
          <Link to={`${OFFLINE_DRILLING_ROUTE}?offline-check=1`} className="secondary sign-in-link">
            Test Offline Page
          </Link>
          <Link to={OFFLINE_DRILLING_ROUTE} className="primary sign-in-link">
            <FiExternalLink size={16} />
            Open Offline Report
          </Link>
        </div>
      </div>
    </section>
  );
}
