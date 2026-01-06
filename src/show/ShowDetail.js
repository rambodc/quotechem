import React, { useCallback, useContext, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { collection, doc, getDoc, onSnapshot, orderBy, query, setDoc, serverTimestamp } from 'firebase/firestore';
import { FiCalendar, FiFlag, FiBriefcase } from 'react-icons/fi';
import TopBar from '../components/TopBar';
import styles from './ShowDetail.module.css';
import { db } from '../firebase';
import { UserContext } from '../App';
import { findUserByEmail, useRoleFlags } from '../services/roles';

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
  const appUser = useContext(UserContext);

  const [show, setShow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [jobs, setJobs] = useState([]);
  const [jobsError, setJobsError] = useState('');
  const [jobsLoading, setJobsLoading] = useState(true);

  const { canManageJobs, canAddMembers, canEditShowMeta, canDeleteShow, loading: roleLoading } =
    useRoleFlags({ uid: appUser?.id, showId });

  const [memberEmail, setMemberEmail] = useState('');
  const [memberRole, setMemberRole] = useState('show_admin');
  const [memberError, setMemberError] = useState('');
  const [memberSuccess, setMemberSuccess] = useState('');
  const [memberSaving, setMemberSaving] = useState(false);

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

  useEffect(() => {
    const jobsCol = collection(db, 'shows', showId, 'jobs');
    const q = query(jobsCol, orderBy('updatedAt', 'desc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((docSnap) => {
          const data = docSnap.data() || {};
          return {
            id: docSnap.id,
            jobId: data.jobId || docSnap.id,
            title: data.title || 'Untitled Job',
            category: data.category || '',
            workstream: data.workstream || '',
            status: data.status || 'draft',
            visibility: data.visibility || 'restricted',
            rfqDueAt: data?.rfq?.dueAt || '',
            eventStart: data?.rfq?.eventDates?.startAt || '',
            eventEnd: data?.rfq?.eventDates?.endAt || '',
          };
        });
        setJobs(list);
        setJobsLoading(false);
        setJobsError('');
      },
      (err) => {
        console.error('jobs snapshot error:', err);
        setJobs([]);
        setJobsLoading(false);
        setJobsError(err?.message || 'Failed to load jobs.');
      }
    );
    return () => unsub();
  }, [showId]);

  const openJob = (job) => {
    const jobId = job.jobId || job.id;
    navigate(`/show/${showId}/job/${jobId}`);
  };

  const addShowMember = async (e) => {
    e.preventDefault();
    setMemberError('');
    setMemberSuccess('');

    if (!canAddMembers) {
      setMemberError('You do not have permission to add show members.');
      return;
    }
    if (!memberEmail.trim()) {
      setMemberError('Enter an email to add.');
      return;
    }

    setMemberSaving(true);
    try {
      const user = await findUserByEmail(memberEmail);
      if (!user?.uid) {
        setMemberError('No user found with that email.');
        setMemberSaving(false);
        return;
      }

      const memberRef = doc(db, 'shows', showId, 'members', user.uid);
      await setDoc(memberRef, {
        uid: user.uid,
        role: memberRole,
        addedBy: appUser?.id || null,
        addedAt: serverTimestamp(),
        email: (user.email || memberEmail).toLowerCase(),
      });
      setMemberSuccess('Member added.');
      setMemberEmail('');
    } catch (err) {
      console.error('Failed to add member:', err);
      setMemberError(err?.message || 'Unable to add member.');
    } finally {
      setMemberSaving(false);
    }
  };

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

          {canAddMembers ? (
            <div className={styles.card}>
              <p className={styles.eyebrow}>Show access</p>
              <h2 className={styles.sectionTitle}>Add a show admin/editor/viewer</h2>
              <form className={styles.memberForm} onSubmit={addShowMember}>
                <label className={styles.label}>
                  User email
                  <input
                    type="text"
                    value={memberEmail}
                    onChange={(e) => setMemberEmail(e.target.value)}
                    placeholder="user@example.com"
                  />
                </label>
                <label className={styles.label}>
                  Role
                  <select value={memberRole} onChange={(e) => setMemberRole(e.target.value)}>
                    <option value="show_admin">Show Admin</option>
                    <option value="show_editor">Show Editor</option>
                    <option value="show_viewer">Show Viewer</option>
                  </select>
                </label>
                {memberError ? <p className={styles.error}>{memberError}</p> : null}
                {memberSuccess ? <p className={styles.success}>{memberSuccess}</p> : null}
                <button type="submit" className={styles.primary} disabled={memberSaving}>
                  {memberSaving ? 'Saving…' : 'Add Member'}
                </button>
              </form>
            </div>
          ) : null}

          {canEditShowMeta || canDeleteShow ? (
            <div className={styles.adminRow}>
              <span className={styles.eyebrow}>Admin actions</span>
              <div className={styles.adminActions}>
                {canEditShowMeta ? (
                  <button type="button" className={styles.secondary} onClick={() => navigate(`/create-show?edit=${showId}`)}>
                    Edit Show
                  </button>
                ) : null}
                {canDeleteShow ? (
                  <button
                    type="button"
                    className={`${styles.secondary} ${styles.danger}`}
                    onClick={() => alert('Delete show not yet implemented.')}
                  >
                    Delete Show
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.eyebrow}>Jobs</p>
              <h2 className={styles.sectionTitle}>Work requests for this show</h2>
            </div>
            {!roleLoading && canManageJobs ? (
              <button
                type="button"
                className={styles.secondary}
                onClick={() => navigate(`/show/${showId}/create-job`)}
              >
                Create Job
              </button>
            ) : null}
          </div>

          <div className={styles.jobList}>
            {jobsLoading ? (
              <p className={styles.muted}>Loading jobs…</p>
            ) : jobsError ? (
              <p className={styles.error}>{jobsError}</p>
            ) : jobs.length === 0 ? (
              <p className={styles.muted}>No jobs yet. Create one to kick off hiring.</p>
            ) : (
              jobs.map((job) => (
                <button
                  key={job.jobId}
                  type="button"
                  className={styles.jobCard}
                  onClick={() => openJob(job)}
                >
                  <div className={styles.jobIcon}>
                    <FiBriefcase size={16} />
                  </div>
                  <div className={styles.jobBody}>
                    <div className={styles.jobMeta}>
                      <span className={`${styles.statusPill} ${styles[`jobStatus_${job.status}`]}`}>
                        {job.status}
                      </span>
                      <span className={styles.jobVisibility}>{job.visibility}</span>
                    </div>
                    <h3>{job.title}</h3>
                    <p className={styles.jobText}>
                      {job.category || job.workstream
                        ? [job.category, job.workstream].filter(Boolean).join(' · ')
                        : 'General'}
                    </p>
                    <div className={styles.jobDates}>
                      {job.eventStart || job.eventEnd ? (
                        <span>{formatDateRange(job.eventStart, job.eventEnd)}</span>
                      ) : (
                        <span>Event dates TBD</span>
                      )}
                      {job.rfqDueAt ? <span className={styles.jobDue}>RFQ due {formatDate(job.rfqDueAt)}</span> : null}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
