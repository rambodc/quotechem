// src/Home.js
import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { FiCalendar, FiFlag } from 'react-icons/fi';
import { db } from '../firebase';
import TopBar from '../components/TopBar';
import MobileNavTabs from '../components/MobileNavTabs';
import layoutStyles from '../styles/layout.module.css';
import './Home.css';

function Home() {
  const [shows, setShows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const navigate = useNavigate();

  const truncate = (text, maxLength) => {
    if (!text) return '';
    return text.length > maxLength ? text.slice(0, maxLength) + '...' : text;
  };

  const formatDate = (value) => {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(d);
  };

  const formatDateRange = (start, end) => {
    if (!start && !end) return 'Dates TBD';
    if (start && end) return `${formatDate(start)} – ${formatDate(end)}`;
    if (start) return `Starts ${formatDate(start)}`;
    return `Ends ${formatDate(end)}`;
  };

  const statusLabel = (value) => (value === 'completed' ? 'Completed' : 'In Progress');

  useEffect(() => {
    const q = query(collection(db, 'shows'), orderBy('updatedAt', 'desc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((docSnap) => {
          const data = docSnap.data() || {};
          return {
            id: docSnap.id,
            showId: data.showId || docSnap.id,
            name: data.name || 'Untitled Show',
            description: data.description || '',
            photoUrl: data.photoUrl || '',
            startDate: data.startDate || '',
            endDate: data.endDate || '',
            status: data.status || 'in_progress',
          };
        });
        setShows(list);
        setLoading(false);
        setError('');

        const savedY = typeof window.history.state?.homeScrollY === 'number'
          ? window.history.state.homeScrollY
          : null;

        if (savedY !== null) {
          requestAnimationFrame(() => {
            window.scrollTo(0, savedY);
          });
        }
      },
      (err) => {
        console.error('shows snapshot error:', err);
        setShows([]);
        setLoading(false);
        setError(err?.message || 'Failed to load shows.');
      }
    );
    return () => unsub();
  }, []);

  const openShow = (show) => {
    const showId = show.showId || show.id;

    try {
      const currentState = window.history.state || {};
      window.history.replaceState(
        { ...currentState, homeScrollY: window.scrollY },
        ''
      );
    } catch {
      // ignore if replaceState is blocked
    }

    navigate(`/show/${showId}`);
  };

  const Dashboard = () => (
    <>
      {loading ? (
        <p>Loading…</p>
      ) : error ? (
        <p style={{ color: '#b91c1c' }}>{error}</p>
      ) : shows.length === 0 ? (
        <div className="empty-state">
          <p>No shows yet.</p>
          <button type="button" className="create-show-btn" onClick={() => navigate('/create-show')}>
            Create your first show
          </button>
        </div>
      ) : (
        <div className="card-grid" style={{ paddingTop: 6 }}>
          {shows.map((show) => (
            <div
              className="glass-card"
              key={show.showId}
              role="button"
              tabIndex={0}
              onClick={() => openShow(show)}
              onKeyDown={(e) => (e.key === 'Enter' ? openShow(show) : null)}
            >
              <div className="card-image-wrap">
                {show.photoUrl ? (
                  <img className="card-image" src={show.photoUrl} alt={show.name || 'Show'} />
                ) : (
                  <div className="album-placeholder">No Photo</div>
                )}
              </div>
              <div className="card-body">
                <div
                  className={`card-meta ${
                    show.status === 'completed' ? 'status-completed' : 'status-progress'
                  }`}
                >
                  <FiFlag size={14} />
                  <span>{statusLabel(show.status)}</span>
                </div>
                <h2>{truncate(show.name || 'Untitled', 32)}</h2>
                <p>{truncate(show.description || '', 120)}</p>

                <div className="show-meta">
                  <span className="show-chip">
                    <FiCalendar size={13} />
                    {formatDateRange(show.startDate, show.endDate)}
                  </span>
                </div>

                <button type="button" className="card-cta">Open Show</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );

  return (
    <div className={layoutStyles.homeContainer} style={{ paddingBottom: 0 }}>
      <TopBar hideLeft>
        <MobileNavTabs />
      </TopBar>

      <div className="home-content">
        <div className="home-header">
          <div>
            <p className="eyebrow">Shows</p>
            <h1>Showcase productions beautifully</h1>
            <p className="subtext">
              Create shows with schedules, visuals, and status tags. Everything stays in one place.
            </p>
          </div>
          <button className="create-show-btn" type="button" onClick={() => navigate('/create-show')}>
            Create Show
          </button>
        </div>

        <Dashboard />
      </div>
    </div>
  );
}

export default Home;
 
