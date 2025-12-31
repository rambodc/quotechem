import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { STRIPE_SECRET_KEY, getStripe, db, admin } from './stripeClient.js';

// test3

function parseBody(body) {
  if (!body) return {};
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch (error) {
      logger.warn('[createStripeCheckoutSession] Unable to parse JSON body', error?.message || error);
      return {};
    }
  }
  return body;
}

function normalizeCurrency(raw) {
  const str = String(raw || '').trim();
  if (!str) return 'usd';
  return str.toLowerCase();
}

function safeNumber(value) {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return null;
  return num;
}

function inferOrigin(req) {
  return req.get('origin') || req.get('Origin') || (() => {
    const referer = req.get('referer') || req.get('Referer');
    if (!referer) return '';
    try {
      return new URL(referer).origin;
    } catch {
      return '';
    }
  })();
}

export const createStripeCheckoutSession = onRequest(
  {
    cors: true,
    secrets: [STRIPE_SECRET_KEY],
  },
  async (req, res) => {
    if (req.method === 'OPTIONS') {
      const origin = inferOrigin(req) || '*';
      res.set('Access-Control-Allow-Origin', origin);
      res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.status(204).send('');
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    const origin = inferOrigin(req) || '*';
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    try {
      // Enforce Firebase Auth: expect Authorization: Bearer <idToken>
      const authHeader = req.get('Authorization') || '';
      const match = authHeader.match(/^Bearer (.+)$/i);
      if (!match) {
        res.status(401).json({ error: 'unauthenticated' });
        return;
      }
      let decoded;
      try {
        decoded = await admin.auth().verifyIdToken(match[1]);
      } catch (verifyErr) {
        logger.warn('[createStripeCheckoutSession] invalid id token', verifyErr?.message || verifyErr);
        res.status(401).json({ error: 'unauthenticated' });
        return;
      }

      const payload = parseBody(req.body);
      const dropId = String(payload.dropId || '').trim();
      if (!dropId) {
        res.status(400).json({ error: 'missing_drop_id' });
        return;
      }

      const buyerUid = String(decoded.uid || '').trim();
      if (!buyerUid) {
        res.status(401).json({ error: 'unauthenticated' });
        return;
      }

      // Always use the email on file; do not accept overrides from the client
      const buyerEmail = ''; // ignored on purpose
      const providedCustomerId = String(payload.stripeCustomerId || '').trim();

      const dropSnap = await db.collection('drops').doc(dropId).get();
      if (!dropSnap.exists) {
        res.status(404).json({ error: 'drop_not_found' });
        return;
      }

      const drop = dropSnap.data() || {};
      if ((drop.purchaseType || '') !== 'purchase_now') {
        res.status(400).json({ error: 'drop_not_purchasable' });
        return;
      }

      const amount = safeNumber(drop.purchaseNowAmount);
      const currency = normalizeCurrency(drop.purchaseNowCurrency || 'usd');
      if (!amount || amount <= 0) {
        res.status(400).json({ error: 'invalid_amount' });
        return;
      }

      const userRef = db.collection('users').doc(buyerUid);
      const userSnap = await userRef.get();
      if (!userSnap.exists) {
        res.status(404).json({ error: 'user_not_found' });
        return;
      }

      const user = userSnap.data() || {};
      const primaryEmail = String(user.email || user.contactEmail || '').trim();
      const effectiveEmail = primaryEmail;

      const stripe = getStripe();
      const unitAmount = Math.round(amount * 100);
      const displayName = drop.title || `Drop ${dropId}`;

      let stripeCustomerId = providedCustomerId || String(user.stripeCustomerId || '').trim();
      if (stripeCustomerId) {
        try {
          await stripe.customers.retrieve(stripeCustomerId);
        } catch (retrieveErr) {
          logger.warn('[createStripeCheckoutSession] provided customer invalid, will recreate', retrieveErr?.message || retrieveErr);
          stripeCustomerId = '';
        }
      }

      if (!stripeCustomerId) {
        try {
          const customer = await stripe.customers.create({
            email: effectiveEmail || undefined,
            metadata: {
              uid: buyerUid,
            },
          });
          stripeCustomerId = customer.id;
          await userRef.set(
            {
              stripeCustomerId,
              stripeCustomerCreatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
        } catch (customerError) {
          logger.error('[createStripeCheckoutSession] failed_to_create_customer', customerError);
          res.status(500).json({ error: 'customer_creation_failed' });
          return;
        }
      } else if (effectiveEmail) {
        try {
          await stripe.customers.update(stripeCustomerId, {
            email: effectiveEmail,
          });
          await userRef.set(
            {
              stripeCustomerId,
              email: user.email || effectiveEmail,
            },
            { merge: true }
          );
        } catch (updateErr) {
          logger.warn('[createStripeCheckoutSession] unable to update customer email', updateErr?.message || updateErr);
        }
      }

      const baseUrl = payload.baseUrl || origin || 'https://example.com';
      const successUrl = payload.successUrl || `${baseUrl.replace(/\/$/, '')}/drop/${dropId}?status=success`;
      const cancelUrl = payload.cancelUrl || `${baseUrl.replace(/\/$/, '')}/drop/${dropId}?status=cancelled`;

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        customer: stripeCustomerId || undefined,
        payment_intent_data: {
          setup_future_usage: 'off_session',
          metadata: {
            dropId,
            buyerUid,
          },
        },
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency,
              unit_amount: unitAmount,
              product_data: {
                name: displayName,
                metadata: {
                  dropId,
                },
              },
            },
          },
        ],
        metadata: {
          dropId,
          buyerUid,
        },
        success_url: successUrl,
        cancel_url: cancelUrl,
      });

      res.status(200).json({ id: session.id, url: session.url });
    } catch (error) {
      logger.error('[createStripeCheckoutSession] error', error);
      res.status(500).json({ error: 'internal_error' });
    }
  }
);
