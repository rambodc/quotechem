import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FiEdit3, FiEye, FiEyeOff, FiRefreshCw, FiRotateCw, FiSave, FiX } from 'react-icons/fi';
import { postJson } from '../../lib/api';
import InventoryScene from './InventoryScene';

const clone = (value) => JSON.parse(JSON.stringify(value));
const settingFor = (product) => ({ position: product.position, rotation: product.rotation, color: product.color, visible: product.visible !== false, packaging: product.packaging.source === 'override' ? { representation: product.packaging.representation, ...(product.packaging.representation === 'tote' ? { capacityPerTote: product.packaging.capacity } : { unitsPerPallet: product.packaging.capacity }), packageLabel: product.packaging.packageLabel } : null });
const footprint = (product) => product.rotation % 180 === 0 ? product.footprint : { width: product.footprint.depth, depth: product.footprint.width };
const overlaps = (left, right) => { const a = footprint(left); const b = footprint(right); return Math.abs(left.position.x - right.position.x) < (a.width + b.width) / 2 + .7 && Math.abs(left.position.z - right.position.z) < (a.depth + b.depth) / 2 + .7; };

function autoArrange(products) {
  let z = 0;
  return products.map((product) => { const next = { ...product, position: { x: 0, z: Math.round(z) } }; z += footprint(next).depth + 1.4; return next; });
}

