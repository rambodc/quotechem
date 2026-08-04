import { createHash, randomUUID } from 'node:crypto';
import { parse } from 'csv-parse/sync';
import iconv from 'iconv-lite';
import { admin, db } from '../../core/firebase.js';
import { miniAppHandler } from '../../core/http.js';
import { asString, toIso } from '../../core/values.js';

const ITEMS = 'uniquemItems';
const IMPORTS = 'uniquemItemImports';
const RECONCILIATIONS = 'uniquemAssemblyReconciliations';
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 400;

export const ITEM_FIELDS = [
  { header: 'Active Status', key: 'activeStatus', type: 'string', required: true },
  { header: 'Type', key: 'type', type: 'string', required: true },
  { header: 'Item', key: 'item', type: 'string', required: true },
  { header: 'Description', key: 'description', type: 'string' },
  { header: 'Sales Tax Code', key: 'salesTaxCode', type: 'string' },
  { header: 'Purchase Tax Code', key: 'purchaseTaxCode', type: 'string' },
  { header: 'Account', key: 'account', type: 'string' },
  { header: 'COGS Account', key: 'cogsAccount', type: 'string' },
  { header: 'Asset Account', key: 'assetAccount', type: 'string' },
  { header: 'Accumulated Depreciation', key: 'accumulatedDepreciation', type: 'number' },
  { header: 'Purchase Description', key: 'purchaseDescription', type: 'string' },
  { header: 'Quantity On Hand', key: 'quantityOnHand', type: 'number' },
  { header: 'U/M', key: 'unitOfMeasure', type: 'string' },
  { header: 'Cost', key: 'cost', type: 'number' },
  { header: 'Preferred Vendor', key: 'preferredVendor', type: 'string' },
  { header: 'Tax Agency', key: 'taxAgency', type: 'string' },
  { header: 'Price', key: 'price', type: 'numberOrPercent' },
  { header: 'Gross Price', key: 'grossPrice', type: 'numberOrPercent' },
  { header: 'Amounts Include Tax', key: 'amountsIncludeTax', type: 'boolean' },
  { header: 'Reorder Pt (Min)', key: 'reorderPoint', type: 'number' },
  { header: 'Manu. Part No.', key: 'manufacturerPartNumber', type: 'string' },
  { header: 'Purchased for Resale', key: 'purchasedForResale', type: 'boolean' },
  { header: 'Sales Tax Return Line', key: 'salesTaxReturnLine', type: 'string' },
  { header: 'Weight', key: 'weight', type: 'number' },
];

const handler = (work) => miniAppHandler('uniquem', work);
const clean = (value, max = 2000) => String(value ?? '').trim().slice(0, max);
export const normalizeItemName = (value) => clean(value, 160).normalize('NFKC').toLocaleLowerCase('en-CA');

function invalid(message, status = 400, extra = {}) {
  throw Object.assign(new Error(message), { status, ...extra });
}

function mapDoc(doc) {
  const data = doc.data() || {};
  return Object.fromEntries(Object.entries({ ...data, id: doc.id }).map(([key, value]) => [key, value?.toDate ? value.toDate().toISOString() : value]));
}

function decodeCsv(buffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer).replace(/^\uFEFF/, '');
  } catch {
    return iconv.decode(buffer, 'windows-1252').replace(/^\uFEFF/, '');
  }
}

function decodePayload({ fileName, contentBase64 } = {}) {
  const safeName = clean(fileName, 180);
  if (!safeName.toLowerCase().endsWith('.csv')) invalid('Upload a QuickBooks CSV file.');
  if (!contentBase64 || typeof contentBase64 !== 'string') invalid('CSV file content is required.');
  const buffer = Buffer.from(contentBase64, 'base64');
  if (!buffer.length) invalid('The CSV file is empty.');
  if (buffer.length > MAX_FILE_BYTES) invalid('CSV file must be 5 MB or smaller.');
  return { fileName: safeName, text: decodeCsv(buffer), fileSize: buffer.length };
}

function numberValue(value, header, rowNumber) {
  const text = clean(value, 100).replace(/,/g, '');
  if (!text) return null;
  const number = Number(text);
  if (!Number.isFinite(number)) invalid(`Row ${rowNumber}: ${header} must be a number or blank.`);
  return number;
}

function booleanValue(value, header, rowNumber) {
  const text = clean(value, 20).toLowerCase();
  if (!text) return null;
  if (['yes', 'true', 'y'].includes(text)) return true;
  if (['no', 'false', 'n'].includes(text)) return false;
  invalid(`Row ${rowNumber}: ${header} must be Yes, No, or blank.`);
}

