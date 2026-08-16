import { randomUUID } from 'node:crypto';
import { defineSecret } from 'firebase-functions/params';
import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { admin, db, storage } from '../../core/firebase.js';
import { requireMiniAppAccess } from '../../core/auth.js';
import { REGION, jsonError, preflight, setCors } from '../../core/http.js';
import { asString, readSecret } from '../../core/values.js';

const OPENAI_API_KEY = defineSecret('OPENAI_API_KEY');
const CHAT_MODEL = process.env.OPENAI_QUOTECHEM_MODEL || 'gpt-5.4-mini';
const CONVERSATIONS = 'quotechemConversations';
const MESSAGE_LIMIT = 24;
const MESSAGE_MAX_CHARS = 5000;
const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
const MAX_QUESTIONS = 3;
const ATTACHMENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']);

function invalid(message, status = 400) { throw Object.assign(new Error(message), { status }); }

function safeOpenAIError(status) {
  if (status === 429) return Object.assign(new Error('The AI service is busy. Please try again shortly.'), { status: 429 });
  if (status === 400) return Object.assign(new Error('The AI service could not process that request.'), { status: 400 });
  return Object.assign(new Error('The AI service is temporarily unavailable.'), { status: 502 });
}

function safeId(value, fallback = '') {
  return asString(value).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100) || fallback;
}

function safeFilename(value, contentType) {
  const extension = contentType === 'application/pdf' ? 'pdf' : contentType.split('/')[1].replace('jpeg', 'jpg');
  const base = asString(value).replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-').slice(0, 100);
  return base || `attachment.${extension}`;
}

export function decodeAttachment(value = {}) {
  const source = asString(value.dataUrl);
  const match = source.match(/^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!match || !ATTACHMENT_TYPES.has(match[1])) invalid('Choose a JPEG, PNG, WebP, GIF, or PDF file.');
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > ATTACHMENT_MAX_BYTES) invalid('Attachments must be 10 MB or smaller.');
  return { contentType: match[1], buffer, dataUrl: source, name: safeFilename(value.name, match[1]), size: buffer.length };
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

export function normalizeChatResult(value = {}, { hasAttachment = false, questionCount = 0 } = {}) {
  let reply = asString(value.reply).slice(0, MESSAGE_MAX_CHARS);
  if (!reply) invalid('The AI returned an empty response.', 502);
  let replyType = value.replyType === 'summary' ? 'summary' : 'question';
  let readyForContact = Boolean(value.readyForContact);
  let quickReplies = Array.isArray(value.quickReplies)
    ? value.quickReplies.map((item) => asString(item).slice(0, 120)).filter(Boolean).slice(0, 4)
    : [];
  if (questionCount >= MAX_QUESTIONS && replyType === 'question') {
    replyType = 'summary'; readyForContact = true; quickReplies = [];
    reply = 'Thank you — I have enough information for the QuoteChem sourcing team to begin reviewing this request. You can add your contact details now, and our team can clarify anything else during follow-up.';
  }
  const attachmentSummary = hasAttachment
    ? asString(value.attachmentSummary).slice(0, 700) || 'The attachment was received, but I could not reliably extract enough detail to describe it. A clearer image or original PDF may help.'
    : '';
  return {
    reply, quickReplies, replyType, readyForContact,
    attachmentAcknowledged: hasAttachment ? true : false,
    attachmentSummary,
  };
}

function extractResponseJson(data) {
  if (typeof data?.output_text === 'string') return JSON.parse(data.output_text);
  for (const item of data?.output || []) for (const content of item?.content || []) if (typeof content?.text === 'string') return JSON.parse(content.text);
  return {};
}

function contextText(context = {}) {
  return [
    `Need: ${asString(context.needLabel) || 'Open requirement'}`,
    asString(context.areaLabel) ? `Production area: ${asString(context.areaLabel)}` : '',
    asString(context.issueLabel) ? `Issue: ${asString(context.issueLabel)}` : '',
  ].filter(Boolean).join('\n');
}

