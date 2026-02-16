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
const QUOTECHEM_FROM_EMAIL = defineSecret('QUOTECHEM_FROM_EMAIL');
const QUOTECHEM_SALES_EMAIL = defineSecret('QUOTECHEM_SALES_EMAIL');

const REQUIRED_FIELDS = [
  'chemicalName',
  'quantity',
  'locationCity',
  'locationStateProvince',
  'locationCountry',
  'email',
];

const CORE_FIELDS = ['chemicalName', 'quantity', 'locationCity', 'locationStateProvince', 'locationCountry'];

const PREFERRED_FIELDS = ['packagingPreference', 'gradeSpec', 'neededBy', 'frequency', 'specNotes'];
const PRICE_SENSITIVE_PREFERRED = ['packagingPreference', 'gradeSpec', 'neededBy'];

const PROFILE_FIELDS = [
  ...REQUIRED_FIELDS,
  ...PREFERRED_FIELDS,
  'companyName',
  'contactName',
  'quantityRaw',
  'quantityValue',
  'quantityUnitNormalized',
  'sizeBucket',
  'assumedDefaults',
  'intakeStage',
  'intakeCompleteAt',
  'customerEmailConfirmedAt',
  'location',
  'destinationCountry',
  'quantityUnit',
  'notes',
  'timeline',
  'shippingMode',
];

const QUICK_CHOICES = {
  packagingPreference: ['bags', 'totes', 'drums', 'bulk', 'not sure'],
  gradeSpec: ['food', 'industrial', 'pharma', 'api', 'drilling', 'not sure'],
  frequency: ['one-time', 'recurring'],
  neededBy: ['ASAP', 'This week', 'This month'],
};

const FACT_FIELDS = [
  ...REQUIRED_FIELDS,
  ...PREFERRED_FIELDS,
  'companyName',
  'contactName',
  'quantityRaw',
  'quantityValue',
  'quantityUnitNormalized',
  'sizeBucket',
];

const LOW_CONFIDENCE_THRESHOLD = Number.parseFloat(process.env.REQUIRED_FIELD_CONFIDENCE_THRESHOLD || '0.65');
const CONTEXT_TOKEN_SOFT_LIMIT = Number.parseInt(process.env.OPENAI_CONTEXT_TOKEN_SOFT_LIMIT || '9000', 10);
const CONTEXT_RECENT_TURNS = Number.parseInt(process.env.OPENAI_CONTEXT_RECENT_TURNS || '12', 10);
const CONTEXT_MAX_MESSAGES = Number.parseInt(process.env.OPENAI_CONTEXT_MAX_MESSAGES || '1200', 10);
const EMAIL_PROVIDER_CONFIDENCE_THRESHOLD = Number.parseFloat(
  process.env.EMAIL_PROVIDER_CONFIDENCE_THRESHOLD || String(LOW_CONFIDENCE_THRESHOLD)
);
const EMAIL_BRAND_LOGO_URL = asString(process.env.EMAIL_BRAND_LOGO_URL) || 'https://quotechemfb.web.app/assets/quotechem-logo.png';

const KNOWN_CITY_HINTS = {
  calgary: { locationCity: 'Calgary', locationStateProvince: 'Alberta', locationCountry: 'Canada' },
  edmonton: { locationCity: 'Edmonton', locationStateProvince: 'Alberta', locationCountry: 'Canada' },
  vancouver: { locationCity: 'Vancouver', locationStateProvince: 'British Columbia', locationCountry: 'Canada' },
  toronto: { locationCity: 'Toronto', locationStateProvince: 'Ontario', locationCountry: 'Canada' },
  ottawa: { locationCity: 'Ottawa', locationStateProvince: 'Ontario', locationCountry: 'Canada' },
  montreal: { locationCity: 'Montreal', locationStateProvince: 'Quebec', locationCountry: 'Canada' },
  winnipeg: { locationCity: 'Winnipeg', locationStateProvince: 'Manitoba', locationCountry: 'Canada' },
  regina: { locationCity: 'Regina', locationStateProvince: 'Saskatchewan', locationCountry: 'Canada' },
  halifax: { locationCity: 'Halifax', locationStateProvince: 'Nova Scotia', locationCountry: 'Canada' },
  saskatoon: { locationCity: 'Saskatoon', locationStateProvince: 'Saskatchewan', locationCountry: 'Canada' },
};

const INITIAL_ASSISTANT_MESSAGE =
  'Hey — I\'m QuoteChem. I can get you pricing from suppliers. What chemical are you looking for, how much, and where should it be delivered?';

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

function normalizeSessionId(value) {
  const v = asString(value);
  if (!v) return '';
  return v.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
}

function shouldUseMemoryV2() {
  return String(process.env.CONCIERGE_MEMORY_V2 || 'true').toLowerCase() === 'true';
}