function numberOrPercentValue(value, header, rowNumber) {
  const text = clean(value, 100);
  if (!text) return null;
  if (text.endsWith('%')) {
    const number = Number(text.slice(0, -1).replace(/,/g, ''));
    if (!Number.isFinite(number)) invalid(`Row ${rowNumber}: ${header} must be a number, percentage, or blank.`);
    return `${number}%`;
  }
  return numberValue(text, header, rowNumber);
}

function canonicalValue(field, value, rowNumber) {
  if (field.type === 'number') return numberValue(value, field.header, rowNumber);
  if (field.type === 'numberOrPercent') return numberOrPercentValue(value, field.header, rowNumber);
  if (field.type === 'boolean') return booleanValue(value, field.header, rowNumber);
  return clean(value, field.key === 'item' ? 160 : 2000) || null;
}

export function parseQuickBooksItemsCsv(text) {
  let records;
  try {
    records = parse(text, { bom: true, relax_column_count: false, skip_empty_lines: true });
  } catch (error) {
    invalid(`QuickBooks CSV could not be parsed: ${error.message}`);
  }
  if (records.length < 2) invalid('QuickBooks CSV contains no item rows.');
  const rawHeaders = records[0].map((value) => clean(value, 120));
  const offset = rawHeaders[0] === '' ? 1 : 0;
  const headers = rawHeaders.slice(offset);
  const expected = ITEM_FIELDS.map((field) => field.header);
  if (headers.length !== expected.length || headers.some((header, index) => header !== expected[index])) {
    const missing = expected.filter((header) => !headers.includes(header));
    const unexpected = headers.filter((header) => !expected.includes(header));
    invalid('CSV headers do not match the QuickBooks Enterprise Desktop 2020 item export.', 400, { missingHeaders: missing, unexpectedHeaders: unexpected });
  }
  const rows = records.slice(1).map((record, index) => {
    const rowNumber = index + 2;
    const values = record.slice(offset);
    const item = {};
    for (let fieldIndex = 0; fieldIndex < ITEM_FIELDS.length; fieldIndex += 1) {
      const field = ITEM_FIELDS[fieldIndex];
      item[field.key] = canonicalValue(field, values[fieldIndex], rowNumber);
      if (field.required && !item[field.key]) invalid(`Row ${rowNumber}: ${field.header} is required.`);
    }
    item.normalizedItem = normalizeItemName(item.item);
    return { rowIndex: index, rowNumber, item };
  });
  if (rows.length > MAX_ROWS) invalid(`CSV contains ${rows.length} rows; the current review limit is ${MAX_ROWS}.`);
  return rows;
}

function itemFields(item = {}) {
  return Object.fromEntries(ITEM_FIELDS.map(({ key }) => [key, item[key] ?? null]));
}

function equalValue(left, right) {
  return (left ?? null) === (right ?? null);
}

export function itemChanges(current, incoming) {
  return ITEM_FIELDS.filter(({ key }) => !equalValue(current?.[key], incoming?.[key])).map(({ key, header }) => ({ key, label: header, current: current?.[key] ?? null, incoming: incoming?.[key] ?? null }));
}

export function catalogRevision(items = []) {
  const state = items.map((item) => ({ productId: item.productId, normalizedItem: item.normalizedItem, updatedAt: toIso(item.updatedAt) || item.updatedAt || '', assemblyAdjustment: Number.isFinite(item.assemblyAdjustment) ? item.assemblyAdjustment : 0, assemblyUpdatedAt: toIso(item.assemblyUpdatedAt) || item.assemblyUpdatedAt || '' })).sort((a, b) => a.productId.localeCompare(b.productId));
  return createHash('sha256').update(JSON.stringify(state)).digest('hex');
}

export function compareQuickBooksRows(rows, existingItems = []) {
  const existingByName = new Map(existingItems.map((item) => [item.normalizedItem || normalizeItemName(item.item), item]));
  const groups = new Map();
  for (const row of rows) (groups.get(row.item.normalizedItem) || groups.set(row.item.normalizedItem, []).get(row.item.normalizedItem)).push(row.rowIndex);
  const matchedIds = new Set();
  const compared = rows.map((row) => {
    const duplicateRows = groups.get(row.item.normalizedItem) || [];
    if (duplicateRows.length > 1) return { ...row, category: 'conflict', selected: false, conflictReason: 'Duplicate Item name in this CSV.', duplicateRows, current: null, changes: [] };
    const current = existingByName.get(row.item.normalizedItem) || null;
    if (!current) return { ...row, category: 'new', selected: true, current: null, changes: ITEM_FIELDS.map(({ key, header }) => ({ key, label: header, current: null, incoming: row.item[key] ?? null })) };
    matchedIds.add(current.productId);
    const changes = itemChanges(current, row.item);
    return { ...row, category: changes.length ? 'changed' : 'unchanged', selected: changes.length > 0, current, changes };
  });
  const missing = existingItems.filter((item) => !matchedIds.has(item.productId)).map((item) => ({ productId: item.productId, item: item.item, type: item.type, activeStatus: item.activeStatus, selected: false }));
  const counts = { new: 0, changed: 0, unchanged: 0, conflict: 0, missing: missing.length };
  for (const row of compared) counts[row.category] += 1;
  return { rows: compared, missing, counts };
}

