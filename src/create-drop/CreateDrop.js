// Simplified drop creator: just title, description, price, currency, image upload
import React, { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import TopBar from '../components/TopBar';
import layoutStyles from '../styles/layout.module.css';
import styles from './CreateDrop.module.css';
import { db, storage } from '../firebase';

const currencyOptions = ['USD', 'CAD'];

export default function CreateDrop() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState(currencyOptions[0]);
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleBack = useCallback(() => {
    if (window.history.length > 2) navigate(-1);
    else navigate('/home');
  }, [navigate]);

  const onFileChange = (e) => {
    const f = e.target.files?.[0];
    setFile(f || null);
    setUploadProgress(0);
    setSuccess('');
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (f) setPreviewUrl(URL.createObjectURL(f));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const numericPrice = parseFloat(price);
    if (!title.trim()) return setError('Title is required.');
    if (!numericPrice || numericPrice <= 0) return setError('Enter a valid price.');

    setSaving(true);

    try {
      const dropsCol = collection(db, 'drops');
      const dropRef = doc(dropsCol);
      let mediaUrl = '';

      if (file) {
        const storageRef = ref(storage, `drops/${dropRef.id}/${file.name}`);
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
              mediaUrl = await getDownloadURL(uploadTask.snapshot.ref);
              resolve();
            }
          );
        });
      }

      await setDoc(dropRef, {
        dropId: dropRef.id,
        title: title.trim(),
        description: description.trim(),
        purchaseType: 'purchase_now',
        purchaseNowAmount: numericPrice,
        purchaseNowCurrency: currency.toLowerCase(),
        mediaUrl,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setSuccess('Drop created successfully.');
      setUploadProgress(0);
      setFile(null);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl('');
      setTitle('');
      setDescription('');
      setPrice('');
      navigate(`/drop/${dropRef.id}`, { replace: true });
    } catch (err) {
      console.error('Failed to create drop:', err);
      setError(err?.message || 'Unable to create drop.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={layoutStyles.pageShell}>
      <TopBar backLabel="Back" onBack={handleBack} title="Create Drop" />
      <div className={layoutStyles.pageInner}>
        <form className={styles.card} onSubmit={handleSubmit}>
          <label className={styles.label}>
            Title
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Drop title"
              required
            />
          </label>

          <label className={styles.label}>
            Description
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this drop about?"
              rows={4}
            />
          </label>

          <div className={styles.row}>
            <label className={styles.label}>
              Price
              <input
                type="number"
                step="0.01"
                min="0"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0.00"
                required
              />
            </label>
            <label className={styles.label}>
              Currency
              <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {currencyOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className={styles.label}>
            Image / Media (optional)
            <input ref={fileInputRef} type="file" accept="image/*,video/*" onChange={onFileChange} />
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
          {success ? <p className={styles.success}>{success}</p> : null}

          <button type="submit" disabled={saving} className={styles.primary}>
            {saving ? 'Saving…' : 'Create Drop'}
          </button>
        </form>
      </div>
    </div>
  );
}
