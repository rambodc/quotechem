import { randomUUID } from 'node:crypto';
import { defineSecret } from 'firebase-functions/params';
import { onRequest } from 'firebase-functions/v2/https';
import { admin, db, storage } from '../../core/firebase.js';
import { miniAppHandler, REGION, setCors } from '../../core/http.js';

const ITEMS = 'uniquemItems';
const TEXTURES = 'uniquemInventoryTextures';
const LAYOUTS = 'uniquemInventoryLayouts';
const CURRENT_LAYOUT = 'current';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const TEXTURE_FORMAT = 'square-side-v2';
const TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const OPENAI_API_KEY = defineSecret('OPENAI_API_KEY');
const handler = (work, options = {}) => miniAppHandler('uniquem', work, options);

function invalid(message, status = 400) { throw Object.assign(new Error(message), { status }); }
const clean = (value) => String(value || '').trim();

function imageDimensions(buffer, contentType) {
  if (contentType === 'image/png' && buffer.length >= 24) return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  if (contentType === 'image/jpeg') {
    let offset = 2;
    while (offset + 8 < buffer.length) {
      if (buffer[offset] !== 0xff) { offset += 1; continue; }
      const marker = buffer[offset + 1]; const length = buffer.readUInt16BE(offset + 2);
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
      if (length < 2) break; offset += length + 2;
    }
  }
  if (contentType === 'image/webp' && buffer.length >= 30) {
    const kind = buffer.subarray(12, 16).toString('ascii');
    if (kind === 'VP8X') return { width: 1 + buffer.readUIntLE(24, 3), height: 1 + buffer.readUIntLE(27, 3) };
    if (kind === 'VP8L') { const bits = buffer.readUInt32LE(21); return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }; }
    if (kind === 'VP8 ' && buffer.length >= 30) return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
  }
  return null;
}

function parseImage(image) {
  const contentType = clean(image?.contentType).toLowerCase();
  if (!TYPES.has(contentType)) invalid('Use JPG, PNG, or WebP reference images.');
  const prefix = `data:${contentType};base64,`;
  const dataUrl = clean(image?.dataUrl);
  if (!dataUrl.startsWith(prefix)) invalid('Reference image data is invalid.');
  const buffer = Buffer.from(dataUrl.slice(prefix.length), 'base64');
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) invalid('Each reference image must be 5 MB or smaller.');
  // Reject arbitrary files carrying an image MIME type.
  const validSignature = contentType === 'image/png' ? buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : contentType === 'image/jpeg' ? buffer[0] === 0xff && buffer[1] === 0xd8 && buffer.at(-2) === 0xff && buffer.at(-1) === 0xd9
      : buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  if (!validSignature) invalid('A reference image is malformed.');
  const dimensions = imageDimensions(buffer, contentType);
  if (!dimensions || dimensions.width < 64 || dimensions.height < 64 || dimensions.width > 6000 || dimensions.height > 6000) invalid('Reference images must be between 64 and 6,000 pixels per side.');
  return { buffer, contentType, dimensions, extension: contentType === 'image/jpeg' ? 'jpg' : contentType.split('/')[1], name: clean(image.name).slice(0, 100) || 'reference' };
}

function parseSingleImageRequest(images) {
  if (!Array.isArray(images) || images.length !== 1) invalid('Choose exactly one reference image.');
  return [parseImage(images[0])];
}

async function existingItem(productId) {
  const snap = await db.collection(ITEMS).doc(productId).get();
  if (!snap.exists) invalid('That inventory product no longer exists.', 409);
  return snap.data() || {};
}

async function textureResult(doc) {
  const value = doc.data() || {};
  return {
    textureId: doc.id, productId: value.productId, textureFormat: value.textureFormat || null, status: value.status || 'Draft', generationStatus: value.generationStatus || 'Uploaded',
    sourceCount: value.sourcePaths?.length || 0, createdAt: value.createdAt?.toDate?.().toISOString() || null,
    generatedToken: value.generatedPath && value.generatedToken ? value.generatedToken : null,
  };
}

