import { randomUUID } from 'node:crypto';
import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { defineSecret } from 'firebase-functions/params';
import { admin, db } from './firebaseAdmin.js';

const REGION = 'us-central1';
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const SESSION_COLLECTION = 'home2PublicIntakeSessions';
const RFQ_COLLECTION = 'home2PublicRfqs';

const OPENAI_API_KEY = defineSecret('OPENAI_API_KEY');

const REQUIRED_FIELDS = [
  'chemicalName',
  'industryUse',
  'quantity',
  'locationCity',
  'locationStateProvince',
  'locationCountry',
  'email',
];

const OPTIONAL_FIELDS = ['packagingPreference', 'neededBy', 'frequency', 'specNotes', 'chemicalIdentity'];
const ALL_EXTRACTION_FIELDS = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS];

const INITIAL_ASSISTANT_MESSAGE =
  "Hey — I'm QuoteChem V2. Tell me what chemical you need, what industry/use it's for, quantity, and delivery location.";

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

function jsonError(res, status, message, extra = {}) {
  setCors(res);
  res.status(status).json({ ok: false, error: message, ...extra });
}

function asString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeSessionId(value) {
  const v = asString(value);
  if (!v) return '';
  return v.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
}

function normalizeEmail(value) {
  return asString(value).toLowerCase();
}

function isEmail(value) {
  const normalized = normalizeEmail(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

function readSecret(secretRef) {
  try {
    return asString(secretRef.value());
  } catch {
    return '';
  }
}

function normalizeExtractedFields(input = {}) {
  const out = {};
  for (const field of ALL_EXTRACTION_FIELDS) {
    const value = asString(input[field]);
    if (!value) continue;
    out[field] = field === 'email' ? normalizeEmail(value) : value;
  }
  return out;
}

function mergeEdits(extracted = {}, edits = {}) {
  const safeEdits = normalizeExtractedFields(edits || {});
  return {
    ...normalizeExtractedFields(extracted || {}),
    ...safeEdits,
  };
}

function validateExtracted(extracted = {}) {
  const normalized = normalizeExtractedFields(extracted || {});
  const validationErrors = [];

  for (const field of REQUIRED_FIELDS) {
    if (!asString(normalized[field])) {
      validationErrors.push({ field, message: `${field} is required` });
    }
  }

  if (normalized.email && !isEmail(normalized.email)) {
    validationErrors.push({ field: 'email', message: 'email must be valid' });
  }

  return {
    normalized,
    validationErrors,
    canConfirm: validationErrors.length === 0,
  };
}

function mapMessageDoc(docSnap) {
  const data = docSnap.data() || {};
  return {
    id: docSnap.id,
    role: data.role || 'user',
    content: data.content || '',
    createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : null,
    model: data.model || '',
  };
}

async function loadAllMessages(sessionId, maxMessages = 1200) {
  const snap = await db
    .collection(SESSION_COLLECTION)
    .doc(sessionId)
    .collection('messages')
    .orderBy('createdAt', 'asc')
    .limit(maxMessages)
    .get();

  return snap.docs.map(mapMessageDoc);
}

function buildTranscript(messages) {
  return (Array.isArray(messages) ? messages : [])
    .map((item) => `${item.role === 'assistant' ? 'Assistant' : 'User'}: ${asString(item.content)}`)
    .join('\n');
}

async function ensureSession(sessionId, metadata = {}) {
  const ref = db.collection(SESSION_COLLECTION).doc(sessionId);
  const snap = await ref.get();
  const now = admin.firestore.FieldValue.serverTimestamp();

  if (!snap.exists) {
    await ref.set({
      sessionId,
      status: 'active',
      completed: false,
      rfqId: null,
      messageCount: 0,
      metadata: {
        locale: asString(metadata.locale),
        referrer: asString(metadata.referrer),
        userAgent: asString(metadata.userAgent),
      },
      createdAt: now,
      updatedAt: now,
      lastMessageAt: now,
    });

    const initialMessageRef = ref.collection('messages').doc();
    await initialMessageRef.set({
      role: 'assistant',
      content: INITIAL_ASSISTANT_MESSAGE,
      model: 'system-seed',
      createdAt: now,
    });

    await ref.set(
      {
        messageCount: admin.firestore.FieldValue.increment(1),
      },
      { merge: true }
    );

    logger.info('home2_session_created', { sessionId });
  }

  return ref;
}

async function callOpenAIChatV2({ userMessage, transcript }) {
  const apiKey = readSecret(OPENAI_API_KEY);
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  if (!apiKey) {
    return {
      reply: 'Thanks. Please continue with your requirement details, and submit when ready.',
      model: 'fallback-no-openai-key',
      error: 'Missing OPENAI_API_KEY',
    };
  }

  const prompt = [
    'Conversation transcript so far:',
    transcript || '(none)',
    'Latest user message:',
    userMessage,
    'Respond as a concise procurement concierge and ask only one useful follow-up when needed.',
  ].join('\n');

  try {
    const response = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content:
              'You are QuoteChem V2. Be concise, practical, and collect procurement details naturally. Do not output JSON.',
          },
          { role: 'user', content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      const failureText = await response.text();
      throw new Error(`OpenAI chat request failed: ${response.status} ${failureText}`);
    }

    const data = await response.json();
    const reply = asString(data?.choices?.[0]?.message?.content) ||
      'Thanks. Please continue with your requirement details, and submit when ready.';

    return { reply, model, error: '' };
  } catch (error) {
    return {
      reply: 'Thanks. Please continue with your requirement details, and submit when ready.',
      model,
      error: asString(error?.message || String(error)),
    };
  }
}

async function callOpenAIExtractionV2({ transcript }) {
  const apiKey = readSecret(OPENAI_API_KEY);
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  if (!apiKey) {
    throw new Error('Missing OPENAI_API_KEY');
  }

  const prompt = [
    'Extract a strict JSON object from this procurement transcript.',
    'Use only these keys:',
    ALL_EXTRACTION_FIELDS.join(', '),
    'Required keys must be populated when clearly present:',
    REQUIRED_FIELDS.join(', '),
    'Rules: no markdown, no extra keys, keep user phrasing, leave unknown fields as empty/missing.',
    'Transcript:',
    transcript || '(none)',
  ].join('\n');

  const response = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You are a strict data extraction engine. Return valid JSON only. Use only allowed keys and do not infer unsupported details.',
        },
        { role: 'user', content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    const failureText = await response.text();
    throw new Error(`OpenAI extraction request failed: ${response.status} ${failureText}`);
  }

  const data = await response.json();
  const raw = data?.choices?.[0]?.message?.content || '{}';

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = {};
  }

  return {
    extracted: normalizeExtractedFields(parsed || {}),
    model,
  };
}

