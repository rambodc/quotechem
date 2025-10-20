// src/create-drop/CreateDrop.js
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, doc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import TopBar from '../components/TopBar';
import layoutStyles from '../styles/layout.module.css';
import { db, storage, logStorageDebug } from '../firebase';

const typeOptions = ['NFT', 'MPT'];
const versionOptions = ['v1', 'v2'];

export default function CreateDrop() {
  const navigate = useNavigate();
  const handleBack = useCallback(() => {
    if (window.history.length > 2) navigate(-1);
    else navigate('/home');
  }, [navigate]);

  const [code, setCode] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [passError, setPassError] = useState('');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tokenId, setTokenId] = useState('');
  const [type, setType] = useState(typeOptions[0]);
  const [dropVersion, setDropVersion] = useState(versionOptions[0]);
  const [artistId, setArtistId] = useState('');
  const [ownedByUid, setOwnedByUid] = useState('');
  const [artistOptions, setArtistOptions] = useState([]);
  const [artistLoading, setArtistLoading] = useState(true);
  const [artistError, setArtistError] = useState('');
  const [userOptions, setUserOptions] = useState([]);
  const [userLoading, setUserLoading] = useState(true);
  const [userError, setUserError] = useState('');
  const [uri, setUri] = useState('');

  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [processingImage, setProcessingImage] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fileInputRef = useRef(null);

  const onChangePasscode = (e) => {
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

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setArtistLoading(true);
        setArtistError('');
        const snapshot = await getDocs(collection(db, 'artists'));
        if (!active) return;
        const options = snapshot.docs.map((docSnap) => {
          const data = docSnap.data() || {};
          const id = data.artistId || docSnap.id;
          const label = (data.artistFullName || '').trim() || 'Untitled Artist';
          return { id, label };
        }).sort((a, b) => a.label.localeCompare(b.label));
        setArtistOptions(options);
      } catch (err) {
        console.error('Failed to load artists list:', err);
        if (!active) return;
        setArtistError(err?.message || 'Failed to load artists.');
      } finally {
        if (!active) return;
        setArtistLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setUserLoading(true);
        setUserError('');
        const snapshot = await getDocs(collection(db, 'users'));
        if (!active) return;
        const options = snapshot.docs.map((docSnap) => {
          const data = docSnap.data() || {};
          const nameParts = [data.firstName, data.lastName].filter(Boolean);
          const name = nameParts.join(' ').trim();
          const baseLabel = name || data.email || docSnap.id;
          const annotatedLabel = name && data.email ? `${name} (${data.email})` : baseLabel;
          return {
            id: docSnap.id,
            label: annotatedLabel,
            email: data.email || '',
          };
        }).sort((a, b) => a.label.localeCompare(b.label));
        setUserOptions(options);
      } catch (err) {
        console.error('Failed to load users list:', err);
        if (!active) return;
        setUserError(err?.message || 'Failed to load users.');
      } finally {
        if (!active) return;
        setUserLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const selectedArtist = useMemo(
    () => artistOptions.find((option) => option.id === artistId) || null,
    [artistOptions, artistId]
  );

  const selectedOwner = useMemo(
    () => userOptions.find((option) => option.id === ownedByUid) || null,
    [userOptions, ownedByUid]
  );

  const canSubmit = useMemo(() => {
    return (
      unlocked &&
      title.trim().length > 0 &&
      description.trim().length > 0 &&
      tokenId.trim().length > 0 &&
      uri.trim().length > 0 &&
      !!selectedArtist &&
      !!selectedOwner &&
      !!file &&
      !saving &&
      !processingImage &&
      !artistLoading &&
      !userLoading &&
      !artistError &&
      !userError
    );
  }, [
    unlocked,
    title,
    description,
    tokenId,
    uri,
    selectedArtist,
    selectedOwner,
    file,
    saving,
    processingImage,
    artistLoading,
    userLoading,
    artistError,
    userError,
  ]);

  const handleFileChange = async (event) => {
    setError('');
    const selected = event.target.files?.[0];
    if (!selected) return;

    if (!selected.type.startsWith('image/')) {
      setError('Please choose an image file (jpg, png, webp, etc).');
      setFile(null);
      setPreviewUrl('');
      return;
    }

    setProcessingImage(true);
    setUploadProgress(0);
    try {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      const { file: resizedFile, previewUrl: resizedUrl } = await resizeImageToMax(selected, 600);
      setFile(resizedFile);
      setPreviewUrl(resizedUrl);
    } catch (err) {
      console.error(err);
      setError(err?.message || 'Unable to process image. Please try another file.');
      setFile(null);
      setPreviewUrl('');
    } finally {
      setProcessingImage(false);
    }
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    if (!canSubmit || !file) return;

    const trimmedArtist = artistId.trim();
    const trimmedOwner = ownedByUid.trim();

    try {
      setSaving(true);
      setError('');

      const dropsCollection = collection(db, 'drops');
      const dropDocRef = doc(dropsCollection);
      const dropId = dropDocRef.id;

      try {
        logStorageDebug();
      } catch {
        // ignore debug errors
      }

      const ext = file.name.includes('.') ? file.name.split('.').pop() : 'jpg';
      const objectPath = `drops/${dropId}/media.${ext}`;
      const storageRef = ref(storage, objectPath);

      const uploadTask = uploadBytesResumable(storageRef, file, {
        contentType: file.type || 'image/jpeg',
      });

      await new Promise((resolve, reject) => {
        uploadTask.on(
          'state_changed',
          (snap) => {
            const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
            setUploadProgress(pct);
          },
          (err) => reject(err),
          () => resolve()
        );
      });

      const mediaPhotoUrl = await getDownloadURL(uploadTask.snapshot.ref);

      const data = {
        dropId,
        createdAt: serverTimestamp(),
        title: title.trim(),
        description: description.trim(),
        tokenId: tokenId.trim(),
        type,
        mediaPhoto: mediaPhotoUrl,
        artistId: trimmedArtist,
        dropVersion,
        ownedByUid: trimmedOwner,
        uri: uri.trim(),
      };

      await setDoc(dropDocRef, data);

      navigate(`/drop/${dropId}`);
    } catch (err) {
      console.error(err);
      setError(err?.message || 'Failed to create drop.');
      setSaving(false);
    }
  };

  return (
    <div className={layoutStyles.detailPage}>
      <TopBar variant="back" backLabel="Back" onBack={handleBack} />

      {!unlocked ? (
        <div
          style={{
            maxWidth: 480,
            width: '100%',
            margin: '80px auto',
            padding: '0 16px',
            textAlign: 'center',
          }}
        >
          <h1 style={{ marginBottom: 8 }}>Enter Passcode</h1>
          <p style={{ color: '#4b5563', marginBottom: 12 }}>Enter the 6-digit passcode to continue.</p>
          <input
            inputMode="numeric"
            pattern="[0-9]*"
            type="text"
            autoComplete="one-time-code"
            autoCorrect="off"
            spellCheck={false}
            name="create-drop-passcode"
            value={code}
            onChange={onChangePasscode}
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
      ) : (
        <div
          style={{
            maxWidth: 720,
            width: '100%',
            margin: '80px auto 40px',
            padding: '0 16px 60px',
          }}
        >
          <h1 style={{ margin: '0 0 24px' }}>Create Drop</h1>

          <form onSubmit={onSubmit}>
            <Field label="Title">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Drop title"
                maxLength={140}
                required
                style={inputStyle}
              />
            </Field>

            <Field label="Description">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe this drop"
                maxLength={2000}
                style={{ ...inputStyle, minHeight: 120, resize: 'vertical' }}
                required
              />
            </Field>

            <Field label="Token ID">
              <input
                type="text"
                value={tokenId}
                onChange={(e) => setTokenId(e.target.value)}
                placeholder="Token identifier"
                style={inputStyle}
                required
              />
            </Field>

            <Field label="Type">
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                style={inputStyle}
              >
                {typeOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Drop Version">
              <select
                value={dropVersion}
                onChange={(e) => setDropVersion(e.target.value)}
                style={inputStyle}
              >
                {versionOptions.map((option) => (
                  <option key={option} value={option}>
                    {option.toUpperCase()}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Artist">
              {artistLoading ? (
                <p style={{ color: '#4b5563', fontSize: 14 }}>Loading artists…</p>
              ) : artistError ? (
                <p style={{ color: '#b91c1c', fontSize: 14 }}>{artistError}</p>
              ) : artistOptions.length === 0 ? (
                <p style={{ color: '#4b5563', fontSize: 14 }}>No artists available. Create an artist first.</p>
              ) : (
                <select
                  value={artistId}
                  onChange={(e) => setArtistId(e.target.value)}
                  style={inputStyle}
                  required
                >
                  <option value="">Select an artist…</option>
                  {artistOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              )}
              {selectedArtist && (
                <p style={{ color: '#64748b', fontSize: 13, marginTop: 6 }}>
                  Artist ID: {selectedArtist.id}
                </p>
              )}
            </Field>

            <Field label="Owned By">
              {userLoading ? (
                <p style={{ color: '#4b5563', fontSize: 14 }}>Loading users…</p>
              ) : userError ? (
                <p style={{ color: '#b91c1c', fontSize: 14 }}>{userError}</p>
              ) : userOptions.length === 0 ? (
                <p style={{ color: '#4b5563', fontSize: 14 }}>No users available.</p>
              ) : (
                <select
                  value={ownedByUid}
                  onChange={(e) => setOwnedByUid(e.target.value)}
                  style={inputStyle}
                  required
                >
                  <option value="">Select a user…</option>
                  {userOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              )}
              {selectedOwner && (
                <p style={{ color: '#64748b', fontSize: 13, marginTop: 6 }}>
                  UID: {selectedOwner.id}
                  {selectedOwner.email ? ` · ${selectedOwner.email}` : ''}
                </p>
              )}
            </Field>

            <Field label="Metadata URI">
              <input
                type="text"
                value={uri}
                onChange={(e) => setUri(e.target.value)}
                placeholder="https://..."
                style={inputStyle}
                required
              />
            </Field>

            <Field label="Media Photo">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                style={{ display: 'block' }}
              />
              {previewUrl ? (
                <div style={{ marginTop: 12 }}>
                  <img
                    src={previewUrl}
                    alt="Drop preview"
                    style={{ width: '100%', maxHeight: 420, objectFit: 'cover', borderRadius: 12 }}
                  />
                </div>
              ) : (
                <p style={{ color: '#6b7280', marginTop: 8 }}>Choose an image (JPG/PNG/WebP).</p>
              )}
            </Field>

            {processingImage && (
              <p style={{ margin: '12px 0', fontSize: 14 }}>Processing image…</p>
            )}

            {saving && (
              <p style={{ margin: '12px 0', fontSize: 14 }}>Uploading… {uploadProgress}%</p>
            )}

            {error && (
              <p style={{ margin: '12px 0', color: '#b91c1c', fontSize: 14 }}>{error}</p>
            )}

            <div style={{ display: 'flex', gap: 12 }}>
              <button className={layoutStyles.createBtn} type="submit" disabled={!canSubmit}>
                {saving ? 'Saving…' : 'Create Drop'}
              </button>
              <button
                type="button"
                className={layoutStyles.createBtn}
                style={{ background: '#e5e7eb', color: '#1f2937' }}
                onClick={() => navigate('/drops')}
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
    <div style={{ marginBottom: 18 }}>
      <label style={labelStyle}>{label}</label>
      {children}
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

const labelStyle = {
  display: 'block',
  fontWeight: 600,
  marginBottom: 8,
  fontSize: 14,
};

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid #d1d5db',
  fontSize: 16,
  outline: 'none',
  background: '#fff',
};
