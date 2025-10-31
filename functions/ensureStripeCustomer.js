import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { STRIPE_SECRET_KEY, getStripe, db, admin } from './stripeClient.js';

export const ensureStripeCustomer = onCall(
  {
    secrets: [STRIPE_SECRET_KEY],
  },
  async (request) => {
    const { auth, data } = request;
    if (!auth?.uid) {
      throw new HttpsError('unauthenticated', 'Authentication required.');
    }

    const uid = auth.uid;
    const userRef = db.collection('users').doc(uid);
    const snap = await userRef.get();
    if (!snap.exists) {
      throw new HttpsError('not-found', 'User record not found.');
    }

    const user = snap.data() || {};
    const providedEmail = typeof data?.email === 'string' ? data.email.trim() : '';
    const providedName = typeof data?.name === 'string' ? data.name.trim() : '';

    const email = providedEmail || String(user.email || user.contactEmail || '').trim();
    const name = providedName || [user.firstName, user.lastName].filter(Boolean).join(' ').trim();

    const stripe = getStripe();
    let stripeCustomerId = String(user.stripeCustomerId || '').trim();

    if (stripeCustomerId) {
      try {
        const customer = await stripe.customers.retrieve(stripeCustomerId);
        const updates = {};
        let needsUpdate = false;
        if (email && customer?.email !== email) {
          updates.email = email;
          needsUpdate = true;
        }
        if (name && customer?.name !== name) {
          updates.name = name;
          needsUpdate = true;
        }
        if (needsUpdate) {
          await stripe.customers.update(stripeCustomerId, updates);
        }
      } catch (err) {
        logger.warn('[ensureStripeCustomer] stored customer invalid, recreating', err?.message || err);
        stripeCustomerId = '';
      }
    }

    if (!stripeCustomerId) {
      const customerPayload = {
        metadata: {
          uid,
        },
      };
      if (email) customerPayload.email = email;
      if (name) customerPayload.name = name;

      const customer = await stripe.customers.create(customerPayload);
      stripeCustomerId = customer.id;

      await userRef.set(
        {
          stripeCustomerId,
          stripeCustomerCreatedAt: admin.firestore.FieldValue.serverTimestamp(),
          email: user.email || email || null,
          firstName: user.firstName || null,
          lastName: user.lastName || null,
        },
        { merge: true }
      );
    }

    return { stripeCustomerId };
  }
);
