// src/create-drop/CreateDrop.js
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import TopBar from '../components/TopBar';
import layoutStyles from '../styles/layout.module.css';
import styles from './CreateDrop.module.css';
import { db, storage, logStorageDebug } from '../firebase';

const typeOptions = ['NFT', 'MPT'];
const versionOptions = ['v1', 'v2'];
const purchaseTypeOptions = [
  { value: 'purchase_now', label: 'Purchase Now' },
  { value: 'bid', label: 'Bid' },
];
const currencyOptions = ['USD', 'CAD'];

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
  const [purchaseType, setPurchaseType] = useState(purchaseTypeOptions[0].value);
  const [purchaseNowAmount, setPurchaseNowAmount] = useState('');
  const [purchaseNowCurrency, setPurchaseNowCurrency] = useState(currencyOptions[0]);
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
  const [mediaType, setMediaType] = useState('');
  const [processingMedia, setProcessingMedia] = useState(false);
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
      const name = (data.artistFullName || '').trim();
      if (!id && !name) return;
      const idLower = id.toLowerCase();
      const nameLower = name.toLowerCase();
      if (seen.has(id) || (!idLower.includes(lower) && !nameLower.includes(lower))) return;
      matches.push({ id, label: name || 'Untitled Artist', subLabel: '' });
      seen.add(id);
    };

    try {
      const byIdSnap = await getDoc(doc(db, 'artists', normalized));
      addArtist(byIdSnap);
    } catch (err) {
      console.error('Artist ID lookup failed:', err);
    }

    const tryFetch = async (q) => {
      try {
        const snap = await getDocs(q);
        snap.forEach(addArtist);
      } catch (err) {
        if (err?.code === 'failed-precondition') {
          throw err;
        }
        if (!errorMessage) errorMessage = err?.message || 'Unable to search artists.';
      }
    };

    try {
      await tryFetch(
        query(collection(db, 'artists'), orderBy('artistFullName'), limit(50))
      );
    } catch (err) {
      try {
        await tryFetch(query(collection(db, 'artists'), limit(60)));
      } catch (fallbackErr) {
        console.error('Artist search failed:', fallbackErr);
        if (!errorMessage) {
          errorMessage = fallbackErr?.message || 'Unable to search artists.';
        }
      }
    }

    if (artistSearchLatestRef.current === normalized) {
      setArtistResults(matches.slice(0, 20));
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
      if (!id) return;
      const first = (data.firstName || '').trim();
      const last = (data.lastName || '').trim();
      const name = `${first} ${last}`.trim();
      const idLower = id.toLowerCase();
      const nameLower = name.toLowerCase();
      if (seen.has(id) || (!idLower.includes(lower) && !nameLower.includes(lower))) return;
      const label = name || id;
      const subLabel = name && label === id ? name : '';
      matches.push({ id, label, subLabel });
      seen.add(id);
    };

    try {
      const byIdSnap = await getDoc(doc(db, 'users', normalized));
      addUser(byIdSnap);
    } catch (err) {
      console.error('User ID lookup failed:', err);
    }

    const tryFetch = async (q) => {
      try {
        const snap = await getDocs(q);
        snap.forEach(addUser);
      } catch (err) {
        if (err?.code === 'failed-precondition') {
          throw err;
        }
        if (!errorMessage) errorMessage = err?.message || 'Unable to search users.';
      }
    };

    try {
      await tryFetch(
        query(collection(db, 'users'), orderBy('firstName'), limit(40))
      );
      await tryFetch(
        query(collection(db, 'users'), orderBy('lastName'), limit(40))
      );
    } catch (err) {
      try {
        await tryFetch(query(collection(db, 'users'), limit(60)));
      } catch (fallbackErr) {
        console.error('User search failed:', fallbackErr);
        if (!errorMessage) {
          errorMessage = fallbackErr?.message || 'Unable to search users.';
        }
      }
    }

    if (ownerSearchLatestRef.current === normalized) {
      setOwnerResults(matches.slice(0, 20));
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
        <div className={styles.searchResults}>
          <p className={styles.searchStatus}>Keep typing to search (min 2 characters).</p>
        </div>
      );
    }

    const hasResults = results.length > 0;

    return (
      <div className={styles.searchResults}>
        {loading && <p className={styles.searchStatus}>Searching…</p>}
        {!loading && errorMessage && <p className={styles.searchError}>{errorMessage}</p>}
        {!loading && hasResults &&
          results.map((option) => (
            <button
              type="button"
              key={option.id}
              onClick={() => onSelect(option)}
              className={styles.resultButton}
            >
              <span className={styles.resultPrimary}>{option.label}</span>
              {option.subLabel ? <span className={styles.resultSecondary}>{option.subLabel}</span> : null}
              <span className={styles.resultMeta}>
                {metaLabel}: {option.id}
              </span>
            </button>
          ))}
        {!loading && !hasResults && !errorMessage && (
          <p className={styles.searchStatus}>No matches. Try a different search.</p>
        )}
      </div>
    );
  };

  const artistId = selectedArtist?.id ?? '';
  const ownedByUid = selectedOwner?.id ?? '';

  const canSubmit = useMemo(() => {
    const isPurchaseNow = purchaseType === 'purchase_now';
    const amountValue = Number(purchaseNowAmount);
    const amountIsValid = Number.isFinite(amountValue) && amountValue > 0;
    const currencyIsValid = currencyOptions.includes(purchaseNowCurrency);

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
      !processingMedia &&
      !artistSearchLoading &&
      !ownerSearchLoading &&
      isPurchaseNow &&
      amountIsValid &&
      currencyIsValid
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
    processingMedia,
    artistSearchLoading,
    ownerSearchLoading,
    purchaseType,
    purchaseNowAmount,
    purchaseNowCurrency,
  ]);

  const handleFileChange = async (event) => {
    setError('');
    const selected = event.target.files?.[0];
    if (!selected) return;

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl('');
    }

    if (selected.type.startsWith('image/')) {
      setProcessingMedia(true);
      setUploadProgress(0);
      try {
        const { file: resizedFile, previewUrl: resizedUrl } = await resizeImageToMax(selected, 600);
        setFile(resizedFile);
        setPreviewUrl(resizedUrl);
        setMediaType('image');
      } catch (err) {
        console.error(err);
        setError(err?.message || 'Unable to process image. Please try another file.');
        setFile(null);
        setPreviewUrl('');
        setMediaType('');
        if (fileInputRef.current) fileInputRef.current.value = '';
      } finally {
        setProcessingMedia(false);
      }
      return;
    }

    if (selected.type === 'video/mp4' || selected.type.startsWith('video/')) {
      setUploadProgress(0);
      const videoUrl = URL.createObjectURL(selected);
      setFile(selected);
      setPreviewUrl(videoUrl);
      setMediaType('video');
      setProcessingMedia(false);
      return;
    }

    setError('Please choose an image or MP4 video file.');
    setFile(null);
    setPreviewUrl('');
    setMediaType('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    if (!canSubmit || !file) return;

    const trimmedArtist = artistId.trim();
    const trimmedOwner = ownedByUid.trim();
    const isPurchaseNow = purchaseType === 'purchase_now';
    const rawAmount = Number(purchaseNowAmount);
    const roundedAmount = Number.isFinite(rawAmount) ? Math.round(rawAmount * 100) / 100 : null;

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

      const derivedMediaType = mediaType || (file.type?.startsWith('video/') ? 'video' : 'image');
      const fallbackExtension = derivedMediaType === 'video' ? 'mp4' : 'jpg';
      const ext = file.name.includes('.') ? file.name.split('.').pop() : fallbackExtension;
      const objectPath = `drops/${dropId}/media.${ext}`;
      const storageRef = ref(storage, objectPath);

      const uploadTask = uploadBytesResumable(storageRef, file, {
        contentType: file.type || (derivedMediaType === 'video' ? 'video/mp4' : 'image/jpeg'),
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

      const mediaUrl = await getDownloadURL(uploadTask.snapshot.ref);

      const data = {
        dropId,
        createdAt: serverTimestamp(),
        title: title.trim(),
        description: description.trim(),
        tokenId: tokenId.trim(),
        type,
        mediaUrl,
        mediaType: derivedMediaType,
        mediaPhoto: derivedMediaType === 'image' ? mediaUrl : '',
        artistId: trimmedArtist,
        dropVersion,
        ownedByUid: trimmedOwner,
        uri: uri.trim(),
        purchaseType,
        purchaseNowAmount: isPurchaseNow ? roundedAmount : null,
        purchaseNowCurrency: isPurchaseNow ? purchaseNowCurrency : null,
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
            name="create-drop-passcode"
            value={code}
            onChange={onChangePasscode}
            placeholder="••••••"
            maxLength={6}
            autoFocus
            className={styles.passcodeInput}
          />
          {passError && <p className={styles.errorText}>{passError}</p>}
          <p className={styles.passcodeHint}>Hint for dev: 123456</p>
        </div>
      ) : (
        <div className={styles.formShell}>
          <h1 className={styles.formTitle}>Create Drop</h1>

          <form className={styles.form} onSubmit={onSubmit}>
            <Field label="Title">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Drop title"
                maxLength={140}
                required
                className={styles.input}
              />
            </Field>

            <Field label="Description">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe this drop"
                maxLength={2000}
                className={`${styles.input} ${styles.textarea}`}
                required
              />
            </Field>

            <Field label="Token ID">
              <input
                type="text"
                value={tokenId}
                onChange={(e) => setTokenId(e.target.value)}
                placeholder="Token identifier"
                className={styles.input}
                required
              />
            </Field>

            <Field label="Type">
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className={styles.input}
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
                className={styles.input}
              >
                {versionOptions.map((option) => (
                  <option key={option} value={option}>
                    {option.toUpperCase()}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Purchase Type">
              <select
                value={purchaseType}
                onChange={(e) => {
                  const value = e.target.value;
                  setPurchaseType(value);
                  if (value !== 'purchase_now') {
                    setPurchaseNowAmount('');
                  }
                }}
                className={styles.input}
              >
                {purchaseTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {purchaseType === 'bid' && (
                <p className={styles.helperText}>Bid mode is coming soon. Switch back to Purchase Now to continue.</p>
              )}
            </Field>

            {purchaseType === 'purchase_now' && (
              <>
                <Field label="Purchase Now Amount">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={purchaseNowAmount}
                    onChange={(e) => setPurchaseNowAmount(e.target.value)}
                    placeholder="Enter amount in dollars"
                    className={styles.input}
                  />
                  <p className={styles.helperText}>Storefront will use this amount when we connect payments.</p>
                </Field>

                <Field label="Currency">
                  <select
                    value={purchaseNowCurrency}
                    onChange={(e) => setPurchaseNowCurrency(e.target.value)}
                    className={styles.input}
                  >
                    {currencyOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </Field>
              </>
            )}

            <Field label="Artist">
              <div className={styles.searchWrapper}>
                <input
                  ref={artistInputRef}
                  type="text"
                  value={artistSearchTerm}
                  onChange={(e) => setArtistSearchTerm(e.target.value)}
                  placeholder={selectedArtist ? `Change selection (current: ${selectedArtist.label})` : 'Search artists by name, description, or ID'}
                  className={styles.input}
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
                <div className={styles.selectionSummary}>
                  <div className={styles.selectionSummaryText}>
                    <span className={styles.resultPrimary}>{selectedArtist.label}</span>
                    <span className={styles.resultMeta}>Artist ID: {selectedArtist.id}</span>
                  </div>
                  <button type="button" onClick={handleClearArtist} className={styles.changeButton}>
                    Change
                  </button>
                </div>
              )}
            </Field>

            <Field label="Owned By">
              <div className={styles.searchWrapper}>
                <input
                  ref={ownerInputRef}
                  type="text"
                  value={ownerSearchTerm}
                  onChange={(e) => setOwnerSearchTerm(e.target.value)}
                  placeholder={selectedOwner ? `Change selection (current: ${selectedOwner.label})` : 'Search users by name, email, or UID'}
                  className={styles.input}
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
                <div className={styles.selectionSummary}>
                  <div className={styles.selectionSummaryText}>
                    <span className={styles.resultPrimary}>{selectedOwner.label}</span>
                    <span className={styles.resultMeta}>
                      UID: {selectedOwner.id}
                      {selectedOwner.subLabel ? ` · ${selectedOwner.subLabel}` : ''}
                    </span>
                  </div>
                  <button type="button" onClick={handleClearOwner} className={styles.changeButton}>
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
                className={styles.input}
                required
              />
            </Field>

            <Field label="Media">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/mp4"
                onChange={handleFileChange}
                className={styles.fileInput}
              />
              {previewUrl ? (
                <div className={styles.previewWrapper}>
                  {mediaType === 'video' ? (
                    <video
                      src={previewUrl}
                      controls
                      playsInline
                      className={styles.previewVideo}
                    />
                  ) : (
                    <img
                      src={previewUrl}
                      alt="Drop preview"
                      className={styles.previewImage}
                    />
                  )}
                </div>
              ) : (
                <p className={styles.fileHint}>Choose an image (JPG/PNG/WebP) or an MP4 video.</p>
              )}
            </Field>

            {processingMedia && (
              <p className={styles.statusText}>Processing media…</p>
            )}

            {saving && (
              <p className={styles.statusText}>Uploading… {uploadProgress}%</p>
            )}

            {error && (
              <p className={styles.errorText}>{error}</p>
            )}

            <div className={styles.buttonRow}>
              <button className={layoutStyles.createBtn} type="submit" disabled={!canSubmit}>
                {saving ? 'Saving…' : 'Create Drop'}
              </button>
              <button
                type="button"
                className={`${layoutStyles.createBtn} ${styles.cancelButton}`}
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
    <div className={styles.field}>
      <label className={styles.fieldLabel}>{label}</label>
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

// Ensure only one default export exists in the file
