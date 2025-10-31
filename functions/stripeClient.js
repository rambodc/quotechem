import { defineSecret } from 'firebase-functions/params';
import admin from 'firebase-admin';
import Stripe from 'stripe';

export const STRIPE_SECRET_KEY = defineSecret('STRIPE_SECRET_KEY');

try {
  admin.app();
} catch {
  admin.initializeApp();
}

export const db = admin.firestore();

let stripeClient = null;
export function getStripe() {
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

export { admin };