function estimateTokensFromText(input) {
  const text = asString(input);
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

function estimateTokensFromMessages(messages) {
  return (Array.isArray(messages) ? messages : []).reduce((total, item) => total + estimateTokensFromText(item.content), 0);
}

function normalizeCountry(input) {
  const value = asString(input).toLowerCase();
  if (!value) return '';
  if (value === 'usa' || value === 'us' || value.includes('united states')) return 'United States';
  if (value === 'canada' || value === 'ca') return 'Canada';
  return value
    .split(' ')
    .map((part) => (part ? `${part[0].toUpperCase()}${part.slice(1)}` : part))
    .join(' ');
}

function normalizePackaging(value) {
  const v = asString(value).toLowerCase();
  if (!v) return '';
  if (v.includes('bag')) return 'bags';
  if (v.includes('tote')) return 'totes';
  if (v.includes('drum')) return 'drums';
  if (v.includes('bulk') || v.includes('tank') || v.includes('iso')) return 'bulk';
  if (v.includes('not sure') || v === 'unknown') return 'not_sure';
  return '';
}

function normalizeGrade(value) {
  const v = asString(value).toLowerCase();
  if (!v) return '';
  if (v.includes('food')) return 'food';
  if (v.includes('industrial') || v.includes('tech')) return 'industrial';
  if (v.includes('pharma')) return 'pharma';
  if (v === 'api' || v.includes('active pharmaceutical')) return 'api';
  if (v.includes('drilling')) return 'drilling';
  if (v.includes('not sure') || v === 'unknown') return 'not_sure';
  return '';
}

function normalizeFrequency(value) {
  const v = asString(value).toLowerCase();
  if (!v) return '';
  if (v.includes('one') || v.includes('single') || v.includes('spot')) return 'one_time';
  if (v.includes('recurr') || v.includes('monthly') || v.includes('weekly') || v.includes('contract')) return 'recurring';
  return '';
}

function normalizeNeededBy(value) {
  const v = asString(value);
  if (!v) return '';
  if (/^asap$/i.test(v)) return 'ASAP';
  if (/\d{4}-\d{2}-\d{2}/.test(v)) return v.match(/\d{4}-\d{2}-\d{2}/)?.[0] || v;
  return v;
}

function normalizeQuantityUnit(input) {
  const unit = asString(input).toLowerCase();
  if (!unit) return '';
  if (['kg', 'kilogram', 'kilograms'].includes(unit)) return 'kg';
  if (['lb', 'lbs', 'pound', 'pounds'].includes(unit)) return 'lb';
  if (['mt', 'metric ton', 'metric tons', 'tonne', 'tonnes'].includes(unit)) return 'mt';
  if (['ton', 'tons'].includes(unit)) return 'ton';
  if (['l', 'liter', 'liters', 'litre', 'litres'].includes(unit)) return 'l';
  if (['bag', 'bags'].includes(unit)) return 'bags';
  if (['tote', 'totes'].includes(unit)) return 'totes';
  if (['drum', 'drums'].includes(unit)) return 'drums';
  if (unit.includes('bulk')) return 'bulk';
  return unit;
}

function toNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const clean = asString(value).replace(/,/g, '');
  if (!clean) return null;
  const parsed = Number.parseFloat(clean);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseQuantityFromText(text) {
  const message = asString(text);
  if (!message) return {};

  const match = message.match(/(\d+(?:[.,]\d+)?)\s*(kg|kilograms?|lbs?|pounds?|mt|metric\s*tons?|tons?|tonnes?|bags?|totes?|drums?|l|liters?|litres?)/i);
  if (!match) {
    if (/\b\d+(?:[.,]\d+)?\b/.test(message)) {
      return { quantityRaw: message };
    }
    return {};
  }

  const value = toNumber(match[1]);
  const rawUnit = match[2];
  const unit = normalizeQuantityUnit(rawUnit);

  return {
    quantity: `${match[1]} ${rawUnit}`,
    quantityRaw: match[0],
    quantityValue: value,
    quantityUnitNormalized: unit,
  };
}

function parseEmailFromText(text) {
  const match = asString(text).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (!match) return '';
  return normalizeEmail(match[0]);
}

function parseLocationFromText(text) {
  const value = asString(text);
  if (!value) return {};

  const toPattern = value.match(/(?:to|deliver(?:ed)?\s+to)\s+([^,\n]+),\s*([^,\n]+)(?:,\s*([^,\n]+))?/i);
  if (toPattern) {
    return {
      locationCity: asString(toPattern[1]),
      locationStateProvince: asString(toPattern[2]),
      locationCountry: normalizeCountry(asString(toPattern[3]) || ''),
    };
  }

  const commaPattern = value.split(',').map((part) => asString(part)).filter(Boolean);
  if (commaPattern.length >= 3) {
    return {
      locationCity: commaPattern[0],
      locationStateProvince: commaPattern[1],
      locationCountry: normalizeCountry(commaPattern[2]),
    };
  }

  const lower = value.toLowerCase();
  for (const [cityKey, normalized] of Object.entries(KNOWN_CITY_HINTS)) {
    const pattern = new RegExp(`\\b${cityKey}\\b`, 'i');
    if (pattern.test(lower)) {
      return normalized;
    }
  }

  return {};
}

function parseUserHints(message) {
  const text = asString(message).toLowerCase();
  const extracted = {};

  const email = parseEmailFromText(message);
  if (email) extracted.email = email;

  Object.assign(extracted, parseQuantityFromText(message));
  Object.assign(extracted, parseLocationFromText(message));

  const packaging = normalizePackaging(text);
  if (packaging) extracted.packagingPreference = packaging;

  const grade = normalizeGrade(text);
  if (grade) extracted.gradeSpec = grade;

  const frequency = normalizeFrequency(text);
  if (frequency) extracted.frequency = frequency;

  if (/\basap\b/i.test(text)) extracted.neededBy = 'ASAP';
  const dateMatch = asString(message).match(/\b\d{4}-\d{2}-\d{2}\b/);
  if (dateMatch) extracted.neededBy = dateMatch[0];

  if (/\b(sds|coa|spec|specs|specification|requirements)\b/i.test(text)) {
    extracted.specNotes = asString(message);
  }

  return extracted;
}

function deriveSizeBucket(profile) {
  const qty = toNumber(profile.quantityValue);
  if (!qty) return '';

  const unit = profile.quantityUnitNormalized || '';
  const packaging = profile.packagingPreference || '';
  const classifier = packaging || unit;

  if (classifier === 'bags') {
    if (qty < 20) return 'small';
    if (qty <= 200) return 'mid';
    return 'large';
  }

  if (classifier === 'totes') {
    if (qty <= 4) return 'small';
    if (qty <= 20) return 'mid';
    return 'large';
  }

  if (classifier === 'bulk' || unit === 'l') {
    if (qty < 10000) return 'small';
    if (qty <= 50000) return 'mid';
    return 'large';
  }

  return '';
}

function pickAllowedFields(input = {}) {
  const out = {};

  for (const [key, rawValue] of Object.entries(input)) {
    if (!PROFILE_FIELDS.includes(key)) continue;
    if (key === 'assumedDefaults' && rawValue && typeof rawValue === 'object') {
      out.assumedDefaults = rawValue;
      continue;
    }

    if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
      out[key] = rawValue;
      continue;
    }

    const value = asString(rawValue);
    if (!value) continue;
    out[key] = value;
  }

  if (out.email) out.email = normalizeEmail(out.email);
  if (out.locationCountry) out.locationCountry = normalizeCountry(out.locationCountry);
  if (out.destinationCountry && !out.locationCountry) out.locationCountry = normalizeCountry(out.destinationCountry);

  if (out.location && (!out.locationCity || !out.locationStateProvince || !out.locationCountry)) {
    const parsed = parseLocationFromText(out.location);
    out.locationCity = out.locationCity || parsed.locationCity || '';
    out.locationStateProvince = out.locationStateProvince || parsed.locationStateProvince || '';
    out.locationCountry = out.locationCountry || parsed.locationCountry || '';
  }

  const locationSeed = [out.locationCity, out.locationStateProvince, out.locationCountry, out.location].join(' ').trim();
  if ((!out.locationCity || !out.locationStateProvince || !out.locationCountry) && locationSeed) {
    const inferred = parseLocationFromText(locationSeed);
    out.locationCity = out.locationCity || inferred.locationCity || '';
    out.locationStateProvince = out.locationStateProvince || inferred.locationStateProvince || '';
    out.locationCountry = out.locationCountry || inferred.locationCountry || '';
  }

  const normalizedPackaging = normalizePackaging(out.packagingPreference);
  if (normalizedPackaging) out.packagingPreference = normalizedPackaging;

  const normalizedGrade = normalizeGrade(out.gradeSpec);
  if (normalizedGrade) out.gradeSpec = normalizedGrade;

  const normalizedFrequency = normalizeFrequency(out.frequency);
  if (normalizedFrequency) out.frequency = normalizedFrequency;

  if (out.neededBy) out.neededBy = normalizeNeededBy(out.neededBy);

  if (out.quantityUnit) out.quantityUnitNormalized = normalizeQuantityUnit(out.quantityUnit);
  if (out.quantityUnitNormalized) out.quantityUnitNormalized = normalizeQuantityUnit(out.quantityUnitNormalized);

  if (out.quantityValue != null) {
    const value = toNumber(out.quantityValue);
    if (value != null) out.quantityValue = value;
    else delete out.quantityValue;
  }

  if (out.quantity) {
    const parsed = parseQuantityFromText(out.quantity);
    out.quantityRaw = out.quantityRaw || parsed.quantityRaw || out.quantity;
    if (parsed.quantityValue != null && out.quantityValue == null) out.quantityValue = parsed.quantityValue;
    if (!out.quantityUnitNormalized && parsed.quantityUnitNormalized) out.quantityUnitNormalized = parsed.quantityUnitNormalized;
  }

  if (out.email && !isEmail(out.email)) delete out.email;

  return out;
}

