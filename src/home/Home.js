// src/Home.js
import React, { useContext, useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query, collectionGroup, where, doc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { FiCalendar, FiFlag } from 'react-icons/fi';
import { db } from '../firebase';
import { UserContext } from '../App';
import TopBar from '../components/TopBar';
import MobileNavTabs from '../components/MobileNavTabs';
import layoutStyles from '../styles/layout.module.css';
import './Home.css';
import { usePlatformAdmin } from '../services/roles';

function Home() {
  const appUser = useContext(UserContext);

  const [shows, setShows] = useState([]);
  const [memberShowIdsByUid, setMemberShowIdsByUid] = useState([]);
  const [memberShowIdsByEmail, setMemberShowIdsByEmail] = useState([]);
  const [memberShowIdsByDoc, setMemberShowIdsByDoc] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [membershipLoading, setMembershipLoading] = useState(true);

  const navigate = useNavigate();

  const { isPlatformAdmin } = usePlatformAdmin(appUser?.id);

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

  // Listen for shows where the user is a member (for non-platform admins), by uid and email for resilience
  useEffect(() => {
    const unsubs = [];
    let listenersActive = 0;

    const done = () => {
      listenersActive -= 1;
      if (listenersActive <= 0) setMembershipLoading(false);
    };

    setMembershipLoading(true);
    setMemberShowIdsByUid([]);
    setMemberShowIdsByEmail([]);

    if (appUser?.id) {
      listenersActive += 1;
      const membersQ = query(
        collectionGroup(db, 'members'),
        where('uid', '==', appUser.id)
      );
      unsubs.push(onSnapshot(
        membersQ,
        (snap) => {
          const ids = snap.docs
            .map((docSnap) => docSnap.ref.parent?.parent?.id)
            .filter(Boolean);
          setMemberShowIdsByUid(ids);
          done();
        },
        (err) => {
          console.error('membership snapshot error (uid):', err);
          setMemberShowIdsByUid([]);
          done();
        }
      ));
    }

    if (appUser?.email) {
      listenersActive += 1;
      const emailNormalized = (appUser.email || '').trim().toLowerCase();
      const membersEmailQ = query(
        collectionGroup(db, 'members'),
        where('email', '==', emailNormalized)
      );
      unsubs.push(onSnapshot(
        membersEmailQ,
        (snap) => {
          const ids = snap.docs
            .map((docSnap) => docSnap.ref.parent?.parent?.id)
            .filter(Boolean);
          setMemberShowIdsByEmail(ids);
          done();
        },
        (err) => {
          console.error('membership snapshot error (email):', err);
          setMemberShowIdsByEmail([]);
          done();
        }
      ));
    }

    // If no listeners, mark done
    if (listenersActive === 0) {
      setMembershipLoading(false);
    }

    return () => unsubs.forEach((fn) => fn && fn());
  }, [appUser?.email, appUser?.id]);

  // Fallback: check direct membership doc per show (matches doc id to uid), useful if old member docs lack uid/email fields.
  useEffect(() => {
    if (isPlatformAdmin) {
      setMemberShowIdsByDoc([]);
      return undefined;
    }
    if (!appUser?.id || shows.length === 0) {
      setMemberShowIdsByDoc([]);
      return undefined;
    }

    const unsubs = [];
    const updateSet = (showId, exists) => {
      setMemberShowIdsByDoc((prev) => {
        const next = new Set(prev);
        if (exists) next.add(showId);
        else next.delete(showId);
        return Array.from(next);
      });
    };

    shows.forEach((show) => {
      const ref = doc(db, 'shows', show.id, 'members', appUser.id);
      const unsub = onSnapshot(
        ref,
        (snap) => updateSet(show.id, snap.exists()),
        () => updateSet(show.id, false)
      );
      unsubs.push(unsub);
    });

    return () => unsubs.forEach((fn) => fn && fn());
  }, [appUser?.id, isPlatformAdmin, shows]);

  // Platform admins: subscribe to all shows
  useEffect(() => {
    if (!isPlatformAdmin) return undefined;
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
  }, [isPlatformAdmin]);

  // Non-admins: subscribe only to allowed show IDs
  useEffect(() => {
    if (isPlatformAdmin) return undefined;
    if (!appUser?.id) {
      setShows([]);
      return undefined;
    }

    const allowedIds = Array.from(new Set([
      ...memberShowIdsByUid,
      ...memberShowIdsByEmail,
      ...memberShowIdsByDoc,
    ]));

    if (allowedIds.length === 0) {
      setShows([]);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    const unsubs = [];
    const current = new Map();

    allowedIds.forEach((showId) => {
      const ref = doc(db, 'shows', showId);
      const unsub = onSnapshot(
        ref,
        (snap) => {
          if (snap.exists()) {
            const data = snap.data() || {};
            current.set(showId, {
              id: showId,
              showId,
              name: data.name || 'Untitled Show',
              description: data.description || '',
              photoUrl: data.photoUrl || '',
              startDate: data.startDate || '',
              endDate: data.endDate || '',
              status: data.status || 'in_progress',
            });
          } else {
            current.delete(showId);
          }
          setShows(Array.from(current.values()));
          setLoading(false);
          setError('');
        },
        (err) => {
          console.error('show doc snapshot error:', err);
          current.delete(showId);
          setShows(Array.from(current.values()));
          setLoading(false);
          setError(err?.message || 'Failed to load shows.');
        }
      );
      unsubs.push(unsub);
    });

    return () => unsubs.forEach((fn) => fn && fn());
  }, [appUser?.id, isPlatformAdmin, memberShowIdsByDoc, memberShowIdsByEmail, memberShowIdsByUid]);

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

  const filteredShows = useMemo(() => {
    if (isPlatformAdmin) return shows;
    if (!appUser?.id) return [];
    const allowedIds = new Set([
      ...memberShowIdsByUid,
      ...memberShowIdsByEmail,
      ...memberShowIdsByDoc,
    ]);
    return shows.filter((show) => allowedIds.has(show.id));
  }, [appUser?.id, isPlatformAdmin, memberShowIdsByDoc, memberShowIdsByEmail, memberShowIdsByUid, shows]);

  const Dashboard = () => (
    <>
      {loading ? (
        <p>Loading…</p>
      ) : error ? (
        <p style={{ color: '#b91c1c' }}>{error}</p>
      ) : membershipLoading && !isPlatformAdmin ? (
        <p>Loading access…</p>
      ) : filteredShows.length === 0 ? (
        <div className="empty-state">
          <p>No shows yet.</p>
          {isPlatformAdmin ? (
            <button type="button" className="create-show-btn" onClick={() => navigate('/create-show')}>
              Create your first show
            </button>
          ) : (
            <p className="muted">Ask a platform admin to add you to a show.</p>
          )}
        </div>
      ) : (
        <div className="card-grid" style={{ paddingTop: 6 }}>
          {filteredShows.map((show) => (
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
          {isPlatformAdmin ? (
            <button className="create-show-btn" type="button" onClick={() => navigate('/create-show')}>
              Create Show
            </button>
          ) : null}
        </div>

        <Dashboard />
      </div>
    </div>
  );
}

export default Home;
 
