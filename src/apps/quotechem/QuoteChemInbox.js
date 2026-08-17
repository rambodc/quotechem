import React, { useCallback, useEffect, useState } from 'react';
import { FiArrowLeft, FiDownload, FiFileText, FiMessageSquare, FiRefreshCw, FiSearch } from 'react-icons/fi';
import { postJson } from '../../lib/api';
import './QuoteChemInbox.css';

const STAGES = [
  ['received', 'Request Received'], ['technical_review', 'Technical Review'], ['supplier_sourcing', 'Supplier Sourcing'],
  ['options_preparing', 'Options Being Prepared'], ['follow_up', 'QuoteChem Follow-Up'],
];
const stageLabel = (value) => STAGES.find(([id]) => id === value)?.[1] || 'Request Received';
const shownDate = (value) => value ? new Date(value).toLocaleString() : '—';

export default function QuoteChemInbox() {
  const [items, setItems] = useState([]); const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState(''); const [status, setStatus] = useState(''); const [stage, setStage] = useState(''); const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const load = useCallback(async (append = false, pageCursor = '') => {
    setLoading(true); setError('');
    try { const result = await postJson('quotechemListRequests', { query, status, stage, cursor: pageCursor }, { authed: true }); setItems((current) => append ? [...current, ...(result.items || [])] : (result.items || [])); setCursor(result.nextCursor || null); }
    catch (reason) { setError(reason.message || 'Unable to load requests.'); } finally { setLoading(false); }
  }, [query, status, stage]);
  useEffect(() => { const timer = window.setTimeout(() => load(false, ''), 250); return () => window.clearTimeout(timer); }, [load]);
  const open = async (conversationId) => {
    setLoading(true); setError('');
    try { setSelected(await postJson('quotechemGetRequest', { conversationId }, { authed: true })); }
    catch (reason) { setError(reason.message || 'Unable to open request.'); } finally { setLoading(false); }
  };
  const updateStage = async (sourcingStage) => {
    const conversationId = selected.conversation.conversationId;
    await postJson('quotechemUpdateStage', { conversationId, sourcingStage }, { authed: true });
    setSelected((current) => ({ ...current, conversation: { ...current.conversation, sourcingStage } }));
    setItems((current) => current.map((item) => item.conversationId === conversationId ? { ...item, sourcingStage } : item));
  };
  const openAttachment = async (messageId) => {
    try { const result = await postJson('quotechemGetAttachment', { conversationId: selected.conversation.conversationId, messageId }, { authed: true }); window.open(result.url, '_blank', 'noopener,noreferrer'); }
    catch (reason) { setError(reason.message || 'Unable to open attachment.'); }
  };

  if (selected) {
    const { conversation, messages } = selected;
    return <section className="qci-page qci-detail">
      <button className="qci-back" type="button" onClick={() => setSelected(null)}><FiArrowLeft /> Back to inbox</button>
      <header><div><p>{conversation.requestId || 'Unfinished conversation'}</p><h1>{conversation.contact?.company || conversation.guidedContext?.needLabel || 'Open sourcing inquiry'}</h1><span>{conversation.contact?.name || 'Anonymous visitor'} · {shownDate(conversation.updatedAt)}</span></div><label>Sourcing stage<select value={conversation.sourcingStage || 'received'} disabled={conversation.status !== 'submitted'} onChange={(event) => updateStage(event.target.value)}>{STAGES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label></header>
      <div className="qci-summary">
        <article><small>Status</small><strong>{conversation.status === 'submitted' ? 'Submitted request' : 'Unfinished conversation'}</strong></article>
        <article><small>Need</small><strong>{conversation.guidedContext?.needLabel || 'Open requirement'}</strong></article>
        <article><small>Area / issue</small><strong>{[conversation.guidedContext?.areaLabel, conversation.guidedContext?.issueLabel].filter(Boolean).join(' · ') || 'Not selected'}</strong></article>
        <article><small>Contact</small><strong>{conversation.contact?.email || 'Not provided'}</strong><span>{conversation.contact?.phone || ''} {conversation.contact?.country || ''}</span></article>
      </div>
      <div className="qci-thread">{messages.map((message) => <article key={message.messageId} className={message.role}>
        <small>{message.role === 'assistant' ? 'QuoteChem AI' : 'Visitor'} · {shownDate(message.createdAt)}</small>
        <p>{message.text}</p>
        {message.attachment ? <button type="button" onClick={() => openAttachment(message.messageId)}><FiDownload /> {message.attachment.name || 'Open attachment'} <span>{message.attachment.kind === 'pdf' ? 'PDF' : 'Image'}</span></button> : null}
        {message.response?.attachmentSummary ? <aside><FiFileText /> {message.response.attachmentSummary}</aside> : null}
      </article>)}</div>
    </section>;
  }

  return <section className="qci-page">
    <header><div><p>QuoteChem sourcing</p><h1>Requests and conversations</h1><span>Review public inquiries and move submitted requests through sourcing.</span></div><button type="button" onClick={() => load(false, '')}><FiRefreshCw /> Refresh</button></header>
    <div className="qci-filters"><label><FiSearch /><input aria-label="Search requests" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search request, company, email, need…" /></label><select aria-label="Filter submission status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All conversations</option><option value="submitted">Submitted requests</option><option value="active">Active conversations</option><option value="ready">Ready for contact</option></select><select aria-label="Filter sourcing stage" value={stage} onChange={(event) => setStage(event.target.value)}><option value="">All sourcing stages</option>{STAGES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></div>
    {error ? <p className="qci-error">{error}</p> : null}
    <div className="qci-list">{items.map((item) => <button type="button" key={item.conversationId} onClick={() => open(item.conversationId)}><span className={`qci-status ${item.status}`}>{item.status === 'submitted' ? item.requestId : 'Conversation'}</span><strong>{item.contact?.company || item.guidedContext?.needLabel || 'Open inquiry'}</strong><small>{item.contact?.name || item.contact?.email || 'Anonymous visitor'}</small><em>{item.status === 'submitted' ? stageLabel(item.sourcingStage) : 'Not submitted'} · {shownDate(item.updatedAt)}</em></button>)}</div>
    {!loading && !items.length ? <div className="qci-empty"><FiMessageSquare /><strong>No matching inquiries</strong><span>New public conversations will appear here.</span></div> : null}
    {loading ? <p className="qci-loading">Loading QuoteChem inquiries…</p> : null}
    {!loading && cursor ? <button className="qci-more" type="button" onClick={() => load(true, cursor)}>Load more conversations</button> : null}
  </section>;
}