export const getUniquemPalletTexture = onRequest({ region: REGION }, async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'GET') return res.status(405).send('Method not allowed');
  const textureId = clean(req.query?.textureId); const token = clean(req.query?.token);
  if (!textureId || !token) return res.status(404).send('Texture not found');
  const snap = await db.collection(TEXTURES).doc(textureId).get(); const value = snap.data() || {};
  if (!snap.exists || value.textureFormat !== TEXTURE_FORMAT || !value.generatedPath || value.generatedToken !== token || !['Draft', 'Approved'].includes(value.status)) return res.status(404).send('Texture not found');
  try {
    const [bytes] = await storage.bucket().file(value.generatedPath).download();
    return res.set('Content-Type', 'image/webp').set('Cache-Control', value.status === 'Approved' ? 'public, max-age=86400, immutable' : 'private, no-store').status(200).send(bytes);
  } catch {
    return res.status(404).send('Texture not found');
  }
});

export const uploadUniquemPalletTextureSources = handler(async (req, user) => {
  const productId = clean(req.body?.productId);
  const images = req.body?.images;
  if (!productId) invalid('Choose an inventory product.');
  await existingItem(productId);
  const parsed = parseSingleImageRequest(images);
  const textureId = randomUUID(); const bucket = storage.bucket(); const sourcePaths = [];
  for (let index = 0; index < parsed.length; index += 1) {
    const image = parsed[index]; const path = `uniquem/inventory-textures/${productId}/${textureId}/sources/${index + 1}.${image.extension}`;
    await bucket.file(path).save(image.buffer, { contentType: image.contentType, resumable: false, metadata: { metadata: { originalName: image.name, uploadedBy: user.uid } } }); sourcePaths.push(path);
  }
  const ref = db.collection(TEXTURES).doc(textureId);
  await ref.set({ textureId, productId, textureFormat: TEXTURE_FORMAT, sourcePaths, sourceContentTypes: parsed.map((item) => item.contentType), status: 'Draft', generationStatus: 'Uploaded', createdAt: admin.firestore.FieldValue.serverTimestamp(), createdBy: user.uid, createdByEmail: user.email || '', updatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedBy: user.uid });
  return { texture: await textureResult(await ref.get()) };
});

function outputText(payload = {}) {
  for (const item of payload.output || []) for (const content of item.content || []) if (content.type === 'output_text' && content.text) return content.text;
  return '';
}

export function normalizeVisualValidation(value = {}) {
  return {
    valid: value.valid === true,
    hasSingleView: value.hasSingleView === true,
    cargoFillsFrame: value.cargoFillsFrame === true,
    hasRepeatedBagPattern: value.hasRepeatedBagPattern === true,
    hasWoodPallet: value.hasWoodPallet === true,
    hasBackgroundScene: value.hasBackgroundScene === true,
    hasReadableText: value.hasReadableText === true,
    reason: clean(value.reason).slice(0, 300),
  };
}

