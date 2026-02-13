import { createHash, randomInt, randomUUID } from 'node:crypto';
import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { defineSecret } from 'firebase-functions/params';
import { admin, auth, db } from './firebaseAdmin.js';

const REGION = 'us-central1';
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

const OPENAI_API_KEY = defineSecret('OPENAI_API_KEY');
const SENDGRID_API_KEY = defineSecret('SENDGRID_API_KEY');
const QUOTECHEM_SALES_EMAIL = defineSecret('QUOTECHEM_SALES_EMAIL');
const QUOTECHEM_FROM_EMAIL = defineSecret('QUOTECHEM_FROM_EMAIL');

const REQUIRED_PROFILE_FIELDS = [
  'chemicalName',
  'companyName',
  'destinationCountry',
  'quantity',
  'quantityUnit',
];

const AUTH_REQUIRED_FIELDS = [
  'chemicalName',
  'companyName',
  'destinationCountry',
  'quantity',
];

const OTP_TTL_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
const USER_TURNS_FOR_AUTH = 2;

function setCors(res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function preflight(req, res) {
  if (req.method === 'OPTIONS') {
    setCors(res);
    res.status(204).send('');
    return true;
  }
  return false;
}

function jsonError(res, status, message) {
  setCors(res);
  res.status(status).json({ ok: false, error: message });
}

function asString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeEmail(value) {
  return asString(value).toLowerCase();
}

function compactObject(input) {
  const out = {};
  Object.entries(input || {}).forEach(([key, value]) => {
    const cleaned = asString(value);
    if (cleaned) out[key] = cleaned;
  });
  return out;
}

function readSecret(secretRef) {
  try {
    return asString(secretRef.value());
  } catch {
    return '';
  }
}

function normalizeSessionId(value) {
  const v = asString(value);
  if (!v) return '';
  return v.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
}

function buildSystemPrompt() {
  return [
    'You are QuoteChem, an industrial chemical sourcing assistant.',
    'Collect intake data in short steps: chemical name, company, location, quantity, unit, timeline, shipping mode.',
    'Use plain concise language and ask only one or two follow-up questions at a time.',
    'Never claim final prices. Explain that final quote is provided after verification.',
    'Return strict JSON only with keys: assistant_reply, extracted, missing_fields, confidence.',
    'extracted allowed keys: chemicalName, companyName, destinationCountry, destinationPostalCode, quantity, quantityUnit, shippingMode, timeline, puritySpec, packagingType, notes, contactName, email.',
    'missing_fields should include unresolved intake fields only.',
  ].join(' ');
}

async function callOpenAI({ userMessage, history, profile }) {
  const apiKey = readSecret(OPENAI_API_KEY);
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  if (!apiKey) {
    return {
      assistant_reply:
        'Please share the chemical, your company, destination country, and quantity so I can prepare intake details.',
      extracted: {},
      missing_fields: REQUIRED_PROFILE_FIELDS,
      confidence: 0.2,
      model: 'fallback-no-openai-key',
    };
  }

  const historyText = history
    .slice(-14)
    .map((item) => `${item.role === 'assistant' ? 'Assistant' : 'User'}: ${item.content}`)
    .join('\n');

  const prompt = [
    'Current intake profile JSON:',
    JSON.stringify(profile || {}),
    'Conversation history:',
    historyText || '(none)',
    'Latest user message:',
    userMessage,
  ].join('\n');

  const body = {
    model,
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: buildSystemPrompt() },
      { role: 'user', content: prompt },
    ],
  };

  const response = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const failureText = await response.text();
    throw new Error(`OpenAI request failed: ${response.status} ${failureText}`);
  }

  const data = await response.json();
  const raw = data?.choices?.[0]?.message?.content || '{}';

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = {
      assistant_reply:
        'Please share the chemical, your company, destination country, and quantity so I can continue.',
      extracted: {},
      missing_fields: REQUIRED_PROFILE_FIELDS,
      confidence: 0.3,
    };
  }

  return {
    assistant_reply: asString(parsed.assistant_reply) || 'Please share the next intake detail.',
    extracted: compactObject(parsed.extracted || {}),
    missing_fields: Array.isArray(parsed.missing_fields)
      ? parsed.missing_fields.map((item) => asString(item)).filter(Boolean)
      : [],
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
    model,
  };
}

function missingFields(profile, requiredFields) {
  return requiredFields.filter((field) => !asString(profile[field]));
}

