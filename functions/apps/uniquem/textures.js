import { randomUUID } from 'node:crypto';
import { defineSecret } from 'firebase-functions/params';
import { admin, db, storage } from '../../core/firebase.js';
import { miniAppHandler } from '../../core/http.js';

const ITEMS = 'uniquemItems';
const TEXTURES = 'uniquemInventoryTextures';
const LAYOUTS = 'uniquemInventoryLayouts';
const CURRENT_LAYOUT = 'current';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
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

function downloadUrl(bucketName, objectPath, token) {
  return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucketName)}/o/${encodeURIComponent(objectPath)}?alt=media&token=${encodeURIComponent(token)}`;
}

async function existingItem(productId) {
  const snap = await db.collection(ITEMS).doc(productId).get();
  if (!snap.exists) invalid('That inventory product no longer exists.', 409);
  return snap.data() || {};
}

async function textureResult(doc) {
  const value = doc.data() || {};
  const bucket = storage.bucket();
  return {
    textureId: doc.id, productId: value.productId, status: value.status || 'Draft', generationStatus: value.generationStatus || 'Uploaded',
    sourceCount: value.sourcePaths?.length || 0, createdAt: value.createdAt?.toDate?.().toISOString() || null,
    generatedUrl: value.generatedPath && value.generatedToken ? downloadUrl(bucket.name, value.generatedPath, value.generatedToken) : null,
  };
}

export const uploadUniquemPalletTextureSources = handler(async (req, user) => {
  const productId = clean(req.body?.productId);
  const images = req.body?.images;
  if (!productId || !Array.isArray(images) || images.length < 1 || images.length > 4) invalid('Choose between 1 and 4 reference images.');
  await existingItem(productId);
  const parsed = images.map(parseImage);
  const textureId = randomUUID(); const bucket = storage.bucket(); const sourcePaths = [];
  for (let index = 0; index < parsed.length; index += 1) {
    const image = parsed[index]; const path = `uniquem/inventory-textures/${productId}/${textureId}/sources/${index + 1}.${image.extension}`;
    await bucket.file(path).save(image.buffer, { contentType: image.contentType, resumable: false, metadata: { metadata: { originalName: image.name, uploadedBy: user.uid } } }); sourcePaths.push(path);
  }
  const ref = db.collection(TEXTURES).doc(textureId);
  await ref.set({ textureId, productId, sourcePaths, sourceContentTypes: parsed.map((item) => item.contentType), status: 'Draft', generationStatus: 'Uploaded', createdAt: admin.firestore.FieldValue.serverTimestamp(), createdBy: user.uid, createdByEmail: user.email || '', updatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedBy: user.uid });
  return { texture: await textureResult(await ref.get()) };
});

export const generateUniquemPalletTexture = handler(async (req, user) => {
  const textureId = clean(req.body?.textureId); const ref = db.collection(TEXTURES).doc(textureId); const snap = await ref.get();
  if (!snap.exists) invalid('Texture draft was not found.', 404);
  const draft = snap.data() || {}; await existingItem(draft.productId);
  if (!['Draft', 'Failed'].includes(draft.status)) invalid('Only a draft texture can be generated.', 409);
  await ref.update({ status: 'Draft', generationStatus: 'Generating', updatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedBy: user.uid });
  try {
    const bucket = storage.bucket(); const content = [{ type: 'input_text', text: 'Create one square texture atlas with exactly three equal vertical panels: a corrected orthographic FRONT view, SIDE view, and TOP view of this same palletized product. Keep product material and stacking consistent across all panels. Use neutral studio lighting and a flat medium-gray background. No captions, logos, invented branding, readable text, watermark, people, vehicles, or warehouse scene. Make each view centered and easy to map onto a rectangular 3D load.' }];
    for (let index = 0; index < draft.sourcePaths.length; index += 1) {
      const [bytes] = await bucket.file(draft.sourcePaths[index]).download(); content.push({ type: 'input_image', image_url: `data:${draft.sourceContentTypes[index]};base64,${bytes.toString('base64')}`, detail: 'high' });
    }
    const response = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { Authorization: `Bearer ${OPENAI_API_KEY.value()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: process.env.OPENAI_IMAGE_ORCHESTRATOR_MODEL || 'gpt-5', input: [{ role: 'user', content }], tools: [{ type: 'image_generation', action: 'edit', model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1', size: '1024x1024', quality: 'medium', output_format: 'webp' }], tool_choice: { type: 'image_generation' } }) });
    if (!response.ok) throw new Error(`Image service failed (${response.status}).`);
    const payload = await response.json(); const call = payload.output?.find((entry) => entry.type === 'image_generation_call');
    if (!call?.result) throw new Error('Image service returned no texture.');
    const output = Buffer.from(call.result, 'base64'); if (!output.length) throw new Error('Generated texture was empty.');
    const generatedPath = `uniquem/inventory-textures/${draft.productId}/${textureId}/generated-atlas.webp`; const generatedToken = randomUUID();
    await bucket.file(generatedPath).save(output, { contentType: 'image/webp', resumable: false, metadata: { metadata: { firebaseStorageDownloadTokens: generatedToken, generatedBy: user.uid } } });
    await ref.update({ generatedPath, generatedToken, generationStatus: 'Generated', model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1', openaiResponseId: payload.id || '', updatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedBy: user.uid });
  } catch (error) {
    await ref.update({ status: 'Failed', generationStatus: 'Failed', failureNote: clean(error.message).slice(0, 500), updatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedBy: user.uid });
    throw error;
  }
  return { texture: await textureResult(await ref.get()) };
}, { secrets: [OPENAI_API_KEY], timeoutSeconds: 180, memory: '1GiB' });

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
    if (!remove && (!textureSnap.exists || textureSnap.data().productId !== productId || textureSnap.data().generationStatus !== 'Generated' || textureSnap.data().status !== 'Draft')) invalid('This generated draft cannot be assigned to that product.', 409);
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

export const __testables = { parseImage, downloadUrl, imageDimensions };
