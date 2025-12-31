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
import { FiDisc } from 'react-icons/fi';

function Home() {
  const appUser = useContext(UserContext);

  const [drops, setDrops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const navigate = useNavigate();

  const truncate = (text, maxLength) => {
    if (!text) return '';
    return text.length > maxLength ? text.slice(0, maxLength) + '...' : text;
  };

  useEffect(() => {
    const q = query(collection(db, 'drops'), orderBy('updatedAt', 'desc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((docSnap) => {
          const data = docSnap.data() || {};
          return {
            id: docSnap.id,
            dropId: data.dropId || docSnap.id,
            title: data.title || 'Untitled Drop',
            description: data.description || '',
            coverUrl: data.mediaUrl || '',
            price: data.purchaseNowAmount || null,
            currency: data.purchaseNowCurrency || 'usd',
          };
        });
        setDrops(list);
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
        console.error('drops snapshot error:', err);
        setDrops([]);
        setLoading(false);
        setError(err?.message || 'Failed to load drops.');
      }
    );
    return () => unsub();
  }, []);

  const openDrop = (drop) => {
    const dropId = drop.dropId || drop.id;

    try {
      const currentState = window.history.state || {};
      window.history.replaceState(
        { ...currentState, homeScrollY: window.scrollY },
        ''
      );
    } catch {
      // ignore if replaceState is blocked
    }

    navigate(`/drop/${dropId}`);
  };

  const Dashboard = () => (
    <>
      {loading ? (
        <p>Loading…</p>
      ) : error ? (
        <p style={{ color: '#b91c1c' }}>{error}</p>
      ) : drops.length === 0 ? (
        <div><p>No drops yet.</p></div>
      ) : (
        <div className="card-grid" style={{ paddingTop: 6 }}>
          {drops.map((drop) => (
            <div
              className="glass-card"
              key={drop.dropId}
              role="button"
              tabIndex={0}
              onClick={() => openDrop(drop)}
              onKeyDown={(e) => (e.key === 'Enter' ? openDrop(drop) : null)}
            >
              <div className="card-image-wrap">
                {drop.coverUrl ? (
                  <img className="card-image" src={drop.coverUrl} alt={drop.title || 'Drop'} />
                ) : (
                  <div className="album-placeholder">No Media</div>
                )}
              </div>
              <div className="card-body">
                <div className="card-meta">
                  <FiDisc size={14} />
                  <span>{drop.price ? `${drop.price} ${drop.currency?.toUpperCase?.() || ''}` : 'TBD'}</span>
                </div>
                <h2>{truncate(drop.title || 'Untitled', 32)}</h2>
                <p>{truncate(drop.description || '', 120)}</p>
                <button type="button" className="card-cta">View Drop</button>
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
        <Dashboard />
      </div>

      {/* No sidebar — topbar tabs only */}
    </div>
  );
}

export default Home;
  
