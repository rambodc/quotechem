import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Accounting from './Accounting';
import { postJson } from '../../lib/api';

jest.mock('../../lib/api', () => ({ postJson: jest.fn() }));

const workspace = {
  customers: [{
    customerId: 'customer-1',
    displayName: 'QC TEST - ABC Oilfield',
    companyName: 'ABC Oilfield Ltd.',
    city: 'Calgary',
    province: 'AB',
  }],
  products: [{
    productId: 'product-1',
    name: 'QC TEST - UniCide G15',
    description: 'Test chemical',
    salesPrice: 120,
    incomeAccount: 'Chemical Sales',
    taxable: true,
  }],
  exports: [],
  settings: { target: 'QuickBooks Desktop Canada 2019+', defaultIncomeAccount: 'Chemical Sales' },
};

beforeEach(() => {
  postJson.mockReset();
  postJson.mockResolvedValue(workspace);
});

test('Accounting customers page loads isolated customer records', async () => {
  render(<Accounting page="customers" />);
  expect(await screen.findByText('QC TEST - ABC Oilfield')).toBeTruthy();
  expect(screen.getByRole('button', { name: /Create customer/i })).toBeTruthy();
  expect(postJson).toHaveBeenCalledWith('listAccountingWorkspace', {}, { authed: true });
});

test('Accounting product form defaults the configured income account', async () => {
  render(<Accounting page="products" />);
  await screen.findByText('QC TEST - UniCide G15');
  fireEvent.click(screen.getByRole('button', { name: /Create product/i }));
  expect(screen.getByLabelText(/QuickBooks income account/i).value).toBe('Chemical Sales');
  expect(screen.getByText(/Exports as a non-inventory item/i)).toBeTruthy();
});

test('Accounting export page requests a separate customer IIF', async () => {
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, writable: true, value: jest.fn(() => 'blob:test') });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: jest.fn() });
  const createObjectURL = jest.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
  const revokeObjectURL = jest.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  postJson
    .mockResolvedValueOnce(workspace)
    .mockResolvedValueOnce({
      exportId: 'export-1',
      filename: 'quotechem-customers-test.iif',
      mimeType: 'text/tab-separated-values;charset=utf-8',
      contentBase64: window.btoa('!CUST\\tNAME\\r\\n'),
      recordCount: 1,
    })
    .mockResolvedValueOnce(workspace);

  render(<Accounting page="export" />);
  await screen.findByText('QC TEST - ABC Oilfield');
  fireEvent.click(screen.getByRole('button', { name: /Download Customers IIF/i }));

  await waitFor(() => expect(postJson).toHaveBeenCalledWith(
    'exportAccountingCustomersIif',
    { customerIds: ['customer-1'] },
    { authed: true }
  ));
  await waitFor(() => expect(click).toHaveBeenCalled());
  createObjectURL.mockRestore();
  revokeObjectURL.mockRestore();
  click.mockRestore();
});
