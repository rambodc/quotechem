// src/Fund.js
import React, { useCallback, useEffect, useMemo, useRef, useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { Transak } from '@transak/transak-sdk';
import app, { auth } from '../firebase';
import { UserContext } from '../App';
import TopBar from '../components/TopBar';
import layoutStyles from '../styles/layout.module.css';

// Prefer an env var override, otherwise use a Hosting rewrite path.
// This avoids hardcoding a specific Firebase project URL and works across envs.
const CREATE_SESSION_URL =
  process.env.REACT_APP_CREATE_TRANSAK_SESSION_URL ||
  '/api/createTransakSession'; // Firebase Hosting rewrite targets the function name

const ENVIRONMENT =
  (process.env.REACT_APP_TRANSAK_ENV || 'STAGING').toUpperCase() === 'PRODUCTION'
    ? Transak.ENVIRONMENTS.PRODUCTION
    : Transak.ENVIRONMENTS.STAGING; // keep STAGING until you flip keys

export default function Fund() {
  const navigate = useNavigate();
  const { appUser } = useContext(UserContext) || {};
  const transakRef = useRef(null);

  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [lastDepositId, setLastDepositId] = useState('');
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth < 900 : false));

  useEffect(() => {
    const update = () => {
      const mobile = (window.innerWidth || 0) < 900;
      setIsMobile(mobile);
    };
    window.addEventListener('resize', update);
    update();
    return () => window.removeEventListener('resize', update);
  }, []);

  const canUse = useMemo(() => !!auth.currentUser, [auth.currentUser]);

  const runTransakFlow = useCallback(async ({ showDepositId = false } = {}) => {
    try {
      setBusy(true);
      setStatus('Authorizing…');
      setError('');
      if (!showDepositId) setLastDepositId('');

      // 1) Ensure signed in
      const fbUser = auth.currentUser;
      if (!fbUser) {
        navigate('/login');
        return;
      }
      const idToken = await fbUser.getIdToken();

      // 2) Ask backend to create a Transak session (per docs, backend-only)
      const resp = await fetch(CREATE_SESSION_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${idToken}`,
        },
        // Body is optional for Step 2; params live in widgetParams server-side
        body: JSON.stringify({}),
      });

      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || !json?.sessionId || !json?.apiKey) {
        throw new Error(json?.error || 'Unable to create session');
      }

      // 3) Boot the SDK with apiKey + sessionId + environment (required trio)
      if (showDepositId && json.depositId) {
        setLastDepositId(json.depositId);
        setStatus(`Deposit ${json.depositId} created. Opening Transak…`);
      } else {
        setStatus('Opening Transak…');
      }

      // Cleanup an old instance if it exists (React fast refresh, route re-entries)
      try { transakRef.current?.close(); } catch {}
      transakRef.current = new Transak({
        apiKey: json.apiKey,
        sessionId: json.sessionId,
        environment: ENVIRONMENT,
        // You can also set containerId to embed instead of overlay
      });

      // 4) Listen to key events (official names from SDK v2)
      Transak.on('*', (e) => {
        // Useful for debugging; remove once stable
        // console.debug('[Transak]', e);
      });

      Transak.on(Transak.EVENTS.TRANSAK_WIDGET_CLOSE, () => {
        setStatus('Widget closed.');
        try { transakRef.current?.close(); } catch {}
      });

      Transak.on(Transak.EVENTS.TRANSAK_ORDER_CREATED, (order) => {
        setStatus(`Order created: ${order?.orderId || ''}`);
      });

      Transak.on(Transak.EVENTS.TRANSAK_ORDER_SUCCESSFUL, (order) => {
        setStatus(`Payment marked successful: ${order?.orderId || ''}`);
        try { transakRef.current?.close(); } catch {}
        // You could navigate or refresh balances here
      });

      transakRef.current.init();
      setStatus('Ready.');
    } catch (err) {
      console.error(err);
      setError(err?.message || 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }, [navigate]);

  // Close widget on unmount (React 18 strict mode safe)
  useEffect(() => {
    return () => {
      try { transakRef.current?.close(); } catch {}
    };
  }, []);

  return (
    <div className={layoutStyles.homeContainer}>
      <TopBar variant="back" backLabel="Back" onBack={() => (window.history.length > 2 ? navigate(-1) : navigate('/home'))} />

      <div style={{ maxWidth: 800, width: '100%', margin: '80px auto 40px', padding: '0 16px' }}>
      <h1 style={{ margin: '0 0 8px' }}>Fund your wallet</h1>
      <p style={{ opacity: 0.85, margin: 0 }}>
        Buy XRP via Transak and send to your XRPL wallet.
      </p>

      {!canUse && (
        <div style={{ marginTop: 16, padding: 12, border: '1px solid #eee', borderRadius: 12 }}>
          <strong>Please sign in first.</strong>
        </div>
      )}

      <div style={{ marginTop: 20 }}>
        <button
          onClick={() => runTransakFlow()}
          disabled={!canUse || busy}
          style={{
            padding: '12px 16px',
            borderRadius: 12,
            border: '1px solid #222',
            background: '#111',
            color: '#fff',
            cursor: !canUse || busy ? 'default' : 'pointer',
            fontWeight: 700,
            width: '100%',
            maxWidth: 320,
          }}
        >
          {busy ? 'Starting…' : 'Legacy Transak test'}
        </button>

        <button
          onClick={() => runTransakFlow({ showDepositId: true })}
          disabled={!canUse || busy}
          style={{
            marginTop: 12,
            padding: '12px 16px',
            borderRadius: 12,
            border: '1px solid #0f5132',
            background: '#198754',
            color: '#fff',
            cursor: !canUse || busy ? 'default' : 'pointer',
            fontWeight: 700,
            width: '100%',
            maxWidth: 320,
          }}
        >
          {busy ? 'Starting…' : 'Start Transak deposit flow'}
        </button>
      </div>

      {lastDepositId && (
        <p style={{ marginTop: 12, fontSize: 13 }}>
          Latest deposit id: <code>{lastDepositId}</code>
        </p>
      )}

      {status && <p style={{ marginTop: 12, fontSize: 13, opacity: 0.8 }}>{status}</p>}
      {error && (
        <p style={{ marginTop: 12, color: '#c00' }}>
          {error}
        </p>
      )}

      {/* If you ever want to embed instead of overlay:
          <div id="transakMount" style={{ height: 720 }} />
          …and pass { containerId: 'transakMount' } in the config above.
      */}
      </div>
    </div>
  );
}
