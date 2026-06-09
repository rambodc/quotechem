import React, { useCallback, useContext, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiCheckCircle, FiDroplet, FiExternalLink, FiWifiOff } from 'react-icons/fi';
import { UserContext } from '../App';
import {
  OFFLINE_DRILLING_ROUTE,
  readPreparedDrillingUser,
  registerDrillingOfflineWorker,
  warmDrillingOfflineCache,
  writePreparedDrillingUser,
} from './drillingOffline';
import './DrillingFluidsReport.css';

export default function DrillingFluidsReport() {
  const appUser = useContext(UserContext);
  const [ready, setReady] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [preparedUser, setPreparedUser] = useState(() => readPreparedDrillingUser());

  const prepareOfflinePage = useCallback(async () => {
    setPreparing(true);
    const user = writePreparedDrillingUser(appUser);
    setPreparedUser(user);
    await registerDrillingOfflineWorker();
    const warmed = await warmDrillingOfflineCache();
    setReady(warmed);
    setPreparing(false);
  }, [appUser]);

  useEffect(() => {
    prepareOfflinePage();
  }, [prepareOfflinePage]);

  return (
    <section className="drilling-report-page launch-page" aria-labelledby="drilling-report-title">
      <div className="drilling-launch-card">
        <span className="drilling-report-icon">
          <FiDroplet size={34} aria-hidden />
        </span>
        <p>Offline Report Setup</p>
        <h1 id="drilling-report-title">Drilling Fluids Report</h1>
        <span>
          Open the dedicated offline report page from here while online. Once prepared, that page can be reopened without internet to save field reports locally.
        </span>

        <div className={`offline-ready-panel ${ready ? 'ready' : ''}`}>
          {ready ? <FiCheckCircle size={18} /> : <FiWifiOff size={18} />}
          <div>
            <strong>{ready ? 'Offline page ready' : preparing ? 'Preparing offline page' : 'Offline page not ready yet'}</strong>
            <span>
              {preparedUser?.email ? `Prepared for ${preparedUser.email}` : 'Your account will be stored locally for upload ownership.'}
            </span>
          </div>
        </div>

        <div className="drilling-actions launch-actions">
          <button type="button" className="secondary" onClick={prepareOfflinePage} disabled={preparing}>
            {preparing ? 'Preparing...' : 'Prepare again'}
          </button>
          <Link to={OFFLINE_DRILLING_ROUTE} className="primary sign-in-link">
            <FiExternalLink size={16} />
            Open Offline Report
          </Link>
        </div>
      </div>
    </section>
  );
}
