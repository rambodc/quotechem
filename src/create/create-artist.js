// src/create-artist.js
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage, logStorageDebug } from '../firebase';
import TopBar from '../components/TopBar';
import layoutStyles from '../styles/layout.module.css';

function CreateArtist() {
  const navigate = useNavigate();
  // No sidebar; use a back button like Artists
  const handleBack = useCallback(() => {
    if (window.history.length > 2) navigate(-1); else navigate('/home');
  }, [navigate]);

  const [fullName, setFullName] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [processingImage, setProcessingImage] = useState(false);
  const [progress, setProgress] = useState(0);
  const [audioFile, setAudioFile] = useState(null);
  const [audioUploadProgress, setAudioUploadProgress] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [code, setCode] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [passError, setPassError] = useState('');

  const inputRef = useRef(null);

  const canSubmit = useMemo(() => {
    return fullName.trim().length > 0 && !!file && !saving && !processingImage;
  }, [fullName, file, saving, processingImage]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handlePasscodeChange = (e) => {
    const v = e.target.value.replace(/\D+/g, '').slice(0, 6);
    setCode(v);
    if (v.length === 6) {
      if (v === '123456') {
        setUnlocked(true);
        setPassError('');
      } else {
        setPassError('Incorrect passcode');
      }
    } else {
      setPassError('');
    }
  };

  const handleFileChange = async (e) => {
    setError('');
    const f = e.target.files?.[0];
    if (!f) return;

    if (!f.type.startsWith('image/')) {
      setError('Please choose an image file (jpg, png, webp, etc).');
      setFile(null);
      setPreviewUrl('');
      return;
    }

    setProgress(0);
    setProcessingImage(true);
    try {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      const { file: resizedFile, previewUrl: objectUrl } = await resizeImageToMax(f, 600);
      setFile(resizedFile);
      setPreviewUrl(objectUrl);
    } catch (err) {
      console.error(err);
      setError(err?.message || 'Unable to process image. Please try another file.');
      setFile(null);
      setPreviewUrl('');
    } finally {
      setProcessingImage(false);
    }
  };

  const handleAudioChange = (e) => {
    setError('');
    const f = e.target.files?.[0] || null;
    if (!f) {
      setAudioFile(null);
      setAudioUploadProgress(0);
      return;
    }

    if (!f.type.startsWith('audio/')) {
      setError('Please choose an audio file (mp3, wav, etc).');
      setAudioFile(null);
      setAudioUploadProgress(0);
      return;
    }

    setAudioFile(f);
    setAudioUploadProgress(0);
  };

  const genId = () => {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;

    try {
      setSaving(true);
      setError('');
      const artistUid = genId();
      // Debug which bucket we're actually using in the running build
      try { logStorageDebug(); } catch {}

      // Upload processed image to Storage
      const ext = file.name.includes('.') ? file.name.split('.').pop() : 'jpg';
      const objectPath = `artists/${artistUid}/cover.${ext}`;
      const storageRef = ref(storage, objectPath);

      const task = uploadBytesResumable(storageRef, file, {
        contentType: file.type || 'image/jpeg',
      });

      await new Promise((resolve, reject) => {
        task.on(
          'state_changed',
          (snap) => {
            const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
            setProgress(pct);
          },
          (err) => reject(err),
          () => resolve()
        );
      });

      const imgUrl = await getDownloadURL(task.snapshot.ref);

      let audioUrl = '';
      if (audioFile) {
        const audioExt = audioFile.name.includes('.') ? audioFile.name.split('.').pop() : 'mp3';
        const audioPath = `artists/${artistUid}/track.${audioExt}`;
        const audioRef = ref(storage, audioPath);
        const audioTask = uploadBytesResumable(audioRef, audioFile, {
          contentType: audioFile.type || 'audio/mpeg',
        });

        await new Promise((resolve, reject) => {
          audioTask.on(
            'state_changed',
            (snap) => {
              const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
              setAudioUploadProgress(pct);
            },
            (err) => reject(err),
            () => resolve()
          );
        });

        audioUrl = await getDownloadURL(audioTask.snapshot.ref);
      }

      // Write Firestore doc
      const data = {
        artistId: artistUid,
        createdAt: serverTimestamp(),
        artistFullName: fullName.trim(),
        artistProfilePhoto: imgUrl,
        artistDescription: description.trim(),
      };

      if (audioUrl) {
        data.artistAudioUrl = audioUrl;
        data.tracks = [
          {
            id: 'main_track',
            title: `${fullName.trim() || 'Artist'} Track`,
            url: audioUrl,
          },
        ];
      } else {
        data.tracks = [];
      }

      await setDoc(doc(db, 'artists', artistUid), data);

      // Go to the new artist page
      navigate(`/artist/${artistUid}`);
    } catch (err) {
      console.error(err);
      setError(err?.message || 'Failed to create artist.');
      setSaving(false);
    }
  };

  if (!unlocked) {
    return (
      <div className={layoutStyles.detailPage}>
        <TopBar variant="back" backLabel="Back" onBack={handleBack} />
        <div style={{ maxWidth: 480, width: '100%', margin: '80px auto', padding: '0 16px', textAlign: 'center' }}>
          <h1 style={{ marginBottom: 8 }}>Enter Passcode</h1>
          <p style={{ color: '#4b5563', marginBottom: 12 }}>Enter the 6-digit passcode to continue.</p>
          <input
            inputMode="numeric"
            pattern="[0-9]*"
            type="text"
            autoComplete="one-time-code"
            autoCorrect="off"
            spellCheck={false}
            name="create-artist-passcode"
            value={code}
            onChange={handlePasscodeChange}
            placeholder="••••••"
            maxLength={6}
            autoFocus
            style={{
              letterSpacing: 6,
              textAlign: 'center',
              padding: '12px 14px',
              borderRadius: 12,
              border: '1px solid #ddd',
              fontSize: 24,
              width: 220,
            }}
          />
          {passError && <p style={{ color: '#b91c1c', marginTop: 10 }}>{passError}</p>}
          <p style={{ marginTop: 10, fontSize: 12, color: '#6b7280' }}>Hint for dev: 123456</p>
        </div>
      </div>
    );
  }

  return (
    <div className={layoutStyles.homeContainer}>
      <TopBar variant="back" backLabel="Back" onBack={handleBack} />

      <div className="page-container" style={{ maxWidth: 680, width: '100%', margin: '80px auto 0', padding: 16 }}>
      <h1 style={{ margin: '20px 0' }}>Create Artist (Image)</h1>

      <form onSubmit={onSubmit}>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Artist Full Name</label>
          <input
            style={inputStyle}
            type="text"
            placeholder="Artist full name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            maxLength={120}
            required
          />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Description</label>
          <textarea
            style={{ ...inputStyle, minHeight: 90, resize: 'vertical' }}
            placeholder="Short description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={1000}
          />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Profile Photo</label>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            style={{ display: 'block' }}
          />
          {previewUrl ? (
            <div style={{ marginTop: 12 }}>
              <img
                src={previewUrl}
                alt="preview"
                style={{ width: '100%', maxHeight: 420, objectFit: 'cover', borderRadius: 10 }}
              />
            </div>
          ) : (
            <p style={{ color: '#666', marginTop: 8 }}>Choose an image (JPG/PNG/WebP).</p>
          )}
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Artist Audio (optional)</label>
          <input
            type="file"
            accept="audio/*"
            onChange={handleAudioChange}
            style={{ display: 'block' }}
          />
          {audioFile ? (
            <p style={{ color: '#4b5563', marginTop: 8 }}>Selected: {audioFile.name}</p>
          ) : (
            <p style={{ color: '#6b7280', marginTop: 8 }}>Upload a single audio track (mp3, wav, etc).</p>
          )}
        </div>

        {processingImage && (
          <div style={{ margin: '12px 0', fontSize: 14 }}>Processing image…</div>
        )}

        {audioFile && saving && (
          <div style={{ margin: '12px 0', fontSize: 14 }}>
            Uploading audio… {audioUploadProgress}%
          </div>
        )}

        {saving && (
          <div style={{ margin: '12px 0', fontSize: 14 }}>
            Uploading image… {progress}%
          </div>
        )}

        {error && (
          <div style={{ margin: '12px 0', color: '#c00', fontSize: 14 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 12 }}>
          <button className={layoutStyles.createBtn} type="submit" disabled={!canSubmit}>
            {saving ? 'Saving…' : 'Create'}
          </button>
          <button
            type="button"
            className={layoutStyles.createBtn}
            style={{ background: '#eee', color: '#333' }}
            onClick={() => navigate('/home')}
            disabled={saving}
          >
            Cancel
          </button>
        </div>
      </form>
      </div>
    </div>
  );
}

function resizeImageToMax(file, maxSize = 600) {
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
            const previewUrl = URL.createObjectURL(processedFile);
            resolve({ file: processedFile, previewUrl });
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

const labelStyle = { display: 'block', fontWeight: 600, marginBottom: 8, fontSize: 14 };

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid #ddd',
  fontSize: 16,
  outline: 'none',
};

export default CreateArtist;
