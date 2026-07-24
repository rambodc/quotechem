import React, { useCallback, useEffect, useState } from 'react';
import { FiDownload, FiFileText, FiPlus, FiRefreshCw } from 'react-icons/fi';
import { postJson } from '../../lib/api';
import './Accounting.css';

const EMPTY = { customers: [], products: [], exports: [], settings: { target: 'QuickBooks Desktop Canada 2019+', defaultIncomeAccount: '' } };

function downloadBase64({ contentBase64, filename, mimeType }) {
  const raw = window.atob(contentBase64);
  const bytes = Uint8Array.from(raw, (character) => character.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: mimeType || 'text/plain;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function Card({ title, value, children }) {
  return <article className="accounting-card"><span>{title}</span>{value != null ? <strong>{value}</strong> : null}{children}</article>;
}

function Alert({ error, status }) {
  return <>{error ? <div className="accounting-alert error">{error}</div> : null}{status ? <div className="accounting-alert success">{status}</div> : null}</>;
}

function CustomerForm({ customer, busy, onCancel, onSave }) {
  const [form, setForm] = useState(customer || { displayName: '', companyName: '', firstName: '', lastName: '', email: '', phone: '', address1: '', address2: '', city: '', province: 'AB', postalCode: '', country: 'Canada' });
  const field = (name, label, type = 'text') => <label>{label}<input type={type} required={name === 'displayName'} value={form[name] || ''} onChange={(event) => setForm({ ...form, [name]: event.target.value })} /></label>;
  return <form className="accounting-form" onSubmit={(event) => { event.preventDefault(); onSave(form); }}>
    <div className="accounting-form-grid">{field('displayName', 'QuickBooks display name')}{field('companyName', 'Company name')}{field('firstName', 'First name')}{field('lastName', 'Last name')}{field('email', 'Email', 'email')}{field('phone', 'Phone')}{field('address1', 'Address line 1')}{field('address2', 'Address line 2')}{field('city', 'City')}{field('province', 'Province')}{field('postalCode', 'Postal code')}{field('country', 'Country')}</div>
    <div className="accounting-actions"><button type="submit" disabled={busy}>Save customer</button><button type="button" className="secondary" onClick={onCancel} disabled={busy}>Cancel</button></div>
  </form>;
}

function ProductForm({ product, defaultIncomeAccount, busy, onCancel, onSave }) {
  const [form, setForm] = useState(product || { name: '', description: '', salesPrice: '', incomeAccount: defaultIncomeAccount || '', taxable: true });
  return <form className="accounting-form" onSubmit={(event) => { event.preventDefault(); onSave(form); }}>
    <div className="accounting-form-grid">
      <label>QuickBooks item name<input required value={form.name || ''} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
      <label>Sales price (CAD)<input required min="0" step="0.01" type="number" value={form.salesPrice} onChange={(event) => setForm({ ...form, salesPrice: event.target.value })} /></label>
      <label className="wide">Description<textarea value={form.description || ''} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
      <label className="wide">QuickBooks income account<input required value={form.incomeAccount || ''} onChange={(event) => setForm({ ...form, incomeAccount: event.target.value })} /></label>
      <label className="accounting-check"><input type="checkbox" checked={form.taxable !== false} onChange={(event) => setForm({ ...form, taxable: event.target.checked })} /> Taxable item</label>
    </div>
    <p className="accounting-note">Exports as a non-inventory item. It will not create inventory quantities or valuation.</p>
    <div className="accounting-actions"><button type="submit" disabled={busy}>Save product</button><button type="button" className="secondary" onClick={onCancel} disabled={busy}>Cancel</button></div>
  </form>;
}

function Dashboard({ data, busy, onSamples }) {
  return <div className="accounting-stack">
    <div className="accounting-cards"><Card title="Test customers" value={data.customers.length} /><Card title="Test products" value={data.products.length} /><Card title="IIF files generated" value={data.exports.length} /></div>
    <section className="accounting-panel"><h2>QuickBooks Desktop test</h2><p>This isolated workspace creates list-only IIF files for QuickBooks Desktop Canada. It does not affect Uniquem inventory or create accounting transactions.</p><button type="button" onClick={onSamples} disabled={busy || !data.settings.defaultIncomeAccount}><FiPlus /> Create sample customer and product</button>{!data.settings.defaultIncomeAccount ? <p className="accounting-note">Save the exact QuickBooks income account on the Export page before creating sample data.</p> : null}</section>
    <section className="accounting-panel"><h2>Safe test sequence</h2><ol><li>Restore a backup as a separate QuickBooks test company.</li><li>Import the Customers IIF and verify the customer.</li><li>Import the Products IIF and verify its type, price, tax flag, and account.</li><li>Record the result on the Export page.</li></ol></section>
  </div>;
}

function Customers({ data, busy, mutate }) {
  const [editing, setEditing] = useState(null); const [search, setSearch] = useState('');
  const rows = data.customers.filter((item) => `${item.displayName} ${item.companyName} ${item.email}`.toLowerCase().includes(search.toLowerCase()));
  return <section className="accounting-panel">
    <div className="accounting-panel-head"><div><h2>Customers</h2><p>Isolated QuickBooks Desktop test customers.</p></div><button type="button" onClick={() => setEditing({})}><FiPlus /> Create customer</button></div>
    {editing ? <CustomerForm customer={editing.customerId ? editing : null} busy={busy} onCancel={() => setEditing(null)} onSave={async (form) => { if (await mutate('saveAccountingCustomer', { ...form, customerId: editing.customerId })) setEditing(null); }} /> : null}
    <input className="accounting-search" aria-label="Search customers" placeholder="Search customers" value={search} onChange={(event) => setSearch(event.target.value)} />
    <div className="accounting-table-wrap"><table><thead><tr><th>Display name</th><th>Company</th><th>Contact</th><th>Address</th><th /></tr></thead><tbody>{rows.map((item) => <tr key={item.customerId}><td>{item.displayName}</td><td>{item.companyName || '-'}</td><td>{item.email || item.phone || '-'}</td><td>{[item.city, item.province].filter(Boolean).join(', ') || '-'}</td><td><button className="link" onClick={() => setEditing(item)}>Edit</button><button className="link danger" onClick={() => window.confirm('Archive this test customer?') && mutate('archiveAccountingCustomer', { customerId: item.customerId })}>Archive</button></td></tr>)}</tbody></table>{!rows.length ? <p className="accounting-empty">No customers found.</p> : null}</div>
  </section>;
}

function Products({ data, busy, mutate }) {
  const [editing, setEditing] = useState(null); const [search, setSearch] = useState('');
  const rows = data.products.filter((item) => `${item.name} ${item.description} ${item.incomeAccount}`.toLowerCase().includes(search.toLowerCase()));
  return <section className="accounting-panel">
    <div className="accounting-panel-head"><div><h2>Products</h2><p>Non-inventory QuickBooks Desktop test items.</p></div><button type="button" onClick={() => setEditing({})}><FiPlus /> Create product</button></div>
    {editing ? <ProductForm product={editing.productId ? editing : null} defaultIncomeAccount={data.settings.defaultIncomeAccount} busy={busy} onCancel={() => setEditing(null)} onSave={async (form) => { if (await mutate('saveAccountingProduct', { ...form, productId: editing.productId })) setEditing(null); }} /> : null}
    <input className="accounting-search" aria-label="Search products" placeholder="Search products" value={search} onChange={(event) => setSearch(event.target.value)} />
    <div className="accounting-table-wrap"><table><thead><tr><th>Item name</th><th>Type</th><th>Price</th><th>Income account</th><th>Taxable</th><th /></tr></thead><tbody>{rows.map((item) => <tr key={item.productId}><td>{item.name}</td><td>Non-inventory</td><td>CAD {Number(item.salesPrice).toFixed(2)}</td><td>{item.incomeAccount}</td><td>{item.taxable ? 'Yes' : 'No'}</td><td><button className="link" onClick={() => setEditing(item)}>Edit</button><button className="link danger" onClick={() => window.confirm('Archive this test product?') && mutate('archiveAccountingProduct', { productId: item.productId })}>Archive</button></td></tr>)}</tbody></table>{!rows.length ? <p className="accounting-empty">No products found.</p> : null}</div>
  </section>;
}

function ExportPage({ data, busy, mutate, exportIif }) {
  const [incomeAccount, setIncomeAccount] = useState(data.settings.defaultIncomeAccount || '');
  const [customerIds, setCustomerIds] = useState(() => data.customers.map((item) => item.customerId));
  const [productIds, setProductIds] = useState(() => data.products.map((item) => item.productId));
  useEffect(() => setIncomeAccount(data.settings.defaultIncomeAccount || ''), [data.settings.defaultIncomeAccount]);
  const toggle = (ids, setIds, id) => setIds(ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]);
  const review = async (item, status) => {
    const failureNote = status === 'failed' ? window.prompt('Paste or describe the QuickBooks import error:') : '';
    if (status === 'failed' && !failureNote) return;
    await mutate('updateAccountingExportStatus', { exportId: item.exportId, status, failureNote });
  };
  return <div className="accounting-stack">
    <section className="accounting-panel"><h2>Export settings</h2><p>Enter the income-account name exactly as it appears in the QuickBooks Desktop test company.</p><form className="accounting-inline-form" onSubmit={(event) => { event.preventDefault(); mutate('saveAccountingSettings', { defaultIncomeAccount: incomeAccount }); }}><input required aria-label="Default income account" placeholder="Example: Chemical Sales" value={incomeAccount} onChange={(event) => setIncomeAccount(event.target.value)} /><button disabled={busy}>Save setting</button></form><p className="accounting-note">Target: {data.settings.target}</p></section>
    <section className="accounting-panel"><h2>Customers IIF</h2><p>QuickBooks cannot be checked from this app. Names that already exist in Desktop may be rejected during import.</p><div className="accounting-selection">{data.customers.map((item) => <label key={item.customerId}><input type="checkbox" checked={customerIds.includes(item.customerId)} onChange={() => toggle(customerIds, setCustomerIds, item.customerId)} />{item.displayName}</label>)}</div><button disabled={busy || !customerIds.length} onClick={() => exportIif('customers', customerIds)}><FiDownload /> Download Customers IIF</button></section>
    <section className="accounting-panel"><h2>Products IIF</h2><div className="accounting-selection">{data.products.map((item) => <label key={item.productId}><input type="checkbox" checked={productIds.includes(item.productId)} onChange={() => toggle(productIds, setProductIds, item.productId)} />{item.name} — {item.incomeAccount}</label>)}</div><button disabled={busy || !productIds.length} onClick={() => exportIif('products', productIds)}><FiDownload /> Download Products IIF</button></section>
    <section className="accounting-panel"><h2>Export history</h2><div className="accounting-table-wrap"><table><thead><tr><th>Generated</th><th>File</th><th>Records</th><th>Status</th><th>Import result</th></tr></thead><tbody>{data.exports.map((item) => <tr key={item.exportId}><td>{item.createdAt ? new Date(item.createdAt).toLocaleString() : '-'}</td><td>{item.filename}</td><td>{item.recordCount}</td><td><span className={`accounting-status ${item.status}`}>{item.status === 'confirmed' ? 'Import confirmed' : item.status === 'failed' ? 'Import failed' : 'Generated'}</span>{item.failureNote ? <small>{item.failureNote}</small> : null}</td><td>{item.status === 'generated' ? <><button className="link" onClick={() => review(item, 'confirmed')}>Confirm success</button><button className="link danger" onClick={() => review(item, 'failed')}>Record failure</button></> : '-'}</td></tr>)}</tbody></table>{!data.exports.length ? <p className="accounting-empty">No IIF files generated yet.</p> : null}</div></section>
  </div>;
}

