// functions/fireblocks.js 2
// Node 20, ESM, Firebase Functions v2
// Endpoint: fireblocksPing → sanity check for Fireblocks auth/connectivity

import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { defineSecret } from 'firebase-functions/params';
import admin from 'firebase-admin';
import { FireblocksSDK } from 'fireblocks-sdk';
// Note: xrpl is not required for regular Fireblocks-signed transfers

// ---- Secrets (set these via Firebase Functions Secrets) ----
//   firebase functions:secrets:set FIREBLOCKS_API_KEY
//   firebase functions:secrets:set FIREBLOCKS_API_PRIVATE_KEY   # PEM contents
//   (optional) firebase functions:secrets:set FIREBLOCKS_BASE_URL  # e.g. https://api.fireblocks.io
const FIREBLOCKS_API_KEY = defineSecret('FIREBLOCKS_API_KEY');
const FIREBLOCKS_API_PRIVATE_KEY = defineSecret('FIREBLOCKS_API_PRIVATE_KEY');
const FIREBLOCKS_BASE_URL = defineSecret('FIREBLOCKS_BASE_URL'); // optional

// ---- Lazy init Firebase Admin ----
try { admin.app(); } catch { admin.initializeApp(); }
const db = admin.firestore();

// ---- Helpers ----
async function verifyIdToken(req) {
  const auth = req.headers.authorization || req.headers.Authorization || '';
  const m = /^Bearer\s+([A-Za-z0-9-_.~]+)$/i.exec(String(auth));
  if (!m) throw Object.assign(new Error('Missing Authorization: Bearer <ID_TOKEN>'), { code: 401 });
  const idToken = m[1];
  const decoded = await admin.auth().verifyIdToken(idToken);
  return decoded; // contains uid, email, etc.
}

function corsify(res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'authorization, content-type');
  res.set('Access-Control-Allow-Methods', 'POST,GET,OPTIONS');
}

function maskKey(key) {
  if (!key) return '';
  return key.length <= 6 ? '******' : `${key.slice(0, 3)}***${key.slice(-3)}`;
}

// ---- Build Fireblocks client from secrets ----
function buildFireblocksClient({ apiKey, privateKeyPem, baseUrl }) {
  // FireblocksSDK(privateKey: string, apiKey: string, apiBaseUrl?: string)
  const url = baseUrl || 'https://api.fireblocks.io';
  return new FireblocksSDK(privateKeyPem, apiKey, url);
}

// ---- Helpers: vault listing ----
async function listAllVaultAccounts(fb) {
  const out = [];
  let after = undefined;
  for (let i = 0; i < 10; i++) {
    try {
      const page = await fb.getVaultAccountsWithPageInfo?.({ limit: 200, orderBy: 'ASC', ...(after ? { after } : {}) });
      const accounts = page?.accounts ?? [];
      if (!Array.isArray(accounts) || accounts.length === 0) break;
      out.push(...accounts);
      after = page?.paging?.after;
      if (!after) break;
    } catch (e) {
      logger.warn('[listAllVaultAccounts] page fetch failed:', e?.message || e);
      break;
    }
  }
  return out;
}

