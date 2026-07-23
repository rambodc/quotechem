import test from 'node:test';
import assert from 'node:assert/strict';
import { __testables } from './three-d.js';

test('Uniquem scene normalization clamps and drops unsafe objects', () => {
  const scene = __testables.normalizeUniquemScene({
    title: 'A'.repeat(120),
    summary: 'Generated scene',
    cameraHint: { distance: 999, target: [100, 2, -100] },
    objects: [
      {
        id: 'bad id !!',
        type: 'platform',
        label: 'Large Platform',
        position: [200, 1, -200],
        scale: [100, -3, 2],
        rotationY: 100,
        color: 'red',
        materialKind: 'unknown',
        textureKind: 'bad-texture',
      },
      {
        id: 'script',
        type: 'externalModel',
        label: 'Bad',
        position: [0, 0, 0],
        scale: [1, 1, 1],
        rotationY: 0,
        color: '#ffffff',
        materialKind: 'matte',
        textureKind: 'plain',
      },
    ],
  });

  assert.equal(scene.title.length, 80);
  assert.deepEqual(scene.cameraHint, { distance: 70, target: [30, 2, -30] });
  assert.equal(scene.objects.length, 1);
  assert.equal(scene.objects[0].id, 'badid');
  assert.deepEqual(scene.objects[0].position, [35, 1, -35]);
  assert.deepEqual(scene.objects[0].scale, [14, 0.05, 2]);
  assert.equal(scene.objects[0].color, '#64748b');
  assert.equal(scene.objects[0].materialKind, 'matte');
  assert.equal(scene.objects[0].textureKind, 'plain');
});

test('Uniquem creator image validation accepts supported images only', () => {
  assert.equal(__testables.isUniquemCreatorImageContentType('image/png'), true);
  assert.equal(__testables.isUniquemCreatorImageContentType('image/jpeg'), true);
  assert.equal(__testables.isUniquemCreatorImageContentType('image/webp'), true);
  assert.equal(__testables.isUniquemCreatorImageContentType('application/pdf'), false);

  const image = __testables.normalizeUniquemCreatorImage({
    name: 'stage.webp',
    contentType: 'image/webp',
    dataUrl: `data:image/webp;base64,${Buffer.from('image').toString('base64')}`,
  });
  assert.equal(image.name, 'stage.webp');
  assert.equal(image.contentType, 'image/webp');
  assert.equal(image.bytes, 5);
  assert.throws(
    () =>
      __testables.normalizeUniquemCreatorImage({
        name: 'stage.pdf',
        contentType: 'application/pdf',
        dataUrl: `data:application/pdf;base64,${Buffer.from('pdf').toString('base64')}`,
      }),
    /PNG, JPG, or WebP/
  );
});

test('Uniquem saved model mapping normalizes active and archived records', () => {
  const doc = {
    id: 'model-1',
    data: () => ({
      modelId: 'model-1',
      title: 'Saved Stage',
      summary: 'Shared saved model',
      status: 'archived',
      scene: {
        title: 'Saved Stage',
        summary: 'Shared saved model',
        cameraHint: { distance: 999, target: [0, 2, 0] },
        objects: [
          {
            id: 'screen',
            type: 'ledPanel',
            label: 'Screen',
            position: [0, 2, 0],
            scale: [3, 2, 1],
            rotationY: 0,
            color: '#ec4899',
            materialKind: 'screen',
            textureKind: 'cosmic',
          },
        ],
      },
      versionCount: 2,
    }),
  };

  const model = __testables.mapUniquem3DModelDoc(doc);
  assert.equal(model.modelId, 'model-1');
  assert.equal(model.status, 'archived');
  assert.equal(model.versionCount, 2);
  assert.equal(model.scene.cameraHint.distance, 70);
  assert.equal(__testables.normalizeUniquemModelStatus('unexpected'), 'active');
});

test('Uniquem version mapping preserves source and normalized scene', () => {
  const doc = {
    id: 'version-1',
    data: () => ({
      versionId: 'version-1',
      prompt: 'Add side speakers.',
      model: 'test-model',
      source: 'ai-edit',
      scene: {
        title: 'Version Scene',
        summary: 'Version summary',
        cameraHint: { distance: 22, target: [0, 2, 0] },
        objects: [
          {
            id: 'speaker',
            type: 'speakerStack',
            label: 'Speaker',
            position: [2, 0, 0],
            scale: [1, 3, 1],
            rotationY: 0,
            color: '#111827',
            materialKind: 'matte',
            textureKind: 'plain',
          },
        ],
      },
    }),
  };

  const version = __testables.mapUniquem3DVersionDoc(doc);
  assert.equal(version.versionId, 'version-1');
  assert.equal(version.source, 'ai-edit');
  assert.equal(version.scene.objects[0].type, 'speakerStack');
});

test('Uniquem model list filtering hides archived models and sorts active models', () => {
  const items = [
    { modelId: 'old-active', status: 'active', updatedAt: '2026-06-15T10:00:00.000Z' },
    { modelId: 'archived-newer', status: 'archived', updatedAt: '2026-06-16T12:00:00.000Z' },
    { modelId: 'new-active', status: 'active', updatedAt: '2026-06-16T11:00:00.000Z' },
  ];

  assert.deepEqual(
    __testables.filterActiveUniquem3DModels(items).map((item) => item.modelId),
    ['new-active', 'old-active']
  );
});