export function buildChatInput(messages, context, attachment, questionCount = 0) {
  const input = [{ role: 'system', content: [{ type: 'input_text', text: [
    'You are QuoteChem, a concise technical sourcing representative for specialty oilfield chemicals.',
    `You may ask at most ${MAX_QUESTIONS} qualification questions total. ${questionCount >= MAX_QUESTIONS ? 'Do not ask another question; provide a short qualification summary and set readyForContact true.' : `You have already asked ${questionCount}. Ask only the single most useful next question if needed.`}`,
    'Do not repeat supplied facts. Prioritize application, observed problem, current treatment, operating conditions, location, quantity, packaging, and timing only when relevant.',
    'Once, when useful, suggest uploading a product label, field photo, SDS/TDS, water analysis, or lab report. Never require or repeatedly request an upload.',
    'Never claim a product, diagnosis, price, manufacturer, availability, or technical solution has been confirmed. Keep reply under 120 words.',
    attachment ? 'You received an attachment. Inspect it, explicitly state what is visibly or documentably present, describe uncertainty, set attachmentAcknowledged true, and provide a useful attachmentSummary.' : 'No attachment was supplied in this turn. Set attachmentAcknowledged false and attachmentSummary to an empty string.',
    `Guided context:\n${contextText(context)}`,
  ].join('\n') }] }];
  for (const message of messages) input.push({ role: message.role, content: [{ type: message.role === 'assistant' ? 'output_text' : 'input_text', text: message.text }] });
  if (attachment) {
    const lastUser = [...input].reverse().find((item) => item.role === 'user');
    if (lastUser) lastUser.content.push(attachment.contentType === 'application/pdf'
      ? { type: 'input_file', filename: attachment.name, file_data: attachment.dataUrl }
      : { type: 'input_image', image_url: attachment.dataUrl, detail: 'auto' });
  }
  return input;
}

async function fetchOpenAI(options) {
  const apiKey = readSecret(OPENAI_API_KEY);
  if (!apiKey) invalid('OpenAI is not configured.', 503);
  const response = await fetch('https://api.openai.com/v1/responses', {
    ...options, headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
  });
  if (!response.ok) { logger.error('QuoteChem OpenAI request failed', { status: response.status }); throw safeOpenAIError(response.status); }
  return response;
}

async function ownedConversation(conversationId, user, allowCreate = false) {
  const id = safeId(conversationId);
  if (!id) return null;
  const ref = db.collection(CONVERSATIONS).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return allowCreate ? { id, ref, data: null } : invalid('Conversation not found.', 404);
  if (snap.data()?.ownerUid !== user.uid) invalid('Conversation not found.', 404);
  return { id, ref, data: snap.data() || {} };
}

async function savedMessages(ref) {
  const snap = await ref.collection('messages').orderBy('createdAt', 'asc').limitToLast(MESSAGE_LIMIT).get();
  return snap.docs.map((doc) => doc.data()).filter((item) => ['user', 'assistant'].includes(item.role) && asString(item.text));
}

async function saveAttachment(user, conversationId, messageId, attachment) {
  const path = `quotechem-conversations/${user.uid}/${conversationId}/${messageId}-${attachment.name}`;
  await storage.bucket().file(path).save(attachment.buffer, {
    contentType: attachment.contentType, resumable: false,
    metadata: { cacheControl: 'private,max-age=3600', metadata: { ownerUid: user.uid, conversationId, messageId } },
  });
  return { path, name: attachment.name, contentType: attachment.contentType, size: attachment.size, kind: attachment.contentType === 'application/pdf' ? 'pdf' : 'image' };
}