export default function InventoryPage() {
  const [data, setData] = useState({ products: [], hiddenProducts: [], floor: { width: 20, depth: 20 }, revision: '' });
  const [draft, setDraft] = useState([]); const [hiddenDraft, setHiddenDraft] = useState([]); const [editing, setEditing] = useState(false); const [selectedId, setSelectedId] = useState(null); const [query, setQuery] = useState(''); const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [resetSignal, setResetSignal] = useState(0);
  const load = useCallback(async () => { setLoading(true); setError(''); try { const result = await postJson('getUniquemInventory', {}, { authed: true }); setData(result); setDraft(clone(result.products || [])); setHiddenDraft(clone(result.hiddenProducts || [])); } catch (reason) { setError(reason.message || 'Inventory could not be loaded.'); } finally { setLoading(false); } }, []);
  useEffect(() => { load(); }, [load]);
  const products = editing ? draft : data.products;
  const selected = products.find((item) => item.productId === selectedId) || null;
  const filtered = useMemo(() => products.filter((item) => item.item.toLowerCase().includes(query.trim().toLowerCase())), [products, query]);
  const update = (productId, patch) => setDraft((current) => current.map((item) => item.productId === productId ? { ...item, ...patch } : item));
  const move = (productId, position) => {
    const candidate = draft.find((item) => item.productId === productId); if (!candidate) return;
    const moved = { ...candidate, position };
    const conflict = draft.find((item) => item.productId !== productId && overlaps(moved, item));
    if (conflict) { setError(`${candidate.item} cannot overlap ${conflict.item}.`); setResetSignal((value) => value + 1); return; }
    setError(''); update(productId, { position });
  };
  const rotate = () => {
    if (!selected) return; const rotated = { ...selected, rotation: (selected.rotation + 90) % 360 };
    const conflict = draft.find((item) => item.productId !== selected.productId && overlaps(rotated, item));
    if (conflict) { setError(`${selected.item} cannot rotate because it would overlap ${conflict.item}.`); return; }
    update(selected.productId, { rotation: rotated.rotation });
  };
  const begin = () => { setDraft(clone(data.products)); setHiddenDraft(clone(data.hiddenProducts)); setEditing(true); setNotice(''); setError(''); };
  const cancel = () => { setDraft(clone(data.products)); setHiddenDraft(clone(data.hiddenProducts)); setEditing(false); setSelectedId(null); setError(''); };
  const save = async () => { setSaving(true); setError(''); try { const configurableHidden = hiddenDraft.filter((product) => product.canShow); const settings = Object.fromEntries([...draft, ...configurableHidden].map((product) => [product.productId, settingFor(product)])); const result = await postJson('saveUniquemInventoryLayout', { revision: data.revision, products: settings }, { authed: true }); setData(result); setDraft(clone(result.products)); setHiddenDraft(clone(result.hiddenProducts)); setEditing(false); setNotice('Shared warehouse layout saved.'); } catch (reason) { setError(reason.message || 'Layout could not be saved.'); } finally { setSaving(false); } };
  const setPackaging = (field, value) => {
    if (!selected) return; const representation = field === 'representation' ? value : selected.packaging.representation;
    const capacity = field === 'capacity' ? Number(value) : (selected.packaging.capacity || 1);
    const packageLabel = field === 'packageLabel' ? value : selected.packaging.packageLabel;
    const packaging = { ...selected.packaging, representation, capacity, packageLabel, resolved: capacity > 0, inferred: false, source: 'override', warning: null };
    const loadCount = capacity > 0 ? Math.ceil(selected.quantityOnHand / capacity) : 1; const remainder = capacity > 0 ? selected.quantityOnHand % capacity : null; const columns = representation === 'tote' ? Math.ceil(loadCount / 3) : loadCount;
    update(selected.productId, { packaging, loadCount, columns, stackLimit: representation === 'tote' ? 3 : 1, partial: remainder > 0, finalLoadQuantity: remainder || capacity, finalLoadPercent: capacity > 0 ? Math.round(((remainder || capacity) / capacity) * 1000) / 10 : null, footprint: { width: Math.max(1.2, columns * 1.35), depth: 1.35 } });
  };
  const hideSelected = () => { if (!selected) return; setDraft((current) => current.filter((item) => item.productId !== selected.productId)); setHiddenDraft((current) => [...current, { ...selected, visible: false, canShow: true, hiddenReason: 'Hidden from 3D by a user' }]); setSelectedId(null); };
  const showHidden = (product) => { const maxZ = draft.reduce((max, item) => Math.max(max, item.position.z + footprint(item).depth + 1.4), 0); setHiddenDraft((current) => current.filter((item) => item.productId !== product.productId)); setDraft((current) => [...current, { ...product, visible: true, position: product.position || { x: 0, z: Math.round(maxZ) } }]); };
  const resetRow = () => { if (!selected) return; const maxZ = draft.filter((item) => item.productId !== selected.productId).reduce((max, item) => Math.max(max, item.position.z + footprint(item).depth + 1.4), 0); update(selected.productId, { position: { x: 0, z: Math.round(maxZ) }, rotation: 0 }); };

  return <div className="inventory-page">
    {error ? <div className="uniquem-alert" role="alert">{error}</div> : null}{notice ? <div className="uniquem-success">{notice}</div> : null}
    <header className="inventory-toolbar"><div><strong>{products.length} product rows</strong><span>QuickBooks snapshot · {products.reduce((sum, item) => sum + item.loadCount, 0)} physical loads</span></div><div className="uniquem-actions">
      <button className="secondary" type="button" onClick={() => setResetSignal((v) => v + 1)}><FiRefreshCw />Reset camera</button><button className="secondary" type="button" onClick={load} disabled={editing || loading}>Refresh data</button>
      {!editing ? <button type="button" onClick={begin}><FiEdit3 />Edit warehouse</button> : <><button className="secondary" type="button" onClick={() => setDraft(autoArrange(draft))}>Auto arrange</button><button className="secondary" type="button" onClick={cancel}><FiX />Cancel</button><button type="button" onClick={save} disabled={saving}><FiSave />{saving ? 'Saving…' : 'Save changes'}</button></>}
    </div></header>
    <div className="inventory-workspace">
      <section className="inventory-stage-panel"><div className="inventory-scene-tools"><input aria-label="Search 3D inventory" placeholder="Search products" value={query} onChange={(event) => setQuery(event.target.value)} /><span>Drag to orbit · Scroll to zoom{editing ? ' · Drag a product row to move' : ''}</span></div>{loading ? <div className="inventory-loading">Loading 3D inventory…</div> : <InventoryScene products={filtered} floor={data.floor} editing={editing} selectedId={selectedId} onSelect={setSelectedId} onMove={move} resetSignal={resetSignal} />}
        <div className="inventory-legend"><span><i className="tote" />1,000 L totes · max 3 high</span><span><i className="pallet" />Palletized bags/pails</span><span><i className="unknown" />Packaging needed</span></div>
      </section>
      <aside className="inventory-sidebar" aria-label="Inventory details">
        {selected ? <><header><div><small>Selected product</small><h2>{selected.item}</h2></div>{editing ? <button className="secondary" type="button" onClick={hideSelected}><FiEyeOff />Hide</button> : null}</header>
          <dl><div><dt>QuickBooks quantity</dt><dd>{selected.quantityOnHand} {selected.unitOfMeasure || ''}</dd></div><div><dt>3D loads</dt><dd>{selected.loadCount}</dd></div><div><dt>Packaging</dt><dd>{selected.packaging.resolved ? `${selected.packaging.capacity} ${selected.packaging.packageLabel} per ${selected.packaging.representation}` : 'Needs configuration'}</dd></div>{selected.partial ? <div><dt>Partial final load</dt><dd>{selected.finalLoadQuantity} {selected.packaging.packageLabel} · {selected.finalLoadPercent}%</dd></div> : null}<div><dt>Position</dt><dd>X {selected.position.x}, Z {selected.position.z} · {selected.rotation}°</dd></div></dl>
          {selected.packaging.warning ? <p className="inventory-warning">{selected.packaging.warning}</p> : null}
          {editing ? <div className="inventory-editor"><label>Color<input aria-label="Product color" type="color" value={selected.color} onChange={(event) => update(selected.productId, { color: event.target.value })} /></label><label>Representation<select value={selected.packaging.representation} onChange={(event) => setPackaging('representation', event.target.value)}><option value="tote">Tote</option><option value="pallet">Pallet</option></select></label><label>{selected.packaging.representation === 'tote' ? 'Litres per tote' : 'Units per pallet'}<input aria-label="Package capacity" type="number" min="0.01" step="0.01" value={selected.packaging.capacity || ''} onChange={(event) => setPackaging('capacity', event.target.value)} /></label><label>Package label<input value={selected.packaging.packageLabel || ''} onChange={(event) => setPackaging('packageLabel', event.target.value)} /></label><button className="secondary" type="button" onClick={rotate}><FiRotateCw />Rotate 90°</button><button className="secondary" type="button" onClick={resetRow}>Reset row</button></div> : null}
        </> : <div className="inventory-sidebar-empty"><strong>Select a product row</strong><span>View its quantity, packaging, partial load, color, and warehouse position.</span></div>}
      </aside>
    </div>
    <details className="inventory-hidden"><summary>{(editing ? hiddenDraft : data.hiddenProducts).length} products not shown in 3D</summary><div>{(editing ? hiddenDraft : data.hiddenProducts).map((item) => <article key={item.productId}><div><strong>{item.item}</strong><span>{item.hiddenReason}</span></div>{item.canShow ? <button className="secondary" type="button" disabled={!editing} onClick={() => showHidden(item)}><FiEye />Show</button> : null}</article>)}</div></details>
  </div>;
}
