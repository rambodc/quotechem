import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import admin from 'firebase-admin';

const TRANSAK_API_KEY = defineSecret('TRANSAK_API_KEY');
const TRANSAK_API_SECRET = defineSecret('TRANSAK_API_SECRET');
const TRANSAK_ENV = defineSecret('TRANSAK_ENV');
const TRANSAK_ALLOWED_ORIGINS = defineSecret('TRANSAK_ALLOWED_ORIGINS');

try { admin.app(); } catch { admin.initializeApp(); }
const db = admin.firestore();
const TOKEN_DOC = db.doc('system/transak_access_token');

const DEFAULT_FIAT_CURRENCY = 'USD';
const DEFAULT_PAYMENT_METHOD = 'credit_debit_card';
const ASSET_CODE = 'XRP';
const FIREBLOCKS_XRP_ADDRESS = 'rBHj9ACjFZo5U9SFzaLWZSScdcXoVuMRY5';

function normEnv(value) {
  return String(value || 'STAGING').trim().toUpperCase();
}

function baseApi(envName) {
  return normEnv(envName) === 'PRODUCTION'
    ? 'https://api.transak.com'
    : 'https://api-stg.transak.com';
}

function baseGateway(envName) {
  return normEnv(envName) === 'PRODUCTION'
    ? 'https://api-gateway.transak.com'
    : 'https://api-gateway-stg.transak.com';
}

function parseAllowedOrigins(csv) {
  const raw = String(csv || '').trim();
  if (!raw) return [];
  return raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

function extractOrigin(req) {
  const origin = (req.get('origin') || req.get('Origin') || '').toLowerCase();
  if (origin) return origin;
  const referer = req.get('referer') || req.get('Referer') || '';
  try {
    return referer ? new URL(referer).origin.toLowerCase() : '';
  } catch {
    return '';
  }
}

function deriveReferrerDomain(req) {
  const origin = extractOrigin(req);
  if (origin) {
    try {
      return new URL(origin).host;
    } catch {
      return origin.replace(/^https?:\/\//i, '');
    }
  }
  return 'localhost';
}

async function verifyFirebaseIdToken(req) {
  const authorization = req.get('authorization') || req.get('Authorization') || '';
  const match = /Bearer\s+([A-Za-z0-9-_.~]+)/.exec(authorization);
  if (!match) {
    return null;
  }
  try {
    return await admin.auth().verifyIdToken(match[1]);
  } catch (error) {
    logger.warn('[createTransakSession] Failed to verify ID token', error?.message || error);
    return null;
  }
}

async function readCachedToken(expectedEnv) {
  try {
    const snap = await TOKEN_DOC.get();
    if (!snap.exists) return null;
    const data = snap.data() || {};
    if (normEnv(data.env) !== normEnv(expectedEnv)) return null;
    if (!data.token || !data.expiresAt) return null;
    if (typeof data.expiresAt === 'number' && data.expiresAt <= Date.now() + 3_600_000) return null;
    return { token: data.token, expiresAt: data.expiresAt };
  } catch (error) {
    logger.warn('[createTransakSession] Unable to read cached token', error?.message || error);
    return null;
  }
}

async function writeCachedToken(envName, token, expiresAt) {
  try {
    await TOKEN_DOC.set({
      env: normEnv(envName),
      token,
      expiresAt,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  } catch (error) {
    logger.warn('[createTransakSession] Unable to cache token', error?.message || error);
  }
}

function decodeJwtExpiryMs(token) {
  if (!token) return null;
  try {
    const [, payload] = token.split('.');
    const decoded = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
    if (typeof decoded?.exp === 'number') return decoded.exp * 1000;
  } catch (error) {
    logger.warn('[createTransakSession] Failed to decode token expiry', error?.message || error);
  }
  return null;
}

async function refreshPartnerAccessToken({ apiKey, apiSecret, envName }) {
  const url = `${baseApi(envName)}/partners/api/v2/refresh-token`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'api-secret': apiSecret,
      },
      body: JSON.stringify({ apiKey }),
    });
    const text = await response.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    if (!response.ok) {
      logger.error('[createTransakSession] refresh-token failed', response.status, String(text).slice(0, 400));
      return null;
    }
    const token = json?.accessToken || json?.data?.accessToken;
    if (!token) return null;
    const expiresAtMs = decodeJwtExpiryMs(token) || ((json?.expiresAt || json?.data?.expiresAt || 0) * 1000) || (Date.now() + 5 * 60 * 60 * 1000);
    await writeCachedToken(envName, token, expiresAtMs);
    return token;
  } catch (error) {
    logger.error('[createTransakSession] refresh-token error', error?.message || error);
    return null;
  }
}

