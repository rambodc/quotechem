import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { FiFlag } from 'react-icons/fi';
import TopBar from '../components/TopBar';
import styles from './JobDetail.module.css';
import { db } from '../firebase';

const statusLabel = (value) => (value ? value : 'draft');

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

export default function JobDetail() {
  const { showId, jobId } = useParams();
  const navigate = useNavigate();

  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const handleBack = useCallback(() => {
    if (window.history.length > 2) navigate(-1);
    else navigate(`/show/${showId}`);
  }, [navigate, showId]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'shows', showId, 'jobs', jobId));
        if (!alive) return;
        if (snap.exists()) {
          setJob({ id: snap.id, ...snap.data() });
        } else {
          setError('Job not found.');
        }
      } catch (err) {
        if (!alive) return;
        setError(err?.message || 'Failed to load job.');
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [jobId, showId]);

  if (loading) return null;

  const rfqDue = job?.rfq?.dueAt;
  const eventStart = job?.rfq?.eventDates?.startAt;
  const eventEnd = job?.rfq?.eventDates?.endAt;

  return (
    <div className={styles.pageShell}>
      <TopBar variant="back" backLabel="Back" onBack={handleBack} />

      {error ? <p className={styles.error}>{error}</p> : null}

      {job ? (
        <div className={styles.card}>
          <p className={styles.eyebrow}>Job</p>
          <h1>{job.title || 'Untitled Job'}</h1>

          <div className={styles.metaRow}>
            <span className={`${styles.statusPill} ${styles[`jobStatus_${job.status}`]}`}>
              <FiFlag size={14} />
              {statusLabel(job.status)}
            </span>
            <span className={styles.visibility}>{job.visibility || 'restricted'}</span>
          </div>

          <div className={styles.grid}>
            <div className={styles.tile}>
              <span className={styles.label}>Category</span>
              <strong>{job.category || '—'}</strong>
            </div>
            <div className={styles.tile}>
              <span className={styles.label}>Workstream</span>
              <strong>{job.workstream || '—'}</strong>
            </div>
            <div className={styles.tile}>
              <span className={styles.label}>Event dates</span>
              <strong>{formatDateRange(eventStart, eventEnd)}</strong>
            </div>
            <div className={styles.tile}>
              <span className={styles.label}>RFQ due</span>
              <strong>{rfqDue ? formatDate(rfqDue) : 'TBD'}</strong>
            </div>
          </div>

          {job.notes ? (
            <div className={styles.notes}>
              <span className={styles.label}>Notes</span>
              <p>{job.notes}</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
