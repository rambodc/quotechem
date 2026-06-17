import test from 'node:test';
import assert from 'node:assert/strict';
import * as functionExports from './index.js';
import { __testables } from './api.js';
import { __emailTestables } from './email.js';

test('temporary password validation accepts six characters', () => {
  assert.equal(__testables.isValidTemporaryPassword('123456'), true);
});

test('temporary password validation rejects shorter values', () => {
  assert.equal(__testables.isValidTemporaryPassword('12345'), false);
});

test('managed mini app normalization includes access-managed apps only', () => {
  assert.deepEqual(__testables.normalizeMiniAppIds(['quotes', 'drilling-fluids-report', 'drilling-programs', 'uniquem', 'account']), [
    'drilling-fluids-report',
    'drilling-programs',
    'uniquem',
  ]);
});

test('admin user email input is normalized and validated', () => {
  assert.equal(__testables.normalizeAdminUserEmailInput(' Riley@Example.COM '), 'riley@example.com');
  assert.throws(() => __testables.normalizeAdminUserEmailInput('not-an-email'), /Valid email is required/);
});

test('admin user email conflict detection ignores the same user only', () => {
  assert.equal(__testables.emailBelongsToAnotherUser({ uid: 'user-1' }, 'user-1'), false);
  assert.equal(__testables.emailBelongsToAnotherUser({ uid: 'user-2' }, 'user-1'), true);
  assert.equal(__testables.emailBelongsToAnotherUser(null, 'user-1'), false);
});

test('invite action status helpers allow pending and expired only', () => {
  assert.equal(__testables.canEditInviteStatus('pending'), true);
  assert.equal(__testables.canEditInviteStatus('expired'), true);
  assert.equal(__testables.canEditInviteStatus('accepted'), false);
  assert.equal(__testables.canEditInviteStatus('cancelled'), false);
  assert.equal(__testables.canResendInviteStatus('pending'), true);
  assert.equal(__testables.canResendInviteStatus('expired'), true);
  assert.equal(__testables.canResendInviteStatus('accepted'), false);
  assert.equal(__testables.canResendInviteStatus('cancelled'), false);
});

test('invite acceptance identity comes from invite record only', () => {
  assert.deepEqual(__testables.inviteIdentity({ firstName: ' Invited ', lastName: ' Person ' }), {
    firstName: 'Invited',
    lastName: 'Person',
  });
});

test('legacy direct user creation function is not exported', () => {
  assert.equal(Object.hasOwn(functionExports, 'adminCreateUser'), false);
});

test('invite management functions are exported and template admin endpoints are removed', () => {
  assert.equal(Object.hasOwn(functionExports, 'adminUpdateInvite'), true);
  assert.equal(Object.hasOwn(functionExports, 'adminCancelInvite'), true);
  assert.equal(Object.hasOwn(functionExports, 'adminListEmailTemplates'), false);
  assert.equal(Object.hasOwn(functionExports, 'adminSaveEmailTemplate'), false);
  assert.equal(Object.hasOwn(functionExports, 'adminSendTestEmail'), false);
});

test('removed quote and RFQ functions are not exported', () => {
  for (const name of [
    'createPublicSession',
    'chatPublicAssistant',
    'finalizePublicSession',
    'adminDashboardSummary',
    'adminListLeads',
    'adminGetLeadDetail',
    'adminUpdateLead',
    'adminAddLeadNote',
    'adminListCustomers',
    'adminGetCustomerTimeline',
  ]) {
    assert.equal(Object.hasOwn(functionExports, name), false);
  }
});

test('mud program extraction page builder creates cover, well info, and section pages', () => {
  const pages = __testables.buildMudProgramPagesFromExtraction({
    overview: {
      programTitle: 'North Pad Mud Program',
      wellName: 'Well 12-34',
      sourceSummary: 'Extracted source summary.',
    },
    formationTops: [{ formation: 'Surface Casing', md: '100' }],
    casingStrings: [{ name: 'Surface', od: '244.5' }],
    volumes: [{ holeSection: 'Surface', totalVolume: '36' }],
    sections: [
      {
        id: 'surface',
        name: 'Surface Hole',
        topDepth: '0 m',
        bottomDepth: '650 m',
        properties: [{ label: 'Viscosity (s/L)', value: '40 - 90' }],
        procedures: [{ heading: 'Spud', lines: ['Fill tanks with fresh water.'] }],
      },
    ],
  });

  assert.equal(pages.length, 3);
  assert.equal(pages[0].type, 'cover');
  assert.equal(pages[0].data.executiveSummary, 'Extracted source summary.');
  assert.equal(pages[1].type, 'wellInfo');
  assert.equal(pages[1].data.formationTops[0].formation, 'Surface Casing');
  assert.equal(pages[2].type, 'section');
  assert.equal(pages[2].title, 'Surface Hole');
  assert.equal(pages[2].data.properties[0].label, 'Viscosity (s/L)');
});

