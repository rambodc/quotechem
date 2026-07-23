import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { defineSecret } from 'firebase-functions/params';
import { EMAIL_SECRETS, DEFAULT_EMAIL_TEMPLATE_IDS, getDefaultEmailTemplate, sendTemplatedEmail } from './email.js';
import { admin, db, storage } from './firebaseAdmin.js';

const REGION = 'us-central1';
const INVITATION_COLLECTION = 'invitations';
const EMAIL_TEMPLATE_COLLECTION = 'emailTemplates';
const UNIQUEM_3D_MODEL_COLLECTION = 'uniquem3DModels';
const UNIQUEM_PRODUCT_COLLECTION = 'uniquemProducts';
const UNIQUEM_ATTACHMENT_COLLECTION = 'uniquemAttachments';
const UNIQUEM_CREATOR_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const UNIQUEM_CREATOR_PROMPT_MAX_CHARS = 2200;
const UNIQUEM_SCENE_OBJECT_MAX = 80;
const UNIQUEM_OBJECT_TYPES = ['box', 'cylinder', 'plane', 'platform', 'stairs', 'trussTower', 'speakerStack', 'ledPanel', 'lightBeam', 'label'];
const UNIQUEM_MATERIAL_KINDS = ['matte', 'metal', 'glow', 'screen'];
const UNIQUEM_TEXTURE_KINDS = ['plain', 'grid', 'cosmic', 'sunset'];

const OPENAI_API_KEY = defineSecret('OPENAI_API_KEY');

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

function normalizeRole(value) {
  const role = asString(value).toLowerCase();
  return role === 'admin' ? 'admin' : 'user';
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

const MINI_APP_IDS = ['uniquem', 'user-access', 'account'];
const ACCESS_MANAGED_MINI_APP_IDS = ['uniquem'];

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
    firstName: asString(data.firstName),
    lastName: asString(data.lastName),
    profilePhotoUrl: asString(data.profilePhotoUrl),
    profilePhotoThumbUrl: asString(data.profilePhotoThumbUrl),
    enabledMiniApps: normalizeMiniAppIds(data.enabledMiniApps) || defaultEnabledMiniAppsForRole(role),
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
    createdBy: asString(data.createdBy),
  };
}

function normalizeDocId(value) {
  return asString(value).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 90);
}

function parseOpenAIJson(raw) {
  const text = asString(raw).replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return {};
      }
    }
    return {};
  }
}

async function ensureUniquemAccess(req) {
  const user = await authenticateRequest(req);
  const userSnap = await db.collection('users').doc(user.uid).get();
  const appUser = userSnap.data() || {};
  const allowed = user.role === 'admin' || normalizeMiniAppIds(appUser.enabledMiniApps)?.includes('uniquem');
  if (!allowed) {
    const err = new Error('Forbidden');
    err.status = 403;
    throw err;
  }
  return user;
}

function clampNumber(value, min, max, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

function normalizeVector3(value, fallback = [0, 0, 0], min = -35, max = 35) {
  const source = Array.isArray(value) ? value : [];
  return [0, 1, 2].map((index) => clampNumber(source[index], min, max, fallback[index]));
}

function normalizeHexColor(value, fallback = '#64748b') {
  const text = asString(value);
  return /^#[0-9a-fA-F]{6}$/.test(text) ? text.toLowerCase() : fallback;
}

function normalizeUniquemSceneObject(item = {}, index = 0) {
  const type = asString(item.type);
  if (!UNIQUEM_OBJECT_TYPES.includes(type)) return null;
  const materialKind = UNIQUEM_MATERIAL_KINDS.includes(asString(item.materialKind)) ? asString(item.materialKind) : 'matte';
  const textureKind = UNIQUEM_TEXTURE_KINDS.includes(asString(item.textureKind)) ? asString(item.textureKind) : 'plain';
  return {
    id: asString(item.id).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) || `object-${index + 1}`,
    type,
    label: asString(item.label).slice(0, 48),
    position: normalizeVector3(item.position, [0, 0.5, 0], -35, 35),
    scale: normalizeVector3(item.scale, [1, 1, 1], 0.05, 14),
    rotationY: clampNumber(item.rotationY, -Math.PI * 2, Math.PI * 2, 0),
    color: normalizeHexColor(item.color),
    materialKind,
    textureKind,
  };
}

function fallbackUniquemScene() {
  return {
    title: 'Generated Object Group',
    summary: 'The request produced a safe starter object group. Regenerate with more detail for a richer preview.',
    cameraHint: { distance: 24, target: [0, 2, 0] },
    objects: [
      {
        id: 'concept-platform',
        type: 'platform',
        label: 'Base',
        position: [0, 0.1, 0],
        scale: [7, 0.2, 4],
        rotationY: 0,
        color: '#334155',
        materialKind: 'matte',
        textureKind: 'plain',
      },
      {
        id: 'concept-panel',
        type: 'ledPanel',
        label: 'Concept',
        position: [0, 2.4, -1.9],
        scale: [4, 2.4, 1],
        rotationY: 0,
        color: '#db2777',
        materialKind: 'screen',
        textureKind: 'cosmic',
      },
    ],
  };
}

function normalizeUniquemScene(value = {}) {
  const rawObjects = Array.isArray(value.objects) ? value.objects : [];
  const objects = rawObjects
    .slice(0, UNIQUEM_SCENE_OBJECT_MAX)
    .map((item, index) => normalizeUniquemSceneObject(item, index))
    .filter(Boolean);
  if (!objects.length) return fallbackUniquemScene();

  return {
    title: asString(value.title).slice(0, 80) || 'Generated 3D Concept',
    summary: asString(value.summary).slice(0, 220) || 'A procedural 3D object group generated from the prompt.',
    cameraHint: {
      distance: clampNumber(value.cameraHint?.distance, 8, 70, 28),
      target: normalizeVector3(value.cameraHint?.target, [0, 2, 0], -30, 30),
    },
    objects,
  };
}

function isUniquemCreatorImageContentType(value) {
  return ['image/png', 'image/jpeg', 'image/webp'].includes(asString(value).toLowerCase());
}

function normalizeUniquemCreatorImage(image) {
  if (!image) return null;
  const contentType = asString(image.contentType).toLowerCase();
  if (!isUniquemCreatorImageContentType(contentType)) {
    const err = new Error('Use a PNG, JPG, or WebP image.');
    err.status = 400;
    throw err;
  }
  const dataUrl = asString(image.dataUrl);
  const prefix = `data:${contentType};base64,`;
  if (!dataUrl.startsWith(prefix)) {
    const err = new Error('Image data is invalid.');
    err.status = 400;
    throw err;
  }
  const base64 = dataUrl.slice(prefix.length);
  const bytes = Buffer.byteLength(base64, 'base64');
  if (!bytes || bytes > UNIQUEM_CREATOR_IMAGE_MAX_BYTES) {
    const err = new Error('Image must be 8 MB or smaller.');
    err.status = 400;
    throw err;
  }
  return {
    name: asString(image.name).slice(0, 120) || 'reference-image',
    contentType,
    dataUrl,
    bytes,
  };
}

