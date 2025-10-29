// Test2



import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import admin from 'firebase-admin';
import Stripe from 'stripe';

const STRIPE_SECRET_KEY = defineSecret('STRIPE_SECRET_KEY');

try { admin.app(); } catch { admin.initializeApp(); }
const db = admin.firestore();

let stripeClient = null;
function getStripe() {
  if (!stripeClient) {
    const secret = STRIPE_SECRET_KEY.value();
    if (!secret) {
      throw new Error('missing_stripe_secret');
    }
    stripeClient = new Stripe(secret, {
      apiVersion: '2023-10-16',
    });
  }
  return stripeClient;
}

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
      const payload = parseBody(req.body);
      const dropId = String(payload.dropId || '').trim();
      if (!dropId) {
        res.status(400).json({ error: 'missing_drop_id' });
        return;
      }

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

      const stripe = getStripe();
      const unitAmount = Math.round(amount * 100);
      const displayName = drop.title || `Drop ${dropId}`;

      const baseUrl = payload.baseUrl || origin || 'https://example.com';
      const successUrl = payload.successUrl || `${baseUrl.replace(/\/$/, '')}/drop/${dropId}?status=success`;
      const cancelUrl = payload.cancelUrl || `${baseUrl.replace(/\/$/, '')}/drop/${dropId}?status=cancelled`;

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
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