// ---- HTTPS Function: Ping Fireblocks ----
export const fireblocksPing = onRequest({
  cors: true,
  secrets: [FIREBLOCKS_API_KEY, FIREBLOCKS_API_PRIVATE_KEY, FIREBLOCKS_BASE_URL],
  region: 'us-central1',
  maxInstances: 5,
}, async (req, res) => {
  try {
    corsify(res);
    if (req.method === 'OPTIONS') return res.status(204).end();

    // 1) Verify caller (must be a signed-in Firebase user)
    const user = await verifyIdToken(req);

    // 2) Read secrets
    const apiKey = FIREBLOCKS_API_KEY.value();
    const privateKeyPem = FIREBLOCKS_API_PRIVATE_KEY.value();
    const baseUrl = FIREBLOCKS_BASE_URL.value() || 'https://api.fireblocks.io';

    if (!apiKey || !privateKeyPem) {
      throw Object.assign(new Error('Fireblocks secrets are not set'), { code: 500 });
    }

    // 3) Init Fireblocks SDK
    const fb = buildFireblocksClient({ apiKey, privateKeyPem, baseUrl });

    // 4) Make a couple of harmless calls to prove connectivity
    // These are read-only and safe.
    let assets = [];
    let firstVault = null;
    try {
      const supported = await fb.getSupportedAssets?.();
      if (Array.isArray(supported)) assets = supported;
    } catch (e) {
      logger.warn('[fireblocksPing] getSupportedAssets failed:', e?.message || e);
    }
    try {
      const vaults = await fb.getVaultAccountsWithPageInfo?.({ limit: 1, orderBy: 'ASC' });
      if (Array.isArray(vaults?.accounts)) firstVault = vaults.accounts[0] || null;
    } catch (e) {
      logger.warn('[fireblocksPing] getVaultAccounts failed:', e?.message || e);
    }

    // 5) Prepare safe response (no secrets)
    const sampleAssets = Array.isArray(assets) ? assets.slice(0, 8) : [];

    return res.status(200).json({
      ok: true,
      user: { uid: user.uid, email: user.email || null },
      fireblocks: {
        apiKeyPreview: maskKey(apiKey),
        baseUrl,
        sampleAssetsCount: Array.isArray(assets) ? assets.length : 0,
        sampleAssets,
        hasVaults: !!firstVault,
        sampleVault: firstVault
          ? {
              id: firstVault.id,
              name: firstVault.name,
              hiddenOnUI: firstVault.hiddenOnUI ?? false,
              assets: firstVault.assets ? firstVault.assets.map((a) => a.id).slice(0, 5) : [],
            }
          : null,
      },
    });
  } catch (err) {
    logger.error('fireblocksPing error', err);
    const status = err?.code && Number.isInteger(err.code) ? err.code : 500;
    return res.status(status).json({ ok: false, error: err?.message || 'Unknown error' });
  }
});

