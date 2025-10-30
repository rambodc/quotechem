// src/Wallet.js
import React, { useState, useEffect } from 'react';
import { auth } from '../firebase';
import { getIdToken } from 'firebase/auth';
import TopBar from '../components/TopBar';
import MobileNavTabs from '../components/MobileNavTabs';
import layoutStyles from '../styles/layout.module.css';

export default function Wallet() {
  // No sidebar; no responsive sidebar toggling needed
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [creatingHandle, setCreatingHandle] = useState(false);
  const [signing, setSigning] = useState(false);
  // Inputs for XRPL transfer test
  const [amount, setAmount] = useState('0.000001');
  const [assetId, setAssetId] = useState('XRP_TEST');
  const [destAddress, setDestAddress] = useState('');
  const [destTag, setDestTag] = useState('');

  const pingFireblocks = async () => {
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Sign in required');
      const idToken = await getIdToken(user, true);
      const resp = await fetch('/api/fireblocks/ping', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'content-type': 'application/json',
        },
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || !json?.ok) {
        throw new Error(json?.error || `Request failed (${resp.status})`);
      }
      setResult(json);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const createOrGetVaults = async () => {
    setCreating(true);
    setError(null);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Sign in required');
      const idToken = await getIdToken(user, true);
      const resp = await fetch('/api/fireblocks/createOrGetVaults', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || !json?.ok) throw new Error(json?.error || `Request failed (${resp.status})`);
      setResult(json);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setCreating(false);
    }
  };

  const createDepositHandle = async () => {
    setCreatingHandle(true);
    setError(null);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Sign in required');
      const idToken = await getIdToken(user, true);
      const resp = await fetch('/api/fireblocks/createDepositHandle', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || !json?.ok) throw new Error(json?.error || `Request failed (${resp.status})`);
      setResult(json);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setCreatingHandle(false);
    }
  };

  const xrplTransferTest = async () => {
    setSigning(true);
    setError(null);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Sign in required');
      const idToken = await getIdToken(user, true);
      const resp = await fetch('/api/fireblocks/xrplTransferTest', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          amount,
          assetId,
          destAddress: destAddress && destAddress.trim() ? destAddress.trim() : undefined,
          destTag: destTag !== '' ? destTag : undefined,
        }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || json?.ok === false) throw new Error(json?.error || json?.note || `Request failed (${resp.status})`);
      setResult(json);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setSigning(false);
    }
  };

  return (
    <div className={layoutStyles.homeContainer}>
      <TopBar hideLeft>
        <MobileNavTabs />
      </TopBar>

      <div style={{ maxWidth: 880, width: '100%', margin: '80px auto 28px', padding: '0 16px' }}>
      <h1 style={{ margin: '0 0 8px' }}>Wallet</h1>
      <p style={{ margin: '0 0 16px', color: '#4b5563' }}>
        Test 1: Ping Fireblocks to verify credentials and connectivity.
      </p>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <button
          onClick={pingFireblocks}
          disabled={loading}
          style={{
            padding: '10px 14px',
            background: '#111827',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            cursor: loading ? 'default' : 'pointer',
            minWidth: 180,
          }}
        >
          {loading ? 'Pinging…' : 'Ping Fireblocks'}
        </button>

        <button
          onClick={createOrGetVaults}
          disabled={creating}
          style={{
            padding: '10px 14px',
            background: '#0ea5e9',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            cursor: creating ? 'default' : 'pointer',
            minWidth: 220,
          }}
        >
          {creating ? 'Creating…' : 'Create/Get Vaults'}
        </button>

        <button
          onClick={createDepositHandle}
          disabled={creatingHandle}
          style={{
            padding: '10px 14px',
            background: '#22c55e',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            cursor: creatingHandle ? 'default' : 'pointer',
            minWidth: 260,
          }}
        >
          {creatingHandle ? 'Issuing…' : 'Create Deposit Handle'}
        </button>

        {/* XRPL Transfer Controls */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 10px',
          background: '#0b1220',
          borderRadius: 8,
          color: '#e5e7eb',
          flexWrap: 'wrap'
        }}>
          <label style={{ display: 'flex', flexDirection: 'column', fontSize: 12 }}>
            Amount (XRP)
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.000001"
              style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #1f2937', background: '#0f172a', color: '#e5e7eb', minWidth: 120 }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', fontSize: 12 }}>
            Asset
            <select
              value={assetId}
              onChange={(e) => setAssetId(e.target.value)}
              style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #1f2937', background: '#0f172a', color: '#e5e7eb' }}
            >
              <option value="XRP_TEST">XRP_TEST</option>
              <option value="XRP">XRP</option>
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', fontSize: 12 }}>
            Dest Address (optional)
            <input
              value={destAddress}
              onChange={(e) => setDestAddress(e.target.value)}
              placeholder="Leave empty to use your deposit"
              style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #1f2937', background: '#0f172a', color: '#e5e7eb', minWidth: 260 }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', fontSize: 12 }}>
            Dest Tag (optional)
            <input
              value={destTag}
              onChange={(e) => setDestTag(e.target.value)}
              placeholder="e.g. 12345"
              style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #1f2937', background: '#0f172a', color: '#e5e7eb', minWidth: 100 }}
            />
          </label>

          <button
            onClick={xrplTransferTest}
            disabled={signing}
            style={{
              padding: '10px 14px',
              background: '#7c3aed',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              cursor: signing ? 'default' : 'pointer',
              minWidth: 200,
              marginLeft: 4,
            }}
          >
            {signing ? 'Sending…' : 'XRPL Transfer Test'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ marginTop: 16, color: '#b91c1c' }}>Error: {error}</div>
      )}

      {result && (
        <pre
          style={{
            whiteSpace: 'pre-wrap',
            background: '#0b1220',
            color: '#e5e7eb',
            padding: 12,
            marginTop: 16,
            borderRadius: 8,
            overflowX: 'auto',
          }}
        >{JSON.stringify(result, null, 2)}</pre>
      )}
      </div>
    </div>
  );
}