export const createPublicSessionV2 = onRequest({ region: REGION }, async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  try {
    const requested = normalizeSessionId(req.body?.sessionId);
    const sessionId = requested || randomUUID();

    const sessionRef = await ensureSession(sessionId, req.body?.metadata || {});
    const sessionSnap = await sessionRef.get();
    const session = sessionSnap.data() || {};
    const messages = await loadAllMessages(sessionId, 200);

    setCors(res);
    res.status(200).json({
      ok: true,
      sessionId,
      session: {
        status: session.status || 'active',
        completed: Boolean(session.completed),
        rfqId: asString(session.rfqId),
        messages,
      },
    });
  } catch (error) {
    logger.error('[createPublicSessionV2] failed', { error: error?.message || String(error) });
    return jsonError(res, 500, 'Failed to create session V2');
  }
});

export const chatPublicAssistantV2 = onRequest(
  {
    region: REGION,
    timeoutSeconds: 60,
    secrets: [OPENAI_API_KEY],
  },
  async (req, res) => {
    if (preflight(req, res)) return;
    if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

    const sessionId = normalizeSessionId(req.body?.sessionId);
    const userMessage = asString(req.body?.message);

    if (!sessionId) return jsonError(res, 400, 'sessionId is required');
    if (!userMessage) return jsonError(res, 400, 'message is required');

    try {
      const sessionRef = await ensureSession(sessionId, req.body?.metadata || {});
      const now = admin.firestore.FieldValue.serverTimestamp();

      const userMessageRef = sessionRef.collection('messages').doc();
      await userMessageRef.set({
        role: 'user',
        content: userMessage,
        createdAt: now,
      });

      const messages = await loadAllMessages(sessionId);
      const transcript = buildTranscript(messages);
      const ai = await callOpenAIChatV2({ userMessage, transcript });

      if (ai.error) {
        logger.error('home2_openai_error', {
          sessionId,
          stage: 'chat',
          error: ai.error,
        });
      }

      const assistantMessageRef = sessionRef.collection('messages').doc();
      await assistantMessageRef.set({
        role: 'assistant',
        content: ai.reply,
        model: ai.model,
        createdAt: now,
      });

      await sessionRef.set(
        {
          updatedAt: now,
          lastMessageAt: now,
          messageCount: admin.firestore.FieldValue.increment(2),
        },
        { merge: true }
      );

      logger.info('home2_chat_turn_saved', {
        sessionId,
        model: ai.model,
      });

      setCors(res);
      res.status(200).json({
        ok: true,
        sessionId,
        assistant: {
          reply: ai.reply,
          quickReplies: [],
        },
        completed: false,
      });
    } catch (error) {
      logger.error('[chatPublicAssistantV2] failed', { sessionId, error: error?.message || String(error) });
      return jsonError(res, 500, 'Failed to process chat message V2');
    }
  }
);