test('mud program table normalizers keep report rows safe', () => {
  assert.deepEqual(__testables.normalizeFormationTops([{ formation: 'A'.repeat(130), md: 100, extra: 'drop' }])[0], {
    formation: 'A'.repeat(120),
    md: '100',
    tvd: '',
    lithology: '',
    gradient: '',
    emd: '',
    pressure: '',
    h2s: '',
    comment: '',
  });
  assert.equal(__testables.normalizeCasingStrings([{ name: 'Surface', od: 244.5 }])[0].od, '244.5');
  assert.equal(__testables.normalizeVolumeRows([{ holeSection: 'Main', totalVolume: 184.9 }])[0].totalVolume, '184.9');
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

test('Uniquem inventory functions are exported', () => {
  for (const name of [
    'listUniquemOperations',
    'saveUniquemProduct',
    'archiveUniquemProduct',
    'saveUniquemWarehouse',
    'receiveUniquemInventory',
    'transferUniquemInventory',
    'adjustUniquemInventory',
    'saveUniquemRecipe',
    'createUniquemBlendJob',
    'completeUniquemBlendJob',
    'cancelUniquemBlendJob',
    'saveUniquemPrice',
  ]) {
    assert.equal(Object.hasOwn(functionExports, name), true);
  }
});

test('Uniquem product and price normalizers keep operations input safe', () => {
  assert.deepEqual(__testables.normalizeUniquemProduct({ name: ' Clay Shield ', sku: 'clay shield!!', type: 'bad', unit: 'litres', reorderPoint: '12.3456' }), {
    name: 'Clay Shield',
    sku: 'CLAYSHIELD',
    type: 'raw',
    unit: 'L',
    reorderPoint: 12.346,
    description: '',
    status: 'active',
    media: [],
  });
  assert.equal(__testables.normalizeUniquemPrice({ productId: 'product-1', price: '15.50', currency: 'cad', unit: 'kg' }).currency, 'CAD');
  assert.throws(() => __testables.normalizeUniquemProduct({ name: '' }), /Product name is required/);
  assert.throws(() => __testables.normalizeUniquemPrice({ productId: 'product-1', price: 0 }), /Price must be greater than zero/);
});

test('Uniquem ledger balances derive stock from movement history', () => {
  const balances = __testables.calculateUniquemBalances([
    { productId: 'product-1', lotId: 'lot-1', warehouseId: 'warehouse-1', location: 'Main', quantity: 100, unit: 'L' },
    { productId: 'product-1', lotId: 'lot-1', warehouseId: 'warehouse-1', location: 'Main', quantity: -25, unit: 'L' },
    { productId: 'product-1', lotId: 'lot-1', warehouseId: 'warehouse-2', location: 'Blend Bay', quantity: 25, unit: 'L' },
  ]);
  assert.deepEqual(balances, [
    { productId: 'product-1', lotId: 'lot-1', warehouseId: 'warehouse-1', location: 'Main', unit: 'L', quantity: 75 },
    { productId: 'product-1', lotId: 'lot-1', warehouseId: 'warehouse-2', location: 'Blend Bay', unit: 'L', quantity: 25 },
  ]);
});

test('Uniquem blend job normalization requires input lots', () => {
  const job = __testables.normalizeUniquemBlendJob({
    name: ' Main blend ',
    outputProductId: 'product-2',
    outputQuantity: '100',
    outputUnit: 'l',
    warehouseId: 'warehouse-1',
    inputs: [{ productId: 'product-1', lotId: 'lot-1', warehouseId: 'warehouse-1', location: 'Main', quantity: '25', unit: 'l' }],
  });
  assert.equal(job.name, 'Main blend');
  assert.equal(job.outputUnit, 'L');
  assert.equal(job.inputs[0].quantity, 25);
  assert.throws(
    () => __testables.normalizeUniquemBlendJob({ outputProductId: 'product-2', outputQuantity: 100, warehouseId: 'warehouse-1', inputs: [] }),
    /At least one input lot is required/
  );
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
