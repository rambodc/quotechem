import test from 'node:test';
import assert from 'node:assert/strict';
import * as functionExports from './index.js';
import { __testables } from './api.js';
import { __testables as operationTestables } from './uniquemOperations.js';
import { __emailTestables } from './email.js';

test('temporary password validation accepts six characters', () => {
  assert.equal(__testables.isValidTemporaryPassword('123456'), true);
});

test('temporary password validation rejects shorter values', () => {
  assert.equal(__testables.isValidTemporaryPassword('12345'), false);
});

test('managed mini app normalization includes access-managed apps only', () => {
  assert.deepEqual(__testables.normalizeMiniAppIds(['quotes', 'drilling-programs', 'uniquem', 'account']), ['uniquem']);
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
    'listUniquemWorkspace',
    'saveUniquemProduct',
    'saveUniquemWarehouseV2',
    'deleteUniquemWarehouse',
    'adjustUniquemInventoryV2',
    'createUniquemReceipt',
    'saveUniquemShipment',
    'completeUniquemShipment',
    'saveUniquemRecipeV2',
    'saveUniquemProductionRun',
    'completeUniquemProductionRun',
    'deleteUniquemProduct',
    'createUniquemAttachmentUpload',
    'saveUniquemAttachment',
    'archiveUniquemAttachment',
    'listUniquemAttachments',
  ]) {
    assert.equal(Object.hasOwn(functionExports, name), true);
  }
});

test('Uniquem package operations validate decimal quantities and draft inputs', () => {
  assert.equal(operationTestables.qty('1.2344'), 1.234);
  assert.equal(operationTestables.signedQty('-0.5'), -0.5);
  assert.throws(() => operationTestables.qty(0), /greater than zero/);
  assert.throws(() => operationTestables.signedQty(0), /cannot be zero/);
  assert.deepEqual(operationTestables.shipmentInput({ customer: 'Test', lines: [{ batchId: 'batch-1', packageQuantity: '0.25' }] }).lines, [{ batchId: 'batch-1', packageQuantity: 0.25 }]);
  assert.equal(operationTestables.recipeInput({ name: 'Blend', outputProductId: 'product-2', ingredients: [{ productId: 'product-1', amount: 20 }] }).ingredients[0].amount, 20);
});

test('Uniquem product normalization keeps operations input safe', () => {
  assert.deepEqual(__testables.normalizeUniquemProduct({ name: ' Clay Shield ', description: ' Bagged additive ', packageType: 'Bag', packageAmount: '20', measurementUnit: 'kg', packagesPerPallet: '20' }), {
    name: 'Clay Shield',
    description: 'Bagged additive',
    packageType: 'Bag',
    packageAmount: 20,
    measurementUnit: 'kg',
    packagesPerPallet: 20,
    status: 'active',
  });
  assert.throws(() => __testables.normalizeUniquemProduct({ name: '' }), /Product name is required/);
  assert.throws(() => __testables.normalizeUniquemProduct({ name: 'Test', packageType: 'Bag', packageAmount: 0, measurementUnit: 'kg' }), /Package amount/);
  assert.throws(() => __testables.normalizeUniquemProduct({ name: 'Test', packageType: 'Bag', packageAmount: 20, measurementUnit: 'kg', packagesPerPallet: 1.5 }), /whole number/);
});

test('Uniquem attachment validation accepts supported operating files', () => {
  assert.equal(__testables.isUniquemAttachmentContentType('image/jpeg'), true);
  assert.equal(__testables.isUniquemAttachmentContentType('video/mp4'), true);
  assert.equal(__testables.isUniquemAttachmentContentType('application/pdf'), true);
  assert.equal(__testables.isUniquemAttachmentContentType('application/x-msdownload'), false);
  const attachment = __testables.normalizeUniquemAttachment({
    entityType: 'product',
    entityId: 'product-1',
    kind: 'sds',
    name: ' Clay Shield SDS.pdf ',
    fileName: 'Clay Shield SDS.pdf',
    contentType: 'application/pdf',
    size: 1234,
    path: 'uniquem/product/product-1/attachment-1-Clay-Shield-SDS.pdf',
    url: 'https://example.com/sds.pdf',
  });
  assert.equal(attachment.entityType, 'product');
  assert.equal(attachment.kind, 'sds');
  assert.equal(attachment.fileName, 'Clay-Shield-SDS.pdf');
  assert.equal(
    __testables.buildUniquemAttachmentPath({ entityType: 'receipt', entityId: 'receipt-1', attachmentId: 'attachment-1', fileName: 'Receipt Photo.jpg' }),
    'uniquem/receipt/receipt-1/attachment-1-Receipt-Photo.jpg'
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
