// src/account/EditUsername.js
import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { doc, getDoc, runTransaction, serverTimestamp } from 'firebase/firestore';
import TopBar from '../components/TopBar';
import layoutStyles from '../styles/layout.module.css';
import styles from './EditUsername.module.css';
import { db } from '../firebase';
import { UserContext } from '../App';

export default function EditUsername() {
  const navigate = useNavigate();
  const location = useLocation();
  const appUser = useContext(UserContext);
  const fromSignup = location.state?.fromSignup;

  const [username, setUsername] = useState('');
  const [initialNormalized, setInitialNormalized] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const normalizeUsername = (value) => {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '')
      .replace(/^_+|_+$/g, '')
      .slice(0, 24);
  };

  const minLengthMet = useMemo(() => normalizeUsername(username).length >= 3, [username]);

  useEffect(() => {
    if (!appUser?.id) return;
    let active = true;
    setLoading(true);
    setError('');

    (async () => {
      try {
        const snap = await getDoc(doc(db, 'users', appUser.id));
        if (!active) return;
        if (snap.exists()) {
          const data = snap.data() || {};
          const currentUsername = data.username || '';
          setUsername(currentUsername || '');
          setInitialNormalized(data.usernameNormalized || '');
        } else {
          setUsername('');
          setInitialNormalized('');
        }
      } catch (err) {
        if (!active) return;
        setError(err?.message || 'Unable to load your profile.');
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [appUser?.id]);

  const handleSave = async () => {
    if (!appUser?.id) {
      setError('You need to sign in to update your username.');
      return;
    }
    const trimmed = username.trim();
    const normalized = normalizeUsername(trimmed);
    if (normalized.length < 3) {
      setError('Username must be at least 3 characters (letters, numbers, underscores).');
      return;
    }

    setSaving(true);
    setError('');
    setStatus('');

    try {
      const now = serverTimestamp();
      const desiredRef = doc(db, 'usernames', normalized);
      await runTransaction(db, async (tx) => {
        const desiredSnap = await tx.get(desiredRef);
        const desiredData = desiredSnap.data();
        if (desiredSnap.exists() && desiredData?.uid !== appUser.id) {
          throw new Error('That username is already taken.');
        }

        if (initialNormalized && initialNormalized !== normalized) {
          const prevRef = doc(db, 'usernames', initialNormalized);
          const prevSnap = await tx.get(prevRef);
          if (prevSnap.exists() && prevSnap.data()?.uid === appUser.id) {
            tx.delete(prevRef);
          }
        }

        tx.set(desiredRef, {
          uid: appUser.id,
          username: trimmed,
          normalized,
          createdAt: desiredData?.createdAt || now,
          updatedAt: now,
        });

        tx.set(
          doc(db, 'users', appUser.id),
          {
            username: trimmed,
            usernameNormalized: normalized,
            updatedAt: now,
          },
          { merge: true }
        );
      });

      setInitialNormalized(normalized);
      setStatus('Saved!');
      if (fromSignup) {
        navigate('/home', { replace: true });
      }
    } catch (err) {
      console.error('save username error:', err);
      setError(err?.message || 'Unable to save username right now.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (fromSignup) {
      navigate('/home', { replace: true });
      return;
    }
    if (window.history.length > 2) {
      navigate(-1);
    } else {
      navigate('/home');
    }
  };

  const topBarVariant = fromSignup ? undefined : 'back';

  return (
    <div className={layoutStyles.homeContainer} style={{ paddingBottom: 0 }}>
      <TopBar variant={topBarVariant} hideLeft={fromSignup} backLabel="Back" onBack={fromSignup ? undefined : handleCancel} />

      <div className={styles.pageShell}>
        <div className={styles.card}>
          <div className={styles.header}>
            <h1>{fromSignup ? 'Choose your username' : 'Edit username'}</h1>
            <p>Pick a handle other collectors will see. You can use letters, numbers, and underscores.</p>
          </div>

          {error ? <div className={styles.error}>{error}</div> : null}
          {status ? <div className={styles.success}>{status}</div> : null}

          {loading ? (
            <p className={styles.statusText}>Loading…</p>
          ) : (
            <>
              <label className={styles.label} htmlFor="username-input">
                Username
              </label>
              <input
                id="username-input"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="your_handle"
                autoComplete="username"
                maxLength={24}
              />
              <div className={styles.helper}>
                {minLengthMet ? 'Looks good.' : 'Must be at least 3 characters.'}
              </div>

              <div className={styles.actions}>
                <button type="button" className={styles.secondary} onClick={handleCancel}>
                  Cancel
                </button>
                <button
                  type="button"
                  className={styles.primary}
                  onClick={handleSave}
                  disabled={saving || !minLengthMet}
                >
                  {saving ? 'Saving…' : 'Save username'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
