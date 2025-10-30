import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import admin from 'firebase-admin';

const FIREBLOCKS_API_KEY = defineSecret('FIREBLOCKS_API_KEY');
const FIREBLOCKS_API_PRIVATE_KEY = defineSecret('FIREBLOCKS_API_PRIVATE_KEY');
const FIREBLOCKS_BASE_URL = defineSecret('FIREBLOCKS_BASE_URL');

try { admin.app(); } catch { admin.initializeApp(); }
const db = admin.firestore();

const AMOUNT_TOLERANCE = 0.0001;
const MATCHABLE_STATUSES = new Set(['INITIATED', 'AWAITING_FIREBLOCKS', 'PENDING', 'SESSION_CREATED']);

function bufferFromRaw(rawBody) {
  if (Buffer.isBuffer(rawBody)) return rawBody;
  if (typeof rawBody === 'string') return Buffer.from(rawBody, 'utf8');
  if (!rawBody) return Buffer.alloc(0);
  return Buffer.from(JSON.stringify(rawBody));
}

function parseJson(rawBuffer) {
  try {
    return JSON.parse(rawBuffer.toString('utf8'));
  } catch (err) {
    logger.error('[handleFireblocksWebhook] Failed to parse body', err);
    return null;
  }
}

function normalizeStatus(status) {
  if (!status) return 'UNKNOWN';
  return String(status).trim().toUpperCase();
}

function mapDepositStatus(status) {
  switch (status) {
    case 'COMPLETED':
    case 'CONFIRMED':
      return 'SETTLED';
    case 'FAILED':
    case 'CANCELLED':
    case 'REJECTED':
      return 'FAILED';
    default:
      return 'AWAITING_FIREBLOCKS';
  }
}

function extractDestinationTag(data) {
  return (
    data?.destination?.tag ||
    data?.destination?.oneTimeAddress?.tag ||
    data?.destination?.extraParameters?.destinationTag ||
    data?.txInfo?.destinationTag ||
    data?.txInfo?.destinationTag?.toString?.() ||
    null
  );
}

function parseAmount(value) {
  if (value === null || value === undefined) return null;
  const num = Number.parseFloat(value);
  return Number.isFinite(num) ? num : null;
}

async function lookupUserByTag(tag) {
  if (!tag) return null;
  try {
    const snap = await db.doc(`userTags/${tag}`).get();
    if (!snap.exists) return null;
    return snap.get('uid') || null;
  } catch (err) {
    logger.error('[handleFireblocksWebhook] Failed to lookup user tag', err);
    return null;
  }
}

function amountMatches(expected, actual) {
  if (expected === null || expected === undefined) return true;
  if (actual === null || actual === undefined) return false;
  return Math.abs(Number(expected) - Number(actual)) <= AMOUNT_TOLERANCE;
}

function deriveEnvironment(baseUrl) {
  if (!baseUrl) return 'PRODUCTION';
  return /sandbox|stg|test/i.test(baseUrl) ? 'SANDBOX' : 'PRODUCTION';
}

function buildTimelineEntry({ status, transactionId, txHash, amount, asset, userTag }) {
  return {
    source: 'fireblocks',
    status,
    at: admin.firestore.Timestamp.now(),
    details: {
      transactionId,
      txHash,
      amount,
      asset,
      userTag,
    },
  };
}

async function createSpecialCaseDeposit({ userId, userTag, status, assetId, amount, txHash, transactionId, environment, details }) {
  const docRef = db.collection('deposits').doc();
  const timestamp = admin.firestore.FieldValue.serverTimestamp();

  await docRef.set({
    userId: userId || null,
    userTag: userTag || null,
    status,
    origin: 'fireblocks_webhook',
    asset: assetId || null,
    environment,
    destination: {
      address: null,
      tag: userTag || null,
    },
    fireblocks: {
      transactionId: transactionId || null,
      status,
      txHash: txHash || null,
      assetId: assetId || null,
      amount: amount || null,
      lastEvent: details || {},
    },
    amount: {
      crypto: {
        amount: amount || null,
        currency: assetId || null,
      },
    },
    createdAt: timestamp,
    updatedAt: timestamp,
    timeline: [
      buildTimelineEntry({
        status,
        transactionId,
        txHash,
        amount,
        asset: assetId,
        userTag,
      }),
    ],
  });

  return docRef;
}

