import { randomUUID } from 'node:crypto';
import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { defineSecret } from 'firebase-functions/params';
import { admin, db } from './firebaseAdmin.js';

const REGION = 'us-central1';
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_API_KEY = defineSecret('OPENAI_API_KEY');
const SENDGRID_API_KEY = defineSecret('SENDGRID_API_KEY');
const QUOTECHEM_SALES_EMAIL = defineSecret('QUOTECHEM_SALES_EMAIL');
const QUOTECHEM_FROM_EMAIL = defineSecret('QUOTECHEM_FROM_EMAIL');

const REQUIRED_PROFILE_FIELDS = [
  'chemicalName',
  'quantity',
  'quantityUnit',
  'destinationCountry',
  'shippingMode',
  'timeline',
  'email',
];

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
    'Goal: help buyer quickly provide quote-critical info for chemical sourcing and shipping.',
    'Always ask concise follow-up questions if required fields are missing.',
    'Never invent pricing or guaranteed inventory.',
    'If user asks price, explain quote depends on chemical spec, quantity, destination, and timeline.',
    'Return strict JSON only with keys: assistant_reply, intent, extracted, missing_fields, confidence.',
    'extracted keys allowed: chemicalName, quantity, quantityUnit, puritySpec, destinationCountry, destinationPostalCode, shippingMode, incoterm, packagingType, timeline, targetPrice, companyName, contactName, email, phone.',
    'intent must be one of: collect_requirements, pricing_guidance, shipping_guidance, lead_capture, general.',
    'missing_fields should include only unresolved required fields.',
    'assistant_reply should be plain text for the end user and no markdown tables.',
  ].join(' ');
}

async function callOpenAI({ userMessage, history, profile }) {
  const apiKey = readSecret(OPENAI_API_KEY);
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  if (!apiKey) {
    return {
      assistant_reply:
        'To generate your quote, please share chemical name, quantity, destination country, shipping preference, and your email.',
      intent: 'collect_requirements',
      extracted: {},
      missing_fields: REQUIRED_PROFILE_FIELDS,
      confidence: 0.2,
      model: 'fallback-no-openai-key',
    };
  }

  const historyText = history
    .slice(-12)
    .map((item) => `${item.role === 'assistant' ? 'Assistant' : 'User'}: ${item.content}`)
    .join('\n');

  const userPrompt = [
    'Current profile context (may be partial JSON):',
    JSON.stringify(profile || {}),
    'Conversation history:',
    historyText || '(no history)',
    'Latest user message:',
    userMessage,
  ].join('\n');

  const body = {
    model,
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: buildSystemPrompt() },
      { role: 'user', content: userPrompt },
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
        'I can help with your quote. Please share chemical name, quantity, destination country, shipping mode, and email.',
      intent: 'collect_requirements',
      extracted: {},
      missing_fields: REQUIRED_PROFILE_FIELDS,
      confidence: 0.3,
    };
  }

  return {
    assistant_reply: asString(parsed.assistant_reply) || 'Please share the required quote details to continue.',
    intent: asString(parsed.intent) || 'general',
    extracted: compactObject(parsed.extracted || {}),
    missing_fields: Array.isArray(parsed.missing_fields)
      ? parsed.missing_fields.map((item) => asString(item)).filter(Boolean)
      : [],
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
    model,
  };
}

