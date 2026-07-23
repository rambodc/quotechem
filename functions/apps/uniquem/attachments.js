import { randomUUID } from 'node:crypto';
import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { admin, db } from '../../core/firebase.js';
import { requireMiniAppAccess } from '../../core/auth.js';
import { REGION, jsonError, preflight, setCors } from '../../core/http.js';
import { asString, normalizeDocId } from '../../core/values.js';
import { normalizeUniquemQuantity, normalizeUniquemStatus, toUniquemIso } from './helpers.js';

const ensureUniquemAccess = (req) => requireMiniAppAccess(req, 'uniquem');

const UNIQUEM_ATTACHMENT_COLLECTION = 'uniquemAttachments';

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

export const __testables = { normalizeUniquemAttachment, isUniquemAttachmentContentType, buildUniquemAttachmentPath, groupUniquemAttachments };