function normalizeUniquemModelStatus(value) {
  return asString(value) === 'archived' ? 'archived' : 'active';
}

function mapUniquem3DModelDoc(doc) {
  const data = doc.data() || {};
  const scene = normalizeUniquemScene(data.scene || {});
  return {
    modelId: asString(data.modelId) || doc.id,
    title: asString(data.title) || scene.title,
    summary: asString(data.summary) || scene.summary,
    scene,
    status: normalizeUniquemModelStatus(data.status),
    createdBy: asString(data.createdBy),
    createdByEmail: asString(data.createdByEmail),
    createdAt: toIso(data.createdAt),
    updatedBy: asString(data.updatedBy),
    updatedByEmail: asString(data.updatedByEmail),
    updatedAt: toIso(data.updatedAt),
    latestPrompt: asString(data.latestPrompt),
    versionCount: Math.max(0, Number(data.versionCount || 0)),
  };
}

function mapUniquem3DVersionDoc(doc) {
  const data = doc.data() || {};
  return {
    versionId: asString(data.versionId) || doc.id,
    scene: normalizeUniquemScene(data.scene || {}),
    prompt: asString(data.prompt),
    model: asString(data.model),
    source: ['ai-generate', 'ai-edit', 'restore'].includes(asString(data.source)) ? asString(data.source) : 'ai-edit',
    createdBy: asString(data.createdBy),
    createdByEmail: asString(data.createdByEmail),
    createdAt: toIso(data.createdAt),
  };
}

function filterActiveUniquem3DModels(models = [], limit = 100) {
  return (Array.isArray(models) ? models : [])
    .filter((model) => normalizeUniquemModelStatus(model.status) === 'active')
    .sort((a, b) => {
      const aTime = asString(a.updatedAt);
      const bTime = asString(b.updatedAt);
      return bTime.localeCompare(aTime);
    })
    .slice(0, limit);
}

function buildUniquemVersionDoc({ versionId, scene, prompt, model, source, user }) {
  return {
    versionId,
    scene: normalizeUniquemScene(scene),
    prompt: asString(prompt).slice(0, UNIQUEM_CREATOR_PROMPT_MAX_CHARS),
    model: asString(model).slice(0, 80),
    source: ['ai-generate', 'ai-edit', 'restore'].includes(asString(source)) ? asString(source) : 'ai-edit',
    createdBy: user.uid,
    createdByEmail: user.email,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

async function loadActiveUniquem3DModel(modelId) {
  const id = normalizeDocId(modelId);
  if (!id) {
    const err = new Error('modelId is required');
    err.status = 400;
    throw err;
  }
  const ref = db.collection(UNIQUEM_3D_MODEL_COLLECTION).doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    const err = new Error('Model not found');
    err.status = 404;
    throw err;
  }
  const model = mapUniquem3DModelDoc(snap);
  if (model.status === 'archived') {
    const err = new Error('Model not found');
    err.status = 404;
    throw err;
  }
  return { ref, snap, model };
}

function normalizeUniquemQuantity(value, { allowNegative = false, fallback = 0 } = {}) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  const rounded = Math.round(num * 1000) / 1000;
  if (allowNegative) return Math.max(-100000000, Math.min(100000000, rounded));
  return Math.max(0, Math.min(100000000, rounded));
}

function normalizeUniquemStatus(value, allowed = ['active', 'archived'], fallback = 'active') {
  const status = asString(value).toLowerCase();
  return allowed.includes(status) ? status : fallback;
}

function normalizeUniquemProduct(input = {}) {
  const name = asString(input.name).slice(0, 160);
  if (!name) {
    const err = new Error('Product name is required.');
    err.status = 400;
    throw err;
  }
  const packageTypes = ['Bag', 'Pail', 'Drum', 'Tote', 'Box/Case', 'Other'];
  const packageType = packageTypes.includes(asString(input.packageType)) ? asString(input.packageType) : '';
  if (!packageType) {
    const err = new Error('Packaging type is required.');
    err.status = 400;
    throw err;
  }
  const packageAmount = normalizeUniquemQuantity(input.packageAmount);
  if (packageAmount <= 0) {
    const err = new Error('Package amount must be greater than zero.');
    err.status = 400;
    throw err;
  }
  const measurementUnit = ['kg', 'L'].includes(asString(input.measurementUnit)) ? asString(input.measurementUnit) : '';
  if (!measurementUnit) {
    const err = new Error('Measurement unit must be kg or L.');
    err.status = 400;
    throw err;
  }
  const packagesPerPallet = input.packagesPerPallet === null || input.packagesPerPallet === '' || input.packagesPerPallet === undefined
    ? null
    : Number(input.packagesPerPallet);
  if (packagesPerPallet !== null && (!Number.isInteger(packagesPerPallet) || packagesPerPallet <= 0)) {
    const err = new Error('Packages per pallet must be a whole number greater than zero.');
    err.status = 400;
    throw err;
  }
  return {
    name,
    description: asString(input.description).slice(0, 1200),
    packageType,
    packageAmount,
    measurementUnit,
    packagesPerPallet,
    status: 'active',
  };
}

function normalizeUniquemAttachmentEntityType(value) {
  const type = asString(value).toLowerCase();
  if (['product', 'receipt', 'shipment', 'production-run'].includes(type)) return type;
  const err = new Error('Attachment entity type is invalid.');
  err.status = 400;
  throw err;
}

function normalizeUniquemAttachmentKind(value) {
  const kind = asString(value).toLowerCase();
  if (['image', 'sds', 'label', 'spec', 'coa', 'delivery-ticket', 'batch-sheet', 'bol', 'packing-slip', 'proof', 'po', 'video', 'document', 'other'].includes(kind)) return kind;
  return 'other';
}

function isUniquemAttachmentContentType(value) {
  const contentType = asString(value).toLowerCase();
  if (contentType.startsWith('image/')) return true;
  if (contentType.startsWith('video/')) return true;
  return [
    'application/pdf',
    'text/plain',
    'text/csv',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ].includes(contentType);
}

function sanitizeUniquemFileName(value) {
  return asString(value)
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 120) || 'attachment';
}

