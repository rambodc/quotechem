import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { FiCalendar, FiFlag } from 'react-icons/fi';
import TopBar from '../components/TopBar';
import styles from './ShowDetail.module.css';
import { db } from '../firebase';

const formatDate = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(d);
};

const formatDateRange = (start, end) => {
  if (!start && !end) return 'Dates TBD';
  if (start && end) return `${formatDate(start)} → ${formatDate(end)}`;
  if (start) return `Starts ${formatDate(start)}`;
  return `Ends ${formatDate(end)}`;
};

const statusLabel = (value) => (value === 'completed' ? 'Completed' : 'In Progress');

export default function ShowDetail() {
  const { showId } = useParams();
  const navigate = useNavigate();

  const [show, setShow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const handleBack = useCallback(() => {
    if (window.history.length > 2) navigate(-1);
    else navigate('/home');
  }, [navigate]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'shows', showId));
        if (!alive) return;
        if (snap.exists()) {
          setShow({ id: snap.id, ...snap.data() });
        } else {
          setError('Show not found.');
        }
      } catch (err) {
        if (!alive) return;
        setError(err?.message || 'Failed to load show.');
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [showId]);

  if (loading) return null;

  return (
    <div className={styles.pageShell}>
      <TopBar variant="back" backLabel="Back" onBack={handleBack} />

      {error ? <p className={styles.error}>{error}</p> : null}

      {show ? (
        <div className={styles.content}>
          <div className={styles.hero}>
            {show.photoUrl ? (
              <img src={show.photoUrl} alt={show.name || 'Show'} />
            ) : (
              <div className={styles.placeholder}>SHOW</div>
            )}
          </div>

          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <p className={styles.eyebrow}>Show</p>
                <h1>{show.name || 'Untitled Show'}</h1>
              </div>
              <span
                className={`${styles.status} ${
                  show.status === 'completed' ? styles.statusDone : styles.statusProgress
                }`}
              >
                <FiFlag size={16} />
                {statusLabel(show.status)}
              </span>
            </div>

            <p className={styles.description}>
              {show.description || 'No description yet.'}
            </p>

            <div className={styles.metaRow}>
              <div className={styles.metaItem}>
                <FiCalendar size={16} />
                <div>
                  <span className={styles.metaLabel}>Schedule</span>
                  <strong>{formatDateRange(show.startDate, show.endDate)}</strong>
                </div>
              </div>
              <div className={styles.metaItem}>
                <FiFlag size={16} />
                <div>
                  <span className={styles.metaLabel}>Status</span>
                  <strong>{statusLabel(show.status)}</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