// ----------------------------------------
// Test 2: Create / Get named XRPL vaults
// ----------------------------------------
export const fireblocksCreateOrGetVaults = onRequest({
  cors: true,
  secrets: [FIREBLOCKS_API_KEY, FIREBLOCKS_API_PRIVATE_KEY, FIREBLOCKS_BASE_URL],
  region: 'us-central1',
  maxInstances: 5,
}, async (req, res) => {
  try {
    corsify(res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Use POST' });

    const user = await verifyIdToken(req);

    const apiKey = FIREBLOCKS_API_KEY.value();
    const privateKeyPem = FIREBLOCKS_API_PRIVATE_KEY.value();
    const baseUrl = FIREBLOCKS_BASE_URL.value() || 'https://api.fireblocks.io';
    if (!apiKey || !privateKeyPem) {
      throw Object.assign(new Error('Fireblocks secrets are not set'), { code: 500 });
    }

    const fb = buildFireblocksClient({ apiKey, privateKeyPem, baseUrl });

    const desired = ['Treasury_XRP', 'Marketplace_Settlement', 'NFT_Minter'];

    const all = await listAllVaultAccounts(fb);
    const byName = new Map(Array.isArray(all) ? all.map((v) => [v.name, v]) : []);

    const results = {};
    for (const name of desired) {
      if (byName.has(name)) {
        const v = byName.get(name);
        results[name] = { id: v.id, existed: true };
        continue;
      }
      // Create if missing
      const created = await fb.createVaultAccount?.(name, false);
      if (!created?.id) throw new Error(`Failed to create vault "${name}"`);
      results[name] = { id: created.id, existed: false };
    }

    return res.status(200).json({
      ok: true,
      user: { uid: user.uid, email: user.email || null },
      vaults: results,
    });
  } catch (err) {
    logger.error('fireblocksCreateOrGetVaults error', err);
    const status = err?.code && Number.isInteger(err.code) ? err.code : 500;
    return res.status(status).json({ ok: false, error: err?.message || 'Unknown error' });
  }
});

// -----------------------------------------------------------
// Test 3: Create per-user XRP deposit handle (address + tag)
// -----------------------------------------------------------
export const fireblocksCreateDepositHandle = onRequest({
  cors: true,
  secrets: [FIREBLOCKS_API_KEY, FIREBLOCKS_API_PRIVATE_KEY, FIREBLOCKS_BASE_URL],
  region: 'us-central1',
  maxInstances: 10,
}, async (req, res) => {
  try {
    corsify(res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Use POST' });

    const user = await verifyIdToken(req);
    const uid = user.uid;

    const apiKey = FIREBLOCKS_API_KEY.value();
    const privateKeyPem = FIREBLOCKS_API_PRIVATE_KEY.value();
    const baseUrl = FIREBLOCKS_BASE_URL.value() || 'https://api.fireblocks.io';
    if (!apiKey || !privateKeyPem) {
      throw Object.assign(new Error('Fireblocks secrets are not set'), { code: 500 });
    }

    const fb = buildFireblocksClient({ apiKey, privateKeyPem, baseUrl });

    // 1) If we already issued a handle, return it (idempotent)
    const docRef = db.doc(`users/${uid}/xrpl/deposit`);
    const prev = await docRef.get();
    if (prev.exists) {
      const d = prev.data() || {};
      return res.status(200).json({ ok: true, existed: true, handle: d });
    }

    // 2) Find Treasury_XRP vault
    const all = await listAllVaultAccounts(fb);
    const treasury = Array.isArray(all) ? all.find((v) => v.name === 'Treasury_XRP') : null;
    if (!treasury?.id) throw new Error('Treasury_XRP vault not found. Run Test 2 first.');

    const vaultId = String(treasury.id);
    const isSandbox = /sandbox/i.test(baseUrl);
    const candidates = isSandbox ? ['XRP_TEST', 'XRP'] : ['XRP', 'XRP_TEST'];

    // 3) Try to ensure asset, then generate deposit address with fallback asset IDs
    let created = null;
    let assetId = null;
    let lastErr = null;
    for (const aid of candidates) {
      try {
        try {
          await fb.createVaultAsset?.(vaultId, aid);
        } catch (e) {
          // 400 usually means already exists or not supported; proceed to try address
          logger.warn('[fireblocksCreateDepositHandle] createVaultAsset ignored:', aid, e?.response?.status || e?.message || e);
        }
        created = await fb.generateNewAddress?.(vaultId, aid, `user:${uid}`);
        if (created?.address) {
          assetId = aid;
          break;
        }
      } catch (e) {
        lastErr = e;
        logger.warn('[fireblocksCreateDepositHandle] generateNewAddress attempt failed for', aid, e?.response?.status || e?.message || e);
      }
    }
    if (!created?.address) {
      logger.error('[fireblocksCreateDepositHandle] generateNewAddress failed:', lastErr?.message || lastErr);
      throw new Error('generate_address_failed');
    }

    if (!created?.address) throw new Error('No address returned from Fireblocks');

    const addr = created.address;
    const tag =
      (created.addressAdditionalData && (created.addressAdditionalData.tag || created.addressAdditionalData.destinationTag)) ||
      created.tag ||
      null;

    if (!tag) throw new Error('No destination tag returned for XRP');

    const handle = {
      vaultId,
      assetId,
      address: addr,
      tag: String(tag),
      depositAddressId: created.id || null,
      description: created.description || `user:${uid}`,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await docRef.set(handle, { merge: true });

    return res.status(200).json({ ok: true, existed: false, handle });
  } catch (err) {
    logger.error('fireblocksCreateDepositHandle error', err);
    const status = err?.code && Number.isInteger(err.code) ? err.code : 500;
    return res.status(status).json({ ok: false, error: err?.message || 'Unknown error' });
  }
});

// -----------------------------------------------------------
// Test 4: Regular XRPL transfer (Fireblocks builds/signs)
// -----------------------------------------------------------
export const fireblocksXrplTransferTest = onRequest({
  cors: true,
  secrets: [FIREBLOCKS_API_KEY, FIREBLOCKS_API_PRIVATE_KEY, FIREBLOCKS_BASE_URL],
  region: 'us-central1',
  maxInstances: 10,
}, async (req, res) => {
  try {
    corsify(res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Use POST' });

    const user = await verifyIdToken(req);
    const uid = user.uid;

    const apiKey = FIREBLOCKS_API_KEY.value();
    const privateKeyPem = FIREBLOCKS_API_PRIVATE_KEY.value();
    const baseUrl = FIREBLOCKS_BASE_URL.value() || 'https://api.fireblocks.io';
    if (!apiKey || !privateKeyPem) {
      throw Object.assign(new Error('Fireblocks secrets are not set'), { code: 500 });
    }

    const fb = buildFireblocksClient({ apiKey, privateKeyPem, baseUrl });

    // Optional customizations from body
    const body = (req.body && typeof req.body === 'object') ? req.body : {};
    const requestedAmount = typeof body.amount === 'string' || typeof body.amount === 'number'
      ? String(body.amount)
      : null;
    const requestedAssetId = typeof body.assetId === 'string' && body.assetId.trim() ? body.assetId.trim() : null;
    const overrideDestAddress = typeof body.destAddress === 'string' && body.destAddress.trim() ? body.destAddress.trim() : null;
    const overrideDestTag = (body.destTag !== undefined && body.destTag !== null) ? String(body.destTag) : undefined;
    const sourceVaultName = typeof body.sourceVaultName === 'string' && body.sourceVaultName.trim() ? body.sourceVaultName.trim() : 'Treasury_XRP';

    // 1) Find source vault (default: Treasury_XRP)
    const all = await listAllVaultAccounts(fb);
    const sourceVault = Array.isArray(all) ? all.find((v) => v.name === sourceVaultName) : null;
    if (!sourceVault?.id) throw new Error(`${sourceVaultName} vault not found. Run Test 2 first.`);
    const vaultId = String(sourceVault.id);

    // 2) Determine destination: default to user's deposit handle
    let assetId = requestedAssetId || 'XRP_TEST';
    let address = overrideDestAddress || null;
    let tag = overrideDestTag;

    if (!address) {
      const depDoc = await db.doc(`users/${uid}/xrpl/deposit`).get();
      if (!depDoc.exists) throw new Error('No deposit handle yet. Run Test 3 first.');
      const dep = depDoc.data() || {};
      assetId = requestedAssetId || dep.assetId || 'XRP_TEST';
      address = dep.address;
      tag = dep.tag ? String(dep.tag) : undefined;
    }
    if (!address) throw new Error('Destination address is missing.');

    // 3) Build a tiny transfer (self-transfer by default)
    const amount = requestedAmount || '0.000001'; // 1 drop

    const created = await fb.createTransaction({
      operation: 'TRANSFER',
      source: { type: 'VAULT_ACCOUNT', id: vaultId },
      destination: {
        type: 'ONE_TIME_ADDRESS',
        oneTimeAddress: {
          address,
          tag,
        },
      },
      assetId,
      amount,
      treatAsGrossAmount: false,
      note: `XRPL transfer test to ${overrideDestAddress ? 'custom dest' : 'self deposit'} for uid:${uid}`,
    });

    // 4) Poll status until terminal or timeout
    let details = null;
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 250));
      try {
        details = await fb.getTransactionById(created?.id);
      } catch {}
      if (!details) continue;
      if (['COMPLETED','CONFIRMED','FAILED','CANCELLED','REJECTED'].includes(details.status)) break;
    }

    return res.status(200).json({
      ok: true,
      transactionId: created?.id || null,
      status: details?.status || null,
      subStatus: details?.subStatus || null,
      error: details?.error || null,
      note: details?.note || null,
      amount,
      assetId,
      to: { address, tag },
    });
  } catch (err) {
    logger.error('fireblocksXrplTransferTest error', err);
    const status = err?.code && Number.isInteger(err.code) ? err.code : 500;
    return res.status(status).json({ ok: false, error: err?.message || 'Unknown error' });
  }
});