function missingFields(profile, required) {
  return required.filter((field) => !asString(profile[field]));
}

function profileCompleteness(profile) {
  const complete = REQUIRED_FIELDS.filter((field) => asString(profile[field])).length;
  return Number(((complete / REQUIRED_FIELDS.length) * 100).toFixed(1));
}

function deriveIntakeStage(session, profile, missingRequired, missingPreferred) {
  if (session?.completed || asString(profile.intakeStage) === 'completed') return 'completed';

  const missingCore = CORE_FIELDS.filter((field) => missingRequired.includes(field));
  if (missingCore.length > 0) return 'collecting_core';

  if (missingRequired.includes('email')) return 'awaiting_email';

  const stillMissingPriceSensitive = missingPreferred.filter((field) => PRICE_SENSITIVE_PREFERRED.includes(field));
  const prompted = Number(session?.preferencePromptCount || 0);

  if (stillMissingPriceSensitive.length > 0 && prompted < 1) return 'collecting_preferences';

  return 'ready_for_confirmation';
}

function questionForMissingField(field) {
  if (field === 'chemicalName') {
    return {
      text: 'What chemical do you need quoted?',
      quickChoices: [],
    };
  }

  if (field === 'quantity') {
    return {
      text: 'Roughly how many bags/totes or what total weight/volume?',
      quickChoices: [],
    };
  }

  if (field === 'locationCity' || field === 'locationStateProvince' || field === 'locationCountry') {
    return {
      text: 'What city, state/province, and country should this be delivered to?',
      quickChoices: [],
    };
  }

  if (field === 'email') {
    return {
      text: 'Perfect. Where should I email the quotes? (We\'ll only use it for this request + follow-up on pricing.)',
      quickChoices: [],
    };
  }

  if (field === 'packagingPreference') {
    return {
      text: 'Packaging preference: bags / totes / drums / bulk?',
      quickChoices: QUICK_CHOICES.packagingPreference,
    };
  }

  if (field === 'gradeSpec') {
    return {
      text: 'Do you need a specific grade? (food / industrial / pharma / api / drilling / not sure)',
      quickChoices: QUICK_CHOICES.gradeSpec,
    };
  }

  if (field === 'neededBy') {
    return {
      text: 'When do you need it by? (date or ASAP)',
      quickChoices: QUICK_CHOICES.neededBy,
    };
  }

  if (field === 'frequency') {
    return {
      text: 'Is this one-time or recurring?',
      quickChoices: QUICK_CHOICES.frequency,
    };
  }

  return {
    text: 'Tell me a bit more about your requirement.',
    quickChoices: [],
  };
}

function conciseSummary(profile) {
  const quantity = asString(profile.quantity) || asString(profile.quantityRaw) || 'quantity not specified';
  const chemical = asString(profile.chemicalName) || 'chemical';
  const city = asString(profile.locationCity) || 'destination city';
  const state = asString(profile.locationStateProvince);
  const country = asString(profile.locationCountry);
  const location = [city, state, country].filter(Boolean).join(', ');
  return `${quantity} of ${chemical} to ${location}`;
}

function buildQuickChoices(stage, missingRequired, missingPreferred) {
  if (stage === 'collecting_core') {
    return questionForMissingField(missingRequired[0]).quickChoices;
  }

  if (stage === 'awaiting_email') return [];

  if (stage === 'collecting_preferences') {
    const field = missingPreferred.find((item) => PRICE_SENSITIVE_PREFERRED.includes(item));
    if (!field) return [];
    return questionForMissingField(field).quickChoices;
  }

  return [];
}

function containsAbusiveLanguage(message) {
  const text = asString(message).toLowerCase();
  if (!text) return false;
  const blocked = ['fuck', 'shit', 'bitch', 'asshole'];
  return blocked.some((word) => text.includes(word));
}

function looksLikeQuestion(message) {
  const text = asString(message);
  if (!text) return false;
  if (text.includes('?')) return true;
  return /^(do|does|did|what|how|can|could|would|is|are|should|where|when|why)\b/i.test(text);
}

function sanitizeAssistantCopy(input) {
  const text = asString(input);
  if (!text) return '';

  if (/guarantee|guaranteed|final price|locked in price/i.test(text)) {
    return 'Thanks. I can help collect your request details and get supplier quotes quickly.';
  }

  return text;
}

function buildSystemPrompt() {
  return [
    'You are QuoteChem, a procurement concierge for bulk chemicals.',
    'Keep tone calm, professional, fast, non-salesy.',
    'Ask one concise question at a time and only for missing info.',
    'If user asks a relevant chemical/procurement question, answer briefly first, then continue intake.',
    'Use conversation history and profile state; do not forget earlier user details in the same session.',
    'Never promise final pricing or supplier guarantees.',
    'Prefer short responses.',
    'Return strict JSON only with keys: assistant_reply, extracted, confidence, next_missing_required, next_missing_preferred, field_confidence, completion_signal.',
    'allowed extracted keys:',
    PROFILE_FIELDS.join(', '),
    'field_confidence must map field -> [0,1] confidence when possible.',
    'completion_signal true when you believe required RFQ fields are complete.',
  ].join(' ');
}

function normalizeMissingArray(input, allowed) {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => asString(item))
    .filter((field) => allowed.includes(field));
}

