import test from 'node:test';
import assert from 'node:assert/strict';
import { customerIif, productIif, sanitizeIifValue } from './accounting.js';

test('customer IIF uses the Desktop list header, CRLF, and Canadian address data', () => {
  const output = customerIif([{
    displayName: 'QC TEST - ABC Oilfield',
    companyName: 'ABC Oilfield Ltd.',
    firstName: 'Renée',
    lastName: 'Smith',
    email: 'test@example.com',
    phone: '403-555-0100',
    address1: '123 Test Street',
    address2: 'Unit 2',
    city: 'Calgary',
    province: 'AB',
    postalCode: 'T2P 1J9',
    country: 'Canada',
  }]);
  assert.match(output, /^!CUST\tNAME\tBADDR1/);
  assert.match(output, /Calgary, AB\tT2P 1J9 Canada/);
  assert.match(output, /Renée\tSmith/);
  assert.ok(output.endsWith('\r\n'));
  assert.equal(output.replace(/\r\n/g, '').includes('\n'), false);
});

test('product IIF exports non-inventory OTHC items without inventory fields', () => {
  const output = productIif([{
    name: 'QC TEST - UniCide G15',
    description: 'Test chemical',
    salesPrice: 120,
    incomeAccount: 'Chemical Sales',
    taxable: true,
  }]);
  assert.match(output, /^!INVITEM\tNAME\tINVITEMTYPE\tDESC\tPRICE\tACCNT\tTAXABLE/);
  assert.match(output, /QC TEST - UniCide G15\tOTHC\tTest chemical\t120\.00\tChemical Sales\tY/);
  assert.doesNotMatch(output, /QTY|ASSET|COGS/);
});

test('IIF sanitization removes delimiters and protects formula-like values', () => {
  assert.equal(sanitizeIifValue(' hello\\tworld\\nnext '), 'hello\\tworld\\nnext');
  assert.equal(sanitizeIifValue('hello\tworld\nnext'), 'hello world next');
  assert.equal(sanitizeIifValue('=2+2'), "'=2+2");
  assert.equal(sanitizeIifValue('Crème brûlée'), 'Crème brûlée');
});
