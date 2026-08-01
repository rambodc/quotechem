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
});

test('storage download URL safely encodes bucket, path, and token', () => {
  const result = __testables.downloadUrl('bucket.test', 'uniquem/product one/atlas.webp', 'token/value');
  assert.match(result, /product%20one%2Fatlas\.webp/);
  assert.match(result, /token%2Fvalue/);
});
