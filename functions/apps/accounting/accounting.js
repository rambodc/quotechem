import { createHash, randomUUID } from 'node:crypto';
import { admin, db } from '../../core/firebase.js';
import { miniAppHandler } from '../../core/http.js';
import { asString, normalizeDocId, toIso } from '../../core/values.js';

const CUSTOMERS = 'accountingCustomers';
const PRODUCTS = 'accountingProducts';
const EXPORTS = 'accountingExports';
const SETTINGS_ID = '_settings';

const now = () => admin.firestore.FieldValue.serverTimestamp();
const handler = (work) => miniAppHandler('accounting', work);
const clean = (value, max = 240) => asString(value).trim().slice(0, max);
const normalizedName = (value) => clean(value).toLocaleLowerCase('en-CA');

function mapDoc(doc) {
  const data = doc.data() || {};
  return Object.fromEntries(
    Object.entries({ ...data, id: doc.id }).map(([key, value]) => [key, value?.toDate ? value.toDate().toISOString() : value])
  );
}

function invalid(message, status = 400) {
  throw Object.assign(new Error(message), { status });
}

function validateEmail(value) {
  const email = clean(value, 254);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) invalid('Enter a valid email address.');
  return email;
}

function customerInput(body = {}) {
  const displayName = clean(body.displayName, 120);
  if (!displayName) invalid('Customer display name is required.');
  return {
    displayName,
    normalizedName: normalizedName(displayName),
    companyName: clean(body.companyName, 120),
    firstName: clean(body.firstName, 80),
    lastName: clean(body.lastName, 80),
    email: validateEmail(body.email),
    phone: clean(body.phone, 40),
    address1: clean(body.address1, 120),
    address2: clean(body.address2, 120),
    city: clean(body.city, 80),
    province: clean(body.province, 40),
    postalCode: clean(body.postalCode, 20),
    country: clean(body.country, 40) || 'Canada',
  };
}

function productInput(body = {}, defaultIncomeAccount = '') {
  const name = clean(body.name, 120);
  if (!name) invalid('Product name is required.');
  const rawPrice = body.salesPrice;
  const salesPrice = Number(rawPrice);
  if (rawPrice === '' || rawPrice == null || !Number.isFinite(salesPrice) || salesPrice < 0 || salesPrice > 100000000) {
    invalid('Sales price must be a valid non-negative number.');
  }
  const incomeAccount = clean(body.incomeAccount || defaultIncomeAccount, 120);
  if (!incomeAccount) invalid('QuickBooks income account is required.');
  return {
    name,
    normalizedName: normalizedName(name),
    description: clean(body.description, 400),
    salesPrice: Math.round(salesPrice * 100) / 100,
    incomeAccount,
    taxable: body.taxable !== false,
    itemType: 'non-inventory',
  };
}

async function ensureUnique(collection, field, value, currentId = '') {
  const snap = await db.collection(collection).where(field, '==', value).limit(2).get();
  if (snap.docs.some((doc) => doc.id !== currentId && doc.data()?.status !== 'archived')) {
    invalid('An active record with this name already exists.', 409);
  }
}

async function settings() {
  const snap = await db.collection(EXPORTS).doc(SETTINGS_ID).get();
  return {
    target: 'QuickBooks Desktop Canada 2019+',
    defaultIncomeAccount: clean(snap.data()?.defaultIncomeAccount, 120),
  };
}

async function workspace() {
  const [customerSnap, productSnap, exportSnap, currentSettings] = await Promise.all([
    db.collection(CUSTOMERS).limit(500).get(),
    db.collection(PRODUCTS).limit(500).get(),
    db.collection(EXPORTS).where('recordType', '==', 'export').limit(200).get(),
    settings(),
  ]);
  return {
    customers: customerSnap.docs.map(mapDoc).filter((item) => item.status !== 'archived').sort((a, b) => a.displayName.localeCompare(b.displayName)),
    products: productSnap.docs.map(mapDoc).filter((item) => item.status !== 'archived').sort((a, b) => a.name.localeCompare(b.name)),
    exports: exportSnap.docs.map(mapDoc).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))),
    settings: currentSettings,
  };
}

export const listAccountingWorkspace = handler(async () => workspace());

export const saveAccountingSettings = handler(async (req, user) => {
  const defaultIncomeAccount = clean(req.body?.defaultIncomeAccount, 120);
  if (!defaultIncomeAccount) invalid('Default QuickBooks income account is required.');
  await db.collection(EXPORTS).doc(SETTINGS_ID).set({
    recordType: 'settings',
    defaultIncomeAccount,
    target: 'QuickBooks Desktop Canada 2019+',
    updatedAt: now(),
    updatedBy: user.uid,
  }, { merge: true });
  return workspace();
});