function resolveApplyPlan(rows, existingItems, decisions = {}) {
  const selected = new Set((decisions.selectedRowIndexes || []).map(Number));
  const renameMap = new Map((decisions.renameMappings || []).map((entry) => [Number(entry.rowIndex), clean(entry.productId, 160)]));
  const duplicateChoices = new Map(Object.entries(decisions.duplicateChoices || {}).map(([name, rowIndex]) => [name, Number(rowIndex)]));
  const deactivate = new Set((decisions.markInactiveItemIds || []).map((value) => clean(value, 160)));
  const existingById = new Map(existingItems.map((item) => [item.productId, item]));
  const existingByName = new Map(existingItems.map((item) => [item.normalizedItem || normalizeItemName(item.item), item]));
  const groups = new Map();
  for (const row of rows) (groups.get(row.item.normalizedItem) || groups.set(row.item.normalizedItem, []).get(row.item.normalizedItem)).push(row.rowIndex);
  const usedExisting = new Set();
  const actions = [];

  for (const row of rows) {
    if (!selected.has(row.rowIndex)) continue;
    const duplicates = groups.get(row.item.normalizedItem) || [];
    if (duplicates.length > 1 && duplicateChoices.get(row.item.normalizedItem) !== row.rowIndex) invalid(`Resolve the duplicate Item conflict for ${row.item.item}.`, 409);
    const exact = existingByName.get(row.item.normalizedItem) || null;
    const mappedId = renameMap.get(row.rowIndex);
    const target = mappedId ? existingById.get(mappedId) : exact;
    if (mappedId && !target) invalid(`The selected rename target for ${row.item.item} no longer exists.`, 409);
    if (target && usedExisting.has(target.productId)) invalid('Two incoming rows cannot update the same existing item.', 409);
    if (target) usedExisting.add(target.productId);
    const changes = target ? itemChanges(target, row.item) : ITEM_FIELDS.map(({ key, header }) => ({ key, label: header, current: null, incoming: row.item[key] ?? null }));
    actions.push({ kind: target ? 'update' : 'create', row, target, changes });
  }

  const finalNames = new Map(existingItems.map((item) => [item.normalizedItem || normalizeItemName(item.item), item.productId]));
  for (const action of actions) if (action.target) finalNames.delete(action.target.normalizedItem || normalizeItemName(action.target.item));
  for (const action of actions) {
    const owner = finalNames.get(action.row.item.normalizedItem);
    if (owner && owner !== action.target?.productId) invalid(`Item ${action.row.item.item} would duplicate an existing item.`, 409);
    finalNames.set(action.row.item.normalizedItem, action.target?.productId || `new:${action.row.rowIndex}`);
  }
  const matchedIds = new Set(actions.filter((action) => action.target).map((action) => action.target.productId));
  const deactivations = [...deactivate].map((productId) => {
    const item = existingById.get(productId);
    if (!item) invalid('An item selected for deactivation no longer exists.', 409);
    if (matchedIds.has(productId)) invalid(`${item.item} cannot be imported and marked missing at the same time.`, 409);
    return item;
  });
  return { actions, deactivations };
}

async function readItems() {
  const snap = await db.collection(ITEMS).limit(1000).get();
  return snap.docs.map(mapDoc).sort((a, b) => String(a.item || '').localeCompare(String(b.item || '')));
}

async function readImportHistory() {
  const snap = await db.collection(IMPORTS).orderBy('createdAt', 'desc').limit(50).get();
  return snap.docs.map(mapDoc);
}

export const listUniquemItems = handler(async () => {
  const [items, imports] = await Promise.all([readItems(), readImportHistory()]);
  return { items, imports, fields: ITEM_FIELDS };
});

export const previewUniquemItemImport = handler(async (req) => {
  const payload = decodePayload(req.body);
  const rows = parseQuickBooksItemsCsv(payload.text);
  const items = await readItems();
  const comparison = compareQuickBooksRows(rows, items);
  return { fileName: payload.fileName, fileSize: payload.fileSize, totalRows: rows.length, catalogRevision: catalogRevision(items), fields: ITEM_FIELDS, existingItems: items, ...comparison };
});

