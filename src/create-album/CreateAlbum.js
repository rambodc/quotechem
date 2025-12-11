// src/create-album/CreateAlbum.js
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection,
  doc,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import TopBar from '../components/TopBar';
import layoutStyles from '../styles/layout.module.css';
import styles from './CreateAlbum.module.css';
import { db, storage, logStorageDebug } from '../firebase';

const PASSCODE = '123456';

export default function CreateAlbum() {
  const navigate = useNavigate();
  const handleBack = useCallback(() => {
    if (window.history.length > 2) navigate(-1);
    else navigate('/albums');
  }, [navigate]);

  const [code, setCode] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [passError, setPassError] = useState('');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [processingMedia, setProcessingMedia] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fileInputRef = useRef(null);

  const onChangePasscode = (event) => {
    const value = event.target.value.replace(/\D+/g, '').slice(0, 6);
    setCode(value);
    if (value.length === 6) {
      if (value === PASSCODE) {
        setUnlocked(true);
        setPassError('');
      } else {
        setPassError('Incorrect passcode');
      }
    } else {
      setPassError('');
    }
  };

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const canSubmit = useMemo(() => {
    return (
      unlocked &&
      title.trim().length > 0 &&
      description.trim().length > 0 &&
      !!file &&
      !saving &&
      !processingMedia
    );
  }, [description, file, processingMedia, saving, title, unlocked]);

  const handleFileChange = async (event) => {
    setError('');
    const selected = event.target.files?.[0];
    if (!selected) return;

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl('');
    }

    if (!selected.type.startsWith('image/')) {
      setError('Please choose an image file (JPG, PNG, WebP).');
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setProcessingMedia(true);
    setUploadProgress(0);

    try {
      const { file: processedFile, previewUrl: processedPreview } = await resizeImageToMax(selected, 800);
      setFile(processedFile);
      setPreviewUrl(processedPreview);
    } catch (err) {
      console.error(err);
      setError(err?.message || 'Unable to process the image. Try a different file.');
      setFile(null);
      setPreviewUrl('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    } finally {
      setProcessingMedia(false);
    }
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    if (!canSubmit || !file) return;

    try {
      setSaving(true);
      setError('');

      const albumsCollection = collection(db, 'albums');
      const albumDocRef = doc(albumsCollection);
      const albumId = albumDocRef.id;

      try {
        logStorageDebug();
      } catch {
        // ignore storage debug issues
      }

      const ext = file.name.includes('.') ? file.name.split('.').pop() : 'jpg';
      const normalizedExt = ext.toLowerCase();
      const storagePath = `albums/${albumId}/cover.${normalizedExt}`;
      const storageRef = ref(storage, storagePath);

      const uploadTask = uploadBytesResumable(storageRef, file, {
        contentType: file.type || 'image/jpeg',
      });

      await new Promise((resolve, reject) => {
        uploadTask.on(
          'state_changed',
          (snapshot) => {
            const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
            setUploadProgress(pct);
          },
          (uploadErr) => reject(uploadErr),
          () => resolve()
        );
      });

      const coverUrl = await getDownloadURL(uploadTask.snapshot.ref);

      const data = {
        albumId,
        title: title.trim(),
        description: description.trim(),
        coverUrl,
        coverType: 'image',
        coverStoragePath: storagePath,
        dropCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await setDoc(albumDocRef, data);

      navigate(`/album/${albumId}`);
    } catch (err) {
      console.error(err);
      setError(err?.message || 'Failed to create set.');
      setSaving(false);
    }
  };

  return (
    <div className={layoutStyles.detailPage}>
      <TopBar variant="back" backLabel="Back" onBack={handleBack} />

      {!unlocked ? (
        <div className={styles.passcodeShell}>
          <h1 className={styles.passcodeTitle}>Enter Passcode</h1>
          <p className={styles.passcodeDescription}>Enter the 6-digit passcode to continue.</p>
          <input
            inputMode="numeric"
            pattern="[0-9]*"
            type="text"
            autoComplete="one-time-code"
            autoCorrect="off"
            spellCheck={false}
            name="create-album-passcode"
            value={code}
            onChange={onChangePasscode}
            placeholder="••••••"
            maxLength={6}
            autoFocus
            className={styles.passcodeInput}
          />
          {passError && <p className={styles.errorText}>{passError}</p>}
          <p className={styles.passcodeHint}>Hint for dev: {PASSCODE}</p>
        </div>
      ) : (
        <div className={styles.formShell}>
          <h1 className={styles.formTitle}>Create Set</h1>

          <form className={styles.form} onSubmit={onSubmit}>
            <Field label="Set Title">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Set title"
                maxLength={140}
                required
                className={styles.input}
              />
            </Field>

            <Field label="Description">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the set (displayed publicly)"
                maxLength={2000}
                className={`${styles.input} ${styles.textarea}`}
                required
              />
            </Field>

            <Field label="Cover Image">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className={styles.fileInput}
              />

              {previewUrl ? (
                <div className={styles.previewWrapper}>
                  <img src={previewUrl} alt="Set cover preview" className={styles.previewImage} />
                </div>
              ) : (
                <p className={styles.statusText}>Choose a square or landscape cover image.</p>
              )}
            </Field>

            {processingMedia && <p className={styles.statusText}>Processing cover…</p>}
            {saving && <p className={styles.statusText}>Uploading… {uploadProgress}%</p>}
            {error && <p className={styles.errorText}>{error}</p>}

            <div className={styles.buttonRow}>
              <button className={layoutStyles.createBtn} type="submit" disabled={!canSubmit}>
                {saving ? 'Saving…' : 'Create Set'}
              </button>
              <button
                type="button"
                className={`${layoutStyles.createBtn} ${styles.cancelButton}`}
                onClick={() => navigate('/albums')}
                disabled={saving}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className={styles.field}>
      <label className={styles.fieldLabel}>{label}</label>
      {children}
    </div>
  );
}

function resizeImageToMax(file, maxSize = 800) {
  return new Promise((resolve, reject) => {
    const mimeType = file.type && file.type.startsWith('image/') ? file.type : 'image/jpeg';
    const reader = new FileReader();

    reader.onerror = () => reject(new Error('Unable to read image file.'));
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Invalid image data.'));
        return;
      }

      const img = new Image();
      img.onload = () => {
        const maxDimension = Math.max(img.width, img.height);
        const scale = maxDimension > maxSize ? maxSize / maxDimension : 1;
        const targetWidth = Math.round(img.width * scale);
        const targetHeight = Math.round(img.height * scale);

        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas is not supported in this browser.'));
          return;
        }

        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

        const quality = mimeType === 'image/jpeg' || mimeType === 'image/webp' ? 0.92 : undefined;
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Image processing failed.'));
              return;
            }

            const processedFile = new File([blob], file.name, { type: mimeType });
            const preview = URL.createObjectURL(processedFile);
            resolve({ file: processedFile, previewUrl: preview });
          },
          mimeType,
          quality
        );
      };

      img.onerror = () => reject(new Error('Invalid image file.'));
      img.src = reader.result;
    };

    reader.readAsDataURL(file);
  });
}