async function sendLeadEmail({ toEmail, fromEmail, subject, html, text }) {
  const apiKey = readSecret(SENDGRID_API_KEY);
  if (!apiKey) {
    throw new Error('Missing SENDGRID_API_KEY');
  }

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

async function loadRecentMessages(sessionId) {
  const snap = await db
    .collection('publicChatSessions')
    .doc(sessionId)
    .collection('messages')
    .orderBy('createdAt', 'asc')
    .limitToLast(20)
    .get();

  return snap.docs.map((docSnap) => {
    const data = docSnap.data() || {};
    const createdAt = data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : null;
    return {
      id: docSnap.id,
      role: data.role || 'user',
      content: data.content || '',
      createdAt,
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
      leadCaptured: false,
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
    const metadata = req.body?.metadata || {};

    const sessionRef = await ensureSession(sessionId, metadata);
    const sessionSnap = await sessionRef.get();
    const data = sessionSnap.data() || {};
    const messages = await loadRecentMessages(sessionId);
    const profile = data.profile || {};
    const missingFields = REQUIRED_PROFILE_FIELDS.filter((field) => !asString(profile[field]));

    setCors(res);
    res.status(200).json({
      ok: true,
      sessionId,
      session: {
        status: data.status || 'active',
        profile,
        leadCaptured: Boolean(data.leadCaptured),
        missingFields,
        messages,
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
    const sessionData = sessionSnap.data() || {};

    const now = admin.firestore.FieldValue.serverTimestamp();
    const userMessageRef = sessionRef.collection('messages').doc();
    await userMessageRef.set({
      role: 'user',
      content: userMessage,
      createdAt: now,
      source: 'web',
    });

    const history = await loadRecentMessages(sessionId);
    const profile = sessionData.profile || {};

    const ai = await callOpenAI({ userMessage, history, profile });

    const mergedProfile = {
      ...compactObject(profile),
      ...compactObject(ai.extracted),
    };

    const missingFields = REQUIRED_PROFILE_FIELDS.filter((field) => !asString(mergedProfile[field]));

    const assistantMessageRef = sessionRef.collection('messages').doc();
    await assistantMessageRef.set({
      role: 'assistant',
      content: ai.assistant_reply,
      createdAt: now,
      intent: ai.intent,
      confidence: ai.confidence,
      missingFields,
      model: ai.model,
    });

    await sessionRef.set(
      {
        profile: mergedProfile,
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
        intent: ai.intent,
        missingFields,
      },
      profile: mergedProfile,
      leadReady: missingFields.length === 0,
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
    const email = asString(req.body?.email);

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
        notes: asString(req.body?.notes),
      };

      const now = admin.firestore.FieldValue.serverTimestamp();
      const leadRef = db.collection('quoteLeads').doc();
      await leadRef.set({
        leadId: leadRef.id,
        sessionId,
        source: 'public_chat',
        profile,
        createdAt: now,
        status: 'new',
      });

      const toEmail = readSecret(QUOTECHEM_SALES_EMAIL);
      const fromEmail = readSecret(QUOTECHEM_FROM_EMAIL) || 'noreply@quotechem.com';

      if (toEmail) {
        const text = [
          `New QuoteChem lead (${leadRef.id})`,
          `Session: ${sessionId}`,
          `Email: ${profile.email || '-'}`,
          `Chemical: ${profile.chemicalName || '-'}`,
          `Quantity: ${profile.quantity || '-'} ${profile.quantityUnit || ''}`,
          `Destination: ${profile.destinationCountry || '-'} ${profile.destinationPostalCode || ''}`,
          `Shipping: ${profile.shippingMode || '-'} / Incoterm: ${profile.incoterm || '-'}`,
          `Timeline: ${profile.timeline || '-'}`,
          `Notes: ${profile.notes || '-'}`,
        ].join('\n');

        const html = text.replace(/\n/g, '<br/>');
        await sendLeadEmail({
          toEmail,
          fromEmail,
          subject: `QuoteChem lead ${leadRef.id}`,
          text,
          html,
        });
      }

      await sessionRef.set(
        {
          profile,
          leadCaptured: true,
          updatedAt: now,
        },
        { merge: true }
      );

      setCors(res);
      res.status(200).json({
        ok: true,
        leadId: leadRef.id,
        sessionId,
        emailed: Boolean(toEmail),
      });
    } catch (error) {
      logger.error('[submitQuoteLead] failed', {
        sessionId,
        error: error?.message || String(error),
      });
      return jsonError(res, 500, 'Failed to submit lead');
    }
  }
);
