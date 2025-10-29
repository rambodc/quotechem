// src/services/stripe.js
import { loadStripe } from '@stripe/stripe-js';

let stripePromise = null;

export function getStripeClient() {
  if (!stripePromise) {
    const publishableKey = process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY;
    if (!publishableKey) {
      console.warn('Missing REACT_APP_STRIPE_PUBLISHABLE_KEY. Stripe checkout disabled.');
      return null;
    }
    stripePromise = loadStripe(publishableKey);
  }
  return stripePromise;
}
