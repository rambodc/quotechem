import React, { useContext, useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, getDocs, limit, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { UserContext } from '../App';
import { db } from '../firebase';
import './EditUsername.css';

function normalizeUsername(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24);
}

export default function EditUsername() {
  const navigate = useNavigate();
  const appUser = useContext(UserContext);

  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const normalized = useMemo(() => normalizeUsername(username.trim()), [username]);
  const valid = normalized.length >= 3;

  useEffect(() => {
    let active = true;

    const load = async () => {
      if (!appUser?.id) {
        if (active) setLoading(false);
        return;
      }

      try {
        const snap = await getDoc(doc(db, 'users', appUser.id));
        if (!active) return;
        setUsername((snap.data()?.username || '').trim());
      } catch (err) {
        if (!active) return;
        setError(err?.message || 'Failed to load username.');
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, [appUser?.id]);

  const save = async () => {
    if (!appUser?.id) {
      setError('You must be signed in.');
      return;
    }

    if (!valid) {
      setError('Username must be at least 3 characters.');
      return;
    }

    setError('');
    setStatus('');
    setSaving(true);

    try {
      const duplicateQuery = query(
        collection(db, 'users'),
        where('usernameNormalized', '==', normalized),
        limit(1)
      );
      const duplicateSnap = await getDocs(duplicateQuery);
      const conflict = duplicateSnap.docs.some((item) => item.id !== appUser.id);
      if (conflict) {
        throw new Error('Username is already taken.');
      }

      await setDoc(
        doc(db, 'users', appUser.id),
        {
          username: username.trim(),
          usernameNormalized: normalized,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setStatus('Username updated.');
      setTimeout(() => navigate('/account'), 400);
    } catch (err) {
      setError(err?.message || 'Unable to save username right now.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="username-page">
      <header>
        <h2>Edit Username</h2>
        <p>Allowed characters: letters, numbers, and underscores.</p>
      </header>

      <div className="username-card">
        {loading ? <p>Loading...</p> : null}
        {error ? <p className="username-error">{error}</p> : null}
        {status ? <p className="username-success">{status}</p> : null}

        {!loading ? (
          <>
            <label htmlFor="username">Username</label>
            <input
              id="username"
              value={username}
              maxLength={24}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="your_name"
            />
            <small>{valid ? `Saved value: ${normalized}` : 'Minimum 3 valid characters required.'}</small>

            <div className="username-actions">
              <button type="button" className="secondary" onClick={() => navigate('/account')}>
                Cancel
              </button>
              <button type="button" className="primary" disabled={saving || !valid} onClick={save}>
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
