import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMovements, calculatedComponents, isCompletePercentage, normalizeComponents, percentageTotal, __testables } from './assemblies.js';

test('recipe percentages are positive, capped, unique, and cannot contain the output item', () => {
  assert.deepEqual(normalizeComponents([{ productId: 'a', percentage: 10.5 }, { productId: 'b', percentage: 89.5 }], 'finished'), [{ productId: 'a', percentage: 10.5 }, { productId: 'b', percentage: 89.5 }]);
  assert.throws(() => normalizeComponents([{ productId: 'finished', percentage: 1 }], 'finished'), /cannot also be a component/);
  assert.throws(() => normalizeComponents([{ productId: 'a', percentage: 1 }, { productId: 'a', percentage: 2 }], 'finished'), /only once/);
  assert.throws(() => normalizeComponents([{ productId: 'a', percentage: 0 }], 'finished'), /greater than zero/);
  assert.throws(() => normalizeComponents([{ productId: 'a', percentage: 100.1 }], 'finished'), /cannot exceed 100/);
});

test('a 10 and 90 percent recipe consumes 100 and 900 from a 1000 unit build', () => {
  const components = calculatedComponents([{ productId: 'a', percentage: 10 }, { productId: 'b', percentage: 90 }], 1000);
  assert.deepEqual(components, [{ productId: 'a', percentage: 10, quantity: 100 }, { productId: 'b', percentage: 90, quantity: 900 }]);
  assert.deepEqual(buildMovements('finished', 1000, components), [
    { productId: 'a', quantity: -100, role: 'component' },
    { productId: 'b', quantity: -900, role: 'component' },
    { productId: 'finished', quantity: 1000, role: 'output' },
  ]);
});

test('percentage totals outside 100 remain valid but are detectable for warnings', () => {
  assert.equal(percentageTotal([{ percentage: 30 }, { percentage: 30 }]), 60);
  assert.equal(isCompletePercentage(60), false);
  assert.equal(isCompletePercentage(100.00000001), true);
});

test('build dates and quantities reject malformed values', () => {
  assert.equal(__testables.isoDate('2026-08-03'), '2026-08-03');
  assert.throws(() => __testables.isoDate('tomorrow'), /invalid/);
  assert.throws(() => __testables.quantity(-1, 'Quantity'), /greater than zero/);
});