export const quotechemChat = onRequest(
  { region: REGION, timeoutSeconds: 120, memory: '1GiB', secrets: [OPENAI_API_KEY] },
  async (req, res) => {
    if (preflight(req, res)) return;
    if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');
    try {
      const user = await requireMiniAppAccess(req, 'quotechem');
      const text = asString(req.body?.text).slice(0, MESSAGE_MAX_CHARS);
      const messageId = safeId(req.body?.messageId);
      if (!messageId || (!text && !req.body?.attachment?.dataUrl)) return jsonError(res, 400, 'A message or attachment is required.');
      const attachment = req.body?.attachment?.dataUrl ? decodeAttachment(req.body.attachment) : null;
      let conversation = await ownedConversation(req.body?.conversationId, user, true);
      const now = admin.firestore.FieldValue.serverTimestamp();
      if (!conversation?.data) {
        const id = conversation?.id || randomUUID(); const ref = conversation?.ref || db.collection(CONVERSATIONS).doc(id);
        await ref.set({ conversationId: id, ownerUid: user.uid, ownerEmail: user.email || '', guidedContext: req.body?.context || {}, status: 'active', questionCount: 0, attachmentCount: 0, createdAt: now, updatedAt: now });
        conversation = { id, ref, data: { questionCount: 0 } };
      }
      const userRef = conversation.ref.collection('messages').doc(messageId);
      const existing = await userRef.get();
      if (existing.exists && existing.data()?.assistantMessageId) {
        const assistant = await conversation.ref.collection('messages').doc(existing.data().assistantMessageId).get();
        setCors(res); return res.status(200).json({ ok: true, conversationId: conversation.id, ...assistant.data()?.response });
      }
      const storedAttachment = existing.data()?.attachment || (attachment ? await saveAttachment(user, conversation.id, messageId, attachment) : null);
      if (!existing.exists) await userRef.set({ messageId, role: 'user', text: text || `Please review the attached ${storedAttachment?.kind || 'file'}.`, attachment: storedAttachment, createdAt: now });
      const history = normalizeChatMessages(await savedMessages(conversation.ref));
      const questionCount = Number(conversation.data.questionCount) || 0;
      const response = await fetchOpenAI({ method: 'POST', body: JSON.stringify({
        model: CHAT_MODEL, reasoning: { effort: 'low' }, input: buildChatInput(history, conversation.data.guidedContext || req.body?.context || {}, attachment, questionCount),
        text: { verbosity: 'low', format: { type: 'json_schema', name: 'quotechem_reply', strict: true, schema: {
          type: 'object', additionalProperties: false,
          properties: {
            reply: { type: 'string' }, quickReplies: { type: 'array', maxItems: 4, items: { type: 'string' } }, readyForContact: { type: 'boolean' },
            replyType: { type: 'string', enum: ['question', 'summary'] }, attachmentAcknowledged: { type: 'boolean' }, attachmentSummary: { type: 'string' },
          },
          required: ['reply', 'quickReplies', 'readyForContact', 'replyType', 'attachmentAcknowledged', 'attachmentSummary'],
        } } },
      }) });
      const result = normalizeChatResult(extractResponseJson(await response.json()), { hasAttachment: Boolean(attachment), questionCount });
      const assistantMessageId = randomUUID();
      const nextQuestionCount = questionCount + (result.replyType === 'question' ? 1 : 0);
      const batch = db.batch();
      batch.set(conversation.ref.collection('messages').doc(assistantMessageId), { messageId: assistantMessageId, role: 'assistant', text: result.reply, response: result, createdAt: now });
      batch.set(userRef, { assistantMessageId }, { merge: true });
      batch.set(conversation.ref, { questionCount: nextQuestionCount, attachmentCount: admin.firestore.FieldValue.increment(storedAttachment ? 1 : 0), status: result.readyForContact ? 'ready' : 'active', updatedAt: now }, { merge: true });
      await batch.commit();
      setCors(res); return res.status(200).json({ ok: true, conversationId: conversation.id, ...result, model: CHAT_MODEL });
    } catch (error) {
      logger.error('quotechemChat failed', { status: error?.status, message: error?.message });
      return jsonError(res, Number(error?.status) || 500, error?.message || 'Chat request failed.');
    }
  }
);

export const quotechemComplete = onRequest({ region: REGION }, async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');
  try {
    const user = await requireMiniAppAccess(req, 'quotechem');
    const conversation = await ownedConversation(req.body?.conversationId, user);
    if (!conversation) return jsonError(res, 400, 'Start a conversation before completing the request.');
    const contact = {
      name: asString(req.body?.contact?.name).slice(0, 120), company: asString(req.body?.contact?.company).slice(0, 160),
      email: asString(req.body?.contact?.email).toLowerCase().slice(0, 200), phone: asString(req.body?.contact?.phone).slice(0, 60), country: asString(req.body?.contact?.country).slice(0, 120),
    };
    if (!contact.name || !contact.company || !/^\S+@\S+\.\S+$/.test(contact.email) || !contact.country) return jsonError(res, 400, 'Complete the required contact details.');
    const requestId = `QC-${new Date().getFullYear()}-${String(Math.floor(10000 + Math.random() * 90000))}`;
    await conversation.ref.set({ contact, requestId, status: 'submitted', submittedAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    setCors(res); return res.status(200).json({ ok: true, requestId });
  } catch (error) { return jsonError(res, Number(error?.status) || 500, error?.message || 'Unable to complete the request.'); }
});
