import { randomUUID } from 'node:crypto';
import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { defineSecret } from 'firebase-functions/params';
import { admin, db } from './firebaseAdmin.js';

const REGION = 'us-central1';
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const SESSION_COLLECTION = 'publicIntakeSessions';
const RFQ_COLLECTION = 'publicRfqs';

const OPENAI_API_KEY = defineSecret('OPENAI_API_KEY');
const SENDGRID_API_KEY = defineSecret('SENDGRID_API_KEY');

const REQUIRED_FIELDS = ['chemicalName', 'industryUse', 'quantity', 'deliveryLocation', 'email'];
const OPTIONAL_FIELDS = [
  'packagingPreference',
  'neededBy',
  'frequency',
  'specNotes',
  'additionalNotes',
  'chemicalIdentity',
  'contactName',
  'companyName',
  'phone',
  'jobTitle',
  'website',
  'companyAddress',
];
const ALL_EXTRACTION_FIELDS = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS, 'confirm'];

const INITIAL_ASSISTANT_MESSAGE =
  "Hey — I'm QuoteChem. Tell me what chemical you need, what industry/use it's for, quantity, and delivery location.";

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

function shouldUseAutoConfirmFlow() {
  const raw = String(process.env.AUTO_CONFIRM_FLOW || '').trim().toLowerCase();
  if (!raw) return true;
  return raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on';
}

function normalizeRole(value) {
  const role = asString(value).toLowerCase();
  return role === 'admin' ? 'admin' : 'user';
}

function mapLeadStage(session = {}) {
  const explicit = asString(session.leadStage);
  if (explicit) return explicit;
  if (Boolean(session.completed)) return 'completed';
  if (Number(session.messageCount || 0) > 1) return 'in_progress';
  return 'new';
}

async function authenticateRequest(req) {
  const header = asString(req.headers?.authorization || req.headers?.Authorization);
  if (!header.toLowerCase().startsWith('bearer ')) {
    const err = new Error('Missing Bearer token');
    err.status = 401;
    throw err;
  }

  const idToken = header.slice(7).trim();
  if (!idToken) {
    const err = new Error('Missing Bearer token');
    err.status = 401;
    throw err;
  }

  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    const userSnap = await db.collection('users').doc(decoded.uid).get();
    const userData = userSnap.data() || {};
    return {
      uid: decoded.uid,
      email: asString(decoded.email) || asString(userData.email),
      role: normalizeRole(userData.role),
    };
  } catch (error) {
    const err = new Error('Invalid authentication token');
    err.status = 401;
    err.cause = error;
    throw err;
  }
}

async function requireAdmin(req) {
  const user = await authenticateRequest(req);
  if (user.role !== 'admin') {
    const err = new Error('Forbidden');
    err.status = 403;
    throw err;
  }
  return user;
}

const MINI_APP_IDS = ['quotes', 'drilling-fluids-report', 'user-access', 'account'];
const ACCESS_MANAGED_MINI_APP_IDS = ['quotes', 'drilling-fluids-report'];

function normalizeMiniAppIds(value) {
  if (!Array.isArray(value)) return null;
  const seen = new Set();
  for (const item of value) {
    const id = asString(item);
    if (ACCESS_MANAGED_MINI_APP_IDS.includes(id)) seen.add(id);
  }
  return Array.from(seen);
}

function defaultEnabledMiniAppsForRole(role) {
  return role === 'admin' ? [...ACCESS_MANAGED_MINI_APP_IDS] : [];
}

function isValidTemporaryPassword(value) {
  return asString(value).length >= 6;
}

