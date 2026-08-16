import { defineSecret } from 'firebase-functions/params';
import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { requireMiniAppAccess } from '../../core/auth.js';
import { REGION, jsonError, preflight, setCors } from '../../core/http.js';
import { asString, readSecret } from '../../core/values.js';

const OPENAI_API_KEY = defineSecret('OPENAI_API_KEY');
const CHAT_MODEL = process.env.OPENAI_QUOTECHEM_MODEL || 'gpt-5.4-mini';
const TRANSCRIBE_MODEL = process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe';
const SPEECH_MODEL = process.env.OPENAI_SPEECH_MODEL || 'tts-1';
const MESSAGE_LIMIT = 24;
const MESSAGE_MAX_CHARS = 5000;
const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const AUDIO_MAX_BYTES = 12 * 1024 * 1024;
const SPEECH_MAX_CHARS = 3500;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const AUDIO_TYPES = new Set(['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/ogg']);

function safeOpenAIError(status) {
  if (status === 429) return Object.assign(new Error('The AI service is busy. Please try again shortly.'), { status: 429 });
  if (status === 400) return Object.assign(new Error('The AI service could not process that request.'), { status: 400 });
  return Object.assign(new Error('The AI service is temporarily unavailable.'), { status: 502 });
}

function decodeDataUrl(value, allowedTypes, maxBytes, label) {
  const source = asString(value);
  const match = source.match(/^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!match || !allowedTypes.has(match[1])) throw Object.assign(new Error(`Unsupported ${label} format.`), { status: 400 });
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > maxBytes) throw Object.assign(new Error(`${label} is too large.`), { status: 400 });
  return { contentType: match[1], buffer, dataUrl: source };
}

export function normalizeChatMessages(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(-MESSAGE_LIMIT).flatMap((item) => {
    const role = item?.role === 'assistant' ? 'assistant' : item?.role === 'user' ? 'user' : '';
    const text = asString(item?.text).slice(0, MESSAGE_MAX_CHARS);
    if (!role || !text) return [];
    return [{ role, text }];
  });
}

export function normalizeChatResult(value = {}) {
  const reply = asString(value.reply).slice(0, MESSAGE_MAX_CHARS);
  if (!reply) throw Object.assign(new Error('The AI returned an empty response.'), { status: 502 });
  const quickReplies = Array.isArray(value.quickReplies)
    ? value.quickReplies.map((item) => asString(item).slice(0, 120)).filter(Boolean).slice(0, 4)
    : [];
  return { reply, quickReplies, readyForContact: Boolean(value.readyForContact) };
}

function extractResponseJson(data) {
  if (typeof data?.output_text === 'string') return JSON.parse(data.output_text);
  for (const item of data?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === 'string') return JSON.parse(content.text);
    }
  }
  return {};
}

function contextText(context = {}) {
  const parts = [
    `Need: ${asString(context.needLabel) || 'Open requirement'}`,
    asString(context.areaLabel) ? `Production area: ${asString(context.areaLabel)}` : '',
    asString(context.issueLabel) ? `Issue: ${asString(context.issueLabel)}` : '',
  ].filter(Boolean);
  return parts.join('\n');
}

export function buildChatInput(messages, context, image) {
  const input = [{ role: 'system', content: [{ type: 'input_text', text: [
    'You are QuoteChem, a concise technical sourcing representative for specialty oilfield chemicals.',
    'Qualify the request by asking one useful question at a time. Do not repeat facts already supplied.',
    'Prioritize application, observed problem, current chemistry and dosage, operating conditions, location, quantity, packaging, and timing only when relevant.',
    'Never claim a product, diagnosis, price, manufacturer, availability, or technical solution has been confirmed.',
    'Be practical and professional. Keep replies under 120 words. Images may be field photos, equipment, labels, deposits, or documents; describe uncertainty clearly.',
    'Set readyForContact true once there is enough information for a human sourcing team to begin. Supply zero to four short quick replies only when genuinely helpful.',
    `Guided context:\n${contextText(context)}`,
  ].join('\n') }] }];
  for (const message of messages) input.push({ role: message.role, content: [{ type: message.role === 'assistant' ? 'output_text' : 'input_text', text: message.text }] });
  if (image) {
    const lastUser = [...input].reverse().find((item) => item.role === 'user');
    if (lastUser) lastUser.content.push({ type: 'input_image', image_url: image.dataUrl, detail: 'auto' });
  }
  return input;
}

