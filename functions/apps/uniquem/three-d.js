import { randomUUID } from 'node:crypto';
import { defineSecret } from 'firebase-functions/params';
import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { admin, db } from '../../core/firebase.js';
import { requireMiniAppAccess } from '../../core/auth.js';
import { REGION, jsonError, preflight, setCors } from '../../core/http.js';
import { asString, normalizeDocId, readSecret, toIso } from '../../core/values.js';

const ensureUniquemAccess = (req) => requireMiniAppAccess(req, 'uniquem');

const UNIQUEM_3D_MODEL_COLLECTION = 'uniquem3DModels';
const UNIQUEM_CREATOR_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const UNIQUEM_CREATOR_PROMPT_MAX_CHARS = 2200;
const UNIQUEM_SCENE_OBJECT_MAX = 80;
const UNIQUEM_OBJECT_TYPES = ['box', 'cylinder', 'plane', 'platform', 'stairs', 'trussTower', 'speakerStack', 'ledPanel', 'lightBeam', 'label'];
const UNIQUEM_MATERIAL_KINDS = ['matte', 'metal', 'glow', 'screen'];
const UNIQUEM_TEXTURE_KINDS = ['plain', 'grid', 'cosmic', 'sunset'];
const OPENAI_API_KEY = defineSecret('OPENAI_API_KEY');

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

export const __testables = { normalizeUniquemScene, normalizeUniquemSceneObject, isUniquemCreatorImageContentType, normalizeUniquemCreatorImage, normalizeUniquemModelStatus, mapUniquem3DModelDoc, mapUniquem3DVersionDoc, filterActiveUniquem3DModels, buildUniquemVersionDoc };
