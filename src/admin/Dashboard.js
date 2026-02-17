import React, { useEffect, useState } from 'react';
import { postJson } from '../lib/api';
import './AdminConsole.css';

export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const data = await postJson('adminDashboardSummary', {}, { authed: true });
        if (!active) return;
        setSummary(data.summary || null);
      } catch (err) {
        if (!active) return;
        setError(err?.message || 'Failed to load dashboard.');
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  const kpi = [
    { label: 'New Leads', value: summary?.newLeads || 0 },
    { label: 'In Progress', value: summary?.inProgressLeads || 0 },
    { label: 'Completed', value: summary?.completedLeads || 0 },
    { label: 'Unique Customers', value: summary?.uniqueCustomers || 0 },
  ];

  return (
    <section className="admin-grid">
      <header className="admin-head">
        <div>
          <h1>Dashboard</h1>
          <p>Operational overview for leads and customers.</p>
        </div>
      </header>

      {error ? <p className="meta" style={{ color: '#991b1b' }}>{error}</p> : null}

      <div className="kpi-grid">
        {kpi.map((item) => (
          <article key={item.label} className="kpi-card">
            <p className="meta">{item.label}</p>
            <strong>{loading ? '...' : item.value}</strong>
          </article>
        ))}
      </div>

      <article className="panel">
        <h2 style={{ margin: 0 }}>Recent Activity</h2>
        <div className="list" style={{ marginTop: 10 }}>
          {(summary?.recentActivity || []).map((item) => (
            <div key={item.sessionId} className="row-card">
              <h3>{item.chemicalName || 'Untitled request'}</h3>
              <p className="meta">{item.email || 'no-email'} • {item.deliveryLocation || 'no-location'}</p>
              <p className="meta">Stage: {item.leadStage} • Updated: {item.updatedAt || '-'}</p>
            </div>
          ))}
          {!loading && (!summary?.recentActivity || summary.recentActivity.length === 0) ? <p className="meta">No activity yet.</p> : null}
        </div>
      </article>
    </section>
  );
}