function buildQuickReplies(missing) {
  const map = {
    chemicalName: 'Chemical: Citric Acid',
    companyName: 'Company: ACME Labs',
    destinationCountry: 'Destination: United States',
    destinationPostalCode: 'Postal code: 94105',
    quantity: 'Quantity: 2',
    quantityUnit: 'Unit: metric tons',
    shippingMode: 'Shipping: sea freight',
    timeline: 'Timeline: 3 weeks',
    email: 'Email: you@company.com',
  };

  return missing
    .slice(0, 3)
    .map((field) => map[field])
    .filter(Boolean);
}

async function sendEmail({ toEmail, fromEmail, subject, text, html }) {
  const apiKey = readSecret(SENDGRID_API_KEY);
  if (!apiKey) throw new Error('Missing SENDGRID_API_KEY');

  const payload = {
    personalizations: [{ to: [{ email: toEmail }] }],
    from: { email: fromEmail },
    subject,
    content: [
      { type: 'text/plain', value: text },
      { type: 'text/html', value: html },
    ],
  };

  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const failure = await response.text();
    throw new Error(`SendGrid request failed: ${response.status} ${failure}`);
  }
}

async function loadRecentMessages(sessionId, limit = 30) {
  const snap = await db
    .collection('publicChatSessions')
    .doc(sessionId)
    .collection('messages')
    .orderBy('createdAt', 'asc')
    .limitToLast(limit)
    .get();

  return snap.docs.map((docSnap) => {
    const data = docSnap.data() || {};
    return {
      id: docSnap.id,
      role: data.role || 'user',
      content: data.content || '',
      quickReplies: Array.isArray(data.quickReplies) ? data.quickReplies : [],
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : null,
    };
  });
}

async function ensureSession(sessionId, metadata = {}) {
  const ref = db.collection('publicChatSessions').doc(sessionId);
  const snap = await ref.get();
  const now = admin.firestore.FieldValue.serverTimestamp();

  if (!snap.exists) {
    await ref.set({
      sessionId,
      status: 'active',
      profile: {},
      metadata: {
        locale: asString(metadata.locale),
        referrer: asString(metadata.referrer),
        userAgent: asString(metadata.userAgent),
      },
      messageCount: 0,
      userTurns: 0,
      authReady: false,
      createdAt: now,
      updatedAt: now,
      lastMessageAt: now,
    });
  }

  return ref;
}

function hashOtp(code) {
  return createHash('sha256').update(code).digest('hex');
}

function generateOtp() {
  return String(randomInt(0, 1000000)).padStart(6, '0');
}

async function findActiveChallenge(sessionId, email) {
  const snap = await db
    .collection('loginChallenges')
    .where('sessionId', '==', sessionId)
    .where('email', '==', email)
    .where('used', '==', false)
    .limit(10)
    .get();

  if (snap.empty) return null;

  const sorted = snap.docs.sort((a, b) => {
    const aMs = a.data()?.createdAt?.toMillis ? a.data().createdAt.toMillis() : 0;
    const bMs = b.data()?.createdAt?.toMillis ? b.data().createdAt.toMillis() : 0;
    return bMs - aMs;
  });

  return sorted[0] || null;
}

async function upsertUserProfile(uid, email, profile, contactName) {
  const now = admin.firestore.FieldValue.serverTimestamp();
  const pieces = asString(contactName).split(' ').filter(Boolean);
  const firstName = pieces[0] || '';
  const lastName = pieces.slice(1).join(' ');

  const usernameBase = (email.split('@')[0] || 'user').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 24);
  const username = usernameBase || `user_${uid.slice(0, 6)}`;

  await db.collection('users').doc(uid).set(
    {
      uid,
      email,
      firstName,
      lastName,
      username,
      usernameNormalized: username.toLowerCase(),
      latestQuoteProfile: profile,
      primaryAuthUid: uid,
      updatedAt: now,
      createdAt: now,
    },
    { merge: true }
  );
}

async function migrateSessionToUser(sessionId, uid, email) {
  const sessionRef = db.collection('publicChatSessions').doc(sessionId);
  const sessionSnap = await sessionRef.get();
  if (!sessionSnap.exists) return;

  const sessionData = sessionSnap.data() || {};
  const profile = sessionData.profile || {};
  const messages = await loadRecentMessages(sessionId, 100);

  const userSessionRef = db.collection('users').doc(uid).collection('chatSessions').doc(sessionId);
  const now = admin.firestore.FieldValue.serverTimestamp();

  await userSessionRef.set(
    {
      sessionId,
      migratedFromPublicSession: true,
      email,
      profile,
      createdAt: now,
      updatedAt: now,
      messageCount: messages.length,
    },
    { merge: true }
  );

  const batch = db.batch();
  messages.forEach((message) => {
    const ref = userSessionRef.collection('messages').doc(message.id || randomUUID());
    batch.set(ref, {
      role: message.role,
      content: message.content,
      quickReplies: Array.isArray(message.quickReplies) ? message.quickReplies : [],
      createdAt: now,
    });
  });
  await batch.commit();

  await upsertUserProfile(uid, email, profile, profile.contactName || '');

  await db.recursiveDelete(sessionRef);
}