function mapUserDoc(doc) {
  const data = doc.data() || {};
  const role = normalizeRole(data.role);
  return {
    uid: asString(data.uid) || doc.id,
    email: asString(data.email),
    role,
    enabledMiniApps: normalizeMiniAppIds(data.enabledMiniApps) || defaultEnabledMiniAppsForRole(role),
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
    createdBy: asString(data.createdBy),
  };
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

function looksLikeUserConfirmation(message) {
  const text = asString(message).toLowerCase();
  if (!text) return false;

  if (/\b(do not|don't|dont|not yet|no)\s+(submit|confirm|proceed|send)\b/.test(text)) {
    return false;
  }

  return /\b(confirm|confirmed|proceed|submit|send it|go ahead|looks good|that's correct|that is correct|approved|approve)\b/.test(text);
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
      leadStage: 'new',
      assignedTo: '',
      priority: 'medium',
      internalNotes: '',
      internalNotesUpdatedAt: null,
      internalNotesUpdatedBy: '',
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

    logger.info('public_session_created', { sessionId });
  }

  return ref;
}

async function callOpenAIExtractionTurn({ transcript }) {
  const apiKey = readSecret(OPENAI_API_KEY);
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  if (!apiKey) throw new Error('Missing OPENAI_API_KEY');

  const prompt = [
    'Extract a strict JSON object from this procurement transcript.',
    'Allowed keys only:',
    ALL_EXTRACTION_FIELDS.join(', '),
    'Required fields:',
    REQUIRED_FIELDS.join(', '),
    'Optional fields should be included only if the user explicitly provided them in the transcript.',
    'Use additionalNotes to capture other important context not covered by other fields; concise summary is preferred.',
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

async function callOpenAIConversation({ transcript, userMessage, extracted, missingRequired, confirmRequested }) {
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
    'Reply as QuoteChem.',
    'If user asks an informational question (examples: what chemicals are used in drilling fluids, what grade is typical), answer it clearly first.',
    'After answering, continue intake naturally: ask at most one concise follow-up only when it fits.',
    'Do not force a follow-up question in every message.',
    'Keep replies short: maximum 2 brief sentences.',
    'If required fields are missing, prefer the most important next field but keep the tone consultative.',
    'If all required fields are complete and user has not confirmed, ask only for email confirmation in one short sentence.',
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
              'You are QuoteChem, concise procurement concierge. Be helpful and informative. Answer user questions directly when asked, then guide intake step-by-step. Ask at most one follow-up question when appropriate. Keep each reply to at most 2 short sentences. Do not output JSON.',
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

async function sendEmail({ toEmail, subject, text, html }) {
  const apiKey = readSecret(SENDGRID_API_KEY);
  if (!apiKey) throw new Error('Missing SENDGRID_API_KEY');

  const fromEmail = asString(process.env.QUOTECHEM_FROM_EMAIL) || 'noreply@quotechem.com';
  const fromName = 'QuoteChem';

  const payload = {
    personalizations: [{ to: [{ email: toEmail }] }],
    from: { email: fromEmail, name: fromName },
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
  const logoUrl = escapeHtml(
    asString(process.env.EMAIL_BRAND_LOGO_URL) || 'https://quotechemfb.web.app/assets/QuoteChem%20Logo%201000%20White.png'
  );

  const html = [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    `<title>${safeTitle}</title>`,
    '</head>',
    '<body style="margin:0;padding:0;background:#ecf3ff;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Arial,sans-serif;color:#0f172a;">',
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${safePreheader}</div>`,
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#ecf3ff;padding:24px 10px;">',
    '<tr><td align="center">',
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:700px;background:#ffffff;border-radius:20px;border:1px solid #cfe0ff;overflow:hidden;box-shadow:0 16px 44px rgba(15,42,86,0.12);">',
    '<tr><td style="padding:28px 28px 22px;background:linear-gradient(135deg,#0f2a56 0%,#143e7d 100%);">',
    `<img src="${logoUrl}" alt="QuoteChem" style="display:block;height:56px;width:auto;max-width:280px;" />`,
    '<p style="margin:12px 0 0;font-size:12px;line-height:1.4;color:#dbeafe;letter-spacing:.08em;text-transform:uppercase;">Procurement Confirmation</p>',
    '</td></tr>',
    `<tr><td style="padding:24px 28px 8px;"><h1 style="margin:0;font-size:28px;line-height:1.25;color:#0f172a;">${safeTitle}</h1></td></tr>`,
    `<tr><td style="padding:0 28px 22px;">${contentHtml}</td></tr>`,
    '<tr><td style="padding:18px 28px;background:#f7faff;border-top:1px solid #dde8ff;">',
    '<p style="margin:0;font-size:12px;line-height:1.55;color:#64748b;">Information in this email is provided for quote preparation and should be confirmed before purchase.</p>',
    '<p style="margin:8px 0 0;font-size:12px;line-height:1.55;color:#64748b;">QuoteChem, Calgary AB</p>',
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

function buildCustomerEmail(extracted) {
  const chemical = asString(extracted.chemicalName) || 'Chemical Request';
  const location = asString(extracted.deliveryLocation) || 'your destination';
  const subject = `QuoteChem Request Received — ${chemical} to ${location}`;

  const summaryRows = [
    ['Chemical', extracted.chemicalName],
    ['Industry / Use', extracted.industryUse],
    ['Quantity', extracted.quantity],
    ['Delivery', extracted.deliveryLocation],
    ['Email', extracted.email],
    ['Contact Name', extracted.contactName],
    ['Company Name', extracted.companyName],
    ['Phone', extracted.phone],
    ['Job Title', extracted.jobTitle],
    ['Website', extracted.website],
    ['Company Address', extracted.companyAddress],
    ['Packaging', extracted.packagingPreference],
    ['Needed By', extracted.neededBy],
    ['Frequency', extracted.frequency],
    ['Chemical Details', extracted.chemicalIdentity],
    ['Notes', extracted.specNotes],
  ].filter(([, value]) => asString(value));

  const htmlRows = summaryRows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:10px 12px;border:1px solid #dbe7ff;background:#f8fbff;width:38%;font-size:13px;line-height:1.45;color:#1e3a5f;"><strong>${escapeHtml(
          label
        )}</strong></td><td style="padding:10px 12px;border:1px solid #dbe7ff;font-size:14px;line-height:1.5;color:#0f172a;">${escapeHtml(value)}</td></tr>`
    )
    .join('');

  const contentHtml = [
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:0;margin-bottom:14px;">',
    '<tr>',
    '<td style="padding:14px 16px;border:1px solid #cfe0ff;border-radius:12px;background:#f2f8ff;">',
    '<p style="margin:0 0 5px;font-size:12px;line-height:1.4;color:#1d4e89;letter-spacing:.04em;text-transform:uppercase;font-weight:700;">Status</p>',
    '<p style="margin:0;font-size:15px;line-height:1.5;color:#0f172a;">Your request is received and our sourcing team has started supplier outreach.</p>',
    '</td>',
    '</tr>',
    '</table>',
    '<h3 style="margin:0 0 10px;font-size:18px;line-height:1.35;color:#0f172a;">Request Summary</h3>',
    `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border:1px solid #dbe7ff;border-radius:12px;overflow:hidden;">${htmlRows}</table>`,
    '<p style="margin:14px 0 0;font-size:13px;line-height:1.6;color:#64748b;">Final pricing depends on grade, packaging, freight lane, and lead time availability.</p>',
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
    logger.info('public_idempotent_skip', { sessionId, rfqId: asString(sessionDoc?.rfqId) });
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
        source: 'public_chat',
        extracted: normalized,
        customerEmailNormalized: normalizeEmail(normalized.email),
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
      leadStage: 'completed',
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

  logger.info('public_finalize_saved', { sessionId, rfqId });

  logger.info('public_email_attempted', { sessionId, rfqId });

  try {
    const customerEmail = buildCustomerEmail(normalized);
    const emailResult = await sendEmail({
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

    logger.info('public_email_sent', { sessionId, rfqId, messageId: emailResult.messageId });

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

    logger.error('public_email_failed', { sessionId, rfqId, error: errorText });

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

export const createPublicSession = onRequest({ region: REGION }, async (req, res) => {
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
        leadStage: mapLeadStage(session),
        completed: Boolean(session.completed),
        rfqId: asString(session.rfqId),
        emailStatus: asString(session?.emailSend?.status || 'not_attempted'),
        latestExtractedState: session?.latestExtractedState || {},
        missingRequired: Array.isArray(session?.missingRequired) ? session.missingRequired : [],
        readyToFinalize: Boolean(session?.readyToFinalize),
        lastFinalizedExtracted: session?.lastFinalizedExtracted || {},
        messages,
      },
    });
  } catch (error) {
    logger.error('[createPublicSession] failed', { error: error?.message || String(error) });
    return jsonError(res, 500, 'Failed to create session');
  }
});

export const chatPublicAssistant = onRequest(
  {
    region: REGION,
    timeoutSeconds: 60,
    secrets: [OPENAI_API_KEY, SENDGRID_API_KEY],
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
        const extraction = await callOpenAIExtractionTurn({ transcript });
        extracted = extraction.extracted;
        extractionModel = extraction.model;
      } catch (error) {
        logger.error('public_openai_error', {
          sessionId,
          stage: 'turn_extraction',
          error: error?.message || String(error),
        });
      }

      const validation = validateExtractedTurnState(extracted);
      const aiConfirmRequested = Boolean(extracted.confirm);
      const userConfirmRequested = looksLikeUserConfirmation(userMessage);
      const confirmRequested = aiConfirmRequested || userConfirmRequested;

      // Keep latest extracted snapshot visible on the session root doc for observability.
      const turnSnapshot = {
        ...validation.normalized,
        confirm: confirmRequested,
      };
      const turnPatch = {
        latestExtractedState: turnSnapshot,
        missingRequired: validation.missingRequired,
        readyToFinalize: validation.readyToFinalize,
        extractionUpdatedAt: now,
      };
      for (const field of REQUIRED_FIELDS) {
        const value = asString(validation.normalized[field]);
        if (value) turnPatch[field] = value;
      }
      await sessionRef.set(turnPatch, { merge: true });

      logger.info('public_turn_extraction_generated', {
        sessionId,
        model: extractionModel || 'unknown',
        confirm: confirmRequested,
        confirmSource: {
          ai: aiConfirmRequested,
          user: userConfirmRequested,
        },
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

      const autoConfirmEnabled = shouldUseAutoConfirmFlow();

      if (autoConfirmEnabled && confirmRequested) {
        logger.info('public_confirm_detected', { sessionId, autoConfirmEnabled: true });
        if (validation.canConfirm) {
          finalizeResult = await finalizeFromExtracted({
            sessionRef,
            sessionId,
            sessionDoc: session,
            extracted: { ...validation.normalized, confirm: true },
            transcript,
          });
        } else {
          logger.info('public_finalize_blocked_missing_fields', {
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
            ? 'Confirmed. Your request is submitted and your confirmation email was sent.'
            : 'Confirmed. Your request is submitted, but email could not be sent yet.';
      } else if (validation.canConfirm && !confirmRequested) {
        const email = asString(validation.normalized.email);
        assistantReply = email
          ? `Ready to send your confirmation to ${email}?`
          : 'Ready to send your confirmation email?';
      } else {
        const conversation = await callOpenAIConversation({
          transcript,
          userMessage,
          extracted: validation.normalized,
          missingRequired: validation.missingRequired,
          confirmRequested,
        });

        if (conversation.error) {
          logger.error('public_openai_error', {
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
          leadStage: finalizeResult.confirmed ? 'completed' : (mapLeadStage(session) === 'new' ? 'in_progress' : mapLeadStage(session)),
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
          extracted: { ...validation.normalized, confirm: confirmRequested },
          validation,
          confirmed: finalizeResult.confirmed,
          rfqId: finalizeResult.rfqId,
          emailStatus: finalizeResult.emailStatus,
        }),
        completed: Boolean(finalizeResult.confirmed),
        rfqId: asString(finalizeResult.rfqId),
      });
    } catch (error) {
      logger.error('[chatPublicAssistant] failed', { sessionId, error: error?.message || String(error) });
      return jsonError(res, 500, 'Failed to process chat message');
    }
  }
);

export const finalizePublicSession = onRequest(
  {
    region: REGION,
    timeoutSeconds: 60,
    secrets: [OPENAI_API_KEY, SENDGRID_API_KEY],
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
        extraction = await callOpenAIExtractionTurn({ transcript });
      } catch (error) {
        logger.error('public_openai_error', {
          sessionId,
          stage: 'manual_finalize_extraction',
          error: error?.message || String(error),
        });
        return jsonError(res, 500, 'Failed to extract structured fields');
      }

      const extracted = extraction.extracted;

      if (action === 'preview') {
        const validation = validateExtractedTurnState(extracted);
        logger.info('public_finalize_preview_generated', {
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
        logger.info('public_finalize_validation_failed', {
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
      logger.error('[finalizePublicSession] failed', { sessionId, error: error?.message || String(error) });
      return jsonError(res, 500, 'Failed to finalize session');
    }
  }
);

function toIso(value) {
  if (!value) return null;
  if (value?.toDate) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return null;
}

function normalizeLeadStageInput(value) {
  const stage = asString(value).toLowerCase();
  if (stage === 'new' || stage === 'in_progress' || stage === 'completed') return stage;
  return '';
}

function normalizePriorityInput(value) {
  const priority = asString(value).toLowerCase();
  if (priority === 'low' || priority === 'medium' || priority === 'high') return priority;
  return '';
}

function mapLeadSummary(docSnap) {
  const data = docSnap.data() || {};
  const latest = data.latestExtractedState || {};
  const normalizedEmail = normalizeEmail(latest.email || data.email);
  return {
    sessionId: docSnap.id,
    status: asString(data.status) || 'active',
    leadStage: mapLeadStage(data),
    completed: Boolean(data.completed),
    chemicalName: asString(data.chemicalName || latest.chemicalName),
    quantity: asString(data.quantity || latest.quantity),
    deliveryLocation: asString(data.deliveryLocation || latest.deliveryLocation),
    email: normalizedEmail,
    emailStatus: asString(data?.emailSend?.status || 'not_attempted'),
    assignedTo: asString(data.assignedTo),
    priority: asString(data.priority || 'medium'),
    messageCount: Number(data.messageCount || 0),
    updatedAt: toIso(data.updatedAt),
    createdAt: toIso(data.createdAt),
  };
}

function leadMatchesSearch(lead, searchTerm) {
  if (!searchTerm) return true;
  const haystack = [
    lead.sessionId,
    lead.chemicalName,
    lead.quantity,
    lead.deliveryLocation,
    lead.email,
    lead.assignedTo,
  ]
    .map((v) => asString(v).toLowerCase())
    .join(' ');
  return haystack.includes(searchTerm);
}

export const adminDashboardSummary = onRequest({ region: REGION }, async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');
  try {
    await requireAdmin(req);

    const sessionsRef = db.collection(SESSION_COLLECTION);
    const rfqsRef = db.collection(RFQ_COLLECTION);
    const [newCountSnap, inProgressCountSnap, completedCountSnap, recentSessionsSnap, recentRfqsSnap] = await Promise.all([
      sessionsRef.where('leadStage', '==', 'new').count().get(),
      sessionsRef.where('leadStage', '==', 'in_progress').count().get(),
      sessionsRef.where('leadStage', '==', 'completed').count().get(),
      sessionsRef.orderBy('updatedAt', 'desc').limit(8).get(),
      rfqsRef.orderBy('updatedAt', 'desc').limit(120).get(),
    ]);

    const uniqueCustomers = new Set();
    for (const doc of recentRfqsSnap.docs) {
      const data = doc.data() || {};
      const email = normalizeEmail(data.customerEmailNormalized || data?.extracted?.email);
      if (email) uniqueCustomers.add(email);
    }

    const recentActivity = recentSessionsSnap.docs.map(mapLeadSummary);

    setCors(res);
    res.status(200).json({
      ok: true,
      summary: {
        newLeads: newCountSnap.data().count || 0,
        inProgressLeads: inProgressCountSnap.data().count || 0,
        completedLeads: completedCountSnap.data().count || 0,
        uniqueCustomers: uniqueCustomers.size,
        recentActivity,
      },
    });
  } catch (error) {
    const status = Number(error?.status) || 500;
    logger.error('[adminDashboardSummary] failed', { error: error?.message || String(error) });
    return jsonError(res, status, status === 403 ? 'Forbidden' : 'Failed to load dashboard');
  }
});

export const adminCreateUser = onRequest({ region: REGION }, async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  let createdAuthUser = null;
  try {
    const adminUser = await requireAdmin(req);
    const email = normalizeEmail(req.body?.email);
    const password = asString(req.body?.password);
    const role = normalizeRole(req.body?.role);
    const enabledMiniApps = normalizeMiniAppIds(req.body?.enabledMiniApps) || defaultEnabledMiniAppsForRole(role);

    if (!isEmail(email)) return jsonError(res, 400, 'Valid email is required');
    if (!isValidTemporaryPassword(password)) return jsonError(res, 400, 'Password must be at least 6 characters');

    createdAuthUser = await admin.auth().createUser({
      email,
      password,
      emailVerified: false,
      disabled: false,
    });

    const now = admin.firestore.FieldValue.serverTimestamp();
    const userDoc = {
      uid: createdAuthUser.uid,
      email,
      role,
      enabledMiniApps,
      firstName: '',
      lastName: '',
      primaryAuthUid: createdAuthUser.uid,
      createdAt: now,
      updatedAt: now,
      createdBy: adminUser.uid,
    };

    await db.collection('users').doc(createdAuthUser.uid).set(userDoc, { merge: true });
    const snap = await db.collection('users').doc(createdAuthUser.uid).get();

    setCors(res);
    res.status(200).json({ ok: true, user: mapUserDoc(snap) });
  } catch (error) {
    if (createdAuthUser?.uid) {
      await admin.auth().deleteUser(createdAuthUser.uid).catch(() => {});
    }
    const status = Number(error?.status) || (error?.code === 'auth/email-already-exists' ? 409 : 500);
    logger.error('[adminCreateUser] failed', { error: error?.message || String(error) });
    return jsonError(res, status, status === 403 ? 'Forbidden' : 'Failed to create user');
  }
});

export const adminListUsers = onRequest({ region: REGION }, async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  try {
    await requireAdmin(req);
    const snap = await db.collection('users').orderBy('email', 'asc').limit(250).get();
    const items = snap.docs.map(mapUserDoc);

    setCors(res);
    res.status(200).json({ ok: true, items, miniApps: MINI_APP_IDS });
  } catch (error) {
    const status = Number(error?.status) || 500;
    logger.error('[adminListUsers] failed', { error: error?.message || String(error) });
    return jsonError(res, status, status === 403 ? 'Forbidden' : 'Failed to list users');
  }
});

export const adminUpdateUserAccess = onRequest({ region: REGION }, async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  try {
    const adminUser = await requireAdmin(req);
    const uid = asString(req.body?.uid);
    const role = normalizeRole(req.body?.role);
    const enabledMiniApps = normalizeMiniAppIds(req.body?.enabledMiniApps) || [];
    if (!uid) return jsonError(res, 400, 'uid is required');

    const userRef = db.collection('users').doc(uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) return jsonError(res, 404, 'User not found');

    await userRef.set(
      {
        role,
        enabledMiniApps,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: adminUser.uid,
      },
      { merge: true }
    );

    const updatedSnap = await userRef.get();
    setCors(res);
    res.status(200).json({ ok: true, user: mapUserDoc(updatedSnap) });
  } catch (error) {
    const status = Number(error?.status) || 500;
    logger.error('[adminUpdateUserAccess] failed', { error: error?.message || String(error) });
    return jsonError(res, status, status === 403 ? 'Forbidden' : 'Failed to update user access');
  }
});

export const adminListLeads = onRequest({ region: REGION }, async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  try {
    await requireAdmin(req);
    const stage = normalizeLeadStageInput(req.body?.stage);
    const search = asString(req.body?.search).toLowerCase();
    const pageSize = Math.min(Math.max(Number(req.body?.pageSize || 25), 1), 100);
    const cursor = asString(req.body?.cursor);

    let query = db.collection(SESSION_COLLECTION).orderBy('updatedAt', 'desc').limit(pageSize * 3);

    if (cursor) {
      const cursorSnap = await db.collection(SESSION_COLLECTION).doc(cursor).get();
      if (cursorSnap.exists) query = query.startAfter(cursorSnap);
    }

    const snap = await query.get();
    const leads = snap.docs
      .map(mapLeadSummary)
      .filter((item) => (stage ? item.leadStage === stage : true))
      .filter((item) => leadMatchesSearch(item, search))
      .slice(0, pageSize);
    const nextCursor = snap.docs.length === pageSize ? snap.docs[snap.docs.length - 1].id : '';

    setCors(res);
    res.status(200).json({
      ok: true,
      items: leads,
      nextCursor,
      hasMore: Boolean(nextCursor),
    });
  } catch (error) {
    const status = Number(error?.status) || 500;
    logger.error('[adminListLeads] failed', { error: error?.message || String(error) });
    return jsonError(res, status, status === 403 ? 'Forbidden' : 'Failed to list leads');
  }
});

export const adminGetLeadDetail = onRequest({ region: REGION }, async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');
  try {
    await requireAdmin(req);
    const sessionId = normalizeSessionId(req.body?.sessionId);
    if (!sessionId) return jsonError(res, 400, 'sessionId is required');

    const sessionRef = db.collection(SESSION_COLLECTION).doc(sessionId);
    const [sessionSnap, messagesSnap] = await Promise.all([
      sessionRef.get(),
      sessionRef.collection('messages').orderBy('createdAt', 'desc').limit(200).get(),
    ]);

    if (!sessionSnap.exists) return jsonError(res, 404, 'Session not found');
    const sessionData = sessionSnap.data() || {};
    const messages = messagesSnap.docs
      .map(mapMessageDoc)
      .reverse();

    setCors(res);
    res.status(200).json({
      ok: true,
      lead: {
        ...mapLeadSummary(sessionSnap),
        rfqId: asString(sessionData.rfqId),
        missingRequired: Array.isArray(sessionData.missingRequired) ? sessionData.missingRequired : [],
        readyToFinalize: Boolean(sessionData.readyToFinalize),
        latestExtractedState: sessionData.latestExtractedState || {},
        lastFinalizedExtracted: sessionData.lastFinalizedExtracted || {},
        emailSend: sessionData.emailSend || {},
        internalNotes: asString(sessionData.internalNotes),
        internalNotesUpdatedAt: toIso(sessionData.internalNotesUpdatedAt),
        internalNotesUpdatedBy: asString(sessionData.internalNotesUpdatedBy),
        messages,
      },
    });
  } catch (error) {
    const status = Number(error?.status) || 500;
    logger.error('[adminGetLeadDetail] failed', { error: error?.message || String(error) });
    return jsonError(res, status, status === 403 ? 'Forbidden' : 'Failed to load lead');
  }
});

export const adminUpdateLead = onRequest({ region: REGION }, async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');
  try {
    const adminUser = await requireAdmin(req);
    const sessionId = normalizeSessionId(req.body?.sessionId);
    if (!sessionId) return jsonError(res, 400, 'sessionId is required');

    const leadStage = normalizeLeadStageInput(req.body?.leadStage);
    const priority = normalizePriorityInput(req.body?.priority);
    const assignedTo = asString(req.body?.assignedTo);
    const internalNotes = asString(req.body?.internalNotes);

    const patch = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (leadStage) patch.leadStage = leadStage;
    if (priority) patch.priority = priority;
    if (assignedTo || req.body?.assignedTo === '') patch.assignedTo = assignedTo;
    if (internalNotes || req.body?.internalNotes === '') {
      patch.internalNotes = internalNotes;
      patch.internalNotesUpdatedAt = admin.firestore.FieldValue.serverTimestamp();
      patch.internalNotesUpdatedBy = adminUser.uid;
    }

    await db.collection(SESSION_COLLECTION).doc(sessionId).set(patch, { merge: true });
    const updatedSnap = await db.collection(SESSION_COLLECTION).doc(sessionId).get();
    if (!updatedSnap.exists) return jsonError(res, 404, 'Session not found');

    setCors(res);
    res.status(200).json({ ok: true, lead: mapLeadSummary(updatedSnap) });
  } catch (error) {
    const status = Number(error?.status) || 500;
    logger.error('[adminUpdateLead] failed', { error: error?.message || String(error) });
    return jsonError(res, status, status === 403 ? 'Forbidden' : 'Failed to update lead');
  }
});

export const adminAddLeadNote = onRequest({ region: REGION }, async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');
  try {
    const adminUser = await requireAdmin(req);
    const sessionId = normalizeSessionId(req.body?.sessionId);
    const note = asString(req.body?.note);
    if (!sessionId) return jsonError(res, 400, 'sessionId is required');
    if (!note) return jsonError(res, 400, 'note is required');

    const sessionRef = db.collection(SESSION_COLLECTION).doc(sessionId);
    const now = admin.firestore.FieldValue.serverTimestamp();
    const noteRef = sessionRef.collection('adminNotes').doc();
    await noteRef.set({
      text: note,
      authorUid: adminUser.uid,
      authorEmail: adminUser.email,
      createdAt: now,
    });

    await sessionRef.set(
      {
        internalNotes: note,
        internalNotesUpdatedAt: now,
        internalNotesUpdatedBy: adminUser.uid,
        updatedAt: now,
      },
      { merge: true }
    );

    setCors(res);
    res.status(200).json({
      ok: true,
      note: {
        noteId: noteRef.id,
        text: note,
        authorUid: adminUser.uid,
        authorEmail: adminUser.email,
      },
    });
  } catch (error) {
    const status = Number(error?.status) || 500;
    logger.error('[adminAddLeadNote] failed', { error: error?.message || String(error) });
    return jsonError(res, status, status === 403 ? 'Forbidden' : 'Failed to add note');
  }
});

export const adminListCustomers = onRequest({ region: REGION }, async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');
  try {
    await requireAdmin(req);
    const search = asString(req.body?.search).toLowerCase();
    const pageSize = Math.min(Math.max(Number(req.body?.pageSize || 25), 1), 100);
    const cursor = asString(req.body?.cursor);

    let query = db.collection(RFQ_COLLECTION).orderBy('updatedAt', 'desc').limit(Math.max(pageSize * 8, 120));
    if (cursor) {
      const cursorSnap = await db.collection(RFQ_COLLECTION).doc(cursor).get();
      if (cursorSnap.exists) query = query.startAfter(cursorSnap);
    }

    const snap = await query.get();
    const grouped = new Map();
    for (const doc of snap.docs) {
      const data = doc.data() || {};
      const extracted = data.extracted || {};
      const email = normalizeEmail(data.customerEmailNormalized || extracted.email);
      if (!email) continue;
      if (search && !email.includes(search)) continue;

      const current = grouped.get(email) || {
        email,
        companyName: asString(extracted.companyName),
        contactName: asString(extracted.contactName),
        submissions: 0,
        latestSubmissionAt: null,
      };
      current.submissions += 1;
      const ts = toIso(data.updatedAt || data.createdAt);
      if (!current.latestSubmissionAt || (ts && ts > current.latestSubmissionAt)) current.latestSubmissionAt = ts;
      if (!current.companyName) current.companyName = asString(extracted.companyName);
      if (!current.contactName) current.contactName = asString(extracted.contactName);
      grouped.set(email, current);
      if (grouped.size >= pageSize) break;
    }

    const items = Array.from(grouped.values()).sort((a, b) => (a.latestSubmissionAt < b.latestSubmissionAt ? 1 : -1));
    const nextCursor = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1].id : '';
    setCors(res);
    res.status(200).json({
      ok: true,
      items,
      nextCursor,
      hasMore: Boolean(nextCursor),
    });
  } catch (error) {
    const status = Number(error?.status) || 500;
    logger.error('[adminListCustomers] failed', { error: error?.message || String(error) });
    return jsonError(res, status, status === 403 ? 'Forbidden' : 'Failed to list customers');
  }
});

export const adminGetCustomerTimeline = onRequest({ region: REGION }, async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');
  try {
    await requireAdmin(req);
    const email = normalizeEmail(req.body?.email);
    if (!email) return jsonError(res, 400, 'email is required');

    const snap = await db
      .collection(RFQ_COLLECTION)
      .where('customerEmailNormalized', '==', email)
      .orderBy('updatedAt', 'desc')
      .limit(100)
      .get();

    const timeline = snap.docs.map((doc) => {
      const data = doc.data() || {};
      const extracted = data.extracted || {};
      return {
        rfqId: doc.id,
        sessionId: asString(data.sessionId),
        chemicalName: asString(extracted.chemicalName),
        quantity: asString(extracted.quantity),
        deliveryLocation: asString(extracted.deliveryLocation),
        emailStatus: asString(data.emailStatus),
        updatedAt: toIso(data.updatedAt),
        createdAt: toIso(data.createdAt),
      };
    });

    setCors(res);
    res.status(200).json({ ok: true, email, timeline });
  } catch (error) {
    const status = Number(error?.status) || 500;
    logger.error('[adminGetCustomerTimeline] failed', { error: error?.message || String(error) });
    return jsonError(res, status, status === 403 ? 'Forbidden' : 'Failed to load customer timeline');
  }
});

export const __testables = {
  isValidTemporaryPassword,
  normalizeMiniAppIds,
};
