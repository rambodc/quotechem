import test from 'node:test';
import assert from 'node:assert/strict';
import { __testables } from './publicQuoteChat.js';
import { __emailTestables } from './email.js';

test('temporary password validation accepts six characters', () => {
  assert.equal(__testables.isValidTemporaryPassword('123456'), true);
});

test('temporary password validation rejects shorter values', () => {
  assert.equal(__testables.isValidTemporaryPassword('12345'), false);
});

test('managed mini app normalization includes access-managed apps only', () => {
  assert.deepEqual(__testables.normalizeMiniAppIds(['quotes', 'drilling-fluids-report', 'drilling-programs', 'uniquem', 'account']), [
    'quotes',
    'drilling-fluids-report',
    'drilling-programs',
    'uniquem',
  ]);
});

test('mud program extraction page builder creates overview and section pages', () => {
  const pages = __testables.buildMudProgramPagesFromExtraction({
    overview: {
      programTitle: 'North Pad Mud Program',
      wellName: 'Well 12-34',
      sourceSummary: 'Extracted source summary.',
    },
    sections: [
      {
        id: 'surface',
        name: 'Surface Hole',
        topDepth: '0 m',
        bottomDepth: '650 m',
      },
    ],
  });

  assert.equal(pages.length, 2);
  assert.equal(pages[0].type, 'overview');
  assert.equal(pages[0].data.executiveSummary, 'Extracted source summary.');
  assert.equal(pages[1].type, 'section');
  assert.equal(pages[1].title, 'Surface Hole');
});

test('mud program PDF validation only accepts application PDFs', () => {
  assert.equal(__testables.isPdfContentType('application/pdf'), true);
  assert.equal(__testables.isPdfContentType('image/png'), false);
});

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

test('QuoteChem email templates render invite links', () => {
  const rendered = __emailTestables.buildTemplatedEmail({
    templateId: 'userInvite',
    data: {
      inviterName: 'Rambod',
      inviteUrl: 'https://quotechem.com/invite/token',
    },
  });

  assert.equal(rendered.subject, 'Finish your QuoteChem registration');
  assert.match(rendered.text, /https:\/\/quotechem\.com\/invite\/token/);
  assert.match(rendered.html, /Finish registration/);
});