function normalizeUniquemAttachment(input = {}) {
  const entityType = normalizeUniquemAttachmentEntityType(input.entityType);
  const entityId = normalizeDocId(input.entityId);
  if (!entityId) {
    const err = new Error('Attachment entity is required.');
    err.status = 400;
    throw err;
  }
  const contentType = asString(input.contentType).toLowerCase();
  if (!isUniquemAttachmentContentType(contentType)) {
    const err = new Error('Unsupported attachment file type.');
    err.status = 400;
    throw err;
  }
  return {
    entityType,
    entityId,
    kind: normalizeUniquemAttachmentKind(input.kind),
    name: asString(input.name).slice(0, 180) || 'Attachment',
    fileName: sanitizeUniquemFileName(input.fileName || input.name),
    contentType,
    size: normalizeUniquemQuantity(input.size, { fallback: 0 }),
    path: asString(input.path).slice(0, 500),
    url: asString(input.url).slice(0, 1200),
    notes: asString(input.notes).slice(0, 800),
    status: normalizeUniquemStatus(input.status),
  };
}

function buildUniquemAttachmentPath({ entityType, entityId, attachmentId, fileName }) {
  return `uniquem/${entityType}/${entityId}/${attachmentId}-${sanitizeUniquemFileName(fileName)}`;
}

function mapUniquemAttachmentDoc(doc) {
  const data = doc.data() || {};
  return {
    attachmentId: asString(data.attachmentId) || doc.id,
    entityType: asString(data.entityType),
    entityId: asString(data.entityId),
    kind: normalizeUniquemAttachmentKind(data.kind),
    name: asString(data.name),
    fileName: asString(data.fileName),
    contentType: asString(data.contentType),
    size: normalizeUniquemQuantity(data.size),
    path: asString(data.path),
    url: asString(data.url),
    notes: asString(data.notes),
    status: normalizeUniquemStatus(data.status),
    uploadedBy: asString(data.uploadedBy),
    uploadedByEmail: asString(data.uploadedByEmail),
    uploadedAt: toUniquemIso(data.uploadedAt),
    updatedAt: toUniquemIso(data.updatedAt),
  };
}

