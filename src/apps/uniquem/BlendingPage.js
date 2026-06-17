import React, { useMemo, useState } from 'react';
import { AttachmentList, AttachmentUpload, entityAttachments, formatQty, getBalance, Panel, productLabel, SelectField } from './UniquemShared';

function RecipeForm({ data, onSubmit }) {
  const [form, setForm] = useState({ name: '', outputProductId: '', outputQuantity: '1', outputUnit: 'L', instructions: '', yieldLossPercent: '0' });
  const [inputs, setInputs] = useState([{ productId: '', quantity: '1', unit: 'L', notes: '' }]);
  const updateInput = (index, patch) => setInputs(inputs.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  return (
    <form className="uniquem-form" onSubmit={(event) => {
      event.preventDefault();
      onSubmit({
        ...form,
        outputQuantity: Number(form.outputQuantity || 1),
        yieldLossPercent: Number(form.yieldLossPercent || 0),
        inputs: inputs.map((item) => ({ ...item, quantity: Number(item.quantity || 0) })),
      });
      setForm({ name: '', outputProductId: '', outputQuantity: '1', outputUnit: 'L', instructions: '', yieldLossPercent: '0' });
      setInputs([{ productId: '', quantity: '1', unit: 'L', notes: '' }]);
    }}>
      <input required placeholder="Recipe name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
      <SelectField label="Output product" required value={form.outputProductId} onChange={(value) => setForm({ ...form, outputProductId: value })} items={data.products} idKey="productId" labelFn={productLabel} />
      <input type="number" min="0.001" step="0.001" value={form.outputQuantity} onChange={(event) => setForm({ ...form, outputQuantity: event.target.value })} />
      <input value={form.outputUnit} onChange={(event) => setForm({ ...form, outputUnit: event.target.value })} />
      <input type="number" min="0" max="100" step="0.001" placeholder="Yield/loss %" value={form.yieldLossPercent} onChange={(event) => setForm({ ...form, yieldLossPercent: event.target.value })} />
      {inputs.map((input, index) => (
        <React.Fragment key={index}>
          <SelectField label={`Input ${index + 1}`} required value={input.productId} onChange={(value) => updateInput(index, { productId: value })} items={data.products} idKey="productId" labelFn={productLabel} />
          <input type="number" min="0.001" step="0.001" value={input.quantity} onChange={(event) => updateInput(index, { quantity: event.target.value })} />
          <input value={input.unit} onChange={(event) => updateInput(index, { unit: event.target.value })} />
        </React.Fragment>
      ))}
      <textarea className="wide" placeholder="Blend instructions" value={form.instructions} onChange={(event) => setForm({ ...form, instructions: event.target.value })} />
      <button type="button" onClick={() => setInputs([...inputs, { productId: '', quantity: '1', unit: 'L', notes: '' }])}>Add input</button>
      <button type="submit">Save recipe</button>
    </form>
  );
}

function BlendJobForm({ data, lookups, onSubmit }) {
  const [form, setForm] = useState({ name: '', recipeId: '', outputProductId: '', outputLotNumber: '', outputQuantity: '', outputUnit: 'L', warehouseId: '', location: 'Main', notes: '' });
  const [inputs, setInputs] = useState([{ balanceKey: '', quantity: '' }]);
  const balanceOptions = data.balances.map((balance) => ({
    key: [balance.productId, balance.lotId, balance.warehouseId, balance.location, balance.unit].join('|'),
    balance,
  }));
  const recipe = data.recipes.find((item) => item.recipeId === form.recipeId);
  const applyRecipe = (recipeId) => {
    const nextRecipe = data.recipes.find((item) => item.recipeId === recipeId);
    setForm({
      ...form,
      recipeId,
      outputProductId: nextRecipe?.outputProductId || form.outputProductId,
      outputQuantity: nextRecipe?.outputQuantity ? String(nextRecipe.outputQuantity) : form.outputQuantity,
      outputUnit: nextRecipe?.outputUnit || form.outputUnit,
    });
  };
  const updateInput = (index, patch) => setInputs(inputs.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  const plannedInputs = inputs.map((input) => ({ ...input, option: balanceOptions.find((item) => item.key === input.balanceKey) })).filter((item) => item.option);
  return (
    <form className="uniquem-form" onSubmit={(event) => {
      event.preventDefault();
      onSubmit({
        ...form,
        outputQuantity: Number(form.outputQuantity || 0),
        inputs: plannedInputs.map(({ option, quantity }) => ({ ...option.balance, quantity: Number(quantity || 0) })),
      });
      setForm({ name: '', recipeId: '', outputProductId: '', outputLotNumber: '', outputQuantity: '', outputUnit: 'L', warehouseId: '', location: 'Main', notes: '' });
      setInputs([{ balanceKey: '', quantity: '' }]);
    }}>
      <input required placeholder="Job name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
      <SelectField label="Recipe" value={form.recipeId} onChange={applyRecipe} items={data.recipes} idKey="recipeId" labelFn={(item) => item.name} />
      <SelectField label="Output product" required value={form.outputProductId} onChange={(value) => setForm({ ...form, outputProductId: value })} items={data.products} idKey="productId" labelFn={productLabel} />
      <input placeholder="Output lot" value={form.outputLotNumber} onChange={(event) => setForm({ ...form, outputLotNumber: event.target.value })} />
      <input required type="number" min="0.001" step="0.001" placeholder="Output qty" value={form.outputQuantity} onChange={(event) => setForm({ ...form, outputQuantity: event.target.value })} />
      <input value={form.outputUnit} onChange={(event) => setForm({ ...form, outputUnit: event.target.value })} />
      <SelectField label="Output warehouse" required value={form.warehouseId} onChange={(value) => setForm({ ...form, warehouseId: value })} items={data.warehouses} idKey="warehouseId" labelFn={(item) => item.name} />
      {inputs.map((input, index) => (
        <React.Fragment key={index}>
          <select required value={input.balanceKey} onChange={(event) => updateInput(index, { balanceKey: event.target.value })}>
            <option value="">Select input lot...</option>
            {balanceOptions.map(({ key, balance }) => (
              <option key={key} value={key}>
                {productLabel(lookups.products.get(balance.productId))} - {lookups.lots.get(balance.lotId)?.lotNumber || balance.lotId} - {formatQty(balance.quantity, balance.unit)}
              </option>
            ))}
          </select>
          <input required type="number" min="0.001" step="0.001" placeholder="Input qty" value={input.quantity} onChange={(event) => updateInput(index, { quantity: event.target.value })} />
        </React.Fragment>
      ))}
      <textarea className="wide" placeholder="Production notes" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
      <button type="button" onClick={() => setInputs([...inputs, { balanceKey: '', quantity: '' }])}>Add input lot</button>
      <button type="submit">Create blend job</button>
      <div className="wide uniquem-preview">
        <strong>Movement preview</strong>
        {recipe ? <span>Using recipe: {recipe.name}</span> : null}
        {plannedInputs.length ? plannedInputs.map(({ option, quantity }) => (
          <span key={option.key}>Consume {formatQty(quantity, option.balance.unit)} from {lookups.lots.get(option.balance.lotId)?.lotNumber || option.balance.lotId}; available {formatQty(getBalance(data, option.balance), option.balance.unit)}</span>
        )) : <span>Select input lots to preview consumption.</span>}
        {form.outputProductId ? <span>Produce {formatQty(form.outputQuantity, form.outputUnit)} of {productLabel(lookups.products.get(form.outputProductId))}</span> : null}
      </div>
    </form>
  );
}

function BlendJobDetail({ data, lookups, job, onCompleteJob, onCancelJob, onUploadAttachment, onArchiveAttachment }) {
  if (!job) return <p className="uniquem-empty">Select a blend job to review planned inputs, files, and lineage.</p>;
  const attachments = entityAttachments(data, 'blendjob', job.jobId);
  return (
    <div className="uniquem-detail">
      <header className="uniquem-detail-head">
        <div>
          <h3>{job.name}</h3>
          <p>{productLabel(lookups.products.get(job.outputProductId))} - {formatQty(job.outputQuantity, job.outputUnit)} - {job.status}</p>
        </div>
        {job.status === 'planned' ? (
          <div className="uniquem-detail-actions">
            <button type="button" onClick={() => onCompleteJob(job.jobId)}>Complete</button>
            <button type="button" onClick={() => onCancelJob(job.jobId)}>Cancel</button>
          </div>
        ) : null}
      </header>
      <div className="uniquem-preview">
        <strong>Planned movement</strong>
        {(job.inputs || []).map((input) => (
          <span key={`${input.lotId}-${input.location}`}>Consume {formatQty(input.quantity, input.unit)} of {productLabel(lookups.products.get(input.productId))} from {lookups.lots.get(input.lotId)?.lotNumber || input.lotId}</span>
        ))}
        <span>Produce {formatQty(job.outputQuantity, job.outputUnit)} into {lookups.warehouses.get(job.warehouseId)?.name || job.warehouseId} / {job.location}</span>
        {job.outputLotId ? <span>Output lot: {lookups.lots.get(job.outputLotId)?.lotNumber || job.outputLotId}</span> : null}
      </div>
      <Panel title="Blend Files">
        <div className="uniquem-file-toolbar">
          <AttachmentUpload label="Batch sheet" entityType="blendjob" entityId={job.jobId} kind="batch-sheet" accept=".pdf,.doc,.docx,image/*" onUpload={onUploadAttachment} />
          <AttachmentUpload label="Blend photo" entityType="blendjob" entityId={job.jobId} kind="image" accept="image/*,video/*" onUpload={onUploadAttachment} />
          <AttachmentUpload label="QA / output label" entityType="blendjob" entityId={job.jobId} kind="label" accept=".pdf,image/*" onUpload={onUploadAttachment} />
        </div>
        <AttachmentList attachments={attachments} onArchive={onArchiveAttachment} />
      </Panel>
    </div>
  );
}

export default function BlendingPage({ data, lookups, onRecipe, onBlendJob, onCompleteJob, onCancelJob, onUploadAttachment, onArchiveAttachment }) {
  const [selectedJobId, setSelectedJobId] = useState('');
  const selectedJob = data.blendJobs.find((job) => job.jobId === selectedJobId) || data.blendJobs[0] || null;
  const sortedJobs = useMemo(() => [...data.blendJobs].sort((a, b) => (a.status === 'planned' ? -1 : 1) - (b.status === 'planned' ? -1 : 1)), [data.blendJobs]);
  return (
    <div className="uniquem-stack">
      <div className="uniquem-grid two">
        <Panel title="Create Recipe">
          <RecipeForm data={data} onSubmit={onRecipe} />
        </Panel>
        <Panel title="Create Blend Job">
          <BlendJobForm data={data} lookups={lookups} onSubmit={onBlendJob} />
        </Panel>
      </div>
      <Panel title="Blend Jobs">
        <div className="uniquem-job-list">
          {sortedJobs.length ? sortedJobs.map((job) => (
            <button type="button" className={`uniquem-job ${selectedJob?.jobId === job.jobId ? 'active' : ''}`} key={job.jobId} onClick={() => setSelectedJobId(job.jobId)}>
              <div>
                <strong>{job.name}</strong>
                <span>{productLabel(lookups.products.get(job.outputProductId))} - {formatQty(job.outputQuantity, job.outputUnit)} - {job.status}</span>
              </div>
            </button>
          )) : <p className="uniquem-empty">No blend jobs yet.</p>}
        </div>
      </Panel>
      <Panel title="Blend Job Detail">
        <BlendJobDetail data={data} lookups={lookups} job={selectedJob} onCompleteJob={onCompleteJob} onCancelJob={onCancelJob} onUploadAttachment={onUploadAttachment} onArchiveAttachment={onArchiveAttachment} />
      </Panel>
    </div>
  );
}