async function callOpenAI({ userMessage, context, profile, stage }) {
  const apiKey = readSecret(OPENAI_API_KEY);
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  if (!apiKey) {
    return {
      assistant_reply: '',
      extracted: {},
      confidence: 0.2,
      next_missing_required: [],
      next_missing_preferred: [],
      field_confidence: {},
      completion_signal: false,
      model: 'fallback-no-openai-key',
    };
  }

  const prompt = [
    'Current stage:',
    stage,
    'Memory mode:',
    context?.mode || 'full',
    'Conversation token estimate:',
    String(context?.tokenEstimate || 0),
    'Current intake profile JSON:',
    JSON.stringify(profile || {}),
    context?.historyText || 'Conversation history:\n(none)',
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
    parsed = {};
  }

  return {
    assistant_reply: sanitizeAssistantCopy(parsed.assistant_reply),
    extracted: pickAllowedFields(parsed.extracted || {}),
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
    next_missing_required: normalizeMissingArray(parsed.next_missing_required, REQUIRED_FIELDS),
    next_missing_preferred: normalizeMissingArray(parsed.next_missing_preferred, PREFERRED_FIELDS),
    field_confidence: normalizeFieldConfidenceMap(parsed.field_confidence || {}),
    completion_signal: Boolean(parsed.completion_signal),
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

  return {
    messageId: response.headers.get('x-message-id') || '',
  };
}

function mapMessageDoc(docSnap) {
  const data = docSnap.data() || {};
  return {
    id: docSnap.id,
    role: data.role || 'user',
    content: data.content || '',
    quickReplies: Array.isArray(data.quickReplies) ? data.quickReplies : [],
    createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : null,
  };
}

async function loadRecentMessages(sessionId, limit = 60) {
  const snap = await db
    .collection(SESSION_COLLECTION)
    .doc(sessionId)
    .collection('messages')
    .orderBy('createdAt', 'asc')
    .limitToLast(limit)
    .get();

  return snap.docs.map(mapMessageDoc);
}

async function loadAllMessages(sessionId, maxMessages = CONTEXT_MAX_MESSAGES) {
  const snap = await db
    .collection(SESSION_COLLECTION)
    .doc(sessionId)
    .collection('messages')
    .orderBy('createdAt', 'asc')
    .limit(maxMessages)
    .get();

  return snap.docs.map(mapMessageDoc);
}

function compactHistoryText(messages, label = 'Conversation history') {
  return [
    `${label}:`,
    messages.map((item) => `${item.role === 'assistant' ? 'Assistant' : 'User'}: ${item.content}`).join('\n') || '(none)',
  ].join('\n');
}

async function buildConversationContext({ sessionId, sessionDoc, tokenBudget = CONTEXT_TOKEN_SOFT_LIMIT }) {
  const fullMessages = await loadAllMessages(sessionId);
  const fullTokenEstimate = estimateTokensFromMessages(fullMessages);
  const hasSummary = asString(sessionDoc?.memory?.summary);
  const factsSnapshot = sessionDoc?.profile || {};

  if (fullTokenEstimate <= tokenBudget || !shouldUseMemoryV2()) {
    return {
      mode: 'full',
      fullMessages,
      recentMessages: fullMessages.slice(-CONTEXT_RECENT_TURNS),
      historyText: compactHistoryText(fullMessages),
      summaryText: hasSummary || '',
      tokenEstimate: fullTokenEstimate,
      factsSnapshot,
    };
  }

  const recentMessages = fullMessages.slice(-CONTEXT_RECENT_TURNS);
  const summaryText = hasSummary || '(summary unavailable)';
  const historyText = [
    'Conversation summary:',
    summaryText,
    compactHistoryText(recentMessages, 'Recent turns'),
    'Known facts snapshot:',
    JSON.stringify(factsSnapshot),
  ].join('\n');

  return {
    mode: 'summarized',
    fullMessages,
    recentMessages,
    historyText,
    summaryText,
    tokenEstimate: fullTokenEstimate,
    factsSnapshot,
  };
}

async function ensureSession(sessionId, metadata = {}) {
  const ref = db.collection(SESSION_COLLECTION).doc(sessionId);
  const snap = await ref.get();
  const now = admin.firestore.FieldValue.serverTimestamp();

  if (!snap.exists) {
    await ref.set({
      sessionId,
      status: 'active',
      profile: {
        intakeStage: 'collecting_core',
      },
      metadata: {
        locale: asString(metadata.locale),
        referrer: asString(metadata.referrer),
        userAgent: asString(metadata.userAgent),
      },
      missingRequired: [...REQUIRED_FIELDS],
      missingPreferred: [...PREFERRED_FIELDS],
      messageCount: 0,
      preferencePromptCount: 0,
      completed: false,
      email1Sent: false,
      email1Pending: false,
      memory: {
        summary: '',
        modeLastUsed: 'full',
      },
      ai: {
        lastCompletionSignal: false,
      },
      createdAt: now,
      updatedAt: now,
      lastMessageAt: now,
    });

    logger.info('session_created', { sessionId });
  }

  return ref;
}

function normalizeFieldConfidenceMap(input = {}) {
  const out = {};
  for (const field of FACT_FIELDS) {
    const raw = input?.[field];
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      out[field] = Math.max(0, Math.min(1, raw));
    }
  }
  return out;
}

function buildRequiredFieldConfidences({ requiredFieldConfidences, mergedProfile, baseProfile, aiConfidence }) {
  const out = {};
  for (const field of REQUIRED_FIELDS) {
    if (typeof requiredFieldConfidences?.[field] === 'number') {
      out[field] = requiredFieldConfidences[field];
      continue;
    }

    const changed = asString(baseProfile?.[field]) !== asString(mergedProfile?.[field]);
    out[field] = changed ? (typeof aiConfidence === 'number' ? aiConfidence : 0.5) : 1;
  }
  return out;
}

function findClarificationField(requiredFieldConfidences, profile) {
  for (const field of REQUIRED_FIELDS) {
    if (!asString(profile?.[field])) continue;
    if ((requiredFieldConfidences?.[field] ?? 1) < LOW_CONFIDENCE_THRESHOLD) return field;
  }
  return '';
}

function normalizedFactValue(field, profile) {
  const value = profile?.[field];
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return asString(value);
}

async function upsertFactsFromProfile({
  sessionRef,
  previousProfile,
  nextProfile,
  fieldConfidences,
  sourceMessageId,
  sourceRole = 'user',
  sourceTurn = 0,
}) {
  const factsRef = sessionRef.collection('facts');
  const changedFields = FACT_FIELDS.filter(
    (field) => normalizedFactValue(field, previousProfile) !== normalizedFactValue(field, nextProfile)
  );

  if (changedFields.length === 0) return;

  const activeSnap = await factsRef.where('status', '==', 'active').get();
  const activeByField = {};
  activeSnap.docs.forEach((docSnap) => {
    const data = docSnap.data() || {};
    const field = asString(data.field);
    if (field && !activeByField[field]) activeByField[field] = docSnap;
  });

  for (const field of changedFields) {
    const nextValue = normalizedFactValue(field, nextProfile);
    if (!nextValue) continue;

    const confidence = typeof fieldConfidences?.[field] === 'number' ? fieldConfidences[field] : 0.5;
    const now = admin.firestore.FieldValue.serverTimestamp();
    const prior = activeByField[field];
    const newFactRef = factsRef.doc();

    if (prior) {
      const priorData = prior.data() || {};
      if (asString(priorData.normalizedValue) === nextValue) {
        await prior.ref.set(
          {
            value: nextValue,
            normalizedValue: nextValue,
            confidence,
            sourceMessageId: sourceMessageId || '',
            sourceRole,
            sourceTurn,
            updatedAt: now,
          },
          { merge: true }
        );
        continue;
      }

      await prior.ref.set(
        {
          status: 'superseded',
          supersededByFactId: newFactRef.id,
          updatedAt: now,
        },
        { merge: true }
      );
    }

    await newFactRef.set({
      field,
      value: nextValue,
      normalizedValue: nextValue,
      confidence,
      sourceMessageId: sourceMessageId || '',
      sourceRole,
      sourceTurn,
      isRequired: REQUIRED_FIELDS.includes(field),
      status: 'active',
      supersededByFactId: null,
      createdAt: now,
      updatedAt: now,
    });
  }
}

async function summarizeConversationIfNeeded({
  sessionRef,
  context,
  mergedProfile,
  missingRequired,
  stage,
  assistantReply,
  requiredFieldConfidences,
  aiCompletionSignal,
}) {
  const now = admin.firestore.FieldValue.serverTimestamp();
  const summaryBase =
    context?.mode === 'summarized' && asString(context?.summaryText)
      ? asString(context.summaryText)
      : context?.fullMessages
          ?.slice(-16)
          .map((item) => `${item.role === 'assistant' ? 'Assistant' : 'User'}: ${item.content}`)
          .join('\n') || '';

  const summary = [
    'Stable summary:',
    summaryBase,
    'Current profile:',
    JSON.stringify({
      chemicalName: mergedProfile.chemicalName || '',
      quantity: mergedProfile.quantity || '',
      locationCity: mergedProfile.locationCity || '',
      locationStateProvince: mergedProfile.locationStateProvince || '',
      locationCountry: mergedProfile.locationCountry || '',
      email: mergedProfile.email || '',
    }),
    `Missing required: ${missingRequired.join(', ') || 'none'}`,
    `Stage: ${stage}`,
    `Assistant last reply: ${assistantReply}`,
  ].join('\n');

  await sessionRef.set(
    {
      memory: {
        summary,
        modeLastUsed: context?.mode || 'full',
        updatedAt: now,
      },
      ai: {
        lastCompletionSignal: Boolean(aiCompletionSignal),
        requiredFieldConfidences,
        updatedAt: now,
      },
    },
    { merge: true }
  );
}

