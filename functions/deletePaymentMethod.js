import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { STRIPE_SECRET_KEY, getStripe, db } from './stripeClient.js';

export const deletePaymentMethod = onCall(
  {
    secrets: [STRIPE_SECRET_KEY],
  },
  async (request) => {
    const { auth, data } = request;
    if (!auth?.uid) {
      throw new HttpsError('unauthenticated', 'Authentication required.');
    }
    const paymentMethodId = typeof data?.paymentMethodId === 'string' ? data.paymentMethodId.trim() : '';
    if (!paymentMethodId) {
      throw new HttpsError('invalid-argument', 'paymentMethodId is required.');
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
      // Detach payment method from customer
      await stripe.paymentMethods.detach(paymentMethodId);
      // If it was default, clear it
      const customer = await stripe.customers.retrieve(customerId);
      if (customer?.invoice_settings?.default_payment_method === paymentMethodId) {
        await stripe.customers.update(customerId, {
          invoice_settings: { default_payment_method: null },
        });
      }
      return { ok: true };
    } catch (err) {
      throw new HttpsError('internal', err?.message || 'Unable to delete payment method.');
    }
  }
);
