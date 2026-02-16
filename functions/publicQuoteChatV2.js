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
const SENDGRID_API_KEY = defineSecret('SENDGRID_API_KEY');
const QUOTECHEM_FROM_EMAIL = defineSecret('QUOTECHEM_FROM_EMAIL');

const REQUIRED_FIELDS = ['chemicalName', 'industryUse', 'quantity', 'deliveryLocation', 'email'];
const OPTIONAL_FIELDS = ['packagingPreference', 'neededBy', 'frequency', 'specNotes', 'chemicalIdentity'];
const ALL_EXTRACTION_FIELDS = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS, 'confirm'];

const INITIAL_ASSISTANT_MESSAGE =
  "Hey — I'm QuoteChem V2. Tell me what chemical you need, what industry/use it's for, quantity, delivery location, and email.";

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

function shouldUseHome2AutoConfirmFlow() {
  return String(process.env.HOME2_AUTO_CONFIRM_FLOW || 'false').toLowerCase() === 'true';
}

function escapeHtml(text) {
  return asString(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeExtractedTurnState(input = {}) {
  const out = {};
  for (const field of ALL_EXTRACTION_FIELDS) {
    const raw = input[field];
    if (field === 'confirm') {
      if (typeof raw === 'boolean') out.confirm = raw;
      else if (typeof raw === 'string') out.confirm = ['true', 'yes', 'confirmed', 'confirm'].includes(raw.trim().toLowerCase());
      continue;
    }

    const value = asString(raw);
    if (!value) continue;
    out[field] = field === 'email' ? normalizeEmail(value) : value;
  }

  if (typeof out.confirm !== 'boolean') out.confirm = false;
  return out;
}

function mergeEdits(extracted = {}, edits = {}) {
  const base = normalizeExtractedTurnState(extracted || {});
  const merged = {
    ...base,
    ...normalizeExtractedTurnState(edits || {}),
  };
  merged.confirm = Boolean(base.confirm);
  return merged;
}

function validateExtractedTurnState(extracted = {}) {
  const normalized = normalizeExtractedTurnState(extracted || {});
  const validationErrors = [];
  const missingRequired = [];

  for (const field of REQUIRED_FIELDS) {
    if (!asString(normalized[field])) {
      missingRequired.push(field);
      validationErrors.push({ field, message: `${field} is required` });
    }
  }

  if (normalized.email && !isEmail(normalized.email)) {
    validationErrors.push({ field: 'email', message: 'email must be valid' });
  }

  const canConfirm = validationErrors.length === 0;

  return {
    normalized,
    validationErrors,
    missingRequired,
    canConfirm,
    readyToFinalize: canConfirm,
  };
}

function computeCompletionFingerprint(extracted = {}) {
  return REQUIRED_FIELDS.map((field) => asString(extracted[field]).toLowerCase()).join('|');
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
      completionFingerprint: '',
      lastFinalizedExtracted: null,
      emailSend: {
        status: 'not_attempted',
        attemptedAt: null,
        sentAt: null,
        error: '',
        messageId: '',
      },
      metadata: {
        locale: asString(metadata.locale),
        referrer: asString(metadata.referrer),
        userAgent: asString(metadata.userAgent),
      },
      createdAt: now,
      updatedAt: now,
      lastMessageAt: now,
    });

    await ref.collection('messages').doc().set({
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

async function callOpenAIExtractionTurnV2({ transcript }) {
  const apiKey = readSecret(OPENAI_API_KEY);
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  if (!apiKey) throw new Error('Missing OPENAI_API_KEY');

  const prompt = [
    'Extract a strict JSON object from this procurement transcript.',
    'Allowed keys only:',
    ALL_EXTRACTION_FIELDS.join(', '),
    'Required fields:',
    REQUIRED_FIELDS.join(', '),
    'Set confirm=true only if the user clearly confirms proceeding/submitting.',
    'No markdown. No extra keys.',
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
            'You are a strict extraction engine. Return JSON only with allowed keys. Keep values concise and faithful to transcript.',
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
    extracted: normalizeExtractedTurnState(parsed || {}),
    model,
  };
}

async function callOpenAIConversationV2({ transcript, userMessage, extracted, missingRequired, confirmRequested }) {
  const apiKey = readSecret(OPENAI_API_KEY);
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  if (!apiKey) {
    return {
      reply: 'Thanks. Please continue with your requirement details.',
      model: 'fallback-no-openai-key',
      error: 'Missing OPENAI_API_KEY',
    };
  }

  const prompt = [
    'Conversation transcript so far:',
    transcript || '(none)',
    'Latest user message:',
    userMessage,
    'Current extracted snapshot:',
    JSON.stringify(extracted || {}),
    `Missing required fields: ${(missingRequired || []).join(', ') || 'none'}`,
    `User requested confirm: ${confirmRequested ? 'true' : 'false'}`,
    'Reply as QuoteChem V2. If missing fields exist, ask one concise missing-field question. If all fields complete and not confirmed, ask for confirmation.',
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
              'You are QuoteChem V2, concise procurement concierge. Ask one question at a time. Do not output JSON.',
          },
          { role: 'user', content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      const failureText = await response.text();
      throw new Error(`OpenAI conversation request failed: ${response.status} ${failureText}`);
    }

    const data = await response.json();
    const reply = asString(data?.choices?.[0]?.message?.content) || 'Please continue with the remaining details.';

    return { reply, model, error: '' };
  } catch (error) {
    return {
      reply: 'Please continue with the remaining details.',
      model,
      error: asString(error?.message || String(error)),
    };
  }
}

function buildMissingFieldsPrompt(missingRequired) {
  if (!Array.isArray(missingRequired) || missingRequired.length === 0) return '';
  const labelMap = {
    chemicalName: 'chemical name/type',
    industryUse: 'industry/use',
    quantity: 'quantity',
    deliveryLocation: 'delivery location',
    email: 'email',
  };

  const first = labelMap[missingRequired[0]] || missingRequired[0];
  return `Before I finalize, I still need your ${first}.`;
}

async function sendEmailV2({ toEmail, subject, text, html }) {
  const apiKey = readSecret(SENDGRID_API_KEY);
  if (!apiKey) throw new Error('Missing SENDGRID_API_KEY');

  const fromEmail = readSecret(QUOTECHEM_FROM_EMAIL) || 'noreply@quotechem.com';

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

  return {
    messageId: response.headers.get('x-message-id') || '',
  };
}

function buildEmailBrandShell({ title, preheader, contentHtml, contentText }) {
  const safeTitle = escapeHtml(title);
  const safePreheader = escapeHtml(preheader);
  const logoUrl = escapeHtml(asString(process.env.EMAIL_BRAND_LOGO_URL) || 'https://quotechemfb.web.app/assets/quotechem-logo.png');

  const html = [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    `<title>${safeTitle}</title>`,
    '</head>',
    '<body style="margin:0;padding:0;background:#f3f6fb;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Arial,sans-serif;color:#0f172a;">',
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${safePreheader}</div>`,
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f6fb;padding:22px 10px;">',
    '<tr><td align="center">',
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#ffffff;border-radius:16px;border:1px solid #dbe7ff;overflow:hidden;">',
    '<tr><td style="padding:18px 22px;background:#0f2a56;">',
    `<img src="${logoUrl}" alt="QuoteChem" style="display:block;height:34px;width:auto;max-width:180px;" />`,
    '</td></tr>',
    `<tr><td style="padding:24px 22px 10px;"><h1 style="margin:0;font-size:24px;line-height:1.3;color:#0f172a;">${safeTitle}</h1></td></tr>`,
    `<tr><td style="padding:0 22px 18px;">${contentHtml}</td></tr>`,
    '<tr><td style="padding:16px 22px;background:#f8fafc;border-top:1px solid #e2e8f0;">',
    '<p style="margin:0;font-size:12px;line-height:1.45;color:#64748b;">Information in this email is provided for quote preparation and should be confirmed before purchase.</p>',
    '</td></tr>',
    '</table>',
    '</td></tr>',
    '</table>',
    '</body>',
    '</html>',
  ].join('');

  const text = [
    title,
    '',
    preheader,
    '',
    contentText,
    '',
    'Information in this email is provided for quote preparation and should be confirmed before purchase.',
  ].join('\n');

  return { html, text };
}

function buildCustomerEmailV2(extracted) {
  const chemical = asString(extracted.chemicalName) || 'Chemical Request';
  const location = asString(extracted.deliveryLocation) || 'your destination';
  const subject = `QuoteChem Request Received — ${chemical} to ${location}`;

  const summaryRows = [
    ['Chemical', extracted.chemicalName],
    ['Industry / Use', extracted.industryUse],
    ['Quantity', extracted.quantity],
    ['Delivery', extracted.deliveryLocation],
    ['Email', extracted.email],
    ['Packaging', extracted.packagingPreference],
    ['Needed By', extracted.neededBy],
    ['Frequency', extracted.frequency],
    ['Chemical Details', extracted.chemicalIdentity],
    ['Notes', extracted.specNotes],
  ].filter(([, value]) => asString(value));

  const htmlRows = summaryRows
    .map(([label, value]) => `<tr><td style="padding:6px 10px;border:1px solid #d1d5db"><strong>${escapeHtml(label)}</strong></td><td style="padding:6px 10px;border:1px solid #d1d5db">${escapeHtml(value)}</td></tr>`)
    .join('');

  const contentHtml = [
    '<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#1e293b;">Thanks for your request. We received your RFQ and started supplier outreach.</p>',
    '<h3 style="margin:14px 0 8px;font-size:17px;color:#0f172a;">Request Summary</h3>',
    `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-size:14px;color:#0f172a;">${htmlRows}</table>`,
    '<p style="margin:12px 0 0;font-size:13px;line-height:1.55;color:#64748b;"><em>Final pricing depends on grade, packaging, freight, and lead time.</em></p>',
  ].join('');

  const contentText = [
    'Thanks for your request. We received your RFQ and started supplier outreach.',
    '',
    'Request Summary:',
    ...summaryRows.map(([label, value]) => `- ${label}: ${value}`),
  ].join('\n');

  const shell = buildEmailBrandShell({
    title: 'QuoteChem Request Received',
    preheader: `We received your ${chemical} RFQ and started supplier outreach.`,
    contentHtml,
    contentText,
  });

  return {
    subject,
    text: shell.text,
    html: shell.html,
  };
}

async function finalizeFromExtracted({ sessionRef, sessionId, sessionDoc, extracted, transcript }) {
  const validation = validateExtractedTurnState(extracted);
  if (!validation.canConfirm) {
    return {
      confirmed: false,
      blocked: true,
      missingRequired: validation.missingRequired,
      validationErrors: validation.validationErrors,
      readyToFinalize: false,
      rfqId: asString(sessionDoc?.rfqId),
      emailStatus: sessionDoc?.emailSend?.status || 'not_attempted',
    };
  }

  const normalized = validation.normalized;
  const fingerprint = computeCompletionFingerprint(normalized);
  const alreadySent = asString(sessionDoc?.completionFingerprint) === fingerprint && asString(sessionDoc?.emailSend?.status) === 'sent';

  if (alreadySent) {
    logger.info('home2_idempotent_skip', { sessionId, rfqId: asString(sessionDoc?.rfqId) });
    return {
      confirmed: true,
      blocked: false,
      missingRequired: [],
      validationErrors: [],
      readyToFinalize: true,
      rfqId: asString(sessionDoc?.rfqId),
      emailStatus: 'sent',
      idempotent: true,
    };
  }

  const rfqId = asString(sessionDoc?.rfqId) || randomUUID();
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
        extracted: normalized,
        confirmSource: 'ai_transcript',
        transcript,
        emailStatus: 'pending',
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
      completionFingerprint: fingerprint,
      lastFinalizedExtracted: normalized,
      finalizedAt: now,
      updatedAt: now,
      emailSend: {
        status: 'pending',
        attemptedAt: now,
        sentAt: null,
        error: '',
        messageId: '',
      },
    },
    { merge: true }
  );

  logger.info('home2_finalize_saved', { sessionId, rfqId });

  logger.info('home2_email_attempted', { sessionId, rfqId });

  try {
    const customerEmail = buildCustomerEmailV2(normalized);
    const emailResult = await sendEmailV2({
      toEmail: normalized.email,
      subject: customerEmail.subject,
      text: customerEmail.text,
      html: customerEmail.html,
    });

    await sessionRef.set(
      {
        updatedAt: now,
        emailSend: {
          status: 'sent',
          attemptedAt: now,
          sentAt: now,
          error: '',
          messageId: emailResult.messageId,
        },
      },
      { merge: true }
    );

    await db.collection(RFQ_COLLECTION).doc(rfqId).set(
      {
        emailStatus: 'sent',
        emailMessageId: emailResult.messageId,
        updatedAt: now,
      },
      { merge: true }
    );

    logger.info('home2_email_sent', { sessionId, rfqId, messageId: emailResult.messageId });

    return {
      confirmed: true,
      blocked: false,
      missingRequired: [],
      validationErrors: [],
      readyToFinalize: true,
      rfqId,
      emailStatus: 'sent',
      idempotent: false,
    };
  } catch (error) {
    const errorText = asString(error?.message || String(error));

    await sessionRef.set(
      {
        updatedAt: now,
        emailSend: {
          status: 'failed',
          attemptedAt: now,
          sentAt: null,
          error: errorText,
          messageId: '',
        },
      },
      { merge: true }
    );

    await db.collection(RFQ_COLLECTION).doc(rfqId).set(
      {
        emailStatus: 'failed',
        emailError: errorText,
        updatedAt: now,
      },
      { merge: true }
    );

    logger.error('home2_email_failed', { sessionId, rfqId, error: errorText });

    return {
      confirmed: true,
      blocked: false,
      missingRequired: [],
      validationErrors: [],
      readyToFinalize: true,
      rfqId,
      emailStatus: 'failed',
      idempotent: false,
    };
  }
}

