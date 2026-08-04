import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AssemblyPage from './AssemblyPage';
import { postJson } from '../../lib/api';

jest.mock('../../lib/api', () => ({ postJson: jest.fn() }));

const items = [
  { productId: 'finished', item: 'Finished Blend', type: 'Inventory Assembly', activeStatus: 'Active', unitOfMeasure: 'litre (l)', quickBooksQuantity: 0, assemblyAdjustment: 0, availableQuantity: 0 },
  { productId: 'a', item: 'Product A', type: 'Inventory Part', activeStatus: 'Active', unitOfMeasure: 'litre (l)', quickBooksQuantity: 200, assemblyAdjustment: 0, availableQuantity: 200 },
  { productId: 'b', item: 'Product B', type: 'Inventory Part', activeStatus: 'Active', unitOfMeasure: 'litre (l)', quickBooksQuantity: 500, assemblyAdjustment: 0, availableQuantity: 500 },
];
const recipe = { recipeId: 'recipe-1', revision: 'revision-1', revisionNumber: 1, status: 'Active', name: 'Standard Blend', outputProductId: 'finished', outputItem: 'Finished Blend', outputUnitOfMeasure: 'litre (l)', percentageTotal: 100, components: [{ productId: 'a', item: 'Product A', unitOfMeasure: 'litre (l)', percentage: 10 }, { productId: 'b', item: 'Product B', unitOfMeasure: 'litre (l)', percentage: 90 }] };

beforeEach(() => { postJson.mockReset(); });

test('creates a recipe from existing catalog items', async () => {
  postJson.mockResolvedValueOnce({ items, recipes: [], builds: [] }).mockResolvedValueOnce({ items, recipes: [recipe], builds: [] });
  render(<AssemblyPage />);
  fireEvent.click(await screen.findByRole('button', { name: /New recipe/i }));
  fireEvent.change(screen.getByLabelText('Recipe name'), { target: { value: 'Standard Blend' } });
  fireEvent.change(screen.getByLabelText('Finished item'), { target: { value: 'finished' } });
  fireEvent.change(screen.getByLabelText('Component 1 item'), { target: { value: 'a' } });
  fireEvent.change(screen.getByLabelText('Component 1 percentage'), { target: { value: '60' } });
  expect(screen.getByText(/total 60%, not 100%/i)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Save recipe' }));
  await waitFor(() => expect(postJson).toHaveBeenCalledWith('saveUniquemAssemblyRecipe', expect.objectContaining({ name: 'Standard Blend', outputProductId: 'finished', components: [{ productId: 'a', percentage: 60 }] }), { authed: true }));
});

test('calculates a 1000 litre build from 10 and 90 percent after shortage acknowledgement', async () => {
  const workspace = { items, recipes: [recipe], builds: [] };
  postJson.mockResolvedValueOnce(workspace).mockResolvedValueOnce({ ...workspace, builds: [{ buildId: 'build-1', kind: 'build', status: 'Posted', outputItem: 'Finished Blend', buildDate: '2026-08-03', components: recipe.components }] });
  render(<AssemblyPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'New Build' }));
  fireEvent.change(screen.getByLabelText('Finished quantity'), { target: { value: '1000' } });
  expect(await screen.findByText(/Confirm negative inventory/i)).toBeTruthy();
  expect(screen.getByLabelText('Finished quantity').value).toBe('1000');
  expect(screen.getByLabelText('Actual component 1 percentage').value).toBe('10');
  expect(screen.getByLabelText('Actual component 2 percentage').value).toBe('90');
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'Post build' }));
  await waitFor(() => expect(postJson).toHaveBeenCalledWith('postUniquemAssemblyBuild', expect.objectContaining({ outputQuantity: 1000, acknowledgeShortage: true, components: [{ productId: 'a', percentage: 10 }, { productId: 'b', percentage: 90 }] }), { authed: true }));
});
