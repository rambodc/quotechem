// src/drop/DropDetail.js
import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { FiChevronDown, FiUser } from 'react-icons/fi';
import TopBar from '../components/TopBar';
import layoutStyles from '../styles/layout.module.css';
import styles from './DropDetail.module.css';
import { db } from '../firebase';
import { getStripeClient } from '../services/stripe';
import { UserContext } from '../App';

const SUPPORTED_PURCHASE_CURRENCIES = ['USD', 'CAD'];
const CREATE_CHECKOUT_URL =
  process.env.REACT_APP_CREATE_STRIPE_SESSION_URL || '/api/createStripeCheckoutSession';

export default function DropDetail() {
  const { dropId } = useParams();
  const navigate = useNavigate();
  const appUser = useContext(UserContext);

  const [drop, setDrop] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  const [album, setAlbum] = useState(null);
  const [albumLoading, setAlbumLoading] = useState(false);
  const [albumError, setAlbumError] = useState('');
  const [artist, setArtist] = useState(null);
  const [artistLoading, setArtistLoading] = useState(false);
  const [artistError, setArtistError] = useState('');

  const handleBack = useCallback(() => {
    if (window.history.length > 2) {
      navigate(-1);
      return;
    }
    if (drop?.albumId) {
      navigate(`/set/${drop.albumId}`);
      return;
    }
    navigate('/purchased');
  }, [navigate, drop?.albumId]);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const snap = await getDoc(doc(db, 'drops', dropId));
        if (!alive) return;

        if (snap.exists()) {
          setDrop(snap.data());
        } else {
          setError('Drop not found.');
        }
      } catch (err) {
        if (!alive) return;
        setError(err?.message || 'Failed to load drop.');
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [dropId]);

  useEffect(() => {
    if (!drop?.albumId) {
      setAlbum(null);
      setAlbumError('');
      setAlbumLoading(false);
      return;
    }

    let active = true;
    setAlbumLoading(true);
    setAlbumError('');

    (async () => {
      try {
        const snap = await getDoc(doc(db, 'sets', drop.albumId));
        if (!active) return;

        if (snap.exists()) {
          setAlbum(snap.data());
          setAlbumError('');
        } else {
          setAlbum(null);
          setAlbumError('Set not found.');
        }
      } catch (err) {
        if (!active) return;
        console.error('album fetch error:', err);
        setAlbum(null);
        setAlbumError('Unable to load set details right now.');
      } finally {
        if (active) setAlbumLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [drop?.albumId]);

  useEffect(() => {
    if (!drop?.artistId) {
      setArtist(null);
      setArtistError('');
      setArtistLoading(false);
      return;
    }

    let active = true;
    setArtistLoading(true);
    setArtistError('');

    (async () => {
      try {
        const snap = await getDoc(doc(db, 'artists', drop.artistId));
        if (!active) return;

        if (snap.exists()) {
          setArtist(snap.data());
        } else {
          setArtist(null);
          setArtistError('Artist not found.');
        }
      } catch (err) {
        if (!active) return;
        console.error('artist fetch error:', err);
        setArtist(null);
        setArtistError('Unable to load artist right now.');
      } finally {
        if (active) setArtistLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [drop?.artistId]);

  const mediaUrl = drop?.mediaUrl || drop?.mediaPhoto || '';
  const derivedMediaType = drop?.mediaType || (mediaUrl && mediaUrl.toLowerCase().endsWith('.mp4') ? 'video' : mediaUrl ? 'image' : '');
  const purchaseTypeLabel = drop?.purchaseType === 'purchase_now' ? 'Purchase Now' : drop?.purchaseType === 'bid' ? 'Bid' : '';
  const isPurchaseNow = drop?.purchaseType === 'purchase_now';
  const hasPurchasePrice = isPurchaseNow && typeof drop?.purchaseNowAmount === 'number' && !Number.isNaN(drop.purchaseNowAmount);
  const purchaseCurrency = drop?.purchaseNowCurrency && SUPPORTED_PURCHASE_CURRENCIES.includes(drop.purchaseNowCurrency)
    ? drop.purchaseNowCurrency
    : SUPPORTED_PURCHASE_CURRENCIES[0];
  const formattedPurchaseAmount = hasPurchasePrice
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: purchaseCurrency }).format(drop.purchaseNowAmount)
    : '';
  const purchasedByUid = drop?.purchasedByUid || '';
  const isSoldOut = Boolean(purchasedByUid);
  const isOwnedByCurrentUser = isSoldOut && purchasedByUid === appUser?.id;
  const showPurchaseButton = isPurchaseNow && hasPurchasePrice && !isSoldOut;

  const detailRows = useMemo(() => {
    if (!drop) return [];
    const uriValue = drop.uri
      ? (
          <a
            href={drop.uri}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.detailLink}
          >
            {drop.uri}
          </a>
        )
      : '';
    const albumName = drop.albumId
      ? album?.title || drop.albumTitle || drop.albumId
      : '';
    const albumValue = drop.albumId
      ? (
          <button
            type="button"
            className={styles.detailLinkButton}
            onClick={() => navigate(`/album/${drop.albumId}`)}
          >
            {albumName}
          </button>
        )
      : '';

    return [
      { label: 'Set', value: albumValue },
      { label: 'Drop ID', value: drop.dropId },
      { label: 'Token ID', value: drop.tokenId },
      { label: 'Type', value: drop.type },
      { label: 'Version', value: drop.dropVersion?.toUpperCase() },
      {
        label: 'Artist',
        value: drop.artistId ? (
          <button
            type="button"
            className={styles.detailLinkButton}
            onClick={() => navigate(`/artist/${drop.artistId}`)}
          >
            {artist?.artistFullName || drop.artistName || drop.artistId}
          </button>
        ) : '',
      },
      { label: 'Owned By UID', value: drop.ownedByUid },
      {
        label: 'Purchased By',
        value: purchasedByUid
          ? purchasedByUid === appUser?.id
            ? 'You'
            : purchasedByUid
          : '',
      },
      { label: 'URI', value: uriValue },
      { label: 'Purchase Type', value: purchaseTypeLabel },
      { label: 'Price', value: hasPurchasePrice ? formattedPurchaseAmount : '' },
      { label: 'Currency', value: hasPurchasePrice ? purchaseCurrency : '' },
    ].filter((row) => row.value);
  }, [
    album,
    artist?.artistFullName,
    drop,
    formattedPurchaseAmount,
    hasPurchasePrice,
    appUser?.id,
    purchasedByUid,
    navigate,
    purchaseCurrency,
    purchaseTypeLabel,
  ]);

  const albumNameDisplay = drop?.albumId ? album?.title || drop.albumTitle || drop.albumId : '';
  const artistNameDisplay = drop?.artistId ? artist?.artistFullName || drop.artistName || 'Artist' : '';
  const artistAvatar = artist?.artistProfilePhoto || '';
  const hasMoreDetails = detailRows.length > 0;
  const toggleLabel = showDetails ? 'Hide Details' : 'More Info';

  const handlePurchaseClick = useCallback(async () => {
    if (!drop?.dropId) return;
    if (!appUser?.id) {
      setCheckoutError('You need an account to purchase this drop.');
      return;
    }
    if (purchasedByUid) {
      setCheckoutError(
        purchasedByUid === appUser.id
          ? 'You already own this collectible.'
          : 'This collectible has already been claimed by another collector.'
      );
      return;
    }
    try {
      setCheckoutBusy(true);
      setCheckoutError('');

      const stripe = await getStripeClient();
      if (!stripe) {
        throw new Error('Stripe is not configured.');
      }

      const response = await fetch(CREATE_CHECKOUT_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          dropId: drop.dropId,
          baseUrl: window.location.origin,
          buyerUid: appUser.id,
          buyerEmail: appUser.email || '',
          stripeCustomerId: appUser.stripeCustomerId || '',
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.id) {
        throw new Error(data?.error || 'Failed to start checkout.');
      }

      if (data.url) {
        window.location.href = data.url;
        return;
      }

      const { error: stripeError } = await stripe.redirectToCheckout({ sessionId: data.id });
      if (stripeError) {
        throw new Error(stripeError.message || 'Checkout redirect failed.');
      }
    } catch (err) {
      console.error(err);
      setCheckoutError(err?.message || 'Unable to launch checkout.');
    } finally {
      setCheckoutBusy(false);
    }
  }, [appUser?.email, appUser?.id, appUser?.stripeCustomerId, drop?.dropId, purchasedByUid]);

  const handleFastPurchase = useCallback(async () => {
    if (!drop?.dropId) return;
    if (!appUser?.id) {
      setCheckoutError('You need an account to purchase this drop.');
      return;
    }
    if (purchasedByUid) {
      setCheckoutError(
        purchasedByUid === appUser.id
          ? 'You already own this collectible.'
          : 'This collectible has already been claimed.'
      );
      return;
    }
    try {
      setCheckoutBusy(true);
      setCheckoutError('');
      await updateDoc(doc(db, 'drops', drop.dropId), {
        purchasedByUid: appUser.id,
        purchasedAt: serverTimestamp(),
        buyerEmail: appUser.email || '',
      });
      setDrop((prev) => (prev ? { ...prev, purchasedByUid: appUser.id } : prev));
    } catch (err) {
      console.error('fast purchase error:', err);
      setCheckoutError(err?.message || 'Unable to complete fast purchase.');
    } finally {
      setCheckoutBusy(false);
    }
  }, [appUser?.email, appUser?.id, drop?.dropId, purchasedByUid]);

  return (
    <div className={layoutStyles.detailPage}>
      <TopBar variant="back" backLabel="Back" onBack={handleBack} />

      <div className={`${layoutStyles.detailContent} ${styles.pageShell}`}>
        {loading ? (
          <p>Loading…</p>
        ) : error ? (
          <p style={{ color: '#b91c1c' }}>{error}</p>
        ) : drop ? (
          <div className={styles.heroWrapper}>
            <div className={styles.heroShell}>
              <div className={styles.sectionTitle}>Drop</div>
              <div className={styles.heroMediaFrame}>
                {mediaUrl ? (
                  derivedMediaType === 'video' ? (
                    <video src={mediaUrl} controls playsInline />
                  ) : (
                    <img src={mediaUrl} alt={drop.title || 'Drop media'} />
                  )
                ) : (
                  <div className={styles.heroPlaceholder}>No Media</div>
                )}
              </div>
            </div>

            <div className={styles.infoCard}>
              <div>
                <h1 className={styles.title}>{drop.title || 'Untitled Drop'}</h1>
                {drop.description ? (
                  <p className={styles.description}>{drop.description}</p>
                ) : null}
                {isOwnedByCurrentUser ? (
                  <div className={styles.dropStatusOwned}>You already own this collectible.</div>
                ) : isSoldOut ? (
                  <div className={styles.dropStatusSold}>This collectible has been claimed by another collector.</div>
                ) : null}
                {drop.artistId ? (
                  <div className={styles.artistRow}>
                    <button
                      type="button"
                      className={styles.artistChip}
                      onClick={() => navigate(`/artist/${drop.artistId}`)}
                    >
                      {artistAvatar ? (
                        <img src={artistAvatar} alt={artistNameDisplay} className={styles.artistAvatar} />
                      ) : (
                        <div className={styles.artistAvatarFallback}>
                          <FiUser size={16} />
                        </div>
                      )}
                      <div className={styles.artistMeta}>
                        <span className={styles.artistLabel}>Artist</span>
                        <span className={styles.artistName}>{artistNameDisplay}</span>
                      </div>
                    </button>
                    {artistLoading ? (
                      <span className={styles.artistStatus}>Loading…</span>
                    ) : artistError ? (
                      <span className={styles.artistError}>{artistError}</span>
                    ) : null}
                  </div>
                ) : null}
                {drop.albumId ? (
                  <>
                    <div className={styles.albumBadge}>
                      <span>Set</span>
                      <button
                        type="button"
                        className={styles.albumLink}
                        onClick={() => navigate(`/album/${drop.albumId}`)}
                      >
                        {albumNameDisplay}
                      </button>
                    </div>
                    {albumLoading ? (
                      <p className={styles.albumMeta}>Loading set details…</p>
                    ) : albumError ? (
                      <p className={styles.albumErrorText}>{albumError}</p>
                    ) : null}
                  </>
                ) : null}
              </div>

              {showPurchaseButton && (
                <div className={styles.purchaseCard}>
                  <div className={styles.purchaseCopy}>
                    <h2>Purchase Now</h2>
                    <p>Own this collectible instantly. Payments will be enabled soon.</p>
                  </div>
                  <button
                    type="button"
                    className={styles.purchaseButton}
                    onClick={handlePurchaseClick}
                    disabled={checkoutBusy}
                  >
                    {checkoutBusy ? 'Redirecting…' : `Purchase Now · ${formattedPurchaseAmount}`}
                  </button>
                </div>
              )}

              {!isSoldOut && (
                <button
                  type="button"
                  className={styles.fastPurchaseButton}
                  onClick={handleFastPurchase}
                  disabled={checkoutBusy}
                >
                  {checkoutBusy ? 'Processing…' : 'Fast Purchase'}
                </button>
              )}

              {checkoutError && (
                <p className={styles.checkoutError}>{checkoutError}</p>
              )}

              {hasMoreDetails && (
                <>
                  <button
                    type="button"
                    className={styles.moreInfoToggle}
                    onClick={() => setShowDetails((prev) => !prev)}
                    aria-expanded={showDetails}
                  >
                    {toggleLabel}
                    <FiChevronDown
                      className={`${styles.toggleIcon} ${showDetails ? styles.openIcon : ''}`}
                      size={18}
                    />
                  </button>

                  <div
                    className={`${styles.detailsPanel} ${showDetails ? styles.detailsPanelOpen : ''}`}
                    aria-hidden={!showDetails}
                  >
                    <dl className={styles.detailList}>
                      {detailRows.map((row) => (
                        <DetailRow key={row.label} label={row.label} value={row.value} />
                      ))}
                    </dl>
                  </div>
                </>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function DetailRow({ label, value }) {
  if (!value) return null;
  return (
    <div className={styles.detailRow}>
      <dt className={styles.detailLabel}>{label}</dt>
      <dd className={styles.detailValue}>{value}</dd>
    </div>
  );
}
