import React, { useCallback, useContext, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import TopBar from '../components/TopBar';
import layoutStyles from '../styles/layout.module.css';
import styles from './DropDetail.module.css';
import { auth, db } from '../firebase';
import { UserContext } from '../App';
import { getStripeClient } from '../services/stripe';

const CREATE_CHECKOUT_URL =
  process.env.REACT_APP_CREATE_STRIPE_SESSION_URL || '/api/createStripeCheckoutSession';

export default function DropDetail() {
  const { dropId } = useParams();
  const appUser = useContext(UserContext);
  const navigate = useNavigate();

  const [drop, setDrop] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');

  const handleBack = useCallback(() => {
    if (window.history.length > 2) navigate(-1);
    else navigate('/home');
  }, [navigate]);

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

  const formattedPrice = (() => {
    if (!drop?.purchaseNowAmount) return '';
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: (drop.purchaseNowCurrency || 'usd').toUpperCase(),
      }).format(drop.purchaseNowAmount);
    } catch {
      return `${drop.purchaseNowAmount} ${drop.purchaseNowCurrency || ''}`;
    }
  })();

  const handlePurchase = useCallback(async () => {
    if (!drop?.dropId || !appUser?.id) {
      setCheckoutError('You need to sign in to purchase.');
      return;
    }
    try {
      setCheckoutBusy(true);
      setCheckoutError('');

      const stripe = await getStripeClient();
      if (!stripe) throw new Error('Stripe is not configured.');

      const currentUser = auth.currentUser;
      const idToken = await currentUser?.getIdToken();
      if (!idToken) throw new Error('Please sign in again.');

      const response = await fetch(CREATE_CHECKOUT_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          dropId: drop.dropId,
          baseUrl: window.location.origin,
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
      if (stripeError) throw new Error(stripeError.message || 'Checkout redirect failed.');
    } catch (err) {
      console.error(err);
      setCheckoutError(err?.message || 'Unable to launch checkout.');
    } finally {
      setCheckoutBusy(false);
    }
  }, [appUser?.email, appUser?.id, appUser?.stripeCustomerId, drop?.dropId]);

  if (loading) return null;

  return (
    <div className={styles.pageShell}>
      <TopBar backLabel="Back" onBack={handleBack} />
      {error ? <p className={styles.description}>{error}</p> : null}
      {drop ? (
        <>
          <div className={styles.heroWrapper}>
            <div className={styles.heroShell}>
              <div className={styles.heroMediaFrame}>
                {drop.mediaUrl ? (
                  drop.mediaUrl.match(/\\.mp4|\\.webm|\\.mov/i) ? (
                    <video controls src={drop.mediaUrl} />
                  ) : (
                    <img src={drop.mediaUrl} alt={drop.title || 'Drop'} />
                  )
                ) : (
                  <div className={styles.heroPlaceholder}>DROP</div>
                )}
              </div>
            </div>
          </div>

          <div className={styles.infoCard}>
            <h1 className={styles.title}>{drop.title || 'Untitled Drop'}</h1>
            <p className={styles.description}>
              {drop.description || 'No description yet.'}
            </p>

            <div className={styles.albumBadge}>
              Price: <strong>{formattedPrice || 'TBD'}</strong>
            </div>

            <button
              className={styles.checkoutButton}
              onClick={handlePurchase}
              disabled={checkoutBusy}
            >
              {checkoutBusy ? 'Starting checkout…' : 'Purchase Now'}
            </button>
            {checkoutError ? <p className={styles.error}>{checkoutError}</p> : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