export const saveAccountingCustomer = handler(async (req, user) => {
  const customerId = normalizeDocId(req.body?.customerId) || randomUUID();
  const input = customerInput(req.body);
  await ensureUnique(CUSTOMERS, 'normalizedName', input.normalizedName, customerId);
  const ref = db.collection(CUSTOMERS).doc(customerId);
  const old = await ref.get();
  await ref.set({
    customerId,
    ...input,
    status: 'active',
    createdAt: old.exists ? old.data()?.createdAt || now() : now(),
    createdBy: old.exists ? old.data()?.createdBy || user.uid : user.uid,
    updatedAt: now(),
    updatedBy: user.uid,
  }, { merge: true });
  return { customerId, ...(await workspace()) };
});

export const archiveAccountingCustomer = handler(async (req, user) => {
  const customerId = normalizeDocId(req.body?.customerId);
  if (!customerId) invalid('customerId is required.');
  const ref = db.collection(CUSTOMERS).doc(customerId);
  if (!(await ref.get()).exists) invalid('Customer not found.', 404);
  await ref.set({ status: 'archived', archivedAt: now(), archivedBy: user.uid, updatedAt: now() }, { merge: true });
  return workspace();
});

export const saveAccountingProduct = handler(async (req, user) => {
  const productId = normalizeDocId(req.body?.productId) || randomUUID();
  const currentSettings = await settings();
  const input = productInput(req.body, currentSettings.defaultIncomeAccount);
  await ensureUnique(PRODUCTS, 'normalizedName', input.normalizedName, productId);
  const ref = db.collection(PRODUCTS).doc(productId);
  const old = await ref.get();
  await ref.set({
    productId,
    ...input,
    status: 'active',
    createdAt: old.exists ? old.data()?.createdAt || now() : now(),
    createdBy: old.exists ? old.data()?.createdBy || user.uid : user.uid,
    updatedAt: now(),
    updatedBy: user.uid,
  }, { merge: true });
  return { productId, ...(await workspace()) };
});

export const archiveAccountingProduct = handler(async (req, user) => {
  const productId = normalizeDocId(req.body?.productId);
  if (!productId) invalid('productId is required.');
  const ref = db.collection(PRODUCTS).doc(productId);
  if (!(await ref.get()).exists) invalid('Product not found.', 404);
  await ref.set({ status: 'archived', archivedAt: now(), archivedBy: user.uid, updatedAt: now() }, { merge: true });
  return workspace();
});

export const createAccountingSamples = handler(async (req, user) => {
  const currentSettings = await settings();
  if (!currentSettings.defaultIncomeAccount) invalid('Save the exact QuickBooks income account before creating sample products.');
  const suffix = new Date().toISOString().replace(/\D/g, '').slice(0, 12);
  const customerId = randomUUID();
  const productId = randomUUID();
  const customer = customerInput({
    displayName: `QC TEST - ABC Oilfield ${suffix}`,
    companyName: `QC TEST - ABC Oilfield ${suffix}`,
    email: `accounting-test-${suffix}@example.com`,
    phone: '403-555-0100',
    address1: '123 Test Street',
    city: 'Calgary',
    province: 'AB',
    postalCode: 'T2P 1J9',
    country: 'Canada',
  });
  const product = productInput({
    name: `QC TEST - UniCide G15 ${suffix}`,
    description: 'QuickBooks Desktop IIF non-inventory test item',
    salesPrice: 120,
    incomeAccount: currentSettings.defaultIncomeAccount,
    taxable: true,
  });
  const batch = db.batch();
  batch.set(db.collection(CUSTOMERS).doc(customerId), {
    customerId, ...customer, status: 'active', createdAt: now(), createdBy: user.uid, updatedAt: now(), updatedBy: user.uid,
  });
  batch.set(db.collection(PRODUCTS).doc(productId), {
    productId, ...product, status: 'active', createdAt: now(), createdBy: user.uid, updatedAt: now(), updatedBy: user.uid,
  });
  await batch.commit();
  return { customerId, productId, ...(await workspace()) };
});

export function sanitizeIifValue(value) {
  const safe = String(value ?? '')
    .normalize('NFC')
    .replace(/[\t\r\n]+/g, ' ')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim();
  return /^[=+\-@]/.test(safe) ? `'${safe}` : safe;
}

function row(values) {
  return values.map(sanitizeIifValue).join('\t');
}

