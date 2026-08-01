import test from 'node:test';
import assert from 'node:assert/strict';
import { __testables } from './textures.js';

const png = Buffer.alloc(32); Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png); png.writeUInt32BE(250, 16); png.writeUInt32BE(250, 20);

test('pallet source validation accepts supported image data and rejects malformed or oversized input', () => {
  const parsed = __testables.parseImage({ name: 'pallet.png', contentType: 'image/png', dataUrl: `data:image/png;base64,${png.toString('base64')}` });
  assert.equal(parsed.contentType, 'image/png');
  assert.equal(parsed.extension, 'png');
  assert.deepEqual(parsed.dimensions, { width: 250, height: 250 });
  assert.throws(() => __testables.parseImage({ name: 'fake.png', contentType: 'image/png', dataUrl: `data:image/png;base64,${Buffer.from('not-png').toString('base64')}` }), /malformed/);
  assert.throws(() => __testables.parseImage({ name: 'file.gif', contentType: 'image/gif', dataUrl: 'data:image/gif;base64,AAAA' }), /JPG, PNG, or WebP/);
  const tiny = Buffer.from(png); tiny.writeUInt32BE(32, 16); tiny.writeUInt32BE(32, 20);
  assert.throws(() => __testables.parseImage({ name: 'tiny.png', contentType: 'image/png', dataUrl: `data:image/png;base64,${tiny.toString('base64')}` }), /between 64 and 6,000/);
  const oversized = Buffer.alloc((5 * 1024 * 1024) + 1); png.copy(oversized); oversized.writeUInt32BE(250, 16); oversized.writeUInt32BE(250, 20);
  assert.throws(() => __testables.parseImage({ name: 'large.png', contentType: 'image/png', dataUrl: `data:image/png;base64,${oversized.toString('base64')}` }), /5 MB or smaller/);
});

test('single-side upload accepts exactly one reference image', () => {
  const image = { name: 'pallet.png', contentType: 'image/png', dataUrl: `data:image/png;base64,${png.toString('base64')}` };
  assert.equal(__testables.parseSingleImageRequest([image]).length, 1);
  assert.throws(() => __testables.parseSingleImageRequest([]), /exactly one/);
  assert.throws(() => __testables.parseSingleImageRequest([image, image]), /exactly one/);
});

test('visual validation requires one repeated bag wall without wood, scene, or text', () => {
  const accepted = __testables.normalizeVisualValidation({ valid: true, hasSingleView: true, cargoFillsFrame: true, hasRepeatedBagPattern: true, hasWoodPallet: false, hasBackgroundScene: false, hasReadableText: false });
  assert.equal(accepted.valid, true);
  const rejected = __testables.normalizeVisualValidation({ valid: false, hasSingleView: false, cargoFillsFrame: false, hasRepeatedBagPattern: false, hasWoodPallet: true, hasBackgroundScene: true, hasReadableText: false, reason: 'collage' });
  assert.equal(rejected.hasWoodPallet, true);
  assert.equal(rejected.reason, 'collage');
});