function escapeHtml(text) {
  return asString(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildSummaryItems(profile) {
  return [
    ['Chemical', profile.chemicalName],
    ['Quantity', profile.quantity || profile.quantityRaw],
    ['Delivery', [profile.locationCity, profile.locationStateProvince, profile.locationCountry].filter(Boolean).join(', ')],
    ['Packaging', profile.packagingPreference],
    ['Grade', profile.gradeSpec],
    ['Needed By', profile.neededBy],
    ['Frequency', profile.frequency],
    ['Notes', profile.specNotes],
  ].filter(([, value]) => asString(value));
}

function shouldUseEmail1Ai() {
  return String(process.env.EMAIL1_AI_ENABLED || 'false').toLowerCase() === 'true';
}

function getEmailModel() {
  return process.env.OPENAI_EMAIL_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini';
}

function buildFallbackEmailSummary(profile) {
  const quantity = asString(profile.quantity) || asString(profile.quantityRaw) || 'your requested quantity';
  const chemical = asString(profile.chemicalName) || 'your requested chemical';
  const destination = [profile.locationCity, profile.locationStateProvince, profile.locationCountry].filter(Boolean).join(', ') || 'your destination';

  return `We received your request for ${quantity} of ${chemical} to ${destination}. Our team is preparing supplier outreach and will follow up with quote options shortly.`;
}

function canShowProviderExamples(profile, requiredFieldConfidences = {}) {
  if (!asString(profile.chemicalName)) {
    return { include: false, reason: 'missing_chemical_name' };
  }
  if (!asString(profile.locationCity)) {
    return { include: false, reason: 'missing_location_city' };
  }
  if (!asString(profile.locationStateProvince) && !asString(profile.locationCountry)) {
    return { include: false, reason: 'missing_location_region' };
  }

  const confidenceChecks = ['chemicalName', 'locationCity'];
  if (asString(profile.locationStateProvince)) confidenceChecks.push('locationStateProvince');
  if (!asString(profile.locationStateProvince) && asString(profile.locationCountry)) confidenceChecks.push('locationCountry');

  for (const field of confidenceChecks) {
    const confidence = requiredFieldConfidences?.[field];
    if (typeof confidence === 'number' && confidence < EMAIL_PROVIDER_CONFIDENCE_THRESHOLD) {
      return { include: false, reason: `low_confidence_${field}` };
    }
  }

  return { include: true, reason: 'included' };
}

function normalizeEmailProviderExamples(input) {
  if (!Array.isArray(input)) return [];
  return input
    .slice(0, 3)
    .map((item) => ({
      name: asString(item?.name).slice(0, 120),
      city: asString(item?.city).slice(0, 80),
      state_or_province: asString(item?.state_or_province).slice(0, 80),
      why_relevant: asString(item?.why_relevant).slice(0, 240),
    }))
    .filter((item) => item.name && item.why_relevant);
}

async function callOpenAIForEmail1({ profile, includeProviderExamples }) {
  const fallbackSummary = buildFallbackEmailSummary(profile);
  const model = getEmailModel();
  const aiEnabled = shouldUseEmail1Ai();
  if (!aiEnabled) {
    return {
      shortSummary: fallbackSummary,
      providerExamples: [],
      aiGenerated: false,
      model: 'email-ai-disabled',
      error: '',
    };
  }

  const apiKey = readSecret(OPENAI_API_KEY);
  if (!apiKey) {
    return {
      shortSummary: fallbackSummary,
      providerExamples: [],
      aiGenerated: false,
      model: 'email-ai-missing-key',
      error: 'Missing OPENAI_API_KEY',
    };
  }

  const payload = {
    chemicalName: asString(profile.chemicalName),
    quantity: asString(profile.quantity) || asString(profile.quantityRaw),
    locationCity: asString(profile.locationCity),
    locationStateProvince: asString(profile.locationStateProvince),
    locationCountry: asString(profile.locationCountry),
    packagingPreference: asString(profile.packagingPreference),
    gradeSpec: asString(profile.gradeSpec),
    neededBy: asString(profile.neededBy),
    frequency: asString(profile.frequency),
    specNotes: asString(profile.specNotes),
  };

  const prompt = [
    'Generate a short customer email section for a chemical RFQ acknowledgment.',
    'Return strict JSON with keys: short_summary, provider_examples.',
    'short_summary: 2-3 sentences, concise, professional, no hype, no guarantees.',
    'provider_examples: array with max 3 objects. Each object keys:',
    'name, city, state_or_province, why_relevant.',
    includeProviderExamples
      ? 'Provider examples may be hypothetical suggestions near the customer location, and must avoid claiming confirmed stock or pricing.'
      : 'Set provider_examples to an empty array.',
    'Do not include markdown. Do not include extra keys.',
    `RFQ profile JSON: ${JSON.stringify(payload)}`,
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
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You write safe, concise procurement email copy. Never promise final pricing, availability, regulatory approval, or guaranteed supplier fit.',
          },
          { role: 'user', content: prompt },
        ],
      }),
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
      parsed = {};
    }

    const shortSummary = asString(parsed?.short_summary).slice(0, 500) || fallbackSummary;
    const providerExamples = includeProviderExamples ? normalizeEmailProviderExamples(parsed?.provider_examples) : [];

    return {
      shortSummary,
      providerExamples,
      aiGenerated: true,
      model,
      error: '',
    };
  } catch (error) {
    return {
      shortSummary: fallbackSummary,
      providerExamples: [],
      aiGenerated: false,
      model,
      error: asString(error?.message || String(error)),
    };
  }
}

function buildEmailBrandShell({ title, preheader, contentHtml, contentText }) {
  const safeTitle = escapeHtml(title);
  const safePreheader = escapeHtml(preheader);
  const logoUrl = escapeHtml(EMAIL_BRAND_LOGO_URL);

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
    '<p style="margin:0 0 8px;font-size:12px;line-height:1.45;color:#475569;">QuoteChem Procurement Concierge</p>',
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
    'QuoteChem Procurement Concierge',
    'Information in this email is provided for quote preparation and should be confirmed before purchase.',
  ].join('\n');

  return { html, text };
}

