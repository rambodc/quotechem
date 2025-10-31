// src/Home.js
import React, { useContext, useEffect, useState } from 'react';
import { db } from '../firebase';
import { useNavigate } from 'react-router-dom';
import { UserContext } from '../App';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import TopBar from '../components/TopBar';
import MobileNavTabs from '../components/MobileNavTabs';
import layoutStyles from '../styles/layout.module.css';
import './Home.css';
import { UI_BUILD_TAG } from '../version';

function Home() {
  const appUser = useContext(UserContext);

  const [albums, setAlbums] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const navigate = useNavigate();

  const truncate = (text, maxLength) => {
    if (!text) return '';
    return text.length > maxLength ? text.slice(0, maxLength) + '...' : text;
  };

  // Fetch latest albums snapshot
  useEffect(() => {
    const q = query(collection(db, 'albums'), orderBy('updatedAt', 'desc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((docSnap) => {
          const data = docSnap.data() || {};
          return {
            id: docSnap.id,
            albumId: data.albumId || docSnap.id,
            title: data.title || 'Untitled Album',
            description: data.description || '',
            coverUrl: data.coverUrl || '',
            dropCount: typeof data.dropCount === 'number' ? data.dropCount : 0,
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

    navigate(`/album/${albumId}`);
  };

  const Dashboard = () => (
    <>
      {/* Welcome message */}
      <div className="home-topbar" style={{ marginTop: 64 }}>
        <div className="home-topbar-left">
          <h1 className="home-welcome">
            Welcome, {appUser?.firstName || 'Friend'} {appUser?.lastName || ''} 👋
          </h1>
          {appUser?.email && <p className="email-text">Email: {appUser.email}</p>}
        </div>
      </div>

      {/* Loading / Empty / Grid */}
      {loading ? (
        <p>Loading…</p>
      ) : error ? (
        <p style={{ color: '#b91c1c' }}>{error}</p>
      ) : albums.length === 0 ? (
        <div><p>No albums yet.</p></div>
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
                  <>
                    <img className="card-image" src={album.coverUrl} alt={album.title || 'Album'} />
                    <div className="card-gradient" />
                  </>
                ) : (
                  <div className="album-placeholder">No Cover</div>
                )}
                <div className="card-text-overlay">
                  <h2>{truncate(album.title || 'Untitled', 30)}</h2>
                  <p>{truncate(album.description || '', 80)}</p>
                  <div className={layoutStyles.chips}>
                    <span>{album.dropCount === 1 ? '1 drop' : `${album.dropCount} drops`}</span>
                  </div>
                  <button type="button">View Album</button>
                </div>
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

      {/* Small build/version badge so you can spot new deploys */}
      <div className="build-badge" aria-label="Build tag">{UI_BUILD_TAG}</div>

      {/* Page content */}
      <div className="home-content">
        <Dashboard />
      </div>

      {/* No sidebar — topbar tabs only */}
    </div>
  );
}

export default Home;
  
