import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FiChevronDown, FiChevronRight, FiRefreshCw, FiUpload, FiX } from 'react-icons/fi';
import { postJson } from '../../lib/api';

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const CATEGORIES = ['all', 'new', 'changed', 'unchanged', 'conflict', 'missing'];

function readFileBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
    reader.onerror = () => reject(new Error('Could not read the CSV file.'));
    reader.readAsDataURL(file);
  });
}

function displayValue(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

function statusLabel(category) {
  return category === 'missing' ? 'Missing from file' : category.charAt(0).toUpperCase() + category.slice(1);
}

function DetailDrawer({ item, fields, onClose }) {
  useEffect(() => {
    const close = (event) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [onClose]);
  return <div className="uniquem-drawer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <aside className="uniquem-drawer" aria-label="Item details">
      <header><div><span>QuickBooks Item</span><h2>{item.item}</h2></div><button onClick={onClose} aria-label="Close"><FiX /></button></header>
      <dl>{fields.map((field) => <div key={field.key}><dt>{field.header}</dt><dd>{displayValue(item[field.key])}</dd></div>)}</dl>
      <p className="uniquem-snapshot-note">Quantity On Hand is an imported QuickBooks snapshot. It does not create Uniquem inventory.</p>
    </aside>
  </div>;
}

function ReviewModal({ preview, contentBase64, onClose, onApplied }) {
  const [selected, setSelected] = useState(() => new Set(preview.rows.filter((row) => row.selected).map((row) => row.rowIndex)));
  const [expanded, setExpanded] = useState(new Set());
  const [filter, setFilter] = useState('all');
  const [renameMappings, setRenameMappings] = useState({});
  const [duplicateChoices, setDuplicateChoices] = useState({});
  const [markInactive, setMarkInactive] = useState(new Set());
  const [reconciliationMode, setReconciliationMode] = useState('reset');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const visibleRows = filter === 'all' ? preview.rows : preview.rows.filter((row) => row.category === filter);
  const availableRenameTargets = preview.missing;
  const mappedTargetIds = new Set(Object.values(renameMappings).filter(Boolean));
  const visibleMissing = preview.missing.filter((item) => !mappedTargetIds.has(item.productId));
  const toggleSelected = (rowIndex) => setSelected((current) => { const next = new Set(current); next.has(rowIndex) ? next.delete(rowIndex) : next.add(rowIndex); return next; });
  const toggleExpanded = (rowIndex) => setExpanded((current) => { const next = new Set(current); next.has(rowIndex) ? next.delete(rowIndex) : next.add(rowIndex); return next; });
  const chooseDuplicate = (row) => {
    setDuplicateChoices((current) => ({ ...current, [row.item.normalizedItem]: row.rowIndex }));
    setSelected((current) => { const next = new Set(current); for (const index of row.duplicateRows || []) next.delete(index); next.add(row.rowIndex); return next; });
  };
  const mapRename = (rowIndex, productId) => {
    setRenameMappings((current) => ({ ...current, [rowIndex]: productId }));
    if (productId) {
      setSelected((current) => new Set(current).add(rowIndex));
      setMarkInactive((current) => { const next = new Set(current); next.delete(productId); return next; });
    }
  };
  const changesFor = (row) => {
    const mapped = preview.existingItems.find((item) => item.productId === renameMappings[row.rowIndex]);
    if (!mapped) return row.changes;
    return preview.fields.filter((field) => (mapped[field.key] ?? null) !== (row.item[field.key] ?? null)).map((field) => ({ key: field.key, label: field.header, current: mapped[field.key] ?? null, incoming: row.item[field.key] ?? null }));
  };
  const apply = async () => {
    setBusy(true); setError('');
    try {
      const data = await postJson('applyUniquemItemImport', {
        fileName: preview.fileName,
        contentBase64,
        catalogRevision: preview.catalogRevision,
        reconciliationMode,
        decisions: {
          selectedRowIndexes: [...selected],
          renameMappings: Object.entries(renameMappings).filter(([, productId]) => productId).map(([rowIndex, productId]) => ({ rowIndex: Number(rowIndex), productId })),
          duplicateChoices,
          markInactiveItemIds: [...markInactive],
        },
      }, { authed: true });
      onApplied(data);
    } catch (err) {
      setError(err?.message || 'The QuickBooks items could not be imported.');
    } finally { setBusy(false); }
  };

  return <div className="uniquem-review-backdrop"><section className="uniquem-review" aria-label="Review QuickBooks import">
    <header><div><span>Import review</span><h2>{preview.fileName}</h2><p>{preview.totalRows} QuickBooks rows</p></div><button onClick={onClose} disabled={busy} aria-label="Close"><FiX /></button></header>
    {error ? <div className="uniquem-alert">{error}</div> : null}
    <nav className="uniquem-review-tabs" aria-label="Import categories">{CATEGORIES.map((category) => <button key={category} className={filter === category ? 'active' : ''} onClick={() => setFilter(category)}>{category === 'all' ? 'All' : statusLabel(category)} <strong>{category === 'all' ? preview.totalRows + preview.missing.length : preview.counts[category]}</strong></button>)}</nav>
    <fieldset className="uniquem-reconciliation"><legend>Assembly inventory reconciliation</legend><label><input type="radio" name="reconciliation" value="reset" checked={reconciliationMode === 'reset'} onChange={() => setReconciliationMode('reset')} /><span><strong>Reset adjustments</strong><small>Use this QuickBooks file as the new inventory baseline.</small></span></label><label><input type="radio" name="reconciliation" value="carry" checked={reconciliationMode === 'carry'} onChange={() => setReconciliationMode('carry')} /><span><strong>Carry adjustments forward</strong><small>Keep Uniquem assembly movements on top of the new snapshot.</small></span></label></fieldset>
    <div className="uniquem-review-list">
      {visibleRows.map((row) => {
        const changes = changesFor(row);
        const isExpanded = expanded.has(row.rowIndex);
        return <article className={`uniquem-review-row ${row.category}`} key={row.rowIndex}>
          <div className="uniquem-review-row-main">
            {row.category === 'conflict' ? <input type="radio" aria-label={`Choose ${row.item.item} row ${row.rowNumber}`} name={`duplicate-${row.item.normalizedItem}`} checked={duplicateChoices[row.item.normalizedItem] === row.rowIndex} onChange={() => chooseDuplicate(row)} /> : <input type="checkbox" aria-label={`Select ${row.item.item}`} checked={selected.has(row.rowIndex)} disabled={row.category === 'unchanged'} onChange={() => toggleSelected(row.rowIndex)} />}
            <button className="uniquem-expand" onClick={() => toggleExpanded(row.rowIndex)} aria-label={`Show changes for ${row.item.item}`}>{isExpanded ? <FiChevronDown /> : <FiChevronRight />}</button>
            <div><strong>{row.item.item}</strong><span>{row.item.type || 'No type'} · {row.item.activeStatus}</span></div>
            <span className={`uniquem-category ${row.category}`}>{statusLabel(row.category)}</span>
            <small>{row.category === 'conflict' ? row.conflictReason : `${changes.length} field change${changes.length === 1 ? '' : 's'}`}</small>
          </div>
          {row.category === 'new' ? <label className="uniquem-rename">This may be a renamed item:<select value={renameMappings[row.rowIndex] || ''} onChange={(event) => mapRename(row.rowIndex, event.target.value)}><option value="">Create as new</option>{availableRenameTargets.map((item) => <option key={item.productId} value={item.productId}>{item.item} ({item.type})</option>)}</select></label> : null}
          {isExpanded ? <div className="uniquem-diff"><div className="heading"><span>Field</span><span>Current</span><span>Incoming</span></div>{changes.map((change) => <div key={change.key}><strong>{change.label}</strong><span>{displayValue(change.current)}</span><span>{displayValue(change.incoming)}</span></div>)}</div> : null}
        </article>;
      })}
      {filter === 'missing' || filter === 'all' ? visibleMissing.map((item) => <article className="uniquem-review-row missing" key={`missing-${item.productId}`}><div className="uniquem-review-row-main"><input type="checkbox" aria-label={`Mark ${item.item} inactive`} checked={markInactive.has(item.productId)} onChange={() => setMarkInactive((current) => { const next = new Set(current); next.has(item.productId) ? next.delete(item.productId) : next.add(item.productId); return next; })} /><span className="uniquem-expand" /><div><strong>{item.item}</strong><span>{item.type} · {item.activeStatus}</span></div><span className="uniquem-category missing">Missing from file</span><small>Check to mark Not-active</small></div></article>) : null}
    </div>
    <footer><div><strong>{selected.size}</strong> CSV rows selected · <strong>{markInactive.size}</strong> missing items to mark inactive</div><button className="secondary" onClick={onClose} disabled={busy}>Cancel</button><button onClick={apply} disabled={busy}>{busy ? 'Importing…' : 'Apply selected changes'}</button></footer>
  </section></div>;
}

export default function ItemsPage() {
  const inputRef = useRef(null);
  const [data, setData] = useState({ items: [], imports: [], fields: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [preview, setPreview] = useState(null);
  const [filePayload, setFilePayload] = useState(null);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [detail, setDetail] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setData(await postJson('listUniquemItems', {}, { authed: true })); }
    catch (err) { setError(err?.message || 'Could not load QuickBooks items.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const chooseFile = async (file) => {
    setError(''); setStatus('');
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) { setError('Upload a .csv file exported from QuickBooks Desktop.'); return; }
    if (file.size > MAX_FILE_BYTES) { setError('CSV file must be 5 MB or smaller.'); return; }
    setBusy(true);
    try {
      const contentBase64 = await readFileBase64(file);
      const next = await postJson('previewUniquemItemImport', { fileName: file.name, contentBase64 }, { authed: true });
      setFilePayload({ fileName: file.name, contentBase64 }); setPreview(next);
    } catch (err) { setError(err?.message || 'Could not preview this QuickBooks CSV.'); }
    finally { setBusy(false); if (inputRef.current) inputRef.current.value = ''; }
  };

  const types = useMemo(() => [...new Set(data.items.map((item) => item.type).filter(Boolean))].sort(), [data.items]);
  const statuses = useMemo(() => [...new Set(data.items.map((item) => item.activeStatus).filter(Boolean))].sort(), [data.items]);
  const items = useMemo(() => data.items.filter((item) => {
    const term = query.trim().toLowerCase();
    return (!term || `${item.item} ${item.description || ''} ${item.preferredVendor || ''}`.toLowerCase().includes(term)) && (!typeFilter || item.type === typeFilter) && (!statusFilter || item.activeStatus === statusFilter);
  }), [data.items, query, typeFilter, statusFilter]);

  return <div className="uniquem-items">
    {error ? <div className="uniquem-alert">{error}</div> : null}{status ? <div className="uniquem-success">{status}</div> : null}
    <section className="uniquem-panel"><header><div><h2>QuickBooks Items</h2><p>Read-only item catalog from QuickBooks Enterprise Desktop 2020.</p></div><div className="uniquem-actions"><button className="secondary" onClick={load} disabled={loading || busy}><FiRefreshCw />Refresh</button><button onClick={() => inputRef.current?.click()} disabled={busy}><FiUpload />{busy ? 'Reading CSV…' : 'Upload QuickBooks CSV'}</button><input ref={inputRef} hidden type="file" accept=".csv,text/csv" onChange={(event) => chooseFile(event.target.files?.[0])} /></div></header>
      <div className="uniquem-filters"><input aria-label="Search items" placeholder="Search item, description, or vendor" value={query} onChange={(event) => setQuery(event.target.value)} /><select aria-label="Filter by type" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="">All types</option>{types.map((type) => <option key={type}>{type}</option>)}</select><select aria-label="Filter by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">All statuses</option>{statuses.map((itemStatus) => <option key={itemStatus}>{itemStatus}</option>)}</select></div>
      {loading ? <p className="uniquem-empty">Loading items…</p> : <div className="uniquem-table-wrap"><table><thead><tr><th>Item</th><th>Type</th><th>Status</th><th>Description</th><th>Quantity On Hand</th><th>U/M</th><th>Cost</th><th>Price</th></tr></thead><tbody>{items.map((item) => <tr key={item.productId} onClick={() => setDetail(item)} tabIndex="0" onKeyDown={(event) => (event.key === 'Enter' || event.key === ' ') && setDetail(item)}><td><strong>{item.item}</strong></td><td>{item.type}</td><td><span className={`uniquem-item-status ${item.activeStatus === 'Active' ? 'active' : ''}`}>{item.activeStatus}</span></td><td>{item.description || '—'}</td><td>{displayValue(item.quantityOnHand)}</td><td>{item.unitOfMeasure || '—'}</td><td>{displayValue(item.cost)}</td><td>{displayValue(item.price)}</td></tr>)}</tbody></table>{!items.length ? <p className="uniquem-empty">{data.items.length ? 'No items match these filters.' : 'No items yet. Upload a QuickBooks CSV to begin.'}</p> : null}</div>}
    </section>
    {data.imports.length ? <section className="uniquem-panel"><header><div><h2>Recent imports</h2><p>Summary history only; CSV contents are not retained.</p></div></header><div className="uniquem-import-history">{data.imports.map((item) => <article key={item.importId}><strong>{item.fileName}</strong><span>{item.createdAt ? new Date(item.createdAt).toLocaleString() : 'Imported'}</span><small>{item.created} new · {item.updated} updated · {item.markedInactive} marked inactive · {item.skipped} skipped</small></article>)}</div></section> : null}
    {detail ? <DetailDrawer item={detail} fields={data.fields} onClose={() => setDetail(null)} /> : null}
    {preview && filePayload ? <ReviewModal preview={preview} contentBase64={filePayload.contentBase64} onClose={() => { setPreview(null); setFilePayload(null); }} onApplied={(next) => { setData({ items: next.items, imports: next.imports, fields: next.fields }); setStatus(`${next.import.created} items created and ${next.import.updated} updated.`); setPreview(null); setFilePayload(null); }} /> : null}
  </div>;
}

export { displayValue, readFileBase64 };