export function customerIif(customers = []) {
  const lines = [
    row(['!CUST', 'NAME', 'BADDR1', 'BADDR2', 'BADDR3', 'BADDR4', 'BADDR5', 'PHONE1', 'EMAIL', 'CONT1', 'CONT2']),
    ...customers.map((item) => row([
      'CUST',
      item.displayName,
      item.companyName || item.displayName,
      item.address1,
      item.address2,
      [item.city, item.province].filter(Boolean).join(', '),
      [item.postalCode, item.country || 'Canada'].filter(Boolean).join(' '),
      item.phone,
      item.email,
      item.firstName,
      item.lastName,
    ])),
  ];
  return `${lines.join('\r\n')}\r\n`;
}

export function productIif(products = []) {
  const lines = [
    row(['!INVITEM', 'NAME', 'INVITEMTYPE', 'DESC', 'PRICE', 'ACCNT', 'TAXABLE']),
    ...products.map((item) => row([
      'INVITEM',
      item.name,
      'OTHC',
      item.description,
      Number(item.salesPrice).toFixed(2),
      item.incomeAccount,
      item.taxable ? 'Y' : 'N',
    ])),
  ];
  return `${lines.join('\r\n')}\r\n`;
}

function timestampName() {
  return new Date().toISOString().replace(/\D/g, '').slice(0, 12);
}

function validateExportItems(type, items) {
  if (!items.length) invalid(`Select at least one ${type === 'customers' ? 'customer' : 'product'} to export.`);
  const names = new Set();
  for (const item of items) {
    const name = type === 'customers' ? item.displayName : item.name;
    if (!clean(name)) invalid('Every exported record must have a name.');
    const normalized = normalizedName(name);
    if (names.has(normalized)) invalid('The export contains duplicate names.');
    names.add(normalized);
    if (type === 'products') {
      if (!Number.isFinite(Number(item.salesPrice)) || Number(item.salesPrice) < 0) invalid(`Invalid price for ${name}.`);
      if (!clean(item.incomeAccount)) invalid(`Missing income account for ${name}.`);
    }
  }
}

async function exportList(type, ids, user) {
  const isCustomers = type === 'customers';
  const collection = isCustomers ? CUSTOMERS : PRODUCTS;
  const key = isCustomers ? 'customerId' : 'productId';
  const selectedIds = [...new Set((Array.isArray(ids) ? ids : []).map(normalizeDocId).filter(Boolean))];
  if (!selectedIds.length) invalid(`Select at least one ${isCustomers ? 'customer' : 'product'} to export.`);
  const snaps = await Promise.all(selectedIds.map((recordId) => db.collection(collection).doc(recordId).get()));
  const items = snaps.filter((snap) => snap.exists && snap.data()?.status !== 'archived').map(mapDoc);
  if (items.length !== selectedIds.length) invalid('One or more selected records are missing or archived.', 409);
  validateExportItems(type, items);
  const content = isCustomers ? customerIif(items) : productIif(items);
  const exportId = randomUUID();
  const filename = `quotechem-${type}-${timestampName()}.iif`;
  const contentHash = createHash('sha256').update(content, 'utf8').digest('hex');
  await db.collection(EXPORTS).doc(exportId).set({
    exportId,
    recordType: 'export',
    exportType: type,
    recordIds: items.map((item) => item[key]),
    recordCount: items.length,
    filename,
    contentHash,
    status: 'generated',
    failureNote: '',
    createdAt: now(),
    createdBy: user.uid,
    createdByEmail: user.email || '',
  });
  return {
    exportId,
    filename,
    mimeType: 'text/tab-separated-values;charset=utf-8',
    contentBase64: Buffer.from(content, 'utf8').toString('base64'),
    recordCount: items.length,
    contentHash,
  };
}

export const exportAccountingCustomersIif = handler(async (req, user) => exportList('customers', req.body?.customerIds, user));
export const exportAccountingProductsIif = handler(async (req, user) => exportList('products', req.body?.productIds, user));

export const updateAccountingExportStatus = handler(async (req, user) => {
  const exportId = normalizeDocId(req.body?.exportId);
  const status = clean(req.body?.status, 30).toLowerCase();
  if (!exportId) invalid('exportId is required.');
  if (!['confirmed', 'failed'].includes(status)) invalid('Status must be confirmed or failed.');
  const failureNote = clean(req.body?.failureNote, 1000);
  if (status === 'failed' && !failureNote) invalid('Describe the QuickBooks import failure.');
  const ref = db.collection(EXPORTS).doc(exportId);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.recordType !== 'export') invalid('Export not found.', 404);
  await ref.set({
    status,
    failureNote: status === 'failed' ? failureNote : '',
    reviewedAt: now(),
    reviewedBy: user.uid,
  }, { merge: true });
  return workspace();
});
