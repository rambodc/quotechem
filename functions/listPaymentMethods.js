import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { STRIPE_SECRET_KEY, getStripe, db } from './stripeClient.js';

export const listPaymentMethods = onCall(
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
      return { methods: [] };
    }

    const stripe = getStripe();
    try {
      const paymentMethods = await stripe.paymentMethods.list({
        customer: customerId,
        type: 'card',
      });

      const methods = (paymentMethods.data || []).map((pm) => ({
        id: pm.id,
        brand: pm.card?.brand || '',
        last4: pm.card?.last4 || '',
        expMonth: pm.card?.exp_month || '',
        expYear: pm.card?.exp_year || '',
        country: pm.card?.country || '',
      }));

      return { methods };
    } catch (err) {
      throw new HttpsError('internal', err?.message || 'Unable to list payment methods.');
    }
  }
);