function groupUniquemAttachments(attachments = []) {
  const grouped = {};
  for (const attachment of Array.isArray(attachments) ? attachments : []) {
    if (attachment.status === 'archived') continue;
    const key = `${attachment.entityType}:${attachment.entityId}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(attachment);
  }
  return grouped;
}

function toUniquemIso(value) {
  return toIso(value);
}

function mapUniquemProductDoc(doc) {
  const data = doc.data() || {};
  return {
    productId: asString(data.productId) || doc.id,
    name: asString(data.name),
    description: asString(data.description),
    packageType: asString(data.packageType),
    packageAmount: normalizeUniquemQuantity(data.packageAmount),
    measurementUnit: asString(data.measurementUnit),
    packagesPerPallet: data.packagesPerPallet === null || data.packagesPerPallet === undefined ? null : Number(data.packagesPerPallet),
    status: normalizeUniquemStatus(data.status),
    createdAt: toUniquemIso(data.createdAt),
    updatedAt: toUniquemIso(data.updatedAt),
  };
}

function uniquemSceneJsonSchema() {
  const vectorSchema = {
    type: 'array',
    minItems: 3,
    maxItems: 3,
    items: { type: 'number' },
  };
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      title: { type: 'string' },
      summary: { type: 'string' },
      cameraHint: {
        type: 'object',
        additionalProperties: false,
        properties: {
          distance: { type: 'number' },
          target: vectorSchema,
        },
        required: ['distance', 'target'],
      },
      objects: {
        type: 'array',
        maxItems: UNIQUEM_SCENE_OBJECT_MAX,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            id: { type: 'string' },
            type: { type: 'string', enum: UNIQUEM_OBJECT_TYPES },
            label: { type: 'string' },
            position: vectorSchema,
            scale: vectorSchema,
            rotationY: { type: 'number' },
            color: { type: 'string' },
            materialKind: { type: 'string', enum: UNIQUEM_MATERIAL_KINDS },
            textureKind: { type: 'string', enum: UNIQUEM_TEXTURE_KINDS },
          },
          required: ['id', 'type', 'label', 'position', 'scale', 'rotationY', 'color', 'materialKind', 'textureKind'],
        },
      },
    },
    required: ['title', 'summary', 'cameraHint', 'objects'],
  };
}

async function callOpenAIUniquemScene({ prompt, image, previousScene }) {
  const apiKey = readSecret(OPENAI_API_KEY);
  const model = asString(process.env.OPENAI_DOCUMENT_MODEL) || 'gpt-5.5';
  if (!apiKey) throw new Error('Missing OPENAI_API_KEY');

  const content = [
    {
      type: 'input_text',
      text: [
        'Create one procedural Three.js object group as JSON for QuoteChem Uniquem 3D Creator.',
        'Describe the requested object with safe primitive objects only. Do not return code, URLs, external assets, GLB files, SVG, CSS, or markdown.',
        'Use these object types only: box, cylinder, plane, platform, stairs, trussTower, speakerStack, ledPanel, lightBeam, label.',
        'Use scale and positions in meters. Keep the full object group near the origin and camera-friendly.',
        'For screens, signage, neon, or artwork, use ledPanel with textureKind cosmic, sunset, or grid.',
        'Use labels sparingly for useful signage or major parts.',
        `User prompt: ${prompt}`,
        previousScene ? `Previous scene to refine or replace: ${JSON.stringify(normalizeUniquemScene(previousScene)).slice(0, 9000)}` : 'No previous scene.',
      ].join('\n'),
    },
  ];
  if (image) {
    content.unshift({
      type: 'input_image',
      image_url: image.dataUrl,
    });
  }

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      reasoning: { effort: 'medium' },
      input: [
        {
          role: 'system',
          content:
            'You convert text and image references into compact procedural 3D scene JSON. Output must obey the provided schema. Prefer recognizable arrangements over excessive object counts.',
        },
        {
          role: 'user',
          content,
        },
      ],
      text: {
        verbosity: 'medium',
        format: {
          type: 'json_schema',
          name: 'uniquem_3d_scene',
          strict: true,
          schema: uniquemSceneJsonSchema(),
        },
      },
    }),
  });

  if (!response.ok) {
    const failureText = await response.text();
    throw new Error(`OpenAI Uniquem 3D scene generation failed: ${response.status} ${failureText}`);
  }

  const parsed = parseOpenAIJson(extractResponsesText(await response.json()));
  return {
    scene: normalizeUniquemScene(parsed),
    model,
  };
}

function extractResponsesText(data) {
  if (typeof data?.output_text === 'string') return data.output_text;
  const chunks = [];
  for (const item of data?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === 'string') chunks.push(content.text);
    }
  }
  return chunks.join('\n').trim();
}

function mapEmailTemplateDoc(doc) {
  const data = doc.data() || {};
  const defaults = getDefaultEmailTemplate(doc.id) || {};
  return {
    templateId: doc.id,
    label: asString(data.label) || defaults.label || doc.id,
    description: asString(data.description) || defaults.description || '',
    subject: asString(data.subject) || defaults.subject || '',
    text: typeof data.text === 'string' ? data.text : defaults.text || '',
    html: typeof data.html === 'string' ? data.html : defaults.html || '',
    actionLabel: typeof data.actionLabel === 'string' ? data.actionLabel : defaults.actionLabel || '',
    actionUrlKey: typeof data.actionUrlKey === 'string' ? data.actionUrlKey : defaults.actionUrlKey || '',
    footer: typeof data.footer === 'string' ? data.footer : defaults.footer || '',
    customized: doc.exists,
    updatedAt: toIso(data.updatedAt),
    updatedBy: asString(data.updatedBy),
  };
}

async function getEmailTemplateOverride(templateId) {
  const id = asString(templateId);
  if (!id || !DEFAULT_EMAIL_TEMPLATE_IDS.includes(id)) return null;
  const snap = await db.collection(EMAIL_TEMPLATE_COLLECTION).doc(id).get();
  return snap.exists ? mapEmailTemplateDoc(snap) : null;
}

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function tokenHash(token) {
  return createHash('sha256').update(String(token || '')).digest('hex');
}

function makeInviteToken() {
  return randomBytes(32).toString('hex');
}

function baseUrlFromRequest(req) {
  const configured = asString(process.env.APP_BASE_URL || process.env.QUOTECHEM_APP_BASE_URL).replace(/\/$/, '');
  if (configured) return configured;
  const origin = asString(req.headers?.origin || req.headers?.Origin).replace(/\/$/, '');
  return origin || 'https://quotechem.com';
}

async function adminDisplayName(uid, fallbackEmail = '') {
  const snap = await db.collection('users').doc(uid).get();
  const data = snap.data() || {};
  return `${asString(data.firstName)} ${asString(data.lastName)}`.trim() || asString(data.email) || fallbackEmail || 'A QuoteChem admin';
}

async function findUserByEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  try {
    const authUser = await admin.auth().getUserByEmail(normalized);
    const userSnap = await db.collection('users').doc(authUser.uid).get();
    return {
      uid: authUser.uid,
      email: normalized,
      authUser,
      user: userSnap.exists ? userSnap.data() || {} : {},
    };
  } catch (error) {
    if (error?.code !== 'auth/user-not-found') throw error;
  }

  const snap = await db.collection('users').where('email', '==', normalized).limit(1).get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { uid: doc.id, email: normalized, authUser: null, user: doc.data() || {} };
}

async function applyUserAccess({ uid, email, firstName = '', lastName = '', role = 'user', enabledMiniApps = [], adminUid = '' }) {
  const now = admin.firestore.FieldValue.serverTimestamp();
  const normalizedRole = normalizeRole(role);
  const ref = db.collection('users').doc(uid);
  const snap = await ref.get();
  const existing = snap.data() || {};
  await ref.set(
    {
      uid,
      email: normalizeEmail(email),
      role: normalizedRole,
      enabledMiniApps: normalizeMiniAppIds(enabledMiniApps) || defaultEnabledMiniAppsForRole(normalizedRole),
      firstName: asString(firstName).slice(0, 80) || asString(existing.firstName),
      lastName: asString(lastName).slice(0, 80) || asString(existing.lastName),
      primaryAuthUid: uid,
      ...(snap.exists ? {} : { createdAt: now, createdBy: adminUid }),
      updatedAt: now,
      updatedBy: adminUid,
    },
    { merge: true }
  );
}

function normalizeAdminUserEmailInput(value) {
  const email = normalizeEmail(value);
  if (!isEmail(email)) {
    const err = new Error('Valid email is required');
    err.status = 400;
    throw err;
  }
  return email;
}

function emailBelongsToAnotherUser(existingUser, uid) {
  return Boolean(existingUser?.uid && existingUser.uid !== uid);
}

function inviteStatus(value) {
  return asString(value) || 'pending';
}

function canEditInviteStatus(value) {
  return ['pending', 'expired'].includes(inviteStatus(value));
}

function canResendInviteStatus(value) {
  return ['pending', 'expired'].includes(inviteStatus(value));
}

function inviteIdentity(invite = {}) {
  return {
    firstName: asString(invite.firstName).slice(0, 80),
    lastName: asString(invite.lastName).slice(0, 80),
  };
}

function publicInvite(invite = {}) {
  return {
    inviteId: asString(invite.inviteId),
    email: asString(invite.email),
    status: inviteStatus(invite.status),
    expiresAt: invite.expiresAt?.toMillis?.() || invite.expiresAt?.getTime?.() || null,
    firstName: asString(invite.firstName),
    lastName: asString(invite.lastName),
    role: normalizeRole(invite.role),
    enabledMiniApps: normalizeMiniAppIds(invite.enabledMiniApps) || defaultEnabledMiniAppsForRole(invite.role),
  };
}

async function loadInviteByToken(token) {
  const hash = tokenHash(token);
  if (!hash) {
    const err = new Error('Invite token is required');
    err.status = 400;
    throw err;
  }
  const snap = await db.collection(INVITATION_COLLECTION).where('tokenHash', '==', hash).limit(1).get();
  if (snap.empty) {
    const err = new Error('Invite not found');
    err.status = 404;
    throw err;
  }
  const doc = snap.docs[0];
  const invite = doc.data() || {};
  if (inviteStatus(invite.status) === 'accepted') {
    const err = new Error('Invite already accepted');
    err.status = 409;
    throw err;
  }
  if (inviteStatus(invite.status) === 'cancelled') {
    const err = new Error('Invite cancelled');
    err.status = 410;
    throw err;
  }
  if (inviteStatus(invite.status) === 'expired' || (invite.expiresAt?.toMillis?.() && invite.expiresAt.toMillis() < Date.now())) {
    await doc.ref.set({ status: 'expired', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true }).catch(() => {});
    const err = new Error('Invite expired');
    err.status = 410;
    throw err;
  }
  return { doc, invite };
}

function toIso(value) {
  if (!value) return null;
  if (value?.toDate) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return null;
}

export const adminListUsers = onRequest({ region: REGION }, async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  try {
    await requireAdmin(req);
    const [snap, inviteSnap] = await Promise.all([
      db.collection('users').orderBy('email', 'asc').limit(250).get(),
      db.collection(INVITATION_COLLECTION).orderBy('updatedAt', 'desc').limit(100).get(),
    ]);
    const items = snap.docs.map(mapUserDoc);
    const invites = inviteSnap.docs.map((doc) => ({ ...publicInvite(doc.data() || {}), inviteId: doc.id }));

    setCors(res);
    res.status(200).json({ ok: true, items, invites, miniApps: MINI_APP_IDS });
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
    const firstName = asString(req.body?.firstName).slice(0, 80);
    const lastName = asString(req.body?.lastName).slice(0, 80);
    const enabledMiniApps = normalizeMiniAppIds(req.body?.enabledMiniApps) || [];
    if (!uid) return jsonError(res, 400, 'uid is required');

    const userRef = db.collection('users').doc(uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) return jsonError(res, 404, 'User not found');
    const existingUserData = userSnap.data() || {};
    const email = normalizeAdminUserEmailInput(req.body?.email || existingUserData.email);
    const currentEmail = normalizeEmail(existingUserData.email);
    const emailChanged = email !== currentEmail;

    if (emailChanged) {
      const existingEmailUser = await findUserByEmail(email);
      if (emailBelongsToAnotherUser(existingEmailUser, uid)) {
        return jsonError(res, 409, 'Email is already assigned to another user');
      }
      await admin.auth().updateUser(uid, { email, emailVerified: false });
    }

    await userRef.set(
      {
        email,
        role,
        firstName,
        lastName,
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

export const adminInviteUser = onRequest({ region: REGION, secrets: EMAIL_SECRETS }, async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  try {
    const adminUser = await requireAdmin(req);
    const email = normalizeEmail(req.body?.email);
    const role = normalizeRole(req.body?.role);
    const firstName = asString(req.body?.firstName).slice(0, 80);
    const lastName = asString(req.body?.lastName).slice(0, 80);
    const enabledMiniApps = normalizeMiniAppIds(req.body?.enabledMiniApps) || defaultEnabledMiniAppsForRole(role);
    if (!isEmail(email)) return jsonError(res, 400, 'Valid email is required');

    const inviterName = await adminDisplayName(adminUser.uid, adminUser.email);
    const existing = await findUserByEmail(email);
    const baseUrl = baseUrlFromRequest(req);

    if (existing?.uid) {
      await applyUserAccess({
        uid: existing.uid,
        email,
        firstName: firstName || existing.user?.firstName || '',
        lastName: lastName || existing.user?.lastName || '',
        role,
        enabledMiniApps,
        adminUid: adminUser.uid,
      });
      const emailResult = await sendTemplatedEmail({
        templateId: 'existingUserAccess',
        to: email,
        data: {
          inviterName,
          signInUrl: `${baseUrl}/signin`,
        },
        override: await getEmailTemplateOverride('existingUserAccess'),
      });
      const snap = await db.collection('users').doc(existing.uid).get();
      setCors(res);
      res.status(200).json({ ok: true, mode: 'existing', user: mapUserDoc(snap), emailMessageId: emailResult.messageId });
      return;
    }

    const pendingSnap = await db.collection(INVITATION_COLLECTION).where('email', '==', email).where('status', '==', 'pending').limit(1).get();
    const inviteId = pendingSnap.empty ? randomUUID() : pendingSnap.docs[0].id;
    const token = makeInviteToken();
    const inviteUrl = `${baseUrl}/invite/${token}`;
    const now = admin.firestore.FieldValue.serverTimestamp();
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    const invitePayload = {
      inviteId,
      email,
      firstName,
      lastName,
      role,
      enabledMiniApps,
      status: 'pending',
      tokenHash: tokenHash(token),
      inviteUrl,
      createdBy: pendingSnap.empty ? adminUser.uid : pendingSnap.docs[0].data()?.createdBy || adminUser.uid,
      updatedBy: adminUser.uid,
      updatedAt: now,
      expiresAt,
      ...(pendingSnap.empty ? { createdAt: now } : { resentAt: now, resentBy: adminUser.uid }),
    };
    await db.collection(INVITATION_COLLECTION).doc(inviteId).set(invitePayload, { merge: true });
    const emailResult = await sendTemplatedEmail({
      templateId: 'userInvite',
      to: email,
      data: {
        inviterName,
        inviteUrl,
      },
      override: await getEmailTemplateOverride('userInvite'),
    });

    setCors(res);
    res.status(200).json({ ok: true, mode: 'invited', invite: publicInvite(invitePayload), emailMessageId: emailResult.messageId });
  } catch (error) {
    const status = Number(error?.status) || 500;
    logger.error('[adminInviteUser] failed', { error: error?.message || String(error) });
    return jsonError(res, status, status === 403 ? 'Forbidden' : asString(error?.message || String(error)) || 'Failed to send invite');
  }
});

export const adminResendInvite = onRequest({ region: REGION, secrets: EMAIL_SECRETS }, async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  try {
    const adminUser = await requireAdmin(req);
    const inviteId = normalizeDocId(req.body?.inviteId);
    if (!inviteId) return jsonError(res, 400, 'inviteId is required');
    const ref = db.collection(INVITATION_COLLECTION).doc(inviteId);
    const snap = await ref.get();
    if (!snap.exists) return jsonError(res, 404, 'Invite not found');
    const invite = snap.data() || {};
    if (!canResendInviteStatus(invite.status)) {
      return jsonError(res, 400, 'Only pending or expired invites can be resent');
    }

    const token = makeInviteToken();
    const inviteUrl = `${baseUrlFromRequest(req)}/invite/${token}`;
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    const now = admin.firestore.FieldValue.serverTimestamp();
    await ref.set(
      {
        status: 'pending',
        tokenHash: tokenHash(token),
        inviteUrl,
        expiresAt,
        resentAt: now,
        resentBy: adminUser.uid,
        updatedAt: now,
        updatedBy: adminUser.uid,
      },
      { merge: true }
    );
    const emailResult = await sendTemplatedEmail({
      templateId: 'userInvite',
      to: invite.email,
      data: {
        inviterName: await adminDisplayName(adminUser.uid, adminUser.email),
        inviteUrl,
      },
      override: await getEmailTemplateOverride('userInvite'),
    });

    setCors(res);
    res.status(200).json({ ok: true, emailMessageId: emailResult.messageId });
  } catch (error) {
    const status = Number(error?.status) || 500;
    logger.error('[adminResendInvite] failed', { error: error?.message || String(error) });
    return jsonError(res, status, status === 403 ? 'Forbidden' : asString(error?.message || String(error)) || 'Failed to resend invite');
  }
});

export const adminUpdateInvite = onRequest({ region: REGION }, async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  try {
    const adminUser = await requireAdmin(req);
    const inviteId = normalizeDocId(req.body?.inviteId);
    if (!inviteId) return jsonError(res, 400, 'inviteId is required');

    const ref = db.collection(INVITATION_COLLECTION).doc(inviteId);
    const snap = await ref.get();
    if (!snap.exists) return jsonError(res, 404, 'Invite not found');
    const invite = snap.data() || {};
    if (!canEditInviteStatus(invite.status)) {
      return jsonError(res, 400, 'Only pending or expired invites can be edited');
    }

    const email = normalizeAdminUserEmailInput(req.body?.email || invite.email);
    const existing = await findUserByEmail(email);
    if (existing?.uid) return jsonError(res, 409, 'Email is already assigned to a user');

    const role = normalizeRole(req.body?.role || invite.role);
    const enabledMiniApps = normalizeMiniAppIds(req.body?.enabledMiniApps) || defaultEnabledMiniAppsForRole(role);
    const patch = {
      email,
      firstName: asString(req.body?.firstName).slice(0, 80),
      lastName: asString(req.body?.lastName).slice(0, 80),
      role,
      enabledMiniApps,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: adminUser.uid,
    };
    await ref.set(patch, { merge: true });
    const updatedSnap = await ref.get();
    setCors(res);
    res.status(200).json({ ok: true, invite: { ...publicInvite(updatedSnap.data() || {}), inviteId } });
  } catch (error) {
    const status = Number(error?.status) || 500;
    logger.error('[adminUpdateInvite] failed', { error: error?.message || String(error) });
    return jsonError(res, status, status === 403 ? 'Forbidden' : asString(error?.message || String(error)) || 'Failed to update invite');
  }
});

export const adminCancelInvite = onRequest({ region: REGION }, async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  try {
    const adminUser = await requireAdmin(req);
    const inviteId = normalizeDocId(req.body?.inviteId);
    if (!inviteId) return jsonError(res, 400, 'inviteId is required');
    const ref = db.collection(INVITATION_COLLECTION).doc(inviteId);
    const snap = await ref.get();
    if (!snap.exists) return jsonError(res, 404, 'Invite not found');
    const invite = snap.data() || {};
    if (asString(invite.status) === 'accepted') return jsonError(res, 400, 'Accepted invites cannot be cancelled');

    await ref.set(
      {
        status: 'cancelled',
        cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
        cancelledBy: adminUser.uid,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: adminUser.uid,
      },
      { merge: true }
    );
    setCors(res);
    res.status(200).json({ ok: true });
  } catch (error) {
    const status = Number(error?.status) || 500;
    logger.error('[adminCancelInvite] failed', { error: error?.message || String(error) });
    return jsonError(res, status, status === 403 ? 'Forbidden' : asString(error?.message || String(error)) || 'Failed to cancel invite');
  }
});

export const previewInvite = onRequest({ region: REGION }, async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  try {
    const { invite } = await loadInviteByToken(req.body?.token);
    setCors(res);
    res.status(200).json({ ok: true, invite: publicInvite(invite) });
  } catch (error) {
    const status = Number(error?.status) || 500;
    logger.error('[previewInvite] failed', { error: error?.message || String(error) });
    return jsonError(res, status, asString(error?.message || String(error)) || 'Unable to load invite');
  }
});

export const acceptInvite = onRequest({ region: REGION }, async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  let createdAuthUser = null;
  try {
    const { doc: inviteDoc, invite } = await loadInviteByToken(req.body?.token);
    const { firstName, lastName } = inviteIdentity(invite);
    const password = asString(req.body?.password);
    if (!firstName) return jsonError(res, 400, 'First name is required');
    if (!lastName) return jsonError(res, 400, 'Last name is required');
    if (!isValidTemporaryPassword(password)) return jsonError(res, 400, 'Password must be at least 6 characters');

    const email = normalizeEmail(invite.email);
    const existing = await findUserByEmail(email);
    if (existing?.uid) return jsonError(res, 409, 'This email is already registered. Sign in instead.');

    createdAuthUser = await admin.auth().createUser({
      email,
      password,
      emailVerified: false,
      displayName: `${firstName} ${lastName}`.trim(),
      disabled: false,
    });

    const now = admin.firestore.FieldValue.serverTimestamp();
    await db.collection('users').doc(createdAuthUser.uid).set(
      {
        uid: createdAuthUser.uid,
        email,
        role: normalizeRole(invite.role),
        enabledMiniApps: normalizeMiniAppIds(invite.enabledMiniApps) || defaultEnabledMiniAppsForRole(invite.role),
        firstName,
        lastName,
        primaryAuthUid: createdAuthUser.uid,
        createdAt: now,
        updatedAt: now,
        createdBy: asString(invite.createdBy),
      },
      { merge: true }
    );
    await inviteDoc.ref.set(
      {
        status: 'accepted',
        acceptedAt: now,
        acceptedBy: createdAuthUser.uid,
        updatedAt: now,
      },
      { merge: true }
    );

    let customToken = '';
    try {
      customToken = await admin.auth().createCustomToken(createdAuthUser.uid);
    } catch (error) {
      logger.error('[acceptInvite] custom token failed', { error: error?.message || String(error) });
    }

    setCors(res);
    res.status(200).json({ ok: true, uid: createdAuthUser.uid, email, customToken, requiresSignIn: !customToken });
  } catch (error) {
    if (createdAuthUser?.uid) {
      await admin.auth().deleteUser(createdAuthUser.uid).catch(() => {});
    }
    const status = Number(error?.status) || (error?.code === 'auth/email-already-exists' ? 409 : 500);
    logger.error('[acceptInvite] failed', { error: error?.message || String(error) });
    return jsonError(res, status, asString(error?.message || String(error)) || 'Failed to accept invite');
  }
});

export const saveUniquemProduct = onRequest({ region: REGION }, async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  try {
    const user = await ensureUniquemAccess(req);
    const product = normalizeUniquemProduct(req.body || {});
    const productId = normalizeDocId(req.body?.productId) || randomUUID();
    const ref = db.collection(UNIQUEM_PRODUCT_COLLECTION).doc(productId);
    const snap = await ref.get();
    const now = admin.firestore.FieldValue.serverTimestamp();
    await ref.set(
      {
        productId,
        ...product,
        createdAt: snap.exists ? snap.data()?.createdAt || now : now,
        updatedAt: now,
        updatedBy: user.uid,
        updatedByEmail: user.email,
      },
      { merge: false }
    );
    setCors(res);
    res.status(200).json({ ok: true, product: mapUniquemProductDoc(await ref.get()) });
  } catch (error) {
    const status = Number(error?.status) || 500;
    logger.error('[saveUniquemProduct] failed', { error: error?.message || String(error) });
    return jsonError(res, status, status === 403 ? 'Forbidden' : asString(error?.message || String(error)) || 'Failed to save product');
  }
});

export const createUniquemAttachmentUpload = onRequest({ region: REGION }, async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  try {
    await ensureUniquemAccess(req);
    const entityType = normalizeUniquemAttachmentEntityType(req.body?.entityType);
    const entityId = normalizeDocId(req.body?.entityId);
    const fileName = sanitizeUniquemFileName(req.body?.fileName);
    const contentType = asString(req.body?.contentType).toLowerCase();
    if (!entityId) return jsonError(res, 400, 'Attachment entity is required.');
    if (!isUniquemAttachmentContentType(contentType)) return jsonError(res, 400, 'Unsupported attachment file type.');
    const attachmentId = randomUUID();
    const path = buildUniquemAttachmentPath({ entityType, entityId, attachmentId, fileName });
    setCors(res);
    res.status(200).json({ ok: true, attachmentId, path, entityType, entityId, fileName, contentType });
  } catch (error) {
    const status = Number(error?.status) || 500;
    logger.error('[createUniquemAttachmentUpload] failed', { error: error?.message || String(error) });
    return jsonError(res, status, status === 403 ? 'Forbidden' : asString(error?.message || String(error)) || 'Failed to prepare attachment upload');
  }
});

export const saveUniquemAttachment = onRequest({ region: REGION }, async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  try {
    const user = await ensureUniquemAccess(req);
    const attachment = normalizeUniquemAttachment(req.body || {});
    const attachmentId = normalizeDocId(req.body?.attachmentId) || randomUUID();
    const expectedPrefix = `uniquem/${attachment.entityType}/${attachment.entityId}/${attachmentId}-`;
    if (!attachment.path.startsWith(expectedPrefix)) return jsonError(res, 400, 'Attachment path is invalid.');
    const ref = db.collection(UNIQUEM_ATTACHMENT_COLLECTION).doc(attachmentId);
    await ref.set(
      {
        attachmentId,
        ...attachment,
        uploadedBy: user.uid,
        uploadedByEmail: user.email,
        uploadedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    const data = await loadUniquemOperationsData();
    setCors(res);
    res.status(200).json({ ok: true, attachment: mapUniquemAttachmentDoc(await ref.get()), ...data, dashboard: buildUniquemDashboard(data) });
  } catch (error) {
    const status = Number(error?.status) || 500;
    logger.error('[saveUniquemAttachment] failed', { error: error?.message || String(error) });
    return jsonError(res, status, status === 403 ? 'Forbidden' : asString(error?.message || String(error)) || 'Failed to save attachment');
  }
});

export const archiveUniquemAttachment = onRequest({ region: REGION }, async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  try {
    const user = await ensureUniquemAccess(req);
    const attachmentId = normalizeDocId(req.body?.attachmentId);
    if (!attachmentId) return jsonError(res, 400, 'attachmentId is required');
    await db.collection(UNIQUEM_ATTACHMENT_COLLECTION).doc(attachmentId).set(
      {
        status: 'archived',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: user.uid,
        updatedByEmail: user.email,
      },
      { merge: true }
    );
    const data = await loadUniquemOperationsData();
    setCors(res);
    res.status(200).json({ ok: true, attachmentId, ...data, dashboard: buildUniquemDashboard(data) });
  } catch (error) {
    const status = Number(error?.status) || 500;
    logger.error('[archiveUniquemAttachment] failed', { error: error?.message || String(error) });
    return jsonError(res, status, status === 403 ? 'Forbidden' : 'Failed to archive attachment');
  }
});

export const listUniquemAttachments = onRequest({ region: REGION }, async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  try {
    await ensureUniquemAccess(req);
    const entityType = req.body?.entityType ? normalizeUniquemAttachmentEntityType(req.body.entityType) : '';
    const entityId = req.body?.entityId ? normalizeDocId(req.body.entityId) : '';
    const snap = await db.collection(UNIQUEM_ATTACHMENT_COLLECTION).orderBy('updatedAt', 'desc').limit(500).get();
    const items = snap.docs
      .map(mapUniquemAttachmentDoc)
      .filter((item) => item.status !== 'archived')
      .filter((item) => (!entityType || item.entityType === entityType) && (!entityId || item.entityId === entityId));
    setCors(res);
    res.status(200).json({ ok: true, items, attachmentsByEntity: groupUniquemAttachments(items) });
  } catch (error) {
    const status = Number(error?.status) || 500;
    logger.error('[listUniquemAttachments] failed', { error: error?.message || String(error) });
    return jsonError(res, status, status === 403 ? 'Forbidden' : 'Failed to list attachments');
  }
});

export const generateUniquem3DScene = onRequest(
  { region: REGION, timeoutSeconds: 120, memory: '1GiB', secrets: [OPENAI_API_KEY] },
  async (req, res) => {
    if (preflight(req, res)) return;
    if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

    try {
      await ensureUniquemAccess(req);
      const prompt = asString(req.body?.prompt).slice(0, UNIQUEM_CREATOR_PROMPT_MAX_CHARS);
      if (!prompt) return jsonError(res, 400, 'Prompt is required.');
      const image = normalizeUniquemCreatorImage(req.body?.image || null);
      const previousScene = req.body?.previousScene && typeof req.body.previousScene === 'object' ? req.body.previousScene : null;

      const generated = await callOpenAIUniquemScene({ prompt, image, previousScene });
      setCors(res);
      res.status(200).json({ ok: true, scene: generated.scene, model: generated.model });
    } catch (error) {
      const status = Number(error?.status) || 500;
      logger.error('[generateUniquem3DScene] failed', { error: error?.message || String(error) });
      return jsonError(res, status, status === 403 ? 'Forbidden' : asString(error?.message || String(error)) || 'Failed to generate 3D scene');
    }
  }
);

export const listUniquem3DModels = onRequest({ region: REGION }, async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  try {
    await ensureUniquemAccess(req);
    const snap = await db.collection(UNIQUEM_3D_MODEL_COLLECTION).orderBy('updatedAt', 'desc').limit(200).get();
    const items = filterActiveUniquem3DModels(snap.docs.map(mapUniquem3DModelDoc), 100);
    setCors(res);
    res.status(200).json({ ok: true, items });
  } catch (error) {
    const status = Number(error?.status) || 500;
    logger.error('[listUniquem3DModels] failed', { error: error?.message || String(error) });
    return jsonError(res, status, status === 403 ? 'Forbidden' : 'Failed to list 3D models');
  }
});

export const getUniquem3DModel = onRequest({ region: REGION }, async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  try {
    await ensureUniquemAccess(req);
    const loaded = await loadActiveUniquem3DModel(req.body?.modelId);
    const versionSnap = await loaded.ref.collection('versions').orderBy('createdAt', 'desc').limit(20).get();
    const versions = versionSnap.docs.map(mapUniquem3DVersionDoc);
    setCors(res);
    res.status(200).json({ ok: true, model: loaded.model, versions });
  } catch (error) {
    const status = Number(error?.status) || 500;
    logger.error('[getUniquem3DModel] failed', { error: error?.message || String(error) });
    return jsonError(res, status, status === 403 ? 'Forbidden' : asString(error?.message || String(error)) || 'Failed to load 3D model');
  }
});

export const createUniquem3DModel = onRequest(
  { region: REGION, timeoutSeconds: 120, memory: '1GiB', secrets: [OPENAI_API_KEY] },
  async (req, res) => {
    if (preflight(req, res)) return;
    if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

    try {
      const user = await ensureUniquemAccess(req);
      const prompt = asString(req.body?.prompt).slice(0, UNIQUEM_CREATOR_PROMPT_MAX_CHARS);
      if (!prompt) return jsonError(res, 400, 'Prompt is required.');
      const image = normalizeUniquemCreatorImage(req.body?.image || null);
      const generated = await callOpenAIUniquemScene({ prompt, image, previousScene: null });
      const scene = normalizeUniquemScene(generated.scene);
      const now = admin.firestore.FieldValue.serverTimestamp();
      const modelId = randomUUID();
      const versionId = randomUUID();
      const ref = db.collection(UNIQUEM_3D_MODEL_COLLECTION).doc(modelId);
      await ref.set({
        modelId,
        title: scene.title,
        summary: scene.summary,
        scene,
        status: 'active',
        createdBy: user.uid,
        createdByEmail: user.email,
        createdAt: now,
        updatedBy: user.uid,
        updatedByEmail: user.email,
        updatedAt: now,
        latestPrompt: prompt,
        versionCount: 1,
      });
      await ref.collection('versions').doc(versionId).set(
        buildUniquemVersionDoc({
          versionId,
          scene,
          prompt,
          model: generated.model,
          source: 'ai-generate',
          user,
        })
      );

      const [saved, versionSnap] = await Promise.all([ref.get(), ref.collection('versions').orderBy('createdAt', 'desc').limit(20).get()]);
      setCors(res);
      res.status(200).json({ ok: true, model: mapUniquem3DModelDoc(saved), versions: versionSnap.docs.map(mapUniquem3DVersionDoc) });
    } catch (error) {
      const status = Number(error?.status) || 500;
      logger.error('[createUniquem3DModel] failed', { error: error?.message || String(error) });
      return jsonError(res, status, status === 403 ? 'Forbidden' : asString(error?.message || String(error)) || 'Failed to create 3D model');
    }
  }
);

export const reviseUniquem3DModel = onRequest(
  { region: REGION, timeoutSeconds: 120, memory: '1GiB', secrets: [OPENAI_API_KEY] },
  async (req, res) => {
    if (preflight(req, res)) return;
    if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

    try {
      const user = await ensureUniquemAccess(req);
      const prompt = asString(req.body?.prompt).slice(0, UNIQUEM_CREATOR_PROMPT_MAX_CHARS);
      if (!prompt) return jsonError(res, 400, 'Prompt is required.');
      const image = normalizeUniquemCreatorImage(req.body?.image || null);
      const loaded = await loadActiveUniquem3DModel(req.body?.modelId);
      const generated = await callOpenAIUniquemScene({ prompt, image, previousScene: loaded.model.scene });
      const scene = normalizeUniquemScene(generated.scene);
      const versionId = randomUUID();
      await loaded.ref.set(
        {
          title: scene.title,
          summary: scene.summary,
          scene,
          updatedBy: user.uid,
          updatedByEmail: user.email,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          latestPrompt: prompt,
          versionCount: admin.firestore.FieldValue.increment(1),
        },
        { merge: true }
      );
      await loaded.ref.collection('versions').doc(versionId).set(
        buildUniquemVersionDoc({
          versionId,
          scene,
          prompt,
          model: generated.model,
          source: 'ai-edit',
          user,
        })
      );

      const [saved, versionSnap] = await Promise.all([loaded.ref.get(), loaded.ref.collection('versions').orderBy('createdAt', 'desc').limit(20).get()]);
      setCors(res);
      res.status(200).json({ ok: true, model: mapUniquem3DModelDoc(saved), versions: versionSnap.docs.map(mapUniquem3DVersionDoc) });
    } catch (error) {
      const status = Number(error?.status) || 500;
      logger.error('[reviseUniquem3DModel] failed', { error: error?.message || String(error) });
      return jsonError(res, status, status === 403 ? 'Forbidden' : asString(error?.message || String(error)) || 'Failed to revise 3D model');
    }
  }
);

export const restoreUniquem3DModelVersion = onRequest({ region: REGION }, async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  try {
    const user = await ensureUniquemAccess(req);
    const loaded = await loadActiveUniquem3DModel(req.body?.modelId);
    const sourceVersionId = normalizeDocId(req.body?.versionId);
    if (!sourceVersionId) return jsonError(res, 400, 'versionId is required');
    const sourceSnap = await loaded.ref.collection('versions').doc(sourceVersionId).get();
    if (!sourceSnap.exists) return jsonError(res, 404, 'Version not found');
    const sourceVersion = mapUniquem3DVersionDoc(sourceSnap);
    const scene = normalizeUniquemScene(sourceVersion.scene);
    const versionId = randomUUID();
    await loaded.ref.set(
      {
        title: scene.title,
        summary: scene.summary,
        scene,
        updatedBy: user.uid,
        updatedByEmail: user.email,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        latestPrompt: `Restored version ${sourceVersionId}`,
        versionCount: admin.firestore.FieldValue.increment(1),
      },
      { merge: true }
    );
    await loaded.ref.collection('versions').doc(versionId).set(
      buildUniquemVersionDoc({
        versionId,
        scene,
        prompt: `Restored version ${sourceVersionId}`,
        model: sourceVersion.model,
        source: 'restore',
        user,
      })
    );

    const [saved, versionSnap] = await Promise.all([loaded.ref.get(), loaded.ref.collection('versions').orderBy('createdAt', 'desc').limit(20).get()]);
    setCors(res);
    res.status(200).json({ ok: true, model: mapUniquem3DModelDoc(saved), versions: versionSnap.docs.map(mapUniquem3DVersionDoc) });
  } catch (error) {
    const status = Number(error?.status) || 500;
    logger.error('[restoreUniquem3DModelVersion] failed', { error: error?.message || String(error) });
    return jsonError(res, status, status === 403 ? 'Forbidden' : asString(error?.message || String(error)) || 'Failed to restore 3D model version');
  }
});

export const archiveUniquem3DModel = onRequest({ region: REGION }, async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  try {
    const user = await ensureUniquemAccess(req);
    const loaded = await loadActiveUniquem3DModel(req.body?.modelId);
    await loaded.ref.set(
      {
        status: 'archived',
        updatedBy: user.uid,
        updatedByEmail: user.email,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    setCors(res);
    res.status(200).json({ ok: true, modelId: loaded.model.modelId });
  } catch (error) {
    const status = Number(error?.status) || 500;
    logger.error('[archiveUniquem3DModel] failed', { error: error?.message || String(error) });
    return jsonError(res, status, status === 403 ? 'Forbidden' : asString(error?.message || String(error)) || 'Failed to archive 3D model');
  }
});

export const __testables = {
  isValidTemporaryPassword,
  normalizeMiniAppIds,
  normalizeUniquemScene,
  normalizeUniquemSceneObject,
  isUniquemCreatorImageContentType,
  normalizeUniquemCreatorImage,
  normalizeUniquemModelStatus,
  mapUniquem3DModelDoc,
  mapUniquem3DVersionDoc,
  filterActiveUniquem3DModels,
  buildUniquemVersionDoc,
  normalizeUniquemProduct,
  normalizeUniquemAttachment,
  isUniquemAttachmentContentType,
  buildUniquemAttachmentPath,
  groupUniquemAttachments,
  normalizeAdminUserEmailInput,
  emailBelongsToAnotherUser,
  canEditInviteStatus,
  canResendInviteStatus,
  inviteIdentity,
};