async function buildCustomerEmail(profile, requiredFieldConfidences = {}) {
  const chemical = asString(profile.chemicalName) || 'Chemical Request';
  const city = asString(profile.locationCity) || 'your destination';
  const subject = `QuoteChem Request Received — ${chemical} to ${city}`;

  const providerDecision = canShowProviderExamples(profile, requiredFieldConfidences);
  const aiContent = await callOpenAIForEmail1({
    profile,
    includeProviderExamples: providerDecision.include,
  });

  const summaryItems = buildSummaryItems(profile);
  const summaryRows = summaryItems.map(([label, value]) => `- ${label}: ${value}`).join('\n');
  const htmlRows = summaryItems
    .map(([label, value]) => `<tr><td style="padding:6px 10px;border:1px solid #d1d5db"><strong>${escapeHtml(label)}</strong></td><td style="padding:6px 10px;border:1px solid #d1d5db">${escapeHtml(value)}</td></tr>`)
    .join('');

  const providerExamples = providerDecision.include ? aiContent.providerExamples : [];
  const providerExamplesIncluded = providerExamples.length > 0;
  const providerReason = providerExamplesIncluded
    ? 'included'
    : providerDecision.include
      ? aiContent.error
        ? 'ai_generation_failed'
        : 'ai_returned_none'
      : providerDecision.reason;

  const providerHtml = providerExamplesIncluded
    ? [
        '<h3 style="margin:18px 0 8px;font-size:17px;color:#0f172a;">Nearby Provider Examples</h3>',
        '<p style="margin:0 0 8px;font-size:14px;line-height:1.55;color:#334155;">Provider examples are suggestions to verify; availability not confirmed.</p>',
        '<ul style="padding-left:20px;margin:8px 0 0;">',
        ...providerExamples.map((item) => {
          const location = [item.city, item.state_or_province].filter(Boolean).join(', ');
          return `<li style="margin:0 0 8px;"><strong>${escapeHtml(item.name)}</strong>${location ? ` (${escapeHtml(location)})` : ''}: ${escapeHtml(item.why_relevant)}</li>`;
        }),
        '</ul>',
      ].join('')
    : '';

  const providerText = providerExamplesIncluded
    ? [
        'Nearby provider examples (suggestions to verify; availability not confirmed):',
        ...providerExamples.map((item) => {
          const location = [item.city, item.state_or_province].filter(Boolean).join(', ');
          return `- ${item.name}${location ? ` (${location})` : ''}: ${item.why_relevant}`;
        }),
      ].join('\n')
    : '';

  const contentHtml = [
    '<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#1e293b;">Thanks for your request. We received your RFQ and are contacting suppliers now.</p>',
    `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#1e293b;">${escapeHtml(aiContent.shortSummary)}</p>`,
    '<h3 style="margin:14px 0 8px;font-size:17px;color:#0f172a;">Request Summary</h3>',
    `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-size:14px;color:#0f172a;">${htmlRows}</table>`,
    providerHtml,
    '<h3 style="margin:18px 0 8px;font-size:17px;color:#0f172a;">What Happens Next</h3>',
    '<ul style="padding-left:20px;margin:8px 0;"><li style="margin:0 0 6px;">We are reaching out to 3-5 verified suppliers.</li><li style="margin:0;">You will receive quote options shortly by email.</li></ul>',
    '<p style="margin:10px 0 0;font-size:13px;line-height:1.55;color:#64748b;"><em>Final pricing depends on grade, packaging, freight, and lead time.</em></p>',
  ].join('');

  const contentText = [
    'Thanks for your request. We received your RFQ and are contacting suppliers now.',
    '',
    aiContent.shortSummary,
    '',
    'Request summary:',
    summaryRows,
    providerText ? `\n${providerText}\n` : '',
    'What happens next:',
    '- We are reaching out to 3-5 verified suppliers.',
    '- You will receive quote options shortly by email.',
    '',
    'Final pricing depends on grade, packaging, freight, and lead time.',
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
    meta: {
      aiGenerated: aiContent.aiGenerated,
      aiModel: aiContent.model,
      aiError: aiContent.error,
      providerExamplesIncluded,
      providerExamplesReason: providerReason,
    },
  };
}

function buildOpsEmail(profile, sessionId, rfqId, sizeBucket) {
  const chemical = asString(profile.chemicalName) || 'Unknown chemical';
  const quantity = asString(profile.quantity) || asString(profile.quantityRaw) || 'Unknown qty';
  const city = asString(profile.locationCity) || 'Unknown city';
  const subject = `New RFQ — ${chemical} / ${quantity} / ${city}`;

  const summaryRows = buildSummaryItems(profile)
    .map(([label, value]) => `${label}: ${value}`)
    .join('\n');

  const text = [
    'New public RFQ received.',
    `RFQ ID: ${rfqId}`,
    `Session ID: ${sessionId}`,
    `Size bucket: ${sizeBucket || 'unknown'}`,
    '',
    summaryRows,
    '',
    `Chat Session ID: ${sessionId}`,
  ].join('\n');

  const html = [
    '<h2>New QuoteChem RFQ</h2>',
    `<p><strong>RFQ ID:</strong> ${escapeHtml(rfqId)}<br/><strong>Session ID:</strong> ${escapeHtml(sessionId)}<br/><strong>Size bucket:</strong> ${escapeHtml(sizeBucket || 'unknown')}</p>`,
    `<pre style="background:#f8fafc;padding:10px;border:1px solid #e2e8f0">${escapeHtml(summaryRows)}</pre>`,
  ].join('');

  return { subject, text, html };
}

function computeCompletionFingerprint(profile) {
  return [
    asString(profile.chemicalName).toLowerCase(),
    asString(profile.quantity).toLowerCase(),
    asString(profile.locationCity).toLowerCase(),
    asString(profile.locationStateProvince).toLowerCase(),
    asString(profile.locationCountry).toLowerCase(),
    asString(profile.email).toLowerCase(),
  ].join('|');
}

