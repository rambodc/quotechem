import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { STRIPE_SECRET_KEY, getStripe, db } from './stripeClient.js';

export const createCustomerPortalSession = onCall(
  {
    secrets: [STRIPE_SECRET_KEY],
  },
  async (request) => {
    const { auth, data } = request;
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

    const returnUrl = typeof data?.returnUrl === 'string' && data.returnUrl ? data.returnUrl : 'https://example.com';

    try {
      const stripe = getStripe();
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
      });
      return { url: session.url };
    } catch (err) {
      throw new HttpsError('internal', err?.message || 'Unable to create customer portal session.');
    }
  }
);
