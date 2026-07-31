import test from 'node:test';
import assert from 'node:assert/strict';
import iconv from 'iconv-lite';
import { ITEM_FIELDS, __testables, catalogRevision, compareQuickBooksRows, itemChanges, normalizeItemName, parseQuickBooksItemsCsv } from './items.js';

const headers = `,${ITEM_FIELDS.map((field) => `"${field.header}"`).join(',')}`;
const row = (overrides = {}) => {
  const values = {
    'Active Status': 'Active', Type: 'Inventory Assembly', Item: 'Test Item', Description: 'Quoted, description',
    'Sales Tax Code': 'G', 'Purchase Tax Code': 'G', Account: '47900 · Chemical Sales', 'COGS Account': '50000 · Cost of Goods Sold',
    'Asset Account': '12100 · Inventory Asset', 'Accumulated Depreciation': '0.00', 'Purchase Description': '', 'Quantity On Hand': '10',
    'U/M': 'litre (l)', Cost: '1.25', 'Preferred Vendor': '', 'Tax Agency': '', Price: '2.50', 'Gross Price': '2.625',
    'Amounts Include Tax': 'No', 'Reorder Pt (Min)': '', 'Manu. Part No.': '', 'Purchased for Resale': 'No', 'Sales Tax Return Line': '', Weight: '1.05',
    ...overrides,
  };
  const escaped = ITEM_FIELDS.map(({ header }) => `"${String(values[header] ?? '').replace(/"/g, '""')}"`);
  return `,${escaped.join(',')}`;
};

test('QuickBooks parser maps all fields and canonical values', () => {
  const [parsed] = parseQuickBooksItemsCsv(`${headers}\r\n${row()}\r\n`);
  assert.equal(parsed.item.item, 'Test Item');
  assert.equal(parsed.item.description, 'Quoted, description');
  assert.equal(parsed.item.quantityOnHand, 10);
  assert.equal(parsed.item.cost, 1.25);
  assert.equal(parsed.item.amountsIncludeTax, false);
  assert.equal(parsed.item.reorderPoint, null);
  assert.equal(parsed.item.account, '47900 · Chemical Sales');
  assert.equal(Object.keys(parsed.item).length, 25);
});

test('CSV decoder accepts UTF-8 and Windows-1252 account separators', () => {
  const csv = `${headers}\r\n${row()}\r\n`;
  assert.match(__testables.decodeCsv(Buffer.from(csv, 'utf8')), /47900 · Chemical Sales/);
  assert.match(__testables.decodeCsv(iconv.encode(csv, 'windows-1252')), /47900 · Chemical Sales/);
});

test('parser supports embedded newlines and rejects wrong headers and bad values', () => {
  const parsed = parseQuickBooksItemsCsv(`${headers}\r\n${row({ Description: 'Line one\nLine two' })}\r\n`);
  assert.equal(parsed[0].item.description, 'Line one\nLine two');
  assert.throws(() => parseQuickBooksItemsCsv(`,Wrong\r\n,value\r\n`), /headers do not match/);
  assert.throws(() => parseQuickBooksItemsCsv(`${headers}\r\n${row({ Cost: 'not-money' })}\r\n`), /Cost must be a number/);
});

test('Sales Tax Item prices preserve QuickBooks percentage values', () => {
  const [parsed] = parseQuickBooksItemsCsv(`${headers}\r\n${row({ Type: 'Sales Tax Item', Item: 'GST', Price: '5%', 'Gross Price': '5%' })}\r\n`);
  assert.equal(parsed.item.price, '5%');
  assert.equal(parsed.item.grossPrice, '5%');
});

test('comparison categorizes new, changed, unchanged, conflict, and missing rows', () => {
  const existing = [
    { productId: 'one', ...parseQuickBooksItemsCsv(`${headers}\r\n${row()}\r\n`)[0].item },
    { productId: 'missing', ...parseQuickBooksItemsCsv(`${headers}\r\n${row({ Item: 'Missing Item' })}\r\n`)[0].item },
  ];
  const rows = parseQuickBooksItemsCsv(`${headers}\r\n${row()}\r\n${row({ Item: 'Changed Item' })}\r\n${row({ Item: 'New Item' })}\r\n${row({ Item: 'New Item' })}\r\n`);
  const changedExisting = { productId: 'changed', ...rows[1].item, price: 1 };
  const comparison = compareQuickBooksRows(rows, [...existing, changedExisting]);
  assert.deepEqual(comparison.counts, { new: 0, changed: 1, unchanged: 1, conflict: 2, missing: 1 });
  assert.equal(comparison.rows[1].changes.some((change) => change.key === 'price'), true);
  assert.equal(comparison.missing[0].item, 'Missing Item');
});

test('name normalization, diffs, and revision are stable', () => {
  assert.equal(normalizeItemName('  TEST Item  '), 'test item');
  assert.deepEqual(itemChanges({ price: 1 }, { price: 2 }).find((change) => change.key === 'price'), { key: 'price', label: 'Price', current: 1, incoming: 2 });
  const first = catalogRevision([{ productId: 'b', normalizedItem: 'b', updatedAt: '2026-01-01' }, { productId: 'a', normalizedItem: 'a', updatedAt: '2026-01-01' }]);
  const second = catalogRevision([{ productId: 'a', normalizedItem: 'a', updatedAt: '2026-01-01' }, { productId: 'b', normalizedItem: 'b', updatedAt: '2026-01-01' }]);
  assert.equal(first, second);
});

test('apply plan keeps selections explicit and supports safe rename mappings', () => {
  const rows = parseQuickBooksItemsCsv(`${headers}\r\n${row({ Item: 'Renamed Item', Price: '20' })}\r\n${row({ Item: 'Brand New' })}\r\n`);
  const existing = [
    { productId: 'old', ...parseQuickBooksItemsCsv(`${headers}\r\n${row({ Item: 'Old Item', Price: '10' })}\r\n`)[0].item },
    { productId: 'missing', ...parseQuickBooksItemsCsv(`${headers}\r\n${row({ Item: 'Missing Item' })}\r\n`)[0].item },
  ];
  const plan = __testables.resolveApplyPlan(rows, existing, {
    selectedRowIndexes: [0],
    renameMappings: [{ rowIndex: 0, productId: 'old' }],
    markInactiveItemIds: ['missing'],
  });
  assert.equal(plan.actions.length, 1);
  assert.equal(plan.actions[0].kind, 'update');
  assert.equal(plan.actions[0].target.productId, 'old');
  assert.equal(plan.actions[0].changes.some((change) => change.key === 'item'), true);
  assert.deepEqual(plan.deactivations.map((item) => item.productId), ['missing']);
  assert.throws(() => __testables.resolveApplyPlan(rows, existing, {
    selectedRowIndexes: [0],
    renameMappings: [{ rowIndex: 0, productId: 'old' }],
    markInactiveItemIds: ['old'],
  }), /cannot be imported and marked missing/);
});
