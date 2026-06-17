import React, { useEffect, useState } from 'react';
import { AttachmentList, entityAttachments, Panel, productLabel, SelectField, TextField, today } from './UniquemShared';

export default function ReceivePage({ data, onReceive, onUploadReceiptFile }) {
  const [form, setForm] = useState({
    productId: '',
    warehouseId: '',
    location: 'Main',
    quantity: '',
    unit: 'L',
    lotNumber: '',
    supplier: '',
    supplierLot: '',
    receivedAt: today(),
    expiryDate: '',
    notes: '',
  });
  const [files, setFiles] = useState([]);
  const [lastLotId, setLastLotId] = useState('');
  const selectedProduct = data.products.find((item) => item.productId === form.productId);
  useEffect(() => {
    if (selectedProduct && form.unit !== selectedProduct.unit) setForm((current) => ({ ...current, unit: selectedProduct.unit }));
  }, [selectedProduct, form.unit]);

  const submit = async (event) => {
    event.preventDefault();
    const response = await onReceive({ ...form, quantity: Number(form.quantity || 0) });
    const lotId = response?.lotId;
    if (lotId) {
      setLastLotId(lotId);
      for (const item of files) {
        await onUploadReceiptFile({ file: item.file, entityType: 'lot', entityId: lotId, kind: item.kind });
      }
    }
    setForm((current) => ({ ...current, quantity: '', lotNumber: '', supplierLot: '', notes: '' }));
    setFiles([]);
  };

  return (
    <div className="uniquem-stack">
      <Panel title="Receive Incoming Chemicals">
        <form className="uniquem-form receive" onSubmit={submit}>
          <SelectField label="Product" required value={form.productId} onChange={(value) => setForm({ ...form, productId: value })} items={data.products} idKey="productId" labelFn={productLabel} />
          <SelectField label="Warehouse" required value={form.warehouseId} onChange={(value) => setForm({ ...form, warehouseId: value })} items={data.warehouses} idKey="warehouseId" labelFn={(item) => item.name} />
          <TextField label="Location" value={form.location} onChange={(value) => setForm({ ...form, location: value })} />
          <TextField label="Quantity" required type="number" step="0.001" min="0.001" value={form.quantity} onChange={(value) => setForm({ ...form, quantity: value })} />
          <TextField label="Unit" value={form.unit} onChange={(value) => setForm({ ...form, unit: value })} />
          <TextField label="Internal lot" value={form.lotNumber} onChange={(value) => setForm({ ...form, lotNumber: value })} />
          <TextField label="Supplier" value={form.supplier} onChange={(value) => setForm({ ...form, supplier: value })} />
          <TextField label="Supplier lot" value={form.supplierLot} onChange={(value) => setForm({ ...form, supplierLot: value })} />
          <TextField label="Received date" type="date" value={form.receivedAt} onChange={(value) => setForm({ ...form, receivedAt: value })} />
          <TextField label="Expiry date" type="date" value={form.expiryDate} onChange={(value) => setForm({ ...form, expiryDate: value })} />
          <label className="wide">
            Notes
            <textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
          </label>
          <label>
            Receiving photo
            <input type="file" accept="image/*" onChange={(event) => event.target.files?.[0] && setFiles([...files, { file: event.target.files[0], kind: 'image' }])} />
          </label>
          <label>
            Ticket / COA / SDS
            <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,image/*" onChange={(event) => event.target.files?.[0] && setFiles([...files, { file: event.target.files[0], kind: 'delivery-ticket' }])} />
          </label>
          <button type="submit">Receive inventory</button>
        </form>
      </Panel>
      <Panel title="Queued Receipt Files">
        {files.length ? (
          <div className="uniquem-attachment-list">
            {files.map((item, index) => (
              <article className="uniquem-attachment" key={`${item.file.name}-${index}`}>
                <span>{item.kind}</span>
                <div>
                  <strong>{item.file.name}</strong>
                  <span>{item.file.type || 'file'} - waiting for receipt</span>
                </div>
              </article>
            ))}
          </div>
        ) : <p className="uniquem-empty">Add receiving photos, tickets, COA, or SDS files before submitting.</p>}
      </Panel>
      {lastLotId ? (
        <Panel title="Last Received Lot Files">
          <AttachmentList attachments={entityAttachments(data, 'lot', lastLotId)} />
        </Panel>
      ) : null}
    </div>
  );
}
