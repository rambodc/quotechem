import React, { useCallback, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { collection, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import TopBar from '../components/TopBar';
import layoutStyles from '../styles/layout.module.css';
import styles from './CreateJob.module.css';
import { db } from '../firebase';

const statusOptions = ['draft', 'bidding', 'awarded', 'active', 'closeout', 'closed'];
const visibilityOptions = ['restricted', 'show'];

export default function CreateJob() {
  const { showId } = useParams();
  const navigate = useNavigate();

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [workstream, setWorkstream] = useState('');
  const [visibility, setVisibility] = useState(visibilityOptions[0]);
  const [status, setStatus] = useState(statusOptions[0]);
  const [rfqDueAt, setRfqDueAt] = useState('');
  const [eventStart, setEventStart] = useState('');
  const [eventEnd, setEventEnd] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleBack = useCallback(() => {
    if (window.history.length > 2) navigate(-1);
    else navigate(`/show/${showId}`);
  }, [navigate, showId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const trimmedTitle = title.trim();
    if (!trimmedTitle) return setError('Job title is required.');

    setSaving(true);
    try {
      const jobsCol = collection(db, 'shows', showId, 'jobs');
      const jobRef = doc(jobsCol);

      await setDoc(jobRef, {
        jobId: jobRef.id,
        title: trimmedTitle,
        category: category.trim(),
        workstream: workstream.trim(),
        visibility,
        status,
        rfq: {
          dueAt: rfqDueAt || '',
          eventDates: { startAt: eventStart || '', endAt: eventEnd || '' },
        },
        notes: notes.trim(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      navigate(`/show/${showId}/job/${jobRef.id}`, { replace: true });
    } catch (err) {
      console.error('Failed to create job:', err);
      setError(err?.message || 'Unable to create job.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={layoutStyles.pageShell}>
      <TopBar variant="back" backLabel="Back" onBack={handleBack} title="Create Job" />
      <div className={styles.page}>
        <div className={styles.header}>
          <div>
            <p className={styles.eyebrow}>New Job</p>
            <h1>Hiring request for this show</h1>
            <p className={styles.subtext}>
              Define the workstream, visibility, and due dates. You can refine scope later.
            </p>
          </div>
        </div>

        <form className={styles.card} onSubmit={handleSubmit}>
          <label className={styles.label}>
            Title
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Security Services"
              required
            />
          </label>

          <label className={styles.label}>
            Category
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Security"
            />
          </label>

          <label className={styles.label}>
            Workstream
            <input
              type="text"
              value={workstream}
              onChange={(e) => setWorkstream(e.target.value)}
              placeholder="Operations"
            />
          </label>

          <div className={styles.row}>
            <label className={styles.label}>
              Visibility
              <select value={visibility} onChange={(e) => setVisibility(e.target.value)}>
                {visibilityOptions.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </label>

            <label className={styles.label}>
              Status
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                {statusOptions.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </label>
          </div>

          <div className={styles.row}>
            <label className={styles.label}>
              RFQ Due Date
              <input
                type="date"
                value={rfqDueAt}
                onChange={(e) => setRfqDueAt(e.target.value)}
              />
            </label>
            <label className={styles.label}>
              Event Start
              <input
                type="date"
                value={eventStart}
                onChange={(e) => setEventStart(e.target.value)}
              />
            </label>
            <label className={styles.label}>
              Event End
              <input
                type="date"
                value={eventEnd}
                onChange={(e) => setEventEnd(e.target.value)}
              />
            </label>
          </div>

          <label className={styles.label}>
            Notes
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Context for vendors, specific needs, or constraints."
              rows={4}
            />
          </label>

          {error ? <p className={styles.error}>{error}</p> : null}

          <button type="submit" disabled={saving} className={styles.primary}>
            {saving ? 'Saving…' : 'Create Job'}
          </button>
        </form>
      </div>
    </div>
  );
}