async function finalizeRfqIfReady({ sessionRef, session, profile, history }) {
  const missingRequired = missingFields(profile, REQUIRED_FIELDS);
  if (missingRequired.length > 0) {
    return { completed: false, rfqId: asString(session.rfqId) };
  }

  const fingerprint = computeCompletionFingerprint(profile);
  const nowIso = new Date().toISOString();
  const sessionSnapshot = await sessionRef.get();
  const currentSession = sessionSnapshot.data() || {};

  if (currentSession.email1Sent && asString(currentSession.completionFingerprint) === fingerprint) {
    return { completed: true, rfqId: asString(currentSession.rfqId) };
  }

  const pendingStartedAt = currentSession.email1PendingAt?.toMillis ? currentSession.email1PendingAt.toMillis() : null;
  if (currentSession.email1Pending && pendingStartedAt && Date.now() - pendingStartedAt < 10 * 60 * 1000) {
    return { completed: false, rfqId: asString(currentSession.rfqId) };
  }

  const rfqId = asString(currentSession.rfqId) || randomUUID();
  const fromEmail = readSecret(QUOTECHEM_FROM_EMAIL) || 'noreply@quotechem.com';
  const salesEmail = readSecret(QUOTECHEM_SALES_EMAIL);

  await sessionRef.set(
    {
      rfqId,
      completionFingerprint: fingerprint,
      email1Pending: true,
      email1PendingAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  const customerEmail = await buildCustomerEmail(profile, currentSession?.ai?.requiredFieldConfidences || {});
  const opsEmail = buildOpsEmail(profile, asString(currentSession.sessionId) || asString(session.sessionId), rfqId, profile.sizeBucket);

  logger.info('email1_ai_generated', {
    rfqId,
    sessionId: currentSession.sessionId || session.sessionId || '',
    enabled: shouldUseEmail1Ai(),
    generated: Boolean(customerEmail?.meta?.aiGenerated),
    model: asString(customerEmail?.meta?.aiModel) || 'unknown',
    fallbackUsed: !customerEmail?.meta?.aiGenerated,
    error: asString(customerEmail?.meta?.aiError),
  });

  logger.info('email1_provider_examples_included', {
    rfqId,
    sessionId: currentSession.sessionId || session.sessionId || '',
    included: Boolean(customerEmail?.meta?.providerExamplesIncluded),
    reason: asString(customerEmail?.meta?.providerExamplesReason) || 'unknown',
  });

  let customerMessageId = '';
  let opsMessageId = '';

  try {
    const customerResult = await sendEmail({
      toEmail: profile.email,
      fromEmail,
      subject: customerEmail.subject,
      text: customerEmail.text,
      html: customerEmail.html,
    });

    customerMessageId = customerResult.messageId;
    logger.info('email1_sent', { rfqId, sessionId: currentSession.sessionId, messageId: customerMessageId });

    if (salesEmail && isEmail(salesEmail)) {
      const opsResult = await sendEmail({
        toEmail: salesEmail,
        fromEmail,
        subject: opsEmail.subject,
        text: opsEmail.text,
        html: opsEmail.html,
      });

      opsMessageId = opsResult.messageId;
      logger.info('ops_notified', { rfqId, sessionId: currentSession.sessionId, messageId: opsMessageId });
    }
  } catch (error) {
    logger.error('error_sendgrid', { rfqId, sessionId: currentSession.sessionId, error: error?.message || String(error) });

    await sessionRef.set(
      {
        email1Pending: false,
        email1Error: asString(error?.message || String(error)),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    throw error;
  }

  const now = admin.firestore.FieldValue.serverTimestamp();
  const transcript = history
    .map((msg) => `${msg.role === 'assistant' ? 'assistant' : 'user'}: ${asString(msg.content)}`)
    .join('\n');

  await db
    .collection(RFQ_COLLECTION)
    .doc(rfqId)
    .set(
      {
        rfqId,
        sessionId: currentSession.sessionId,
        status: 'submitted',
        source: 'public_chat',
        profile,
        chatSummary: transcript,
        quote2Status: 'pending_human_quote',
        email1SentAt: now,
        email1MessageId: customerMessageId,
        opsNotifiedAt: opsMessageId ? now : null,
        opsMessageId,
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
      email1Pending: false,
      email1Sent: true,
      completionFingerprint: fingerprint,
      completedAt: now,
      updatedAt: now,
      profile: {
        ...profile,
        intakeStage: 'completed',
        intakeCompleteAt: nowIso,
        customerEmailConfirmedAt: nowIso,
      },
    },
    { merge: true }
  );

  logger.info('rfq_completed', { rfqId, sessionId: currentSession.sessionId });

  return { completed: true, rfqId };
}

function shouldUseConcierge() {
  return String(process.env.CONCIERGE_V1 || 'true').toLowerCase() === 'true';
}

function mergeProfiles(existing, modelExtracted, parsedHints) {
  const merged = {
    ...pickAllowedFields(existing),
    ...pickAllowedFields(modelExtracted),
    ...pickAllowedFields(parsedHints),
  };

  if (!merged.chemicalName && asString(modelExtracted?.useCase)) {
    merged.chemicalName = asString(modelExtracted.useCase);
  }

  if (!merged.quantity && merged.quantityRaw) merged.quantity = merged.quantityRaw;

  if (!merged.locationCountry && merged.destinationCountry) {
    merged.locationCountry = normalizeCountry(merged.destinationCountry);
  }

  if (merged.gradeSpec === 'not_sure') {
    merged.assumedDefaults = {
      ...(merged.assumedDefaults || {}),
      gradeApplied: true,
      gradeOriginal: 'not_sure',
    };
    merged.gradeSpec = 'industrial';
  }

  if (merged.email && !isEmail(merged.email)) {
    delete merged.email;
  }

  merged.sizeBucket = deriveSizeBucket(merged);

  return merged;
}

function assistantReplyForState({ stage, missingRequired, missingPreferred, aiReply, profile, allowSideAnswer }) {
  const answerPlusQuestion = (questionText) => {
    const helpful = sanitizeAssistantCopy(aiReply);
    if (!helpful) return questionText;
    const normalizedHelpful = helpful.replace(/\s+/g, ' ').trim();
    if (!normalizedHelpful) return questionText;
    if (normalizedHelpful.toLowerCase() === questionText.toLowerCase()) return questionText;
    return `${normalizedHelpful} ${questionText}`;
  };

  const shouldBlendHelp = Boolean(allowSideAnswer);

  if (stage === 'collecting_core') {
    const questionText = questionForMissingField(missingRequired[0]).text;
    return shouldBlendHelp ? answerPlusQuestion(questionText) : questionText;
  }

  if (stage === 'awaiting_email') {
    const questionText = questionForMissingField('email').text;
    return shouldBlendHelp ? answerPlusQuestion(questionText) : questionText;
  }

  if (stage === 'collecting_preferences') {
    const field = missingPreferred.find((item) => PRICE_SENSITIVE_PREFERRED.includes(item));
    if (field) {
      const questionText = questionForMissingField(field).text;
      return shouldBlendHelp ? answerPlusQuestion(questionText) : questionText;
    }
  }

  if (stage === 'ready_for_confirmation') {
    return `Got it — ${conciseSummary(profile)}. I\'m sending your confirmation email now. We\'re contacting 3-5 suppliers and will follow up with quotes soon after.`;
  }

  return sanitizeAssistantCopy(aiReply) || 'Thanks. Please continue with your request details.';
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
    const profile = pickAllowedFields(session.profile || {});
    const messages = await loadRecentMessages(sessionId);

    const missingRequired = missingFields(profile, REQUIRED_FIELDS);
    const missingPreferred = missingFields(profile, PREFERRED_FIELDS);
    const stage = deriveIntakeStage(session, profile, missingRequired, missingPreferred);

    if (messages.length === 0) {
      messages.push({
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: INITIAL_ASSISTANT_MESSAGE,
        quickReplies: [],
        createdAt: null,
      });
    }

    setCors(res);
    res.status(200).json({
      ok: true,
      sessionId,
      session: {
        status: session.status || 'active',
        profile: {
          ...profile,
          intakeStage: stage,
        },
        messages,
        missingFields: missingRequired,
        missingRequired,
        missingPreferred,
        intakeStage: stage,
        profileCompleteness: profileCompleteness(profile),
        readyForEmail: CORE_FIELDS.every((field) => !missingRequired.includes(field)) && missingRequired.includes('email'),
        completed: stage === 'completed' || Boolean(session.completed),
        rfqId: asString(session.rfqId),
        memoryMode: asString(session?.memory?.modeLastUsed) || 'full',
        aiCompletionSignal: Boolean(session?.ai?.lastCompletionSignal),
        requiredFieldConfidences: session?.ai?.requiredFieldConfidences || {},
        clarificationNeeded: false,
        clarificationField: '',
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
    secrets: [OPENAI_API_KEY, SENDGRID_API_KEY, QUOTECHEM_FROM_EMAIL, QUOTECHEM_SALES_EMAIL],
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

      const userMessageRef = sessionRef.collection('messages').doc();
      await userMessageRef.set({
        role: 'user',
        content: userMessage,
        createdAt: now,
      });

      const context = await buildConversationContext({ sessionId, sessionDoc: session, tokenBudget: CONTEXT_TOKEN_SOFT_LIMIT });
      const history = context.fullMessages;
      const baseProfile = pickAllowedFields(session.profile || {});

      if (containsAbusiveLanguage(userMessage)) {
        const safeReply = 'I can help with bulk chemical quote requests. Please share chemical, quantity, and delivery location.';
        await sessionRef.collection('messages').doc().set({
          role: 'assistant',
          content: safeReply,
          quickReplies: [],
          createdAt: now,
          confidence: 1,
          model: 'safety-fallback',
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
          assistant: { reply: safeReply, quickReplies: [] },
          profile: baseProfile,
          missingFields: missingFields(baseProfile, REQUIRED_FIELDS),
          missingRequired: missingFields(baseProfile, REQUIRED_FIELDS),
          missingPreferred: missingFields(baseProfile, PREFERRED_FIELDS),
          intakeStage: asString(baseProfile.intakeStage) || 'collecting_core',
          profileCompleteness: profileCompleteness(baseProfile),
          readyForEmail: false,
          completed: false,
          rfqId: asString(session.rfqId),
          quickChoices: [],
          memoryMode: context.mode,
          aiCompletionSignal: false,
          requiredFieldConfidences: {},
          clarificationNeeded: false,
          clarificationField: '',
        });
      }

      let ai = {
        assistant_reply: '',
        extracted: {},
        confidence: 0.2,
        next_missing_required: [],
        next_missing_preferred: [],
        field_confidence: {},
        completion_signal: false,
        model: 'deterministic-fallback',
      };

      if (shouldUseConcierge()) {
        try {
          ai = await callOpenAI({
            userMessage,
            context,
            profile: baseProfile,
            stage: asString(baseProfile.intakeStage) || 'collecting_core',
          });
        } catch (error) {
          logger.error('error_openai', { sessionId, error: error?.message || String(error) });
        }
      }

      const parsedHints = parseUserHints(userMessage);
      const mergedProfile = mergeProfiles(baseProfile, ai.extracted, parsedHints);
      const requiredFieldConfidences = buildRequiredFieldConfidences({
        requiredFieldConfidences: ai.field_confidence,
        mergedProfile,
        baseProfile,
        aiConfidence: ai.confidence,
      });
      const allowSideAnswer = looksLikeQuestion(userMessage) && Boolean(asString(ai.assistant_reply));

      const missingRequired = missingFields(mergedProfile, REQUIRED_FIELDS);
      const missingPreferred = missingFields(mergedProfile, PREFERRED_FIELDS);
      let stage = deriveIntakeStage(session, mergedProfile, missingRequired, missingPreferred);

      const readyForEmail = CORE_FIELDS.every((field) => !missingRequired.includes(field)) && missingRequired.includes('email');

      let completed = false;
      let rfqId = asString(session.rfqId);
      let preferencePromptIncrement = 0;
      const aiCompletionSignal = Boolean(ai.completion_signal);

      if (stage === 'collecting_preferences') {
        preferencePromptIncrement = 1;
      }

      if (missingRequired.length === 0 && (aiCompletionSignal || stage === 'ready_for_confirmation')) {
        const completion = await finalizeRfqIfReady({
          sessionRef,
          session: {
            ...session,
            sessionId,
          },
          profile: mergedProfile,
          history,
        });
        completed = completion.completed;
        rfqId = completion.rfqId || rfqId;
        if (completed) stage = 'completed';
      }

      const clarificationField = findClarificationField(requiredFieldConfidences, mergedProfile);
      const clarificationNeeded = Boolean(clarificationField) && !completed && missingRequired.length === 0;

      const assistantReply =
        stage === 'completed'
          ? `Got it — ${conciseSummary(mergedProfile)}. I\'m sending your confirmation email now. We\'re contacting 3-5 suppliers and will follow up with quotes soon after.`
          : clarificationNeeded
            ? `Quick check: ${questionForMissingField(clarificationField).text}`
          : assistantReplyForState({
              stage,
              missingRequired,
              missingPreferred,
              aiReply: ai.assistant_reply,
              profile: mergedProfile,
              allowSideAnswer,
            });

      const quickChoices = clarificationNeeded
        ? questionForMissingField(clarificationField).quickChoices
        : buildQuickChoices(stage, missingRequired, missingPreferred);

      const assistantMessageRef = sessionRef.collection('messages').doc();
      await assistantMessageRef.set({
        role: 'assistant',
        content: assistantReply,
        quickReplies: quickChoices,
        createdAt: now,
        confidence: ai.confidence,
        model: ai.model,
      });

      const profileForSave = {
        ...mergedProfile,
        intakeStage: stage,
      };

      await upsertFactsFromProfile({
        sessionRef,
        previousProfile: baseProfile,
        nextProfile: profileForSave,
        fieldConfidences: {
          ...ai.field_confidence,
          ...requiredFieldConfidences,
        },
        sourceMessageId: userMessageRef.id,
        sourceRole: 'user',
        sourceTurn: Number(session.messageCount || 0) + 1,
      });

      if (shouldUseMemoryV2()) {
        await summarizeConversationIfNeeded({
          sessionRef,
          context,
          mergedProfile: profileForSave,
          missingRequired,
          stage,
          assistantReply,
          requiredFieldConfidences,
          aiCompletionSignal,
        });
      }

      await sessionRef.set(
        {
          profile: profileForSave,
          missingFields: missingRequired,
          missingRequired,
          missingPreferred,
          updatedAt: now,
          lastMessageAt: now,
          messageCount: admin.firestore.FieldValue.increment(2),
          preferencePromptCount: admin.firestore.FieldValue.increment(preferencePromptIncrement),
          completed,
          rfqId: rfqId || null,
          'memory.modeLastUsed': context.mode,
          'ai.lastCompletionSignal': aiCompletionSignal,
          'ai.requiredFieldConfidences': requiredFieldConfidences,
        },
        { merge: true }
      );

      if (readyForEmail) {
        logger.info('email_requested', { sessionId });
      }

      logger.info('field_extracted', {
        sessionId,
        stage,
        missingRequired,
        missingPreferred,
        completeness: profileCompleteness(mergedProfile),
        memoryMode: context.mode,
        clarificationNeeded,
        clarificationField,
      });

      setCors(res);
      res.status(200).json({
        ok: true,
        sessionId,
        assistant: {
          reply: assistantReply,
          quickReplies: quickChoices,
        },
        profile: profileForSave,
        missingFields: missingRequired,
        missingRequired,
        missingPreferred,
        intakeStage: stage,
        profileCompleteness: profileCompleteness(mergedProfile),
        readyForEmail,
        completed,
        rfqId,
        quickChoices,
        memoryMode: context.mode,
        aiCompletionSignal,
        requiredFieldConfidences,
        clarificationNeeded,
        clarificationField,
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
    secrets: [OPENAI_API_KEY, SENDGRID_API_KEY, QUOTECHEM_FROM_EMAIL],
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

      let selected = templates[template] || templates.basic;
      if (template === 'email1_preview') {
        selected = await buildCustomerEmail(
          {
            chemicalName: 'Sodium Hydroxide',
            quantity: '20,000 kg',
            locationCity: 'Houston',
            locationStateProvince: 'Texas',
            locationCountry: 'United States',
            packagingPreference: 'totes',
            gradeSpec: 'industrial',
            neededBy: 'ASAP',
            frequency: 'one_time',
            specNotes: 'COA preferred',
          },
          {
            chemicalName: 1,
            locationCity: 1,
            locationStateProvince: 1,
          }
        );
      }

      await sendEmail({
        toEmail: targetEmail,
        fromEmail,
        subject: selected.subject,
        text: selected.text,
        html: selected.html,
      });

      setCors(res);
      const knownTemplate = template in templates || template === 'email1_preview';
      res.status(200).json({ ok: true, sent: true, template: knownTemplate ? template : 'basic' });
    } catch (error) {
      logger.error('[sendTestEmail] failed', { targetEmail, error: error?.message || String(error) });
      return jsonError(res, 500, 'Failed to send test email');
    }
  }
);
