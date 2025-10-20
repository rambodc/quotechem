// src/create-drop/CreateDrop.js
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection,
  doc,
  endAt,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAt,
} from 'firebase/firestore';
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
  const [selectedArtist, setSelectedArtist] = useState(null);
  const [artistSearchTerm, setArtistSearchTerm] = useState('');
  const [artistResults, setArtistResults] = useState([]);
  const [artistSearchLoading, setArtistSearchLoading] = useState(false);
  const [artistSearchError, setArtistSearchError] = useState('');
  const artistSearchLatestRef = useRef('');
  const [selectedOwner, setSelectedOwner] = useState(null);
  const [ownerSearchTerm, setOwnerSearchTerm] = useState('');
  const [ownerResults, setOwnerResults] = useState([]);
  const [ownerSearchLoading, setOwnerSearchLoading] = useState(false);
  const [ownerSearchError, setOwnerSearchError] = useState('');
  const ownerSearchLatestRef = useRef('');
  const [uri, setUri] = useState('');

  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [processingImage, setProcessingImage] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fileInputRef = useRef(null);
  const artistInputRef = useRef(null);
  const ownerInputRef = useRef(null);

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

  const searchArtists = useCallback(async (term) => {
    const normalized = term.trim();
    if (!normalized) return;

    const lower = normalized.toLowerCase();
    const seen = new Set();
    const matches = [];
    let errorMessage = '';

    const addArtist = (snap) => {
      if (!snap?.exists()) return;
      const data = snap.data() || {};
      const rawId = data.artistId || snap.id || '';
      const id = rawId.trim();
      if (!id || seen.has(id)) return;
      const label = (data.artistFullName || '').trim() || 'Untitled Artist';
      const description = data.artistDescription || '';
      const subLabel = description ? description.slice(0, 80) : '';
      matches.push({ id, label, subLabel });
      seen.add(id);
    };

    try {
      const byIdSnap = await getDoc(doc(db, 'artists', normalized));
      addArtist(byIdSnap);
    } catch (err) {
      console.error('Artist ID lookup failed:', err);
    }

    try {
      const nameQuery = query(
        collection(db, 'artists'),
        orderBy('artistFullName'),
        startAt(normalized),
        endAt(`${normalized}\uf8ff`),
        limit(10)
      );
      const nameSnap = await getDocs(nameQuery);
      nameSnap.forEach(addArtist);
    } catch (err) {
      console.warn('Artist name search fallback:', err);
      if (err?.code === 'failed-precondition') {
        try {
          const fallbackSnap = await getDocs(
            query(collection(db, 'artists'), limit(30))
          );
          fallbackSnap.forEach((snap) => {
            const data = snap.data() || {};
            const rawId = data.artistId || snap.id || '';
            const id = rawId.trim();
            if (!id || seen.has(id)) return;
            const label = (data.artistFullName || '').trim();
            const description = data.artistDescription || '';
            if (
              label.toLowerCase().includes(lower) ||
              id.toLowerCase().includes(lower) ||
              description.toLowerCase().includes(lower)
            ) {
              const subLabel = description ? description.slice(0, 80) : '';
              matches.push({ id, label: label || 'Untitled Artist', subLabel });
              seen.add(id);
            }
          });
        } catch (fallbackErr) {
          console.error('Artist fallback search failed:', fallbackErr);
          errorMessage = fallbackErr?.message || 'Unable to search artists.';
        }
      } else {
        errorMessage = err?.message || 'Unable to search artists.';
      }
    }

    if (artistSearchLatestRef.current === normalized) {
      setArtistResults(matches);
      setArtistSearchError(errorMessage);
      setArtistSearchLoading(false);
    }
  }, []);

  const searchUsers = useCallback(async (term) => {
    const normalized = term.trim();
    if (!normalized) return;

    const lower = normalized.toLowerCase();
    const seen = new Set();
    const matches = [];
    let errorMessage = '';

    const addUser = (snap) => {
      if (!snap?.exists()) return;
      const data = snap.data() || {};
      const rawId = snap.id || '';
      const id = rawId.trim();
      if (!id || seen.has(id)) return;
      const nameParts = [data.firstName, data.lastName]
        .map((part) => (part ? String(part).trim() : ''))
        .filter(Boolean);
      const name = nameParts.join(' ').trim();
      const email = (data.email || '').trim();
      const label = name || email || id;
      const subLabel = email && email !== label ? email : '';
      matches.push({ id, label, subLabel });
      seen.add(id);
    };

    try {
      const byIdSnap = await getDoc(doc(db, 'users', normalized));
      addUser(byIdSnap);
    } catch (err) {
      console.error('User ID lookup failed:', err);
    }

    const runQuery = async (field, value, limitCount = 10) => {
      try {
        const q = query(
          collection(db, 'users'),
          orderBy(field),
          startAt(value),
          endAt(`${value}\uf8ff`),
          limit(limitCount)
        );
        const snap = await getDocs(q);
        snap.forEach(addUser);
      } catch (err) {
        console.warn(`User search by ${field} failed:`, err);
        if (err?.code !== 'failed-precondition' && !errorMessage) {
          errorMessage = err?.message || 'Unable to search users.';
        }
      }
    };

    await runQuery('email', normalized.toLowerCase(), 10);
    if (matches.length < 15) await runQuery('firstName', normalized, 8);
    if (matches.length < 15) await runQuery('lastName', normalized, 8);

    if (matches.length < 10) {
      try {
        const fallbackSnap = await getDocs(
          query(collection(db, 'users'), limit(40))
        );
        fallbackSnap.forEach((snap) => {
          const data = snap.data() || {};
          const rawId = snap.id || '';
          const id = rawId.trim();
          if (!id || seen.has(id)) return;
          const nameParts = [data.firstName, data.lastName]
            .map((part) => (part ? String(part).trim() : ''))
            .filter(Boolean);
          const name = nameParts.join(' ').trim();
          const email = (data.email || '').trim();
          const combined = `${name} ${email}`.toLowerCase();
          if (combined.includes(lower) || id.toLowerCase().includes(lower)) {
            const label = name || email || id;
            const subLabel = email && email !== label ? email : '';
            matches.push({ id, label, subLabel });
            seen.add(id);
          }
        });
      } catch (fallbackErr) {
        console.error('User fallback search failed:', fallbackErr);
        if (!errorMessage) {
          errorMessage = fallbackErr?.message || 'Unable to search users.';
        }
      }
    }

    if (ownerSearchLatestRef.current === normalized) {
      setOwnerResults(matches);
      setOwnerSearchError(errorMessage);
      setOwnerSearchLoading(false);
    }
  }, []);

  useEffect(() => {
    const term = artistSearchTerm.trim();

    if (!term) {
      artistSearchLatestRef.current = '';
      setArtistResults([]);
      setArtistSearchError('');
      setArtistSearchLoading(false);
      return;
    }

    if (term.length < 2) {
      artistSearchLatestRef.current = '';
      setArtistResults([]);
      setArtistSearchError('');
      setArtistSearchLoading(false);
      return;
    }

    artistSearchLatestRef.current = term;
    setArtistSearchLoading(true);
    setArtistSearchError('');
    const handle = setTimeout(() => {
      searchArtists(term);
    }, 260);

    return () => clearTimeout(handle);
  }, [artistSearchTerm, searchArtists]);

  useEffect(() => {
    const term = ownerSearchTerm.trim();

    if (!term) {
      ownerSearchLatestRef.current = '';
      setOwnerResults([]);
      setOwnerSearchError('');
      setOwnerSearchLoading(false);
      return;
    }

    if (term.length < 2) {
      ownerSearchLatestRef.current = '';
      setOwnerResults([]);
      setOwnerSearchError('');
      setOwnerSearchLoading(false);
      return;
    }

    ownerSearchLatestRef.current = term;
    setOwnerSearchLoading(true);
    setOwnerSearchError('');
    const handle = setTimeout(() => {
      searchUsers(term);
    }, 260);

    return () => clearTimeout(handle);
  }, [ownerSearchTerm, searchUsers]);

  const handleSelectArtist = useCallback((option) => {
    setSelectedArtist(option);
    setArtistSearchTerm('');
    setArtistResults([]);
    setArtistSearchError('');
    artistSearchLatestRef.current = '';
  }, []);

  const handleSelectOwner = useCallback((option) => {
    setSelectedOwner(option);
    setOwnerSearchTerm('');
    setOwnerResults([]);
    setOwnerSearchError('');
    ownerSearchLatestRef.current = '';
  }, []);

  const handleClearArtist = useCallback(() => {
    setSelectedArtist(null);
    setArtistSearchTerm('');
    setArtistResults([]);
    setArtistSearchError('');
    artistSearchLatestRef.current = '';
    if (artistInputRef.current) {
      artistInputRef.current.focus();
    }
  }, []);

  const handleClearOwner = useCallback(() => {
    setSelectedOwner(null);
    setOwnerSearchTerm('');
    setOwnerResults([]);
    setOwnerSearchError('');
    ownerSearchLatestRef.current = '';
    if (ownerInputRef.current) {
      ownerInputRef.current.focus();
    }
  }, []);

  const renderDropdown = (term, loading, errorMessage, results, onSelect, metaLabel) => {
    const trimmed = term.trim();
    if (!trimmed) return null;
    if (trimmed.length < 2) {
      return (
        <div style={searchResultsStyle}>
          <p style={searchStatusStyle}>Keep typing to search (min 2 characters).</p>
        </div>
      );
    }

    const hasResults = results.length > 0;

    return (
      <div style={searchResultsStyle}>
        {loading && <p style={searchStatusStyle}>Searching…</p>}
        {!loading && errorMessage && <p style={searchErrorStyle}>{errorMessage}</p>}
        {!loading && hasResults &&
          results.map((option) => (
            <button
              type="button"
              key={option.id}
              onClick={() => onSelect(option)}
              style={resultButtonStyle}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#f8fafc';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#ffffff';
              }}
            >
              <span style={resultPrimaryStyle}>{option.label}</span>
              {option.subLabel ? <span style={resultSecondaryStyle}>{option.subLabel}</span> : null}
              <span style={resultMetaStyle}>
                {metaLabel}: {option.id}
              </span>
            </button>
          ))}
        {!loading && !hasResults && !errorMessage && (
          <p style={searchStatusStyle}>No matches. Try a different search.</p>
        )}
      </div>
    );
  };

  const artistId = selectedArtist?.id ?? '';
  const ownedByUid = selectedOwner?.id ?? '';

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
      !artistSearchLoading &&
      !ownerSearchLoading
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
    artistSearchLoading,
    ownerSearchLoading,
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
              <div style={searchWrapperStyle}>
                <input
                  ref={artistInputRef}
                  type="text"
                  value={artistSearchTerm}
                  onChange={(e) => setArtistSearchTerm(e.target.value)}
                  placeholder={selectedArtist ? `Change selection (current: ${selectedArtist.label})` : 'Search artists by name, description, or ID'}
                  style={inputStyle}
                />
                {renderDropdown(
                  artistSearchTerm,
                  artistSearchLoading,
                  artistSearchError,
                  artistResults,
                  handleSelectArtist,
                  'Artist ID'
                )}
              </div>
              {selectedArtist && (
                <div style={selectionSummaryStyle}>
                  <div style={selectionSummaryTextStyle}>
                    <span style={resultPrimaryStyle}>{selectedArtist.label}</span>
                    <span style={resultMetaStyle}>Artist ID: {selectedArtist.id}</span>
                  </div>
                  <button type="button" onClick={handleClearArtist} style={clearSelectionButtonStyle}>
                    Change
                  </button>
                </div>
              )}
            </Field>

            <Field label="Owned By">
              <div style={searchWrapperStyle}>
                <input
                  ref={ownerInputRef}
                  type="text"
                  value={ownerSearchTerm}
                  onChange={(e) => setOwnerSearchTerm(e.target.value)}
                  placeholder={selectedOwner ? `Change selection (current: ${selectedOwner.label})` : 'Search users by name, email, or UID'}
                  style={inputStyle}
                />
                {renderDropdown(
                  ownerSearchTerm,
                  ownerSearchLoading,
                  ownerSearchError,
                  ownerResults,
                  handleSelectOwner,
                  'UID'
                )}
              </div>
              {selectedOwner && (
                <div style={selectionSummaryStyle}>
                  <div style={selectionSummaryTextStyle}>
                    <span style={resultPrimaryStyle}>{selectedOwner.label}</span>
                    <span style={resultMetaStyle}>
                      UID: {selectedOwner.id}
                      {selectedOwner.subLabel ? ` · ${selectedOwner.subLabel}` : ''}
                    </span>
                  </div>
                  <button type="button" onClick={handleClearOwner} style={clearSelectionButtonStyle}>
                    Change
                  </button>
                </div>
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

const searchWrapperStyle = {
  position: 'relative',
};

const searchResultsStyle = {
  position: 'absolute',
  top: 'calc(100% + 6px)',
  left: 0,
  right: 0,
  maxHeight: 240,
  overflowY: 'auto',
  borderRadius: 12,
  border: '1px solid #e2e8f0',
  background: '#ffffff',
  boxShadow: '0 16px 32px rgba(15, 23, 42, 0.12)',
  zIndex: 30,
  padding: 6,
};

const searchStatusStyle = {
  margin: '6px 8px',
  fontSize: 13,
  color: '#475569',
};

const searchErrorStyle = {
  ...searchStatusStyle,
  color: '#b91c1c',
};

const resultButtonStyle = {
  width: '100%',
  border: 'none',
  background: '#ffffff',
  borderRadius: 10,
  padding: '10px 12px',
  textAlign: 'left',
  cursor: 'pointer',
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  transition: 'background 0.16s ease',
};

const resultPrimaryStyle = {
  fontWeight: 600,
  color: '#0f172a',
};

const resultSecondaryStyle = {
  fontSize: 12.5,
  color: '#475569',
};

const resultMetaStyle = {
  fontSize: 11.5,
  color: '#64748b',
};

const selectionSummaryStyle = {
  marginTop: 12,
  padding: '10px 12px',
  borderRadius: 12,
  background: '#f1f5f9',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
};

const selectionSummaryTextStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};

const clearSelectionButtonStyle = {
  border: 'none',
  background: 'transparent',
  color: '#0ea5e9',
  fontWeight: 600,
  cursor: 'pointer',
};
