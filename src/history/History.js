// src/history/History.js
import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import TopBar from '../components/TopBar';
import layoutStyles from '../styles/layout.module.css';
import styles from './History.module.css';
import { db, functions } from '../firebase';
import { UserContext } from '../App';

function formatAmount(amount, currency) {
  if (typeof amount !== 'number' || Number.isNaN(amount)) return '—';
  const code = currency && typeof currency === 'string' ? currency.toUpperCase() : 'USD';
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${code}`;
  }
}

function formatDate(timestamp) {
  if (!timestamp?.toDate) return 'Pending timestamp';
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(timestamp.toDate());
  } catch {
    return timestamp.toDate().toISOString();
  }
}

export default function History() {
  const appUser = useContext(UserContext);
  const navigate = useNavigate();
  const handleBack = useCallback(() => {
    if (window.history.length > 2) navigate(-1);
    else navigate('/more');
  }, [navigate]);

  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dropsById, setDropsById] = useState({});
  const [cards, setCards] = useState([]);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [cardsError, setCardsError] = useState('');
  const [managingCards, setManagingCards] = useState(false);

  useEffect(() => {
    if (!appUser?.id) {
      setPayments([]);
      setLoading(false);
      setError('');
      return undefined;
    }

    const paymentsRef = collection(db, 'users', appUser.id, 'payments');
    const orderedQuery = query(paymentsRef, orderBy('createdAt', 'desc'));

    let unsubscribe = () => {};
    let usingFallback = false;

    const handleSnapshot = (snapshot) => {
      const list = snapshot.docs.map((docSnap) => {
        const data = docSnap.data() || {};
        return {
          id: docSnap.id,
          dropId: data.dropId || '',
          amountTotal: typeof data.amountTotal === 'number' ? data.amountTotal : null,
          amountTotalCents: typeof data.amountTotalCents === 'number' ? data.amountTotalCents : null,
          currency: data.currency || '',
          status: (data.paymentStatus || '').toLowerCase(),
          createdAt: data.createdAt || null,
        };
      });
      setPayments(list);
      setLoading(false);
      setError('');
    };

    const handleError = (err) => {
      console.error('payments snapshot error:', err);
      if (!usingFallback && err?.code === 'failed-precondition') {
        usingFallback = true;
        unsubscribe();
        unsubscribe = onSnapshot(paymentsRef, handleSnapshot, handleError);
        return;
      }
      setPayments([]);
      setLoading(false);
      setError(err?.message || 'Failed to load payment history.');
    };

    setLoading(true);
    unsubscribe = onSnapshot(orderedQuery, handleSnapshot, handleError);
    return () => unsubscribe();
  }, [appUser?.id]);

  const dropIdsToFetch = useMemo(() => {
    const needed = new Set();
    payments.forEach((payment) => {
      if (payment.dropId && !dropsById[payment.dropId]) {
        needed.add(payment.dropId);
      }
    });
    return Array.from(needed);
  }, [dropsById, payments]);

  useEffect(() => {
    if (dropIdsToFetch.length === 0) return undefined;
    let cancelled = false;

    (async () => {
      const entries = await Promise.all(
        dropIdsToFetch.map(async (dropId) => {
          try {
            const snap = await getDoc(doc(db, 'drops', dropId));
            return { dropId, data: snap.exists() ? snap.data() : null };
          } catch (err) {
            console.error('Failed to load drop for history:', dropId, err);
            return { dropId, data: null };
          }
        })
      );

      if (cancelled) return;
      setDropsById((prev) => {
        const next = { ...prev };
        entries.forEach(({ dropId, data }) => {
          next[dropId] = data;
        });
        return next;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [dropIdsToFetch]);

  useEffect(() => {
    if (!appUser?.id || !appUser?.stripeCustomerId) {
      setCards([]);
      setCardsLoading(false);
      setCardsError(appUser?.id ? 'No payment method on file yet.' : '');
      return;
    }
    let active = true;
    const fetchCards = async () => {
      try {
        setCardsLoading(true);
        setCardsError('');
        const callable = httpsCallable(functions, 'listPaymentMethods');
        const resp = await callable({});
        const methods = Array.isArray(resp?.data?.methods) ? resp.data.methods : [];
        if (!active) return;
        setCards(methods);
        setCardsError(methods.length ? '' : 'No cards on file yet.');
      } catch (err) {
        console.error('list payment methods error:', err);
        if (!active) return;
        setCards([]);
        setCardsError(err?.message || 'Unable to load cards right now.');
      } finally {
        if (active) setCardsLoading(false);
      }
    };
    fetchCards();
    return () => {
      active = false;
    };
  }, [appUser?.id, appUser?.stripeCustomerId]);

  useEffect(() => {
    const handleFocus = () => setManagingCards(false);
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  const handleManageCards = useCallback(async () => {
    if (!appUser?.stripeCustomerId) {
      setCardsError('No Stripe customer found for this account yet.');
      return;
    }
    try {
      setManagingCards(true);
      const callable = httpsCallable(functions, 'createCustomerPortalSession');
      const resp = await callable({
        returnUrl: window.location.origin + '/payment',
      });
      if (resp?.data?.url) {
        window.location.href = resp.data.url;
      } else {
        throw new Error('Unable to create portal session.');
      }
    } catch (err) {
      console.error('manage cards error:', err);
      setCardsError(err?.message || 'Unable to open card management.');
      setManagingCards(false);
    }
  }, [appUser?.stripeCustomerId]);

  const content = useMemo(() => {
    if (loading) {
      return <p className={styles.loadingState}>Loading transactions…</p>;
    }
    if (error) {
      return <p className={styles.errorState}>{error}</p>;
    }
    if (payments.length === 0) {
      return <p className={styles.emptyState}>No transactions yet. Completed purchases will appear here.</p>;
    }

    return (
      <div className={styles.list}>
        {payments.map((payment) => {
          const drop = payment.dropId ? dropsById[payment.dropId] : null;
          const amount =
            typeof payment.amountTotal === 'number'
              ? payment.amountTotal
              : typeof payment.amountTotalCents === 'number'
              ? payment.amountTotalCents / 100
              : null;
          const currency = (payment.currency || drop?.purchaseNowCurrency || 'USD').toUpperCase();
          const amountDisplay = formatAmount(amount, currency);
          const createdLabel = formatDate(payment.createdAt);
          const status = payment.status || 'pending';
          const statusClass =
            status === 'paid'
              ? `${styles.statusChip} ${styles.statusPaid}`
              : status === 'payment_failed' || status === 'failed'
              ? `${styles.statusChip} ${styles.statusFailed}`
              : `${styles.statusChip} ${styles.statusPending}`;
          const dropTitle = drop?.title || 'Drop';
          const albumTitle = drop?.albumTitle || '';

          return (
            <div key={payment.id} className={styles.entry}>
              <div className={styles.entryHeader}>
                <div>
                  <h3 className={styles.entryTitle}>{dropTitle}</h3>
                  {albumTitle ? <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 13 }}>{albumTitle}</p> : null}
                </div>
                <span className={styles.amount}>{amountDisplay}</span>
              </div>
              <div className={styles.metaRow}>
                <span className={statusClass}>{status.replace(/_/g, ' ')}</span>
                <span>{createdLabel}</span>
                {payment.dropId ? <span>Drop ID: {payment.dropId}</span> : null}
              </div>
              {payment.dropId ? (
                <button
                  type="button"
                  className={styles.dropLink}
                  onClick={() => navigate(`/drop/${payment.dropId}`)}
                >
                  View drop details
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  }, [dropsById, error, loading, navigate, payments]);

  return (
    <div className={layoutStyles.detailPage}>
      <TopBar variant="back" backLabel="Back" onBack={handleBack} />
      <div className={styles.pageShell}>
        <header className={styles.header}>
          <h1>Payment</h1>
          <p>Manage your cards and review your payments.</p>
        </header>

        <section className={styles.cardsSection}>
          <div className={styles.cardsHeader}>
            <h2>Cards on file</h2>
            <button type="button" className={styles.manageButton} onClick={handleManageCards}>
              {managingCards ? 'Opening…' : 'Add / Edit Card'}
            </button>
          </div>
          {cardsLoading ? (
            <p className={styles.loadingState}>Loading cards…</p>
          ) : cardsError ? (
            <p className={styles.errorState}>{cardsError}</p>
          ) : cards.length === 0 ? (
            <p className={styles.emptyState}>No cards on file yet.</p>
          ) : (
            <div className={styles.cardsList}>
              {cards.map((card) => (
                <div key={card.id} className={styles.cardEntry}>
                  <div>
                    <div className={styles.cardBrand}>{card.brand?.toUpperCase() || 'CARD'}</div>
                    <div className={styles.cardMeta}>
                      **** **** **** {card.last4 || '----'} · Expires {card.expMonth}/{card.expYear}
                    </div>
                  </div>
                  <div className={styles.cardMeta}>Country: {card.country || '—'}</div>
                </div>
              ))}
            </div>
          )}
        </section>

        {content}
      </div>
      {managingCards ? <div className={styles.overlay}>Opening card manager…</div> : null}
    </div>
  );
}
