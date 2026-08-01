import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import InventoryPage from './InventoryPage';
import { isTapGesture } from './InventoryScene';
import { postJson } from '../../lib/api';

jest.mock('../../lib/api', () => ({ postJson: jest.fn() }));
jest.mock('three/examples/jsm/controls/OrbitControls', () => ({ OrbitControls: jest.fn() }));

const epsealon = { productId: 'ep', item: 'EpSealon', description: 'EpSealon (48 x 11.3 kg bag)/Pallet', quantityOnHand: 770, unitOfMeasure: 'each (ea)', visible: true, color: '#2563eb', position: { x: 0, z: 0 }, rotation: 0, packaging: { representation: 'pallet', capacity: 48, packageLabel: 'bags', resolved: true, source: 'description', inferred: true }, loadCount: 17, stackCount: 6, stackLimit: 3, columns: 3, rows: 2, partial: true, finalLoadQuantity: 2, finalLoadPercent: 4.2, footprint: { width: 4.05, depth: 2.7 } };
const response = { products: [epsealon], hiddenProducts: [{ productId: 'zero', item: 'Zero Product', hiddenReason: 'Quantity On Hand is zero or blank' }], floor: { width: 35, depth: 20 }, revision: 'revision-1' };

beforeEach(() => { postJson.mockReset(); postJson.mockResolvedValue(response); });

test('shows an accessible inventory fallback and QuickBooks load details', async () => {
  render(<InventoryPage />);
  expect(await screen.findByText('3D view unavailable')).toBeTruthy();
  fireEvent.click(screen.getAllByRole('button', { name: /EpSealon · 17 loads/i })[0]);
  const details = screen.getByRole('complementary', { name: 'Inventory details' });
  expect(within(details).getAllByText(/770 each/i).length).toBeGreaterThanOrEqual(1);
  expect(within(details).getByText(/2 bags · 4.2%/i)).toBeTruthy();
  expect(screen.getByText(/1 products not shown/i)).toBeTruthy();
});

test('edits color and packaging then saves the shared layout', async () => {
  render(<InventoryPage />);
  await screen.findByText('3D view unavailable');
  fireEvent.click(screen.getByRole('button', { name: 'Customize products' }));
  fireEvent.click(screen.getAllByRole('button', { name: /EpSealon · 17 loads/i })[0]);
  fireEvent.change(screen.getByLabelText('Product color'), { target: { value: '#abcdef' } });
  fireEvent.change(screen.getByLabelText('Package capacity'), { target: { value: '40' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(postJson).toHaveBeenCalledWith('saveUniquemInventoryLayout', expect.objectContaining({ revision: 'revision-1', products: expect.objectContaining({ ep: expect.objectContaining({ color: '#abcdef', visible: true }) }) }), { authed: true }));
  expect(postJson.mock.calls[1][1].products.ep.position).toBeUndefined();
  expect(postJson.mock.calls[1][1].products.ep.rotation).toBeUndefined();
});

test('Cancel discards an inventory editing session', async () => {
  render(<InventoryPage />); await screen.findByText('3D view unavailable');
  fireEvent.click(screen.getByRole('button', { name: 'Customize products' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.getByRole('button', { name: 'Customize products' })).toBeTruthy();
  expect(postJson).toHaveBeenCalledTimes(1);
});

test('search narrows the product browser without removing the 3D fallback product', async () => {
  render(<InventoryPage />); await screen.findByText('3D view unavailable');
  fireEvent.change(screen.getByLabelText('Search inventory products'), { target: { value: 'not a match' } });
  expect(screen.getByText('Products (0)')).toBeTruthy();
  expect(screen.getByRole('button', { name: /EpSealon · 17 loads/i })).toBeTruthy();
});

test('touch and mouse selection distinguish taps from orbit gestures', () => {
  expect(isTapGesture({ x: 10, y: 10, time: 0 }, { x: 15, y: 14, time: 300 })).toBe(true);
  expect(isTapGesture({ x: 10, y: 10, time: 0 }, { x: 35, y: 10, time: 300 })).toBe(false);
  expect(isTapGesture({ x: 10, y: 10, time: 0 }, { x: 10, y: 10, time: 900 })).toBe(false);
});