async function validateGeneratedSide(output) {
  const response = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { Authorization: `Bearer ${OPENAI_API_KEY.value()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: process.env.OPENAI_IMAGE_VALIDATION_MODEL || process.env.OPENAI_IMAGE_ORCHESTRATOR_MODEL || 'gpt-5', input: [{ role: 'user', content: [{ type: 'input_text', text: 'Validate this 3D bag-wall side texture. Return JSON only with boolean fields valid, hasSingleView, cargoFillsFrame, hasRepeatedBagPattern, hasWoodPallet, hasBackgroundScene, hasReadableText, plus a short reason. It is valid only when it is one square edge-to-edge staggered wall made from repeated long-side bag faces extracted from the product, with no full pallet photograph, collage, wooden pallet, surrounding scene, or readable text.' }, { type: 'input_image', image_url: `data:image/webp;base64,${output.toString('base64')}`, detail: 'high' }] }] }) });
  if (!response.ok) throw new Error(`Texture validation service failed (${response.status}).`);
  const text = outputText(await response.json()).replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  let parsed; try { parsed = JSON.parse(text); } catch { throw new Error('Texture validation returned an invalid result.'); }
  const result = normalizeVisualValidation(parsed);
  result.valid = result.valid && result.hasSingleView && result.cargoFillsFrame && result.hasRepeatedBagPattern && !result.hasWoodPallet && !result.hasBackgroundScene && !result.hasReadableText;
  return result;
}

async function generateSideImage(sourceBytes, sourceContentType) {
  const content = [
    { type: 'input_text', text: 'Create exactly one square 1:1 texture for the vertical side of a 3D pallet load. From the reference photo, identify and extract the clearest representative long side face of one individual bag, preserving that product bag material, color, seams, wrinkles, and shape. Then construct a clean straight-on wall of repeated copies of that bag side in staggered brick-like horizontal rows, similar to real interlocked pallet bag stacking. The repeated bag wall must fill the square edge-to-edge, with alternating row offsets and no continuous vertical seams. Show only the bag wall pattern—not the original full pallet photograph. Remove wooden pallet, background, floor, horizon, and surrounding objects. No collage, atlas, panels, alternate views, top view, perspective, border, margin, captions, labels, logos, invented branding, readable text, or watermark.' },
    { type: 'input_image', image_url: `data:${sourceContentType};base64,${sourceBytes.toString('base64')}`, detail: 'high' },
  ];
  const response = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { Authorization: `Bearer ${OPENAI_API_KEY.value()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: process.env.OPENAI_IMAGE_ORCHESTRATOR_MODEL || 'gpt-5', input: [{ role: 'user', content }], tools: [{ type: 'image_generation', action: 'edit', model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1', size: '1024x1024', quality: 'medium', output_format: 'webp' }], tool_choice: { type: 'image_generation' } }) });
  if (!response.ok) throw new Error(`Image service failed (${response.status}).`);
  const payload = await response.json(); const call = payload.output?.find((entry) => entry.type === 'image_generation_call');
  if (!call?.result) throw new Error('Image service returned no texture.');
  const output = Buffer.from(call.result, 'base64'); const dimensions = imageDimensions(output, 'image/webp');
  if (!output.length || dimensions?.width !== 1024 || dimensions?.height !== 1024) throw new Error('Generated texture was not a valid 1024 × 1024 WebP image.');
  return { output, responseId: payload.id || '' };
}

export const generateUniquemPalletTexture = handler(async (req, user) => {
  const textureId = clean(req.body?.textureId); const ref = db.collection(TEXTURES).doc(textureId); const snap = await ref.get();
  if (!snap.exists) invalid('Texture draft was not found.', 404);
  const draft = snap.data() || {}; await existingItem(draft.productId);
  if (!['Draft', 'Failed'].includes(draft.status)) invalid('Only a draft texture can be generated.', 409);
  await ref.update({ status: 'Draft', generationStatus: 'Generating', updatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedBy: user.uid });
  try {
    if (draft.textureFormat !== TEXTURE_FORMAT || draft.sourcePaths?.length !== 1) invalid('Upload one new reference image for the square-side texture format.', 409);
    const bucket = storage.bucket(); const [sourceBytes] = await bucket.file(draft.sourcePaths[0]).download(); let accepted = null; const validations = [];
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const generated = await generateSideImage(sourceBytes, draft.sourceContentTypes[0]); const validation = await validateGeneratedSide(generated.output); validations.push({ attempt, ...validation });
      if (validation.valid) { accepted = generated; break; }
    }
    if (!accepted) throw new Error(`Generated texture did not pass visual validation: ${validations.at(-1)?.reason || 'the output was not one clean staggered bag wall'}.`);
    const generatedPath = `uniquem/inventory-textures/${draft.productId}/${textureId}/side-texture.webp`; const generatedToken = randomUUID();
    await bucket.file(generatedPath).save(accepted.output, { contentType: 'image/webp', resumable: false, metadata: { metadata: { firebaseStorageDownloadTokens: generatedToken, generatedBy: user.uid, textureFormat: TEXTURE_FORMAT } } });
    await ref.update({ generatedPath, generatedToken, textureFormat: TEXTURE_FORMAT, generationStatus: 'Generated', generationAttempts: validations.length, validations, model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1', openaiResponseId: accepted.responseId, updatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedBy: user.uid });
  } catch (error) {
    await ref.update({ status: 'Failed', generationStatus: 'Failed', failureNote: clean(error.message).slice(0, 500), updatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedBy: user.uid });
    throw error;
  }
  return { texture: await textureResult(await ref.get()) };
}, { secrets: [OPENAI_API_KEY], timeoutSeconds: 300, memory: '1GiB' });

async function changeApproval(req, user, remove = false) {
  const productId = clean(req.body?.productId); const expectedRevision = clean(req.body?.revision); const textureId = remove ? '' : clean(req.body?.textureId);
  if (!productId || !expectedRevision || (!remove && !textureId)) invalid('A current product, texture, and inventory revision are required.');
  const { revision } = await import('./inventory.js');
  await db.runTransaction(async (tx) => {
    const itemRef = db.collection(ITEMS).doc(productId); const layoutRef = db.collection(LAYOUTS).doc(CURRENT_LAYOUT);
    const [itemSnap, layoutSnap, textureSnap] = await Promise.all([tx.get(itemRef), tx.get(layoutRef), textureId ? tx.get(db.collection(TEXTURES).doc(textureId)) : Promise.resolve(null)]);
    if (!itemSnap.exists) invalid('That inventory product no longer exists.', 409);
    const itemQuery = await tx.get(db.collection(ITEMS).limit(1000)); const items = itemQuery.docs.map((doc) => ({ ...doc.data(), productId: doc.data().productId || doc.id })); const layout = layoutSnap.exists ? layoutSnap.data() : {};
    if (revision(items, layout) !== expectedRevision) invalid('Inventory or layout changed. Reload and try again.', 409);
    if (!remove && (!textureSnap.exists || textureSnap.data().productId !== productId || textureSnap.data().textureFormat !== TEXTURE_FORMAT || textureSnap.data().generationStatus !== 'Generated' || textureSnap.data().status !== 'Draft')) invalid('This generated draft cannot be assigned to that product.', 409);
    const products = { ...(layout.products || {}) }; products[productId] = { ...(products[productId] || {}), approvedTextureId: textureId || null };
    tx.set(layoutRef, { ...layout, products, layoutRevision: randomUUID(), updatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedBy: user.uid, updatedByEmail: user.email || '' }, { merge: false });
    if (!remove) tx.update(textureSnap.ref, { status: 'Approved', approvedAt: admin.firestore.FieldValue.serverTimestamp(), approvedBy: user.uid, updatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedBy: user.uid });
  });
}

export const approveUniquemPalletTexture = handler(async (req, user) => { await changeApproval(req, user); return { approved: true }; });
export const removeUniquemPalletTexture = handler(async (req, user) => { await changeApproval(req, user, true); return { removed: true }; });

export const discardUniquemPalletTextureDraft = handler(async (req, user) => {
  const textureId = clean(req.body?.textureId); const ref = db.collection(TEXTURES).doc(textureId); const snap = await ref.get();
  if (!snap.exists) invalid('Texture draft was not found.', 404); const data = snap.data(); if (!['Draft', 'Failed'].includes(data.status)) invalid('An approved texture cannot be discarded.', 409);
  const bucket = storage.bucket(); await Promise.all([...(data.sourcePaths || []), data.generatedPath].filter(Boolean).map((path) => bucket.file(path).delete({ ignoreNotFound: true })));
  await ref.delete(); return { discarded: true };
});

export const __testables = { parseImage, parseSingleImageRequest, imageDimensions, normalizeVisualValidation, outputText };
