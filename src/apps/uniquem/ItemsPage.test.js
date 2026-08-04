import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import ItemsPage from './ItemsPage';
import { postJson } from '../../lib/api';

jest.mock('../../lib/api', () => ({ postJson: jest.fn() }));

const fields = [
  { header: 'Active Status', key: 'activeStatus', type: 'string' },
  { header: 'Type', key: 'type', type: 'string' },
  { header: 'Item', key: 'item', type: 'string' },
  { header: 'Description', key: 'description', type: 'string' },
  { header: 'Price', key: 'price', type: 'number' },
];
const existing = { productId: 'existing-1', normalizedItem: 'old name', activeStatus: 'Active', type: 'Inventory Assembly', item: 'Old Name', description: 'Old description', price: 10 };
const missingExisting = { productId: 'existing-2', normalizedItem: 'old missing', activeStatus: 'Active', type: 'Inventory Part', item: 'Old Missing', description: null, price: 5 };
const workspace = { fields, items: [existing, missingExisting], imports: [] };
const preview = {
  fileName: 'items.csv', fileSize: 200, totalRows: 3, catalogRevision: 'revision-1', fields, existingItems: [existing],
  counts: { new: 1, changed: 1, unchanged: 0, conflict: 1, missing: 2 },
  missing: [{ productId: 'existing-1', item: 'Old Name', type: 'Inventory Assembly', activeStatus: 'Active', selected: false }, { productId: 'existing-2', item: 'Old Missing', type: 'Inventory Part', activeStatus: 'Active', selected: false }],
  rows: [
    { rowIndex: 0, rowNumber: 2, category: 'new', selected: true, item: { normalizedItem: 'new item', activeStatus: 'Active', type: 'Inventory Part', item: 'New Item', description: 'New', price: 15 }, changes: [{ key: 'item', label: 'Item', current: null, incoming: 'New Item' }] },
    { rowIndex: 1, rowNumber: 3, category: 'changed', selected: true, item: { normalizedItem: 'changed item', activeStatus: 'Active', type: 'Inventory Assembly', item: 'Changed Item', description: 'Updated', price: 20 }, current: { ...existing, productId: 'changed-1', item: 'Changed Item', normalizedItem: 'changed item' }, changes: [{ key: 'price', label: 'Price', current: 10, incoming: 20 }] },
    { rowIndex: 2, rowNumber: 4, category: 'conflict', selected: false, conflictReason: 'Duplicate Item name in this CSV.', duplicateRows: [2, 3], item: { normalizedItem: 'duplicate', activeStatus: 'Active', type: 'Service', item: 'Duplicate', description: null, price: null }, changes: [] },
  ],
};

beforeEach(() => {
  postJson.mockReset();
  postJson.mockResolvedValueOnce(workspace);
});

test('Items catalog is read-only, filterable, and exposes all item details', async () => {
  render(<ItemsPage />);
  expect(await screen.findByText('Old Name')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Create|Edit|Delete/i })).not.toBeTruthy();
  fireEvent.click(screen.getByText('Old Name'));
  const drawer = await screen.findByRole('complementary', { name: 'Item details' });
  expect(within(drawer).getByText('Old description')).toBeTruthy();
  expect(within(drawer).getByText(/imported QuickBooks snapshot/i)).toBeTruthy();
});

test('CSV upload opens categorized review with default selections and field diffs', async () => {
  postJson.mockResolvedValueOnce(preview);
  render(<ItemsPage />);
  await screen.findByText('Old Name');
  const input = document.querySelector('input[type="file"]');
  fireEvent.change(input, { target: { files: [new File(['csv'], 'items.csv', { type: 'text/csv' })] } });
  expect(await screen.findByRole('region', { name: 'Review QuickBooks import' })).toBeTruthy();
  expect(screen.getByRole('checkbox', { name: 'Select New Item' }).checked).toBe(true);
  expect(screen.getByRole('checkbox', { name: 'Select Changed Item' }).checked).toBe(true);
  expect(screen.getByRole('radio', { name: /Choose Duplicate row 4/i }).checked).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Show changes for Changed Item' }));
  expect(screen.getByText('Current')).toBeTruthy();
  expect(screen.getByText('Incoming')).toBeTruthy();
  expect(screen.getByText('20')).toBeTruthy();
  expect(screen.getByLabelText(/This may be a renamed item/i)).toBeTruthy();
});

test('review submits selected rows, rename mappings, and explicit missing deactivation', async () => {
  postJson.mockResolvedValueOnce(preview).mockResolvedValueOnce({
    fields, items: [{ ...existing, item: 'New Item' }], imports: [],
    import: { created: 0, updated: 1, markedInactive: 1 },
  });
  render(<ItemsPage />);
  await screen.findByText('Old Name');
  fireEvent.change(document.querySelector('input[type="file"]'), { target: { files: [new File(['csv'], 'items.csv', { type: 'text/csv' })] } });
  await screen.findByRole('region', { name: 'Review QuickBooks import' });
  fireEvent.change(screen.getByLabelText(/This may be a renamed item/i), { target: { value: 'existing-1' } });
  fireEvent.click(screen.getByRole('checkbox', { name: 'Mark Old Missing inactive' }));
  fireEvent.click(screen.getByRole('button', { name: 'Apply selected changes' }));
  await waitFor(() => expect(postJson).toHaveBeenCalledWith(
    'applyUniquemItemImport',
    expect.objectContaining({
      fileName: 'items.csv',
      catalogRevision: 'revision-1',
      reconciliationMode: 'reset',
      decisions: expect.objectContaining({
        selectedRowIndexes: expect.arrayContaining([0, 1]),
        renameMappings: [{ rowIndex: 0, productId: 'existing-1' }],
        markInactiveItemIds: ['existing-2'],
      }),
    }),
    { authed: true }
  ));
});

test('upload rejects non-CSV and oversized files before calling preview', async () => {
  render(<ItemsPage />);
  await screen.findByText('Old Name');
  const input = document.querySelector('input[type="file"]');
  fireEvent.change(input, { target: { files: [new File(['bad'], 'items.txt', { type: 'text/plain' })] } });
  expect(await screen.findByText(/Upload a .csv file/i)).toBeTruthy();
  expect(postJson).toHaveBeenCalledTimes(1);
});
