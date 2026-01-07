import React, { useContext, useRef, useState } from 'react';
import TopBar from '../components/TopBar';
import layoutStyles from '../styles/layout.module.css';
import { UserContext } from '../App';
import { FiUser, FiMail, FiHash } from 'react-icons/fi';
import { storage, db } from '../firebase';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { doc, setDoc } from 'firebase/firestore';

export default function Profile() {
  const appUser = useContext(UserContext);
  const fileInputRef = useRef(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setProgress(0);
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    handleUpload(file, objectUrl);
  };

  const handleUpload = async (file, objectUrl) => {
    if (!appUser?.id) {
      setError('You must be signed in to upload a photo.');
      return;
    }
    try {
      setUploading(true);
      const storageRef = ref(storage, `users/${appUser.id}/profile-${file.name}`);
      const task = uploadBytesResumable(storageRef, file);

      await new Promise((resolve, reject) => {
        task.on(
          'state_changed',
          (snap) => {
            const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
            setProgress(pct);
          },
          reject,
          () => resolve()
        );
      });

      const url = await getDownloadURL(task.snapshot.ref);
      await setDoc(doc(db, 'users', appUser.id), { photoUrl: url }, { merge: true });
      setError('');
    } catch (err) {
      console.error('Profile upload failed:', err);
      setError(err?.message || 'Upload failed.');
    } finally {
      setUploading(false);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    }
  };

  return (
    <div className={layoutStyles.pageShell} style={{ minHeight: '100vh' }}>
      <TopBar variant="back" backLabel="Back" onBack={() => window.history.back()} />

      <div
        style={{
          maxWidth: 520,
          margin: '90px auto 60px',
          padding: '0 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <h1 style={{ textAlign: 'center', margin: '0 0 8px', fontSize: 26 }}>Profile</h1>
        <div
          style={{
            background: '#fff',
            borderRadius: 18,
            padding: 18,
            boxShadow: '0 18px 40px rgba(15,23,42,0.12)',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexDirection: 'column' }}>
            <div
              style={{
                width: 120,
                height: 120,
                borderRadius: 999,
                background: '#e0f2fe',
                display: 'grid',
                placeItems: 'center',
                color: '#0369a1',
                overflow: 'hidden',
                boxShadow: '0 12px 30px rgba(15,23,42,0.12)',
              }}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
            >
              {previewUrl ? (
                <img src={previewUrl} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : appUser?.photoUrl ? (
                <img src={appUser.photoUrl} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <FiUser size={42} />
              )}
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              style={{
                padding: '10px 14px',
                borderRadius: 12,
                border: '1px solid #e2e8f0',
                background: '#fff',
                cursor: 'pointer',
                fontWeight: 700,
              }}
            >
              {uploading ? `Uploading… ${progress}%` : 'Upload photo'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
            {error ? <p style={{ color: '#b91c1c', margin: 0 }}>{error}</p> : null}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
              <strong style={{ fontSize: 20 }}>
                {`${appUser?.firstName || ''} ${appUser?.lastName || ''}`.trim() || 'Unnamed User'}
              </strong>
              <span style={{ color: '#475569', fontSize: 15 }}>{appUser?.email || 'No email'}</span>
            </div>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'auto 1fr',
              gap: 10,
              alignItems: 'center',
              color: '#475569',
              fontSize: 14,
              wordBreak: 'break-all',
            }}
          >
            <FiMail />
            <span>{appUser?.email || 'No email'}</span>
            <FiHash />
            <span>{appUser?.id || 'No UID'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