async function fetchOpenAI(path, options) {
  const apiKey = readSecret(OPENAI_API_KEY);
  if (!apiKey) throw Object.assign(new Error('OpenAI is not configured.'), { status: 503 });
  const response = await fetch(`https://api.openai.com/v1/${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${apiKey}`, ...(options.headers || {}) },
  });
  if (!response.ok) {
    logger.error('QuoteChem OpenAI request failed', { path, status: response.status });
    throw safeOpenAIError(response.status);
  }
  return response;
}

async function authenticate(req) {
  return requireMiniAppAccess(req, 'quotechem');
}

export const quotechemChat = onRequest(
  { region: REGION, timeoutSeconds: 120, memory: '512MiB', secrets: [OPENAI_API_KEY] },
  async (req, res) => {
    if (preflight(req, res)) return;
    if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');
    try {
      await authenticate(req);
      const messages = normalizeChatMessages(req.body?.messages);
      if (!messages.length || messages.at(-1)?.role !== 'user') return jsonError(res, 400, 'A user message is required.');
      const image = req.body?.image?.dataUrl ? decodeDataUrl(req.body.image.dataUrl, IMAGE_TYPES, IMAGE_MAX_BYTES, 'Image') : null;
      const response = await fetchOpenAI('responses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: CHAT_MODEL,
          reasoning: { effort: 'low' },
          input: buildChatInput(messages, req.body?.context || {}, image),
          text: { verbosity: 'low', format: { type: 'json_schema', name: 'quotechem_reply', strict: true, schema: {
            type: 'object', additionalProperties: false,
            properties: {
              reply: { type: 'string' },
              quickReplies: { type: 'array', maxItems: 4, items: { type: 'string' } },
              readyForContact: { type: 'boolean' },
            },
            required: ['reply', 'quickReplies', 'readyForContact'],
          } } },
        }),
      });
      const result = normalizeChatResult(extractResponseJson(await response.json()));
      setCors(res);
      return res.status(200).json({ ok: true, ...result, model: CHAT_MODEL });
    } catch (error) {
      logger.error('quotechemChat failed', { status: error?.status, message: error?.message });
      return jsonError(res, Number(error?.status) || 500, error?.message || 'Chat request failed.');
    }
  }
);

export const quotechemTranscribe = onRequest(
  { region: REGION, timeoutSeconds: 120, memory: '512MiB', secrets: [OPENAI_API_KEY] },
  async (req, res) => {
    if (preflight(req, res)) return;
    if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');
    try {
      await authenticate(req);
      const audio = decodeDataUrl(req.body?.audioDataUrl, AUDIO_TYPES, AUDIO_MAX_BYTES, 'Audio recording');
      const extension = audio.contentType.includes('webm') ? 'webm' : audio.contentType.includes('mp4') ? 'm4a' : audio.contentType.includes('wav') ? 'wav' : audio.contentType.includes('ogg') ? 'ogg' : 'mp3';
      const form = new FormData();
      form.append('model', TRANSCRIBE_MODEL);
      form.append('file', new Blob([audio.buffer], { type: audio.contentType }), `recording.${extension}`);
      const response = await fetchOpenAI('audio/transcriptions', { method: 'POST', body: form });
      const data = await response.json();
      const transcript = asString(data?.text).slice(0, MESSAGE_MAX_CHARS);
      if (!transcript) throw Object.assign(new Error('No speech was detected.'), { status: 400 });
      setCors(res);
      return res.status(200).json({ ok: true, transcript });
    } catch (error) {
      logger.error('quotechemTranscribe failed', { status: error?.status, message: error?.message });
      return jsonError(res, Number(error?.status) || 500, error?.message || 'Transcription failed.');
    }
  }
);

export const quotechemSpeak = onRequest(
  { region: REGION, timeoutSeconds: 120, memory: '512MiB', secrets: [OPENAI_API_KEY] },
  async (req, res) => {
    if (preflight(req, res)) return;
    if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');
    try {
      await authenticate(req);
      const text = asString(req.body?.text).slice(0, SPEECH_MAX_CHARS);
      if (!text) return jsonError(res, 400, 'Text is required.');
      const response = await fetchOpenAI('audio/speech', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: SPEECH_MODEL, voice: 'alloy', input: text, response_format: 'mp3' }),
      });
      const audio = Buffer.from(await response.arrayBuffer());
      setCors(res);
      return res.status(200).json({ ok: true, audioDataUrl: `data:audio/mpeg;base64,${audio.toString('base64')}` });
    } catch (error) {
      logger.error('quotechemSpeak failed', { status: error?.status, message: error?.message });
      return jsonError(res, Number(error?.status) || 500, error?.message || 'Speech generation failed.');
    }
  }
);