export const finalizePublicSessionV2 = onRequest(
  {
    region: REGION,
    timeoutSeconds: 60,
    secrets: [OPENAI_API_KEY],
  },
  async (req, res) => {
    if (preflight(req, res)) return;
    if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

    const sessionId = normalizeSessionId(req.body?.sessionId);
    const action = asString(req.body?.action).toLowerCase();

    if (!sessionId) return jsonError(res, 400, 'sessionId is required');
    if (action !== 'preview' && action !== 'confirm') return jsonError(res, 400, 'action must be preview or confirm');

    try {
      const sessionRef = await ensureSession(sessionId, req.body?.metadata || {});
      const sessionSnap = await sessionRef.get();
      const session = sessionSnap.data() || {};

      if (action === 'confirm' && session.completed && asString(session.rfqId)) {
        setCors(res);
        return res.status(200).json({
          ok: true,
          action: 'confirm',
          saved: true,
          rfqId: asString(session.rfqId),
          idempotent: true,
        });
      }

      const messages = await loadAllMessages(sessionId);
      const transcript = buildTranscript(messages);

      let extraction;
      try {
        extraction = await callOpenAIExtractionV2({ transcript });
      } catch (error) {
        logger.error('home2_openai_error', {
          sessionId,
          stage: 'finalize_extraction',
          error: error?.message || String(error),
        });
        return jsonError(res, 500, 'Failed to extract structured fields');
      }

      const extracted = extraction.extracted;

      if (action === 'preview') {
        const validation = validateExtracted(extracted);

        logger.info('home2_finalize_preview_generated', {
          sessionId,
          model: extraction.model,
          canConfirm: validation.canConfirm,
          validationErrorCount: validation.validationErrors.length,
        });

        setCors(res);
        return res.status(200).json({
          ok: true,
          action: 'preview',
          extracted: validation.normalized,
          validationErrors: validation.validationErrors,
          canConfirm: validation.canConfirm,
        });
      }

      const merged = mergeEdits(extracted, req.body?.edits || {});
      const validation = validateExtracted(merged);

      if (!validation.canConfirm) {
        logger.info('home2_finalize_validation_failed', {
          sessionId,
          validationErrorCount: validation.validationErrors.length,
        });

        setCors(res);
        return res.status(200).json({
          ok: false,
          action: 'confirm',
          validationErrors: validation.validationErrors,
        });
      }

      const rfqId = asString(session.rfqId) || randomUUID();
      const now = admin.firestore.FieldValue.serverTimestamp();

      await db
        .collection(RFQ_COLLECTION)
        .doc(rfqId)
        .set(
          {
            rfqId,
            sessionId,
            status: 'submitted',
            source: 'public_chat_v2',
            extracted: validation.normalized,
            transcript,
            validationMeta: {
              requiredFields: REQUIRED_FIELDS,
              optionalFields: OPTIONAL_FIELDS,
              extractionModel: extraction.model,
              confirmedAt: now,
            },
            createdAt: now,
            updatedAt: now,
          },
          { merge: true }
        );

      await sessionRef.set(
        {
          completed: true,
          status: 'completed',
          rfqId,
          finalizedAt: now,
          updatedAt: now,
        },
        { merge: true }
      );

      logger.info('home2_finalize_confirm_saved', {
        sessionId,
        rfqId,
        model: extraction.model,
      });

      setCors(res);
      return res.status(200).json({
        ok: true,
        action: 'confirm',
        saved: true,
        rfqId,
      });
    } catch (error) {
      logger.error('[finalizePublicSessionV2] failed', { sessionId, error: error?.message || String(error) });
      return jsonError(res, 500, 'Failed to finalize session V2');
    }
  }
);
