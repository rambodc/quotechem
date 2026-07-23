import test from 'node:test';
import assert from 'node:assert/strict';
import * as functionExports from '../../index.js';
import { __testables as productTestables } from './products.js';
import { __testables as attachmentTestables } from './attachments.js';
import * as helperTestables from './helpers.js';
import { shipmentInput } from './shipments.js';
import { recipeInput } from './recipes.js';
import { runInput } from './production.js';
const __testables = { ...productTestables, ...attachmentTestables };
const operationTestables = { ...helperTestables, shipmentInput, recipeInput, runInput };

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
