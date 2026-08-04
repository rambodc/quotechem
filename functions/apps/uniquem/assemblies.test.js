import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMovements, normalizeComponents, scaledComponents, __testables } from './assemblies.js';

test('recipe components are positive, unique, and cannot contain the output item', () => {
  assert.deepEqual(normalizeComponents([{ productId: 'a', quantity: 300 }, { productId: 'b', quantity: 300 }], 'finished'), [{ productId: 'a', quantity: 300 }, { productId: 'b', quantity: 300 }]);
  assert.throws(() => normalizeComponents([{ productId: 'finished', quantity: 1 }], 'finished'), /cannot also be a component/);
  assert.throws(() => normalizeComponents([{ productId: 'a', quantity: 1 }, { productId: 'a', quantity: 2 }], 'finished'), /only once/);
  assert.throws(() => normalizeComponents([{ productId: 'a', quantity: 0 }], 'finished'), /greater than zero/);
});

test('a 600 litre component recipe may create 1000 litres without mass-balance validation', () => {
  const recipe = { outputQuantity: 1000, components: [{ productId: 'a', quantity: 300 }, { productId: 'b', quantity: 300 }] };
  assert.deepEqual(scaledComponents(recipe, 1000), recipe.components);
  assert.deepEqual(buildMovements('finished', 1000, recipe.components), [
    { productId: 'a', quantity: -300, role: 'component' },
    { productId: 'b', quantity: -300, role: 'component' },
    { productId: 'finished', quantity: 1000, role: 'output' },
  ]);
});

test('expected component quantities scale with requested output', () => {
  const scaled = scaledComponents({ outputQuantity: 1000, components: [{ productId: 'a', quantity: 300 }] }, 2500);
  assert.equal(scaled[0].quantity, 750);
});

test('build dates and quantities reject malformed values', () => {
  assert.equal(__testables.isoDate('2026-08-03'), '2026-08-03');
  assert.throws(() => __testables.isoDate('tomorrow'), /invalid/);
  assert.throws(() => __testables.quantity(-1, 'Quantity'), /greater than zero/);
});