export const createPublicSession = onRequest({ region: REGION }, async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  try {
    const requested = normalizeSessionId(req.body?.sessionId);
    const sessionId = requested || randomUUID();
    const metadata = req.body?.metadata || {};

    const sessionRef = await ensureSession(sessionId, metadata);
    const sessionSnap = await sessionRef.get();
    const session = sessionSnap.data() || {};

    const profile = session.profile || {};
    const intakeMissingFields = missingFields(profile, REQUIRED_PROFILE_FIELDS);
    const authMissingFields = missingFields(profile, AUTH_REQUIRED_FIELDS);
    const messages = await loadRecentMessages(sessionId);
    const authReady = authMissingFields.length === 0 && (session.userTurns || 0) >= USER_TURNS_FOR_AUTH;

    setCors(res);
    res.status(200).json({
      ok: true,
      sessionId,
      session: {
        status: session.status || 'active',
        profile,
        messages,
        intakeMissingFields,
        authMissingFields,
        authReady,
        userTurns: session.userTurns || 0,
      },
    });
  } catch (error) {
    logger.error('[createPublicSession] failed', { error: error?.message || String(error) });
    return jsonError(res, 500, 'Failed to create session');
  }
});

export const chatPublicAssistant = onRequest(
  { region: REGION, timeoutSeconds: 60, secrets: [OPENAI_API_KEY] },
  async (req, res) => {
    if (preflight(req, res)) return;
    if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

    const sessionId = normalizeSessionId(req.body?.sessionId);
    const userMessage = asString(req.body?.message);

    if (!sessionId) return jsonError(res, 400, 'sessionId is required');
    if (!userMessage) return jsonError(res, 400, 'message is required');

    try {
      const sessionRef = await ensureSession(sessionId, req.body?.metadata || {});
      const sessionSnap = await sessionRef.get();
      const session = sessionSnap.data() || {};
      const now = admin.firestore.FieldValue.serverTimestamp();

      await sessionRef.collection('messages').doc().set({
        role: 'user',
        content: userMessage,
        createdAt: now,
      });

      const history = await loadRecentMessages(sessionId);
      const profile = session.profile || {};
      const ai = await callOpenAI({ userMessage, history, profile });

      const mergedProfile = {
        ...compactObject(profile),
        ...compactObject(ai.extracted),
      };

      const intakeMissingFields = missingFields(mergedProfile, REQUIRED_PROFILE_FIELDS);
      const authMissingFields = missingFields(mergedProfile, AUTH_REQUIRED_FIELDS);
      const nextUserTurns = (session.userTurns || 0) + 1;
      const authReady = authMissingFields.length === 0 && nextUserTurns >= USER_TURNS_FOR_AUTH;
      const quickReplies = buildQuickReplies(intakeMissingFields);

      await sessionRef.collection('messages').doc().set({
        role: 'assistant',
        content: ai.assistant_reply,
        quickReplies,
        createdAt: now,
        confidence: ai.confidence,
        model: ai.model,
      });

      await sessionRef.set(
        {
          profile: mergedProfile,
          intakeMissingFields,
          authMissingFields,
          authReady,
          updatedAt: now,
          lastMessageAt: now,
          messageCount: admin.firestore.FieldValue.increment(2),
          userTurns: nextUserTurns,
        },
        { merge: true }
      );

      setCors(res);
      res.status(200).json({
        ok: true,
        sessionId,
        assistant: {
          reply: ai.assistant_reply,
          quickReplies,
        },
        profile: mergedProfile,
        intakeMissingFields,
        authMissingFields,
        authReady,
      });
    } catch (error) {
      logger.error('[chatPublicAssistant] failed', {
        sessionId,
        error: error?.message || String(error),
      });
      return jsonError(res, 500, 'Failed to process chat message');
    }
  }
);

