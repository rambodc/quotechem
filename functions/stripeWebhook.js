import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { STRIPE_SECRET_KEY, getStripe, db, admin } from './stripeClient.js';

const STRIPE_WEBHOOK_SECRET = defineSecret('STRIPE_WEBHOOK_SECRET');

export const stripeWebhook = onRequest(
  {
    secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET],
    cors: false,
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    const signature = req.headers['stripe-signature'];
    if (!signature) {
      res.status(400).send('Missing signature');
      return;
    }

    let event;
    try {
      const stripe = getStripe();
      const secret = STRIPE_WEBHOOK_SECRET.value();
      const rawBody = req.rawBody ? req.rawBody : Buffer.from(JSON.stringify(req.body));
      event = stripe.webhooks.constructEvent(rawBody, signature, secret);
    } catch (err) {
      logger.error('[stripeWebhook] signature verification failed', err?.message || err);
      res.status(400).send('Invalid signature');
      return;
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object;
          const { buyerUid, dropId } = session.metadata || {};
          if (!buyerUid) break;

          const amountTotal = typeof session.amount_total === 'number' ? session.amount_total : null;
          const userRef = db.collection('users').doc(buyerUid);
          const paymentRefId = session.payment_intent ? String(session.payment_intent) : String(session.id);
          await userRef.collection('payments').doc(paymentRefId).set(
            {
              stripeSessionId: session.id,
              paymentIntentId: session.payment_intent || null,
              customerId: session.customer || null,
              dropId: dropId || null,
              currency: session.currency ? session.currency.toUpperCase() : null,
              amountTotalCents: amountTotal,
              amountTotal: amountTotal !== null ? amountTotal / 100 : null,
              paymentStatus: session.payment_status || null,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
              raw: session,
            },
            { merge: true }
          );

          if (dropId) {
            const dropRef = db.collection('drops').doc(dropId);
            await db.runTransaction(async (transaction) => {
              const dropSnap = await transaction.get(dropRef);
              if (!dropSnap.exists) return;
              const dropData = dropSnap.data() || {};

              const alreadyPurchased = Boolean(dropData.purchasedByUid);
              const isSameBuyer = alreadyPurchased && dropData.purchasedByUid === buyerUid;
              if (alreadyPurchased && !isSameBuyer) {
                logger.warn('[stripeWebhook] drop already purchased by another user', { dropId, buyerUid });
                return;
              }

              const updates = {
                lastPurchaseAt: admin.firestore.FieldValue.serverTimestamp(),
                lastPurchaseBuyerUid: buyerUid,
                purchasedByUid: buyerUid,
                purchasedAt: admin.firestore.FieldValue.serverTimestamp(),
                purchasedPaymentIntentId: session.payment_intent || null,
                purchasedCurrency: session.currency ? session.currency.toUpperCase() : null,
                purchasedAmountCents: amountTotal,
              };

              transaction.set(dropRef, updates, { merge: true });

              const albumId = dropData.albumId || dropData.albumID; // fallback if older casing
              if (albumId) {
                const albumRef = db.collection('albums').doc(albumId);
                transaction.set(
                  albumRef,
                  {
                    lastPurchaseAt: admin.firestore.FieldValue.serverTimestamp(),
                    purchasedDropCount: admin.firestore.FieldValue.increment(isSameBuyer ? 0 : 1),
                  },
                  { merge: true }
                );
              }
            });
          }
         break;
       }
        case 'payment_intent.payment_failed': {
          const intent = event.data.object;
          const buyerUid = intent.metadata?.buyerUid;
          if (!buyerUid) break;
          const paymentRefId = String(intent.id);
          await db
            .collection('users')
            .doc(buyerUid)
            .collection('payments')
            .doc(paymentRefId)
            .set(
              {
                paymentIntentId: intent.id,
                customerId: intent.customer || null,
                dropId: intent.metadata?.dropId || null,
                currency: intent.currency ? intent.currency.toUpperCase() : null,
                amountTotalCents: typeof intent.amount === 'number' ? intent.amount : null,
                amountTotal: typeof intent.amount === 'number' ? intent.amount / 100 : null,
                paymentStatus: intent.status || 'payment_failed',
                failureCode: intent.last_payment_error?.code || null,
                failureMessage: intent.last_payment_error?.message || null,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              },
              { merge: true }
            );
          break;
        }
        default:
          // Ignore other events for now
          break;
      }

      res.status(200).send('ok');
    } catch (err) {
      logger.error('[stripeWebhook] processing error', err);
      res.status(500).send('error');
    }
  }
);