export default function Accounting({ page = 'dashboard' }) {
  const [data, setData] = useState(EMPTY); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [status, setStatus] = useState('');
  const load = useCallback(async () => { setLoading(true); setError(''); try { setData(await postJson('listAccountingWorkspace', {}, { authed: true })); } catch (err) { setError(err?.message || 'Could not load Accounting.'); } finally { setLoading(false); } }, []);
  useEffect(() => { load(); }, [load]);
  const mutate = async (endpoint, payload, success = '') => { setBusy(true); setError(''); setStatus(''); try { const result = await postJson(endpoint, payload, { authed: true }); if (result.customers) setData(result); if (success) setStatus(success); return result; } catch (err) { setError(err?.message || 'Accounting operation failed.'); return null; } finally { setBusy(false); } };
  const exportIif = async (type, ids) => { const result = await mutate(type === 'customers' ? 'exportAccountingCustomersIif' : 'exportAccountingProductsIif', { [type === 'customers' ? 'customerIds' : 'productIds']: ids }); if (!result) return; downloadBase64(result); setStatus(`${result.filename} generated. Import it into the backup QuickBooks test company.`); await load(); };
  const content = ({ dashboard: <Dashboard data={data} busy={busy} onSamples={() => mutate('createAccountingSamples', {}, 'Sample customer and product created.')} />, customers: <Customers data={data} busy={busy} mutate={mutate} />, products: <Products data={data} busy={busy} mutate={mutate} />, export: <ExportPage data={data} busy={busy} mutate={mutate} exportIif={exportIif} /> })[page] || null;
  return <section className="accounting-page"><header className="accounting-head"><div><p>QuickBooks Desktop test</p><h1><FiFileText /> Accounting</h1></div><button type="button" className="secondary" onClick={load} disabled={loading || busy}><FiRefreshCw /> Refresh</button></header><Alert error={error} status={status} />{loading ? <div className="accounting-loading">Loading Accounting...</div> : content}</section>;
}

export { downloadBase64 };
