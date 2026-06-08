import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { postJson } from '../lib/api';
import './AdminConsole.css';

const TABS = [
  { id: 'new', label: 'New' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'completed', label: 'Completed' },
];

export default function Leads() {
  const [tab, setTab] = useState('new');
  const [search, setSearch] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [selectedDetail, setSelectedDetail] = useState(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await postJson('adminListLeads', { stage: tab, search, pageSize: 50 }, { authed: true });
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (err) {
      setError(err?.message || 'Failed to load leads.');
    } finally {
      setLoading(false);
    }
  }, [search, tab]);

  useEffect(() => {
    load();
  }, [load]);

  const openDetail = async (sessionId) => {
    setSelected(sessionId);
    setSelectedDetail(null);
    setNote('');
    try {
      const data = await postJson('adminGetLeadDetail', { sessionId }, { authed: true });
      setSelectedDetail(data.lead || null);
      setNote(data?.lead?.internalNotes || '');
    } catch (err) {
      setError(err?.message || 'Failed to load lead detail.');
    }
  };

  const closeDetail = () => {
    setSelected(null);
    setSelectedDetail(null);
    setNote('');
  };

  const updateLead = async (patch) => {
    if (!selected) return;
    setSaving(true);
    try {
      await postJson('adminUpdateLead', { sessionId: selected, ...patch }, { authed: true });
      await openDetail(selected);
      await load();
    } catch (err) {
      setError(err?.message || 'Failed to update lead.');
    } finally {
      setSaving(false);
    }
  };

  const saveNote = async () => {
    if (!selected || !note.trim()) return;
    setSaving(true);
    try {
      await postJson('adminAddLeadNote', { sessionId: selected, note: note.trim() }, { authed: true });
      await openDetail(selected);
      await load();
    } catch (err) {
      setError(err?.message || 'Failed to add note.');
    } finally {
      setSaving(false);
    }
  };

  const transcriptPreview = useMemo(() => (selectedDetail?.messages || []).slice(-20), [selectedDetail]);

  return (
    <section className="admin-grid">
      <header className="admin-head">
        <div>
          <h1>Leads</h1>
          <p>Track new, in-progress, and completed submissions.</p>
        </div>
      </header>

      <div className="filters">
        {TABS.map((item) => (
          <button key={item.id} type="button" className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)}>
            {item.label}
          </button>
        ))}
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search lead..." />
        <button type="button" onClick={load}>Refresh</button>
      </div>

      {error ? <p className="meta" style={{ color: '#991b1b' }}>{error}</p> : null}

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Session</th>
              <th>Chemical</th>
              <th>Quantity</th>
              <th>Delivery</th>
              <th>Email</th>
              <th>Status</th>
              <th>Updated</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.sessionId}>
                <td>{item.sessionId}</td>
                <td>{item.chemicalName || '-'}</td>
                <td>{item.quantity || '-'}</td>
                <td>{item.deliveryLocation || '-'}</td>
                <td>{item.email || '-'}</td>
                <td><span className="badge">{item.leadStage}</span></td>
                <td>{item.updatedAt || '-'}</td>
                <td><button type="button" className="action-btn" onClick={() => openDetail(item.sessionId)}>View</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {loading ? <p className="meta">Loading...</p> : null}

      {selected ? (
        <aside className="drawer">
          <div className="drawer-header">
            <h2 style={{ margin: 0 }}>Lead Detail</h2>
            <button type="button" className="ghost-btn" onClick={closeDetail}>Close</button>
          </div>

          {selectedDetail ? (
            <>
              <div className="kv" style={{ marginTop: 10 }}>
                <p><span>Session:</span> {selectedDetail.sessionId}</p>
                <p><span>Chemical:</span> {selectedDetail.chemicalName || '-'}</p>
                <p><span>Email:</span> {selectedDetail.email || '-'}</p>
                <p><span>Email Send:</span> {selectedDetail?.emailSend?.status || selectedDetail.emailStatus || '-'}</p>
                <p><span>Assigned:</span> {selectedDetail.assignedTo || '-'}</p>
                <p><span>Priority:</span> {selectedDetail.priority || '-'}</p>
              </div>

              <div className="btn-row" style={{ marginTop: 10 }}>
                <button type="button" className="primary-btn" disabled={saving} onClick={() => updateLead({ leadStage: 'in_progress' })}>Mark In Progress</button>
                <button type="button" className="primary-btn" disabled={saving} onClick={() => updateLead({ leadStage: 'completed' })}>Mark Completed</button>
                <button type="button" className="ghost-btn" disabled={saving} onClick={() => updateLead({ priority: 'high' })}>Priority High</button>
              </div>

              <article className="panel" style={{ marginTop: 12 }}>
                <h3 style={{ marginTop: 0 }}>Internal Notes</h3>
                <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add internal note..." />
                <div className="btn-row" style={{ marginTop: 8 }}>
                  <button type="button" className="primary-btn" disabled={saving || !note.trim()} onClick={saveNote}>Save Note</button>
                  <button type="button" className="ghost-btn" disabled={saving} onClick={() => updateLead({ internalNotes: note })}>Update Latest Note</button>
                </div>
              </article>

              <article className="panel" style={{ marginTop: 12 }}>
                <h3 style={{ marginTop: 0 }}>Transcript Preview</h3>
                <div className="list">
                  {transcriptPreview.map((msg) => (
                    <div key={msg.id} className="row-card">
                      <p style={{ margin: 0, fontWeight: 700 }}>{msg.role}</p>
                      <p style={{ margin: '4px 0 0' }}>{msg.content}</p>
                    </div>
                  ))}
                </div>
              </article>
            </>
          ) : (
            <p className="meta">Loading detail...</p>
          )}
        </aside>
      ) : null}
    </section>
  );
}
