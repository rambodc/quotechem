import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { STRIPE_SECRET_KEY, getStripe, db } from './stripeClient.js';

export const createSetupIntent = onCall(
  {
    secrets: [STRIPE_SECRET_KEY],
  },
  async (request) => {
    const { auth } = request;
    if (!auth?.uid) {
      throw new HttpsError('unauthenticated', 'Authentication required.');
    }
    const uid = auth.uid;
    const userSnap = await db.collection('users').doc(uid).get();
    if (!userSnap.exists) {
      throw new HttpsError('not-found', 'User not found.');
    }
    const user = userSnap.data() || {};
    const customerId = String(user.stripeCustomerId || '').trim();
    if (!customerId) {
      throw new HttpsError('failed-precondition', 'Stripe customer not found for this user.');
    }

    try {
      const stripe = getStripe();
      const intent = await stripe.setupIntents.create({
        customer: customerId,
        payment_method_types: ['card'],
        usage: 'off_session',
      });
      return { clientSecret: intent.client_secret };
    } catch (err) {
      throw new HttpsError('internal', err?.message || 'Unable to create setup intent.');
    }
  }
);
