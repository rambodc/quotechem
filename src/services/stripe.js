import { loadStripe } from '@stripe/stripe-js';

let stripePromise = null;

export async function getStripeClient() {
  if (!stripePromise) {
    const key = process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY;
    if (!key) {
      console.error('Missing REACT_APP_STRIPE_PUBLISHABLE_KEY');
      return null;
    }
    stripePromise = loadStripe(key);
  }
  return stripePromise;
}
