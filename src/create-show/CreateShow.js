import React, { useCallback, useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import TopBar from '../components/TopBar';
import layoutStyles from '../styles/layout.module.css';
import styles from './CreateShow.module.css';
import { db, storage } from '../firebase';

const statusOptions = [
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
];

export default function CreateShow() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [status, setStatus] = useState(statusOptions[0].value);
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleBack = useCallback(() => {
    if (window.history.length > 2) navigate(-1);
    else navigate('/home');
  }, [navigate]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const onFileChange = (e) => {
    const f = e.target.files?.[0];
    setFile(f || null);
    setUploadProgress(0);
    setError('');
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (f) setPreviewUrl(URL.createObjectURL(f));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const trimmedName = name.trim();
    const trimmedDescription = description.trim();

    if (!trimmedName) return setError('Show name is required.');
    if (!startDate) return setError('Start date is required.');
    if (!endDate) return setError('End date is required.');
    if (new Date(endDate) < new Date(startDate)) {
      return setError('End date must be after the start date.');
    }

    setSaving(true);

    try {
      const showsCol = collection(db, 'shows');
      const showRef = doc(showsCol);
      let photoUrl = '';

      if (file) {
        const storageRef = ref(storage, `shows/${showRef.id}/${file.name}`);
        const uploadTask = uploadBytesResumable(storageRef, file);

        await new Promise((resolve, reject) => {
          uploadTask.on(
            'state_changed',
            (snapshot) => {
              const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
              setUploadProgress(pct);
            },
            reject,
            async () => {
              photoUrl = await getDownloadURL(uploadTask.snapshot.ref);
              resolve();
            }
          );
        });
      }

      await setDoc(showRef, {
        showId: showRef.id,
        name: trimmedName,
        description: trimmedDescription,
        photoUrl,
        startDate,
        endDate,
        status,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      navigate(`/show/${showRef.id}`, { replace: true });
    } catch (err) {
      console.error('Failed to create show:', err);
      setError(err?.message || 'Unable to create show.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={layoutStyles.pageShell}>
      <TopBar variant="back" backLabel="Back" onBack={handleBack} title="Create Show" />

      <div className={styles.page}>
        <div className={styles.header}>
          <div>
            <p className={styles.eyebrow}>New Show</p>
            <h1>Create a show to share with your team</h1>
            <p className={styles.subtext}>
              Add a cover image, dates, and status. You can adjust details later.
            </p>
          </div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className={styles.mediaShortcut}
          >
            Upload Cover
          </button>
        </div>

        <form className={styles.card} onSubmit={handleSubmit}>
          <label className={styles.label}>
            Show name
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My summer production"
              required
            />
          </label>

          <label className={styles.label}>
            Description
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this show about?"
              rows={4}
            />
          </label>

          <div className={styles.row}>
            <label className={styles.label}>
              Start date
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </label>
            <label className={styles.label}>
              End date
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
              />
            </label>
          </div>

          <label className={styles.label}>
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.label}>
            Cover photo (optional)
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={onFileChange}
            />
            {previewUrl ? (
              <div className={styles.preview}>
                <img src={previewUrl} alt="Preview" />
              </div>
            ) : null}
            {uploadProgress > 0 ? (
              <div className={styles.progress}>Upload: {uploadProgress}%</div>
            ) : null}
          </label>

          {error ? <p className={styles.error}>{error}</p> : null}

          <button type="submit" disabled={saving} className={styles.primary}>
            {saving ? 'Saving…' : 'Create Show'}
          </button>
        </form>
      </div>
    </div>
  );
}
