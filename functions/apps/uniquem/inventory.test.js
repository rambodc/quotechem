import test from 'node:test';
import assert from 'node:assert/strict';
import { inferPackaging, calculateInventoryProduct, autoPlaceProducts, rowsOverlap, buildInventory, deterministicColor, __testables } from './inventory.js';

const item = (overrides = {}) => ({ productId: 'p1', item: 'EpSealon', description: 'EpSealon (48 x 11.3 kg bag)/Pallet', activeStatus: 'Active', quantityOnHand: 770, unitOfMeasure: 'each (ea)', ...overrides });

test('packaging parser handles QuickBooks tote, bag, and pail descriptions', () => {
  assert.deepEqual(inferPackaging(item({ unitOfMeasure: 'litre (l)', quantityOnHand: 92000 })).capacity, 1000);
  assert.equal(inferPackaging(item()).capacity, 48);
  assert.equal(inferPackaging(item({ description: 'ClayShield (32 x 19L Pails)/Pallet' })).capacity, 32);
  assert.equal(inferPackaging(item({ description: 'Terminox S (40 x 25 kg/Bag)' })).capacity, 40);
  assert.equal(inferPackaging(item({ description: 'Unknown powder', unitOfMeasure: 'kilogram (kg)' })).resolved, false);
});

test('load calculation produces partial pallets and triple-stacked totes', () => {
  const pallet = calculateInventoryProduct(item());
  assert.equal(pallet.loadCount, 17);
  assert.equal(pallet.finalLoadQuantity, 2);
  assert.equal(pallet.finalLoadPercent, 4.2);
  const tote = calculateInventoryProduct(item({ item: 'Choline Chloride', quantityOnHand: 92000, unitOfMeasure: 'litre (l)' }));
  assert.equal(tote.loadCount, 92);
  assert.equal(tote.columns, 31);
  assert.equal(tote.stackLimit, 3);
});

test('unknown packaging creates one placeholder and overrides resolve it', () => {
  const unknown = calculateInventoryProduct(item({ description: 'Guar Gum', quantityOnHand: 7428 }));
  assert.equal(unknown.loadCount, 1);
  assert.match(unknown.packaging.warning, /could not be inferred/i);
  const configured = calculateInventoryProduct(item({ description: 'Guar Gum', quantityOnHand: 7428 }), { packaging: { representation: 'pallet', unitsPerPallet: 40, packageLabel: 'bags' } });
  assert.equal(configured.loadCount, 186);
  assert.equal(configured.packaging.source, 'override');
});

test('inactive and zero-stock products remain hidden', () => {
  assert.match(calculateInventoryProduct(item({ activeStatus: 'Not-active' })).hiddenReason, /Not-active/);
  assert.match(calculateInventoryProduct(item({ quantityOnHand: 0 })).hiddenReason, /zero or blank/);
  assert.match(calculateInventoryProduct(item(), { visible: false }).hiddenReason, /Hidden from 3D/);
});

test('layout placement, rotation, colors, and collision checks are deterministic', () => {
  assert.equal(deterministicColor('stable-id'), deterministicColor('stable-id'));
  const base = calculateInventoryProduct(item({ quantityOnHand: 48 }));
  const placed = autoPlaceProducts([{ ...base }, { ...base, productId: 'p2', item: 'Second' }]);
  assert.deepEqual(placed[0].position, { x: 0, z: 0 });
  assert.notDeepEqual(placed[1].position, placed[0].position);
  assert.equal(rowsOverlap({ ...placed[0], position: { x: 0, z: 0 } }, { ...placed[1], position: { x: 0, z: 0 } }), true);
  assert.doesNotThrow(() => __testables.safeSetting({ position: { x: 2, z: 3 }, rotation: 90, color: '#abcdef', visible: true }, 'p1'));
  assert.throws(() => __testables.safeSetting({ position: { x: 2.5, z: 3 }, rotation: 45, color: 'red' }, 'p1'));
});

test('saved rows stay stable as quantities change and the floor expands', () => {
  const layout = { products: { p1: { position: { x: 7, z: 9 }, rotation: 90, color: '#112233', visible: true, packaging: null } } };
  const first = buildInventory([item({ quantityOnHand: 48 })], layout);
  const changed = buildInventory([item({ quantityOnHand: 480 })], layout);
  assert.deepEqual(changed.products[0].position, first.products[0].position);
  assert.equal(changed.products[0].color, '#112233');
  assert.ok(changed.floor.depth >= first.floor.depth);
});

test('inventory revision changes for item imports and shared layout saves', () => {
  const items = [item()];
  const initial = __testables.revision(items, { layoutRevision: 'one' });
  assert.notEqual(initial, __testables.revision([item({ quantityOnHand: 771, updatedAt: 'later' })], { layoutRevision: 'one' }));
  assert.notEqual(initial, __testables.revision(items, { layoutRevision: 'two' }));
});

test('automatic placements are persistable and preserve stable row metadata', () => {
  const product = buildInventory([item()], {}).products[0];
  assert.deepEqual(__testables.defaultSavedSetting(product), { position: product.position, rotation: 0, color: product.color, visible: true, packaging: null });
});