async function getPartnerAccessToken({ apiKey, apiSecret, envName }) {
  const cached = await readCachedToken(envName);
  if (cached?.token) return cached.token;
  const fresh = await refreshPartnerAccessToken({ apiKey, apiSecret, envName });
  if (fresh) return fresh;
  throw new Error('transak_token_unavailable');
}

function parseRequestBody(body) {
  if (!body) return {};
  if (typeof body === 'object') return body;
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
}

function sanitizeFiatAmount(input) {
  if (typeof input === 'number') {
    return Number.isFinite(input) && input > 0 ? Number(input.toFixed(2)) : null;
  }
  if (typeof input === 'string') {
    const value = Number.parseFloat(input);
    return Number.isFinite(value) && value > 0 ? Number(value.toFixed(2)) : null;
  }
  return null;
}

export const createTransakSession = onRequest({
  cors: true,
  region: 'us-central1',
  maxInstances: 20,
  secrets: [
    TRANSAK_API_KEY,
    TRANSAK_API_SECRET,
    TRANSAK_ENV,
    TRANSAK_ALLOWED_ORIGINS,
  ],
}, async (req, res) => {
  try {
    const allowedOrigins = parseAllowedOrigins(TRANSAK_ALLOWED_ORIGINS.value());
    const origin = extractOrigin(req);
    if (req.method === 'OPTIONS') {
      if (allowedOrigins.length && (!origin || !allowedOrigins.includes(origin))) {
        return res.status(204).end();
      }
      if (allowedOrigins.length) {
        res.set('Access-Control-Allow-Origin', origin);
        res.set('Vary', 'Origin');
      } else {
        res.set('Access-Control-Allow-Origin', '*');
      }
      res.set('Access-Control-Allow-Headers', 'authorization, content-type');
      res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
      return res.status(204).end();
    }
    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'method_not_allowed' });
    }

    if (allowedOrigins.length && (!origin || !allowedOrigins.includes(origin))) {
      logger.warn('[createTransakSession] Origin blocked', { origin });
      return res.status(403).json({ ok: false, error: 'origin_not_allowed' });
    }

    if (allowedOrigins.length) {
      res.set('Access-Control-Allow-Origin', origin);
      res.set('Vary', 'Origin');
    } else {
      res.set('Access-Control-Allow-Origin', '*');
    }
    res.set('Access-Control-Allow-Headers', 'authorization, content-type');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');

    const user = await verifyFirebaseIdToken(req);
    if (!user?.uid) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }

    const apiKey = TRANSAK_API_KEY.value();
    const apiSecret = TRANSAK_API_SECRET.value();
    const envName = normEnv(TRANSAK_ENV.value() || 'STAGING');

    if (!apiKey || !apiSecret) {
      logger.error('[createTransakSession] Missing Transak API credentials');
      return res.status(500).json({ ok: false, error: 'transak_credentials_missing' });
    }

    const userSnap = await db.doc(`users/${user.uid}`).get();
    const destinationTagRaw = userSnap.exists ? userSnap.get('userTag') : null;
    const destinationTag = destinationTagRaw ? String(destinationTagRaw) : null;
    if (!destinationTag) {
      logger.error('[createTransakSession] Missing userTag for user', user.uid);
      return res.status(400).json({ ok: false, error: 'user_tag_missing' });
    }

    const accessToken = await getPartnerAccessToken({ apiKey, apiSecret, envName });

    const body = parseRequestBody(req.body);
    const fiatAmount =
      sanitizeFiatAmount(body.fiatAmount) ||
      sanitizeFiatAmount(body.defaultFiatAmount) ||
      sanitizeFiatAmount(body.amount) ||
      100;
    const fiatCurrency = typeof body.fiatCurrency === 'string' && body.fiatCurrency.trim()
      ? body.fiatCurrency.trim().toUpperCase()
      : DEFAULT_FIAT_CURRENCY;
    const paymentMethod = typeof body.paymentMethod === 'string' && body.paymentMethod.trim()
      ? body.paymentMethod.trim()
      : DEFAULT_PAYMENT_METHOD;
    const defaultCryptoAmount = sanitizeFiatAmount(body.cryptoAmount) || null;

    if (!fiatAmount || fiatAmount <= 0) {
      return res.status(400).json({ ok: false, error: 'invalid_amount' });
    }

    const referrerDomain = deriveReferrerDomain(req);

    const widgetParams = {
      apiKey,
      referrerDomain,
      partnerCustomerId: user.uid,
      fiatCurrency,
      defaultFiatAmount: String(fiatAmount),
      cryptoCurrencyCode: ASSET_CODE,
      walletAddress: FIREBLOCKS_XRP_ADDRESS,
      walletAddressTag: destinationTag,
      disableWalletAddressForm: true,
      defaultPaymentMethod: paymentMethod,
      ...(defaultCryptoAmount ? { defaultCryptoAmount: String(defaultCryptoAmount) } : {}),
      ...(user.email ? { email: user.email } : {}),
    };

    if (body.redirectUrl && typeof body.redirectUrl === 'string') {
      widgetParams.redirectUrl = body.redirectUrl;
    }
    if (body.widgetVariant && typeof body.widgetVariant === 'string') {
      widgetParams.widgetVariant = body.widgetVariant;
    }

    const url = `${baseGateway(envName)}/api/v2/auth/session`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'access-token': accessToken,
      },
      body: JSON.stringify({ widgetParams }),
    });

    const text = await response.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}

    let sessionId = json?.session_id || json?.data?.sessionId || null;
    let widgetUrl = json?.widgetUrl || json?.data?.widgetUrl || null;
    if (!sessionId && typeof widgetUrl === 'string') {
      try {
        const parsed = new URL(widgetUrl);
        sessionId = parsed.searchParams.get('sessionId');
      } catch {}
    }

    if (!response.ok || !widgetUrl) {
      logger.error('[createTransakSession] Failed to create session', response.status, String(text).slice(0, 400));
      return res.status(502).json({ ok: false, error: 'transak_session_failed' });
    }

    const depositRef = db.collection('deposits').doc();
    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    const depositData = {
      userId: user.uid,
      status: 'INITIATED',
      asset: ASSET_CODE,
      environment: envName,
      fiat: {
        currency: fiatCurrency,
        amount: fiatAmount,
      },
      ...(defaultCryptoAmount ? { crypto: { currency: ASSET_CODE, amount: defaultCryptoAmount } } : {}),
      destination: {
        address: FIREBLOCKS_XRP_ADDRESS,
        tag: destinationTag,
      },
      userTag: destinationTag,
      transak: {
        sessionId,
        widgetUrl,
        status: 'SESSION_CREATED',
        paymentMethod,
        partnerCustomerId: user.uid,
        referrerDomain,
      },
      fireblocks: {
        vaultAccountId: null,
        status: 'PENDING',
      },
      createdAt: timestamp,
      updatedAt: timestamp,
      timeline: [
        {
          source: 'transak',
          status: 'SESSION_CREATED',
          at: admin.firestore.Timestamp.now(),
          details: {
            sessionId,
            widgetUrl,
          },
        },
      ],
    };

    await depositRef.set(depositData);

    return res.status(200).json({
      ok: true,
      depositId: depositRef.id,
      environment: envName,
      sessionId,
      apiKey,
      widgetUrl,
      destination: {
        address: FIREBLOCKS_XRP_ADDRESS,
        tag: destinationTag,
      },
      transak: {
        sessionId,
        widgetUrl,
      },
    });
  } catch (error) {
    logger.error('[createTransakSession] error', error);
    const message = error?.message || 'internal_error';
    return res.status(500).json({ ok: false, error: message });
  }
});