export const applyUniquemItemImport = handler(async (req, user) => {
  const payload = decodePayload(req.body);
  const rows = parseQuickBooksItemsCsv(payload.text);
  const expectedRevision = clean(req.body?.catalogRevision, 128);
  if (!expectedRevision) invalid('Preview this CSV again before importing.');
  const importId = randomUUID();
  const reconciliationMode = clean(req.body?.reconciliationMode, 20);
  if (!['reset', 'carry'].includes(reconciliationMode)) invalid('Choose whether this import resets or carries assembly adjustments.');
  let result;
  await db.runTransaction(async (tx) => {
    const currentSnap = await tx.get(db.collection(ITEMS).limit(1000));
    const currentItems = currentSnap.docs.map(mapDoc);
    if (catalogRevision(currentItems) !== expectedRevision) invalid('Items changed after this preview. Upload the CSV again to refresh the review.', 409);
    const plan = resolveApplyPlan(rows, currentItems, req.body?.decisions || {});
    const currentByName = new Map(currentItems.map((item) => [item.normalizedItem || normalizeItemName(item.item), item]));
    const renameTargets = new Map((req.body?.decisions?.renameMappings || []).map((entry) => [Number(entry.rowIndex), clean(entry.productId, 160)]));
    const reconciledById = new Map();
    for (const row of rows) {
      const mappedId = renameTargets.get(row.rowIndex);
      const target = mappedId ? currentItems.find((item) => item.productId === mappedId) : currentByName.get(row.item.normalizedItem);
      if (target) reconciledById.set(target.productId, target);
    }
    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    let created = 0; let updated = 0; let unchanged = 0;
    for (const action of plan.actions) {
      if (action.kind === 'create') {
        const productId = randomUUID();
        tx.create(db.collection(ITEMS).doc(productId), { productId, ...itemFields(action.row.item), normalizedItem: action.row.item.normalizedItem, assemblyAdjustment: 0, sourceSystem: 'quickbooks-desktop', createdAt: timestamp, createdBy: user.uid, updatedAt: timestamp, updatedBy: user.uid, lastImportId: importId });
        created += 1;
      } else if (!action.changes.length) {
        unchanged += 1;
      } else {
        const patch = Object.fromEntries(action.changes.map(({ key, incoming }) => [key, incoming]));
        patch.normalizedItem = action.row.item.normalizedItem;
        patch.sourceSystem = 'quickbooks-desktop'; patch.updatedAt = timestamp; patch.updatedBy = user.uid; patch.lastImportId = importId;
        tx.update(db.collection(ITEMS).doc(action.target.productId), patch);
        updated += 1;
      }
    }
    let reconciledItems = 0; let reconciledAdjustment = 0;
    if (reconciliationMode === 'reset') {
      for (const item of reconciledById.values()) {
        const adjustment = Number.isFinite(item.assemblyAdjustment) ? item.assemblyAdjustment : 0;
        if (!adjustment) continue;
        tx.update(db.collection(ITEMS).doc(item.productId), { assemblyAdjustment: 0, assemblyReconciledAt: timestamp, assemblyReconciledBy: user.uid, assemblyReconciledImportId: importId, updatedAt: timestamp, updatedBy: user.uid });
        reconciledItems += 1; reconciledAdjustment += adjustment;
      }
    }
    let markedInactive = 0;
    for (const item of plan.deactivations) {
      if (item.activeStatus !== 'Not-active') {
        tx.update(db.collection(ITEMS).doc(item.productId), { activeStatus: 'Not-active', updatedAt: timestamp, updatedBy: user.uid, lastImportId: importId });
        markedInactive += 1;
      }
    }
    const summary = { importId, fileName: payload.fileName, fileSize: payload.fileSize, totalRows: rows.length, selectedRows: plan.actions.length, created, updated, unchanged, markedInactive, skipped: rows.length - plan.actions.length, reconciliationMode, reconciledItems, reconciledAdjustment, status: 'completed', createdAt: timestamp, createdBy: user.uid, createdByEmail: user.email || '' };
    tx.create(db.collection(IMPORTS).doc(importId), summary);
    tx.create(db.collection(RECONCILIATIONS).doc(importId), { importId, mode: reconciliationMode, reconciledItems, reconciledAdjustment, affectedItems: [...reconciledById.values()].map((item) => ({ productId: item.productId, item: item.item, priorAdjustment: Number.isFinite(item.assemblyAdjustment) ? item.assemblyAdjustment : 0 })), createdAt: timestamp, createdBy: user.uid, createdByEmail: user.email || '' });
    result = summary;
  });
  return { import: result, ...(await listItemsResult()) };
});

async function listItemsResult() {
  const [items, imports] = await Promise.all([readItems(), readImportHistory()]);
  return { items, imports, fields: ITEM_FIELDS };
}

export const __testables = { decodeCsv, decodePayload, numberValue, numberOrPercentValue, booleanValue, resolveApplyPlan };
