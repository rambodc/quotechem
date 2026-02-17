import React, { useState } from 'react';
import { postJson } from '../lib/api';
import './AdminConsole.css';

export default function Customers() {
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState('');
  const [timeline, setTimeline] = useState({});

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await postJson('adminListCustomers', { search, pageSize: 60 }, { authed: true });
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (err) {
      setError(err?.message || 'Failed to load customers.');
    } finally {
      setLoading(false);
    }
  };

  const toggleTimeline = async (email) => {
    if (expanded === email) {
      setExpanded('');
      return;
    }
    setExpanded(email);
    if (timeline[email]) return;
    try {
      const data = await postJson('adminGetCustomerTimeline', { email }, { authed: true });
      setTimeline((prev) => ({ ...prev, [email]: data.timeline || [] }));
    } catch (err) {
      setError(err?.message || 'Failed to load timeline.');
    }
  };

  return (
    <section className="admin-grid">
      <header className="admin-head">
        <div>
          <h1>Customers</h1>
          <p>Grouped by exact email with submission timelines.</p>
        </div>
      </header>

      <div className="filters">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by email..." />
        <button type="button" onClick={load}>Load Customers</button>
      </div>

      {error ? <p className="meta" style={{ color: '#991b1b' }}>{error}</p> : null}
      {loading ? <p className="meta">Loading...</p> : null}

      <div className="list">
        {items.map((customer) => (
          <article key={customer.email} className="row-card">
            <div className="admin-head" style={{ marginBottom: 6 }}>
              <div>
                <h3 style={{ margin: 0 }}>{customer.email}</h3>
                <p className="meta">{customer.companyName || customer.contactName || 'No profile details yet'}</p>
              </div>
              <button type="button" className="action-btn" onClick={() => toggleTimeline(customer.email)}>
                {expanded === customer.email ? 'Hide' : 'View Timeline'}
              </button>
            </div>
            <p className="meta">Submissions: {customer.submissions} • Latest: {customer.latestSubmissionAt || '-'}</p>

            {expanded === customer.email ? (
              <div className="list" style={{ marginTop: 10 }}>
                {(timeline[customer.email] || []).map((item) => (
                  <div key={item.rfqId} className="panel">
                    <p className="meta">RFQ: {item.rfqId}</p>
                    <p style={{ margin: '4px 0 0' }}><strong>{item.chemicalName || '-'}</strong></p>
                    <p className="meta">{item.quantity || '-'} • {item.deliveryLocation || '-'}</p>
                    <p className="meta">Email status: {item.emailStatus || '-'}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
