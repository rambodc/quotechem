import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import admin from 'firebase-admin';
import crypto from 'node:crypto';

const TRANSAK_WEBHOOK_SECRET = defineSecret('TRANSAK_WEBHOOK_SECRET');
const TRANSAK_ENV = defineSecret('TRANSAK_ENV');

try { admin.app(); } catch { admin.initializeApp(); }
const db = admin.firestore();

const STATUS_MAP = new Map([
  ['AWAITING_PAYMENT', 'PENDING'],
  ['AWAITING_DELIVERY', 'PENDING'],
  ['PENDING_DELIVERY', 'PENDING'],
  ['COMPLETED', 'AWAITING_FIREBLOCKS'],
  ['FAILED', 'FAILED'],
  ['CANCELLED', 'CANCELLED'],
  ['EXPIRED', 'EXPIRED'],
  ['REFUNDED', 'REFUNDED'],
]);

function bufferFromRaw(rawBody) {
  if (Buffer.isBuffer(rawBody)) return rawBody;
  if (typeof rawBody === 'string') return Buffer.from(rawBody, 'utf8');
  if (!rawBody) return Buffer.alloc(0);
  return Buffer.from(JSON.stringify(rawBody));
}

function readSignature(req) {
  const headers = req.headers || {};
  return (
    headers['x-transak-signature'] ||
    headers['x-transak-hmac'] ||
    headers['transak-signature'] ||
    ''
  );
}

function verifySignature(rawBody, signature, secret) {
  if (!secret || !signature) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');
  return expected === signature || expected === signature.toLowerCase();
}

function normalizeStatus(status) {
  if (!status) return 'UNKNOWN';
  const norm = String(status).trim().toUpperCase();
  return STATUS_MAP.has(norm) ? norm : norm;
}

function depositLifecycleStatus(status) {
  const norm = normalizeStatus(status);
  return STATUS_MAP.get(norm) || 'PENDING';
}

function parseWebhookBody(rawBuffer) {
  try {
    return JSON.parse(rawBuffer.toString('utf8'));
  } catch (err) {
    logger.error('[handleTransakWebhook] Failed to parse body', err);
    return null;
  }
}

async function findDepositRef(orderId, sessionId) {
  if (orderId) {
    const snap = await db.collection('deposits').where('transak.orderId', '==', orderId).limit(1).get();
    if (!snap.empty) return snap.docs[0].ref;
  }
  if (sessionId) {
    const snap = await db.collection('deposits').where('transak.sessionId', '==', sessionId).limit(1).get();
    if (!snap.empty) return snap.docs[0].ref;
  }
  return null;
}

export const handleTransakWebhook = onRequest({
  secrets: [TRANSAK_WEBHOOK_SECRET, TRANSAK_ENV],
  region: 'us-central1',
  maxInstances: 10,
}, async (req, res) => {
  try {
    if (req.method === 'GET') {
      return res.status(200).send('ok');
    }
    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'method_not_allowed' });
    }

    const secret = TRANSAK_WEBHOOK_SECRET.value();
    const envName = (TRANSAK_ENV.value() || 'STAGING').toUpperCase();
    if (!secret) {
      logger.error('[handleTransakWebhook] Missing TRANSAK_WEBHOOK_SECRET');
      return res.status(500).json({ ok: false, error: 'webhook_secret_missing' });
    }

    const signature = readSignature(req);
    const rawBody = bufferFromRaw(req.rawBody);
    if (!verifySignature(rawBody, signature, secret)) {
      logger.warn('[handleTransakWebhook] Invalid signature', { signature });
      return res.status(401).json({ ok: false, error: 'invalid_signature' });
    }

    const payload = parseWebhookBody(rawBody);
    if (!payload) {
      return res.status(400).json({ ok: false, error: 'invalid_json' });
    }

    const data = payload?.data || payload;
    const orderId = data?.orderId || data?.id || payload?.orderId;
    const sessionId = data?.sessionId || data?.session_id || payload?.sessionId;
    const partnerCustomerId = data?.partnerCustomerId || data?.userId;
    const status = normalizeStatus(data?.status || payload?.status);
    const depositStatus = depositLifecycleStatus(status);
    const fiatAmount = data?.fiatAmount || data?.fiatAmountInUsd || null;
    const fiatCurrency = data?.fiatCurrency || null;
    const cryptoAmount = data?.cryptoAmount || data?.amount || null;
    const cryptoCurrency = data?.cryptoCurrency || data?.cryptoCurrencyCode || 'XRP';
    const txHash = data?.transactionHash || data?.txHash || null;
    const walletAddress = data?.walletAddress || null;
    const walletAddressTag = data?.walletAddressTag || data?.walletTag || null;
    const orderCreatedAt = data?.createdAt || data?.created_at || null;
    const orderCompletedAt = data?.completedAt || data?.completed_at || null;

    const depositRef = await findDepositRef(orderId, sessionId);
    if (!depositRef) {
      logger.warn('[handleTransakWebhook] Deposit not found', { orderId, sessionId, partnerCustomerId });
      return res.status(202).json({ ok: false, error: 'deposit_not_found' });
    }

    const timelineEntry = {
      source: 'transak',
      status,
      at: admin.firestore.Timestamp.now(),
      details: {
        orderId,
        sessionId,
        partnerCustomerId,
        txHash,
        walletAddress,
        walletAddressTag,
      },
    };

    const updates = {
      status: depositStatus,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      'transak.status': status,
      'transak.environment': envName,
      timeline: admin.firestore.FieldValue.arrayUnion(timelineEntry),
    };

    if (orderId) updates['transak.orderId'] = orderId;
    if (sessionId) updates['transak.sessionId'] = sessionId;
    if (partnerCustomerId) updates['transak.partnerCustomerId'] = partnerCustomerId;
    if (txHash) updates['transak.txHash'] = txHash;
    if (walletAddress) updates['transak.walletAddress'] = walletAddress;
    if (walletAddressTag) updates['transak.walletAddressTag'] = walletAddressTag;
    if (orderCompletedAt) updates['transak.completedAt'] = orderCompletedAt;
    if (orderCreatedAt) updates['transak.createdAt'] = orderCreatedAt;

    if (fiatAmount || fiatCurrency) {
      updates['transak.fiat'] = {
        amount: fiatAmount || null,
        currency: fiatCurrency || null,
      };
    }
    if (cryptoAmount || cryptoCurrency) {
      updates['transak.crypto'] = {
        amount: cryptoAmount || null,
        currency: cryptoCurrency || null,
      };
    }

    if (status === 'COMPLETED') {
      updates.status = 'AWAITING_FIREBLOCKS';
    } else if (status === 'FAILED' || status === 'CANCELLED' || status === 'EXPIRED') {
      updates.status = 'FAILED';
    }

    await depositRef.set(updates, { merge: true });

    return res.status(200).json({ ok: true });
  } catch (error) {
    logger.error('[handleTransakWebhook] error', error);
    return res.status(500).json({ ok: false, error: 'internal_error' });
  }
});
