import React, { useState } from 'react';
import { asMoney, DataTable, Panel, productLabel, SelectField, today } from './UniquemShared';

export default function PriceListPage({ data, lookups, onPrice }) {
  const [form, setForm] = useState({ productId: '', price: '', currency: 'CAD', unit: 'L', effectiveDate: today(), notes: '' });
  return (
    <div className="uniquem-stack">
      <Panel title="Add Price">
        <form className="uniquem-form compact" onSubmit={(event) => {
          event.preventDefault();
          onPrice({ ...form, price: Number(form.price || 0) });
          setForm({ productId: '', price: '', currency: 'CAD', unit: 'L', effectiveDate: today(), notes: '' });
        }}>
          <SelectField label="Product" required value={form.productId} onChange={(value) => setForm({ ...form, productId: value })} items={data.products} idKey="productId" labelFn={productLabel} />
          <input required type="number" min="0.01" step="0.01" placeholder="Price" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} />
          <input placeholder="Currency" value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value })} />
          <input placeholder="Unit" value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })} />
          <input type="date" value={form.effectiveDate} onChange={(event) => setForm({ ...form, effectiveDate: event.target.value })} />
          <input placeholder="Notes" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
          <button type="submit">Save price</button>
        </form>
      </Panel>
      <Panel title="Active Price List">
        <DataTable
          empty="No prices yet."
          columns={['Product', 'Price', 'Effective', 'Status']}
          rows={data.prices.map((item) => [
            productLabel(lookups.products.get(item.productId)),
            asMoney(item),
            item.effectiveDate || '-',
            item.status,
          ])}
        />
      </Panel>
    </div>
  );
}