function buildStateResponse({ extracted, validation, confirmed, rfqId, emailStatus }) {
  return {
    extracted: {
      ...validation.normalized,
      confirm: Boolean(extracted?.confirm),
    },
    missingRequired: validation.missingRequired,
    readyToFinalize: validation.readyToFinalize,
    confirmed: Boolean(confirmed),
    emailStatus: asString(emailStatus),
    rfqId: asString(rfqId),
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
        emailStatus: asString(session?.emailSend?.status || 'not_attempted'),
        lastFinalizedExtracted: session?.lastFinalizedExtracted || {},
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
    secrets: [OPENAI_API_KEY, SENDGRID_API_KEY, QUOTECHEM_FROM_EMAIL],
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
      const sessionSnap = await sessionRef.get();
      const session = sessionSnap.data() || {};
      const now = admin.firestore.FieldValue.serverTimestamp();

      await sessionRef.collection('messages').doc().set({
        role: 'user',
        content: userMessage,
        createdAt: now,
      });

      const messages = await loadAllMessages(sessionId);
      const transcript = buildTranscript(messages);

      let extracted = { confirm: false };
      let extractionModel = '';
      try {
        const extraction = await callOpenAIExtractionTurnV2({ transcript });
        extracted = extraction.extracted;
        extractionModel = extraction.model;
      } catch (error) {
        logger.error('home2_openai_error', {
          sessionId,
          stage: 'turn_extraction',
          error: error?.message || String(error),
        });
      }

      const validation = validateExtractedTurnState(extracted);
      const confirmRequested = Boolean(extracted.confirm);

      logger.info('home2_turn_extraction_generated', {
        sessionId,
        model: extractionModel || 'unknown',
        confirm: confirmRequested,
        missingRequired: validation.missingRequired,
      });

      let finalizeResult = {
        confirmed: false,
        blocked: false,
        missingRequired: validation.missingRequired,
        validationErrors: validation.validationErrors,
        readyToFinalize: validation.readyToFinalize,
        rfqId: asString(session.rfqId),
        emailStatus: asString(session?.emailSend?.status || 'not_attempted'),
        idempotent: false,
      };

      const autoConfirmEnabled = shouldUseHome2AutoConfirmFlow();

      if (autoConfirmEnabled && confirmRequested) {
        logger.info('home2_confirm_detected', { sessionId, autoConfirmEnabled: true });
        if (validation.canConfirm) {
          finalizeResult = await finalizeFromExtracted({
            sessionRef,
            sessionId,
            sessionDoc: session,
            extracted: validation.normalized,
            transcript,
          });
        } else {
          logger.info('home2_finalize_blocked_missing_fields', {
            sessionId,
            missingRequired: validation.missingRequired,
          });
          finalizeResult = {
            ...finalizeResult,
            blocked: true,
          };
        }
      }

      let assistantReply = '';
      if (autoConfirmEnabled && confirmRequested && !validation.canConfirm) {
        assistantReply = buildMissingFieldsPrompt(validation.missingRequired) || 'Before I finalize, I still need a few details.';
      } else if (finalizeResult.confirmed) {
        assistantReply =
          finalizeResult.emailStatus === 'sent'
            ? `Confirmed — your request is submitted. I sent your confirmation email. RFQ ID: ${asString(finalizeResult.rfqId)}.`
            : `Confirmed — your request is submitted (RFQ ID: ${asString(finalizeResult.rfqId)}). I could not send email yet, but your request is saved.`;
      } else {
        const conversation = await callOpenAIConversationV2({
          transcript,
          userMessage,
          extracted: validation.normalized,
          missingRequired: validation.missingRequired,
          confirmRequested,
        });

        if (conversation.error) {
          logger.error('home2_openai_error', {
            sessionId,
            stage: 'conversation',
            error: conversation.error,
          });
        }

        assistantReply = asString(conversation.reply) || 'Please continue with your requirement details.';
      }

      await sessionRef.collection('messages').doc().set({
        role: 'assistant',
        content: assistantReply,
        model: extractionModel || process.env.OPENAI_MODEL || 'gpt-4o-mini',
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

      setCors(res);
      return res.status(200).json({
        ok: true,
        sessionId,
        assistant: {
          reply: assistantReply,
          quickReplies: [],
        },
        state: buildStateResponse({
          extracted,
          validation,
          confirmed: finalizeResult.confirmed,
          rfqId: finalizeResult.rfqId,
          emailStatus: finalizeResult.emailStatus,
        }),
        completed: Boolean(finalizeResult.confirmed),
        rfqId: asString(finalizeResult.rfqId),
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
    secrets: [OPENAI_API_KEY, SENDGRID_API_KEY, QUOTECHEM_FROM_EMAIL],
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
      const messages = await loadAllMessages(sessionId);
      const transcript = buildTranscript(messages);

      let extraction;
      try {
        extraction = await callOpenAIExtractionTurnV2({ transcript });
      } catch (error) {
        logger.error('home2_openai_error', {
          sessionId,
          stage: 'manual_finalize_extraction',
          error: error?.message || String(error),
        });
        return jsonError(res, 500, 'Failed to extract structured fields');
      }

      const extracted = extraction.extracted;

      if (action === 'preview') {
        const validation = validateExtractedTurnState(extracted);
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
          extracted: {
            ...validation.normalized,
            confirm: Boolean(extracted.confirm),
          },
          validationErrors: validation.validationErrors,
          missingRequired: validation.missingRequired,
          canConfirm: validation.canConfirm,
        });
      }

      const merged = mergeEdits(extracted, req.body?.edits || {});
      const finalizeResult = await finalizeFromExtracted({
        sessionRef,
        sessionId,
        sessionDoc: session,
        extracted: merged,
        transcript,
      });

      if (finalizeResult.blocked) {
        logger.info('home2_finalize_validation_failed', {
          sessionId,
          validationErrorCount: finalizeResult.validationErrors.length,
        });

        setCors(res);
        return res.status(200).json({
          ok: false,
          action: 'confirm',
          validationErrors: finalizeResult.validationErrors,
          missingRequired: finalizeResult.missingRequired,
        });
      }

      setCors(res);
      return res.status(200).json({
        ok: true,
        action: 'confirm',
        saved: true,
        rfqId: finalizeResult.rfqId,
        emailStatus: finalizeResult.emailStatus,
        idempotent: Boolean(finalizeResult.idempotent),
      });
    } catch (error) {
      logger.error('[finalizePublicSessionV2] failed', { sessionId, error: error?.message || String(error) });
      return jsonError(res, 500, 'Failed to finalize session V2');
    }
  }
);