export const handleFireblocksWebhook = onRequest({
  secrets: [FIREBLOCKS_API_KEY, FIREBLOCKS_API_PRIVATE_KEY, FIREBLOCKS_BASE_URL],
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

    const apiKey = FIREBLOCKS_API_KEY.value();
    const privateKey = FIREBLOCKS_API_PRIVATE_KEY.value();
    if (!apiKey || !privateKey) {
      logger.error('[handleFireblocksWebhook] Fireblocks secrets missing');
      return res.status(500).json({ ok: false, error: 'fireblocks_secrets_missing' });
    }

    const rawBody = bufferFromRaw(req.rawBody);
    const payload = parseJson(rawBody);
    if (!payload) {
      return res.status(400).json({ ok: false, error: 'invalid_json' });
    }

    const data = payload?.data || payload;
    const transactionId = data?.id || data?.txId || null;
    const status = normalizeStatus(data?.status);
    const subStatus = data?.subStatus || null;
    const assetId = data?.assetId || data?.asset || 'XRP';
    const txHash = data?.txHash || data?.hash || null;
    const amount = parseAmount(data?.amount || data?.amountInfo?.amount);
    const destinationTagRaw = extractDestinationTag(data);
    const destinationTag = destinationTagRaw ? String(destinationTagRaw) : null;
    const baseUrl = FIREBLOCKS_BASE_URL.value();
    const environment = deriveEnvironment(baseUrl);

    const userId = await lookupUserByTag(destinationTag);

    if (!destinationTag) {
      logger.warn('[handleFireblocksWebhook] Missing destination tag', { transactionId, txHash });
      await createSpecialCaseDeposit({
        userId,
        userTag: null,
        status: 'UNMATCHED_FIREBLOCKS',
        assetId,
        amount,
        txHash,
        transactionId,
        environment,
        details: data,
      });
      return res.status(200).json({ ok: true, note: 'no_destination_tag' });
    }

    const snapshot = await db.collection('deposits').where('destination.tag', '==', destinationTag).get();
    const candidates = [];

    snapshot.forEach((docSnap) => {
      const deposit = docSnap.data();
      const currentStatus = String(deposit?.status || '').toUpperCase();
      if (!MATCHABLE_STATUSES.has(currentStatus) && currentStatus !== 'AWAITING_FIREBLOCKS') return;

      const expected = parseAmount(deposit?.transak?.crypto?.amount || deposit?.crypto?.amount || deposit?.amount?.crypto?.amount);
      if (amountMatches(expected, amount)) {
        candidates.push({ ref: docSnap.ref, data: deposit, expected });
      }
    });

    if (candidates.length === 0) {
      const specialRef = await createSpecialCaseDeposit({
        userId,
        userTag: destinationTag,
        status: 'UNMATCHED_FIREBLOCKS',
        assetId,
        amount,
        txHash,
        transactionId,
        environment,
        details: data,
      });
      logger.warn('[handleFireblocksWebhook] Created unmatched deposit', { destinationTag, transactionId, specialId: specialRef.id });
      return res.status(200).json({ ok: true, created: specialRef.id, unmatched: true });
    }

    if (candidates.length > 1) {
      const specialRef = await createSpecialCaseDeposit({
        userId,
        userTag: destinationTag,
        status: 'AMBIGUOUS_FIREBLOCKS',
        assetId,
        amount,
        txHash,
        transactionId,
        environment,
        details: {
          ...data,
          candidateDepositIds: candidates.map((c) => c.ref.id),
        },
      });
      logger.warn('[handleFireblocksWebhook] Ambiguous deposit match', {
        destinationTag,
        transactionId,
        candidates: candidates.map((c) => c.ref.id),
        recordId: specialRef.id,
      });
      return res.status(200).json({ ok: true, ambiguous: true, recordId: specialRef.id });
    }

    const match = candidates[0];
    const depositStatus = mapDepositStatus(status);
    const timelineEntry = buildTimelineEntry({
      status,
      transactionId,
      txHash,
      amount,
      asset: assetId,
      userTag: destinationTag,
    });

    const updates = {
      status: depositStatus,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      'fireblocks.status': status,
      'fireblocks.subStatus': subStatus || null,
      'fireblocks.transactionId': transactionId || null,
      'fireblocks.txHash': txHash || null,
      'fireblocks.assetId': assetId || null,
      'fireblocks.amount': amount || null,
      'fireblocks.eventReceivedAt': admin.firestore.FieldValue.serverTimestamp(),
      'fireblocks.environment': environment,
      timeline: admin.firestore.FieldValue.arrayUnion(timelineEntry),
    };

    if (data?.confirmations !== undefined) {
      updates['fireblocks.confirmations'] = data.confirmations;
    }
    if (data?.lastUpdated) {
      updates['fireblocks.lastUpdated'] = data.lastUpdated;
    }

    await match.ref.set(updates, { merge: true });

    logger.info('[handleFireblocksWebhook] Deposit updated', {
      depositId: match.ref.id,
      transactionId,
      status,
    });

    return res.status(200).json({ ok: true, depositId: match.ref.id });
  } catch (error) {
    logger.error('[handleFireblocksWebhook] error', error);
    return res.status(500).json({ ok: false, error: 'internal_error' });
  }
});
