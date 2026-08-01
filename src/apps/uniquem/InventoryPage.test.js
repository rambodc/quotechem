import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import InventoryPage from './InventoryPage';
import { postJson } from '../../lib/api';

jest.mock('../../lib/api', () => ({ postJson: jest.fn() }));
jest.mock('three/examples/jsm/controls/OrbitControls', () => ({ OrbitControls: jest.fn() }));

const epsealon = { productId: 'ep', item: 'EpSealon', description: 'EpSealon (48 x 11.3 kg bag)/Pallet', quantityOnHand: 770, unitOfMeasure: 'each (ea)', visible: true, color: '#2563eb', position: { x: 0, z: 0 }, rotation: 0, packaging: { representation: 'pallet', capacity: 48, packageLabel: 'bags', resolved: true, source: 'description', inferred: true }, loadCount: 17, stackLimit: 1, columns: 17, partial: true, finalLoadQuantity: 2, finalLoadPercent: 4.2, footprint: { width: 22.95, depth: 1.35 } };
const response = { products: [epsealon], hiddenProducts: [{ productId: 'zero', item: 'Zero Product', hiddenReason: 'Quantity On Hand is zero or blank' }], floor: { width: 35, depth: 20 }, revision: 'revision-1' };

beforeEach(() => { postJson.mockReset(); postJson.mockResolvedValue(response); });

test('shows an accessible inventory fallback and QuickBooks load details', async () => {
  render(<InventoryPage />);
  expect(await screen.findByText('3D view unavailable')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /EpSealon · 17 loads/i }));
  const details = screen.getByRole('complementary', { name: 'Inventory details' });
  expect(within(details).getByText(/770 each/i)).toBeTruthy();
  expect(within(details).getByText(/2 bags · 4.2%/i)).toBeTruthy();
  expect(screen.getByText(/1 products not shown/i)).toBeTruthy();
});

test('edits color and packaging then saves the shared layout', async () => {
  render(<InventoryPage />);
  await screen.findByText('3D view unavailable');
  fireEvent.click(screen.getByRole('button', { name: 'Edit warehouse' }));
  fireEvent.click(screen.getByRole('button', { name: /EpSealon · 17 loads/i }));
  fireEvent.change(screen.getByLabelText('Product color'), { target: { value: '#abcdef' } });
  fireEvent.change(screen.getByLabelText('Package capacity'), { target: { value: '40' } });
  fireEvent.click(screen.getByRole('button', { name: 'Rotate 90°' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(postJson).toHaveBeenCalledWith('saveUniquemInventoryLayout', expect.objectContaining({ revision: 'revision-1', products: expect.objectContaining({ ep: expect.objectContaining({ color: '#abcdef', rotation: 90, visible: true }) }) }), { authed: true }));
});

test('Cancel discards an inventory editing session', async () => {
  render(<InventoryPage />); await screen.findByText('3D view unavailable');
  fireEvent.click(screen.getByRole('button', { name: 'Edit warehouse' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.getByRole('button', { name: 'Edit warehouse' })).toBeTruthy();
  expect(postJson).toHaveBeenCalledTimes(1);
});