export const sendLoginCode = onRequest(
  {
    region: REGION,
    timeoutSeconds: 60,
    secrets: [SENDGRID_API_KEY, QUOTECHEM_FROM_EMAIL],
  },
  async (req, res) => {
    if (preflight(req, res)) return;
    if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

    const sessionId = normalizeSessionId(req.body?.sessionId);
    const email = normalizeEmail(req.body?.email);
    const contactName = asString(req.body?.contactName);

    if (!sessionId) return jsonError(res, 400, 'sessionId is required');
    if (!email) return jsonError(res, 400, 'email is required');

    try {
      const sessionRef = db.collection('publicChatSessions').doc(sessionId);
      const sessionSnap = await sessionRef.get();
      if (!sessionSnap.exists) return jsonError(res, 404, 'session not found');

      const session = sessionSnap.data() || {};
      const authMissingFields = missingFields(session.profile || {}, AUTH_REQUIRED_FIELDS);
      const authReady = authMissingFields.length === 0 && (session.userTurns || 0) >= USER_TURNS_FOR_AUTH;

      if (!authReady) {
        return jsonError(res, 400, `Not ready for authentication yet. Missing: ${authMissingFields.join(', ')}`);
      }

      const active = await findActiveChallenge(sessionId, email);
      if (active) {
        await active.ref.set({ used: true, invalidatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      }

      const code = generateOtp();
      const codeHash = hashOtp(code);
      const nowDate = new Date();
      const expiresAtDate = new Date(nowDate.getTime() + OTP_TTL_MINUTES * 60 * 1000);

      const challengeRef = db.collection('loginChallenges').doc();
      await challengeRef.set({
        challengeId: challengeRef.id,
        sessionId,
        email,
        contactName,
        codeHash,
        attempts: 0,
        maxAttempts: OTP_MAX_ATTEMPTS,
        used: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: admin.firestore.Timestamp.fromDate(expiresAtDate),
      });

      const fromEmail = readSecret(QUOTECHEM_FROM_EMAIL) || 'noreply@quotechem.com';
      const subject = 'Your QuoteChem verification code';
      const text = `Your QuoteChem code is ${code}. It expires in ${OTP_TTL_MINUTES} minutes.`;
      const html = `<p>Your QuoteChem code is <strong style="font-size:22px;letter-spacing:2px;">${code}</strong>.</p><p>This code expires in ${OTP_TTL_MINUTES} minutes.</p>`;

      await sendEmail({ toEmail: email, fromEmail, subject, text, html });

      await sessionRef.set(
        {
          profile: {
            ...(session.profile || {}),
            email,
            ...(contactName ? { contactName } : {}),
          },
          pendingAuth: {
            challengeId: challengeRef.id,
            email,
            expiresAt: admin.firestore.Timestamp.fromDate(expiresAtDate),
          },
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      setCors(res);
      res.status(200).json({
        ok: true,
        sessionId,
        codeSent: true,
        expiresInMinutes: OTP_TTL_MINUTES,
      });
    } catch (error) {
      logger.error('[sendLoginCode] failed', { sessionId, error: error?.message || String(error) });
      return jsonError(res, 500, 'Failed to send login code');
    }
  }
);

export const verifyLoginCode = onRequest({ region: REGION, timeoutSeconds: 60 }, async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  const sessionId = normalizeSessionId(req.body?.sessionId);
  const email = normalizeEmail(req.body?.email);
  const code = asString(req.body?.code);

  if (!sessionId) return jsonError(res, 400, 'sessionId is required');
  if (!email) return jsonError(res, 400, 'email is required');
  if (!code) return jsonError(res, 400, 'code is required');

  try {
    const challengeDoc = await findActiveChallenge(sessionId, email);
    if (!challengeDoc) return jsonError(res, 404, 'No active code for this session/email');

    const challenge = challengeDoc.data() || {};
    const expiresAt = challenge.expiresAt?.toDate ? challenge.expiresAt.toDate() : null;
    if (!expiresAt || expiresAt.getTime() < Date.now()) {
      await challengeDoc.ref.set({ used: true, expiredAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      return jsonError(res, 400, 'Code expired. Request a new code.');
    }

    const attempts = Number(challenge.attempts || 0);
    const maxAttempts = Number(challenge.maxAttempts || OTP_MAX_ATTEMPTS);
    if (attempts >= maxAttempts) {
      await challengeDoc.ref.set({ used: true, lockedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      return jsonError(res, 429, 'Too many attempts. Request a new code.');
    }

    const incomingHash = hashOtp(code);
    if (incomingHash !== challenge.codeHash) {
      await challengeDoc.ref.set(
        {
          attempts: admin.firestore.FieldValue.increment(1),
          lastFailedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      return jsonError(res, 400, 'Invalid code');
    }

    await challengeDoc.ref.set(
      {
        used: true,
        verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    let userRecord;
    try {
      userRecord = await auth.getUserByEmail(email);
    } catch {
      userRecord = await auth.createUser({ email, emailVerified: true });
    }

    const customToken = await auth.createCustomToken(userRecord.uid);

    await migrateSessionToUser(sessionId, userRecord.uid, email);

    setCors(res);
    res.status(200).json({
      ok: true,
      uid: userRecord.uid,
      email,
      customToken,
      migrated: true,
    });
  } catch (error) {
    logger.error('[verifyLoginCode] failed', { sessionId, email, error: error?.message || String(error) });
    return jsonError(res, 500, 'Failed to verify login code');
  }
});

export const sendTestEmail = onRequest(
  {
    region: REGION,
    timeoutSeconds: 60,
    secrets: [SENDGRID_API_KEY, QUOTECHEM_FROM_EMAIL],
  },
  async (req, res) => {
    if (preflight(req, res)) return;
    if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

    const targetEmail = normalizeEmail(req.body?.email);
    const template = asString(req.body?.template) || 'basic';

    if (!targetEmail) return jsonError(res, 400, 'email is required');

    try {
      const fromEmail = readSecret(QUOTECHEM_FROM_EMAIL) || 'noreply@quotechem.com';

      const templates = {
        basic: {
          subject: 'QuoteChem test email: basic',
          text: 'This is a basic SendGrid test from QuoteChem.',
          html: '<h2>QuoteChem</h2><p>This is a <strong>basic</strong> SendGrid test email.</p>',
        },
        quote_status: {
          subject: 'QuoteChem test email: quote status',
          text: 'Your quote request is in review. We will contact you shortly.',
          html: '<h2>QuoteChem Quote Update</h2><p>Your quote request is in review. We will contact you shortly.</p>',
        },
      };

      const selected = templates[template] || templates.basic;
      await sendEmail({
        toEmail: targetEmail,
        fromEmail,
        subject: selected.subject,
        text: selected.text,
        html: selected.html,
      });

      setCors(res);
      res.status(200).json({ ok: true, sent: true, template: template in templates ? template : 'basic' });
    } catch (error) {
      logger.error('[sendTestEmail] failed', { targetEmail, error: error?.message || String(error) });
      return jsonError(res, 500, 'Failed to send test email');
    }
  }
);

export const submitQuoteLead = onRequest(
  {
    region: REGION,
    timeoutSeconds: 60,
    secrets: [SENDGRID_API_KEY, QUOTECHEM_SALES_EMAIL, QUOTECHEM_FROM_EMAIL],
  },
  async (req, res) => {
    if (preflight(req, res)) return;
    if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

    const sessionId = normalizeSessionId(req.body?.sessionId);
    const email = normalizeEmail(req.body?.email);

    if (!sessionId) return jsonError(res, 400, 'sessionId is required');
    if (!email) return jsonError(res, 400, 'email is required');

    try {
      const sessionRef = db.collection('publicChatSessions').doc(sessionId);
      const sessionSnap = await sessionRef.get();
      if (!sessionSnap.exists) return jsonError(res, 404, 'session not found');

      const session = sessionSnap.data() || {};
      const profile = {
        ...(session.profile || {}),
        email,
        contactName: asString(req.body?.contactName) || asString(session.profile?.contactName),
        companyName: asString(req.body?.companyName) || asString(session.profile?.companyName),
        phone: asString(req.body?.phone) || asString(session.profile?.phone),
      };

      const leadRef = db.collection('quoteLeads').doc();
      await leadRef.set({
        leadId: leadRef.id,
        sessionId,
        source: 'public_chat',
        profile,
        status: 'new',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      const toEmail = readSecret(QUOTECHEM_SALES_EMAIL);
      const fromEmail = readSecret(QUOTECHEM_FROM_EMAIL) || 'noreply@quotechem.com';

      if (toEmail) {
        const text = [
          `New QuoteChem lead (${leadRef.id})`,
          `Session: ${sessionId}`,
          `Email: ${profile.email || '-'}`,
          `Chemical: ${profile.chemicalName || '-'}`,
          `Company: ${profile.companyName || '-'}`,
          `Destination: ${profile.destinationCountry || '-'}`,
          `Quantity: ${profile.quantity || '-'} ${profile.quantityUnit || ''}`,
        ].join('\n');

        await sendEmail({
          toEmail,
          fromEmail,
          subject: `QuoteChem lead ${leadRef.id}`,
          text,
          html: text.replace(/\n/g, '<br/>'),
        });
      }

      await sessionRef.set({ profile, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });

      setCors(res);
      res.status(200).json({
        ok: true,
        leadId: leadRef.id,
        emailed: Boolean(toEmail),
      });
    } catch (error) {
      logger.error('[submitQuoteLead] failed', { sessionId, error: error?.message || String(error) });
      return jsonError(res, 500, 'Failed to submit lead');
    }
  }
);
