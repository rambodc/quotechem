// src/Home.js
import React, { useContext, useEffect, useState } from 'react';
import { db, functions } from '../firebase';
import { useNavigate } from 'react-router-dom';
import { UserContext } from '../App';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import TopBar from '../components/TopBar';
import MobileNavTabs from '../components/MobileNavTabs';
import layoutStyles from '../styles/layout.module.css';
import './Home.css';
import { UI_BUILD_TAG } from '../version';
import { FiDisc } from 'react-icons/fi';

function Home() {
  const appUser = useContext(UserContext);

  const [albums, setAlbums] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagError, setDiagError] = useState('');
  const [diagResult, setDiagResult] = useState(null);

  const navigate = useNavigate();

  const truncate = (text, maxLength) => {
    if (!text) return '';
    return text.length > maxLength ? text.slice(0, maxLength) + '...' : text;
  };

  // Fetch latest albums snapshot
  useEffect(() => {
    const q = query(collection(db, 'sets'), orderBy('updatedAt', 'desc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((docSnap) => {
          const data = docSnap.data() || {};
          return {
            id: docSnap.id,
            albumId: data.albumId || docSnap.id,
            title: data.title || 'Untitled Set',
            description: data.description || '',
            coverUrl: data.coverUrl || '',
            dropCount: typeof data.dropCount === 'number' ? data.dropCount : 0,
            artistName: data.artistName || data.artistFullName || '',
          };
        });
        setAlbums(list);
        setLoading(false);
        setError('');

        // ---- Restore scroll position if we have one in history.state ----
        const savedY = typeof window.history.state?.homeScrollY === 'number'
          ? window.history.state.homeScrollY
          : null;

        if (savedY !== null) {
          // Try to restore after layout; one RAF is usually enough
          requestAnimationFrame(() => {
            window.scrollTo(0, savedY);
          });
        }

      },
      (err) => {
        console.error('albums snapshot error:', err);
        setAlbums([]);
        setLoading(false);
        setError(err?.message || 'Failed to load albums.');
      }
    );
    return () => unsub();
  }, []);

  const openAlbum = (album) => {
    const albumId = album.albumId || album.id;

    try {
      const currentState = window.history.state || {};
      window.history.replaceState(
        { ...currentState, homeScrollY: window.scrollY },
        ''
      );
    } catch {
      // ignore if replaceState is blocked
    }

    navigate(`/set/${albumId}`);
  };

  const runDiagnostics = async () => {
    if (diagLoading) return;
    setDiagLoading(true);
    setDiagError('');
    setDiagResult(null);

    try {
      const callable = httpsCallable(functions, 'runStartupDiagnostics');
      const response = await callable({
        client: {
          buildTag: UI_BUILD_TAG,
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
          currentPath: typeof window !== 'undefined' ? window.location.pathname : '/home',
        },
      });
      setDiagResult(response?.data || null);
    } catch (err) {
      console.error('runStartupDiagnostics failed:', err);
      setDiagError(err?.message || 'Diagnostics failed.');
    } finally {
      setDiagLoading(false);
    }
  };

  const Dashboard = () => (
    <>
      {loading ? (
        <p>Loading…</p>
      ) : error ? (
        <p style={{ color: '#b91c1c' }}>{error}</p>
      ) : albums.length === 0 ? (
        <div><p>No sets yet.</p></div>
      ) : (
        <div className="card-grid" style={{ paddingTop: 6 }}>
          {albums.map((album) => (
            <div
              className="glass-card"
              key={album.albumId}
              role="button"
              tabIndex={0}
              onClick={() => openAlbum(album)}
              onKeyDown={(e) => (e.key === 'Enter' ? openAlbum(album) : null)}
            >
              <div className="card-image-wrap">
                {album.coverUrl ? (
                  <img className="card-image" src={album.coverUrl} alt={album.title || 'Set'} />
                ) : (
                  <div className="album-placeholder">No Cover</div>
                )}
              </div>
              <div className="card-body">
                {album.artistName ? (
                  <div className="card-meta">
                    <FiDisc size={14} />
                    <span>{album.artistName}</span>
                  </div>
                ) : null}
                <h2>{truncate(album.title || 'Untitled', 32)}</h2>
                <p>{truncate(album.description || '', 120)}</p>
                <div className="card-chips">
                  <span>{album.dropCount === 1 ? '1 drop' : `${album.dropCount} drops`}</span>
                </div>
                <button type="button" className="card-cta">Open Set</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );

  return (
    <div className={layoutStyles.homeContainer} style={{ paddingBottom: 0 }}>
      {/* Fixed, reusable Top Bar */}
      <TopBar hideLeft>
        <MobileNavTabs />
      </TopBar>

      {/* Page content */}
      <div className="home-content">
        <section className="diag-card">
          <div className="diag-header">
            <h3>System Diagnostics</h3>
            <button type="button" className="diag-button" onClick={runDiagnostics} disabled={diagLoading}>
              {diagLoading ? 'Running…' : 'Run Diagnostics'}
            </button>
          </div>
          <p className="diag-copy">
            Confirms authenticated access to Firestore, Storage, Functions/Auth, and App Check token visibility.
          </p>
          {diagError ? <p className="diag-error">{diagError}</p> : null}
          {diagResult ? (
            <pre className="diag-result">{JSON.stringify(diagResult, null, 2)}</pre>
          ) : null}
        </section>
        <Dashboard />
      </div>

      {/* No sidebar — topbar tabs only */}
    </div>
  );
}

export default Home;
  
