import { randomUUID } from 'node:crypto';
import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { defineSecret } from 'firebase-functions/params';
import { admin, db } from './firebaseAdmin.js';

const REGION = 'us-central1';
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const SESSION_COLLECTION = 'publicIntakeSessions';

const OPENAI_API_KEY = defineSecret('OPENAI_API_KEY');
const SENDGRID_API_KEY = defineSecret('SENDGRID_API_KEY');
const QUOTECHEM_FROM_EMAIL = defineSecret('QUOTECHEM_FROM_EMAIL');

const PROFILE_FIELDS = [
  'chemicalName',
  'companyName',
  'location',
  'destinationCountry',
  'quantity',
  'quantityUnit',
  'timeline',
  'shippingMode',
  'contactName',
  'email',
  'notes',
];

const IMPORTANT_FIELDS = ['chemicalName', 'destinationCountry', 'quantity'];

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

function compactObject(input) {
  const out = {};
  Object.entries(input || {}).forEach(([key, value]) => {
    if (!PROFILE_FIELDS.includes(key)) return;
    const cleaned = asString(value);
    if (cleaned) out[key] = key === 'email' ? normalizeEmail(cleaned) : cleaned;
  });
  return out;
}

function missingFields(profile, required) {
  return required.filter((field) => !asString(profile[field]));
}

function buildQuickReplies(missing) {
  const map = {
    chemicalName: 'Chemical: Citric Acid',
    destinationCountry: 'Destination: United States',
    quantity: 'Quantity: 2 metric tons',
  };

  return missing
    .slice(0, 3)
    .map((field) => map[field])
    .filter(Boolean);
}

function buildSystemPrompt() {
  return [
    'You are QuoteChem, a public chemical sourcing assistant.',
    'Goal: ask concise follow-up questions and gather quote intake details.',
    'Ask one short next question at a time.',
    'Do not mention authentication or login.',
    'Do not make final pricing commitments.',
    'Return strict JSON only with keys: assistant_reply, extracted, confidence.',
    'extracted keys allowed only:',
    PROFILE_FIELDS.join(', '),
  ].join(' ');
}

async function callOpenAI({ userMessage, history, profile }) {
  const apiKey = readSecret(OPENAI_API_KEY);
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  if (!apiKey) {
    return {
      assistant_reply:
        'Got it. What chemical do you need, what quantity, and where should it be delivered?',
      extracted: {},
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
    temperature: 0.3,
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
      assistant_reply: 'Thanks. Please share chemical name, quantity, and delivery location.',
      extracted: {},
      confidence: 0.3,
    };
  }

  return {
    assistant_reply: asString(parsed.assistant_reply) || 'Please continue with your requirements.',
    extracted: compactObject(parsed.extracted || {}),
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
    model,
  };
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
    .collection(SESSION_COLLECTION)
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
  const ref = db.collection(SESSION_COLLECTION).doc(sessionId);
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
      createdAt: now,
      updatedAt: now,
      lastMessageAt: now,
    });
  }

  return ref;
}

export const createPublicSession = onRequest({ region: REGION }, async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  try {
    const requested = normalizeSessionId(req.body?.sessionId);
    const sessionId = requested || randomUUID();

    const sessionRef = await ensureSession(sessionId, req.body?.metadata || {});
    const sessionSnap = await sessionRef.get();
    const session = sessionSnap.data() || {};
    const profile = session.profile || {};

    const messages = await loadRecentMessages(sessionId);
    const missing = missingFields(profile, IMPORTANT_FIELDS);

    setCors(res);
    res.status(200).json({
      ok: true,
      sessionId,
      session: {
        status: session.status || 'active',
        profile,
        messages,
        missingFields: missing,
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

      const missing = missingFields(mergedProfile, IMPORTANT_FIELDS);
      const quickReplies = buildQuickReplies(missing);

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
          missingFields: missing,
          updatedAt: now,
          lastMessageAt: now,
          messageCount: admin.firestore.FieldValue.increment(2),
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
        missingFields: missing,
      });
    } catch (error) {
      logger.error('[chatPublicAssistant] failed', { sessionId, error: error?.message || String(error) });
      return jsonError(res, 500, 'Failed to process chat message');
    }
  }
);

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
