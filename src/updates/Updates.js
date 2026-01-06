import React from 'react';
import TopBar from '../components/TopBar';
import layoutStyles from '../styles/layout.module.css';

const updates = [
  { id: 1, title: 'Show access control', detail: 'Platform admins can add show members by email and manage jobs.', time: 'Today' },
  { id: 2, title: 'Jobs module', detail: 'Create and view jobs within shows with status tags.', time: 'Yesterday' },
  { id: 3, title: 'Profile page', detail: 'See your name, email, and UID.', time: 'This week' },
];

export default function Updates() {
  return (
    <div className={layoutStyles.pageShell} style={{ minHeight: '100vh' }}>
      <TopBar variant="back" backLabel="Back" onBack={() => window.history.back()} />

      <div
        style={{
          maxWidth: 520,
          margin: '90px auto 60px',
          padding: '0 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {updates.map((item) => (
          <div
            key={item.id}
            style={{
              background: '#fff',
              borderRadius: 16,
              padding: 16,
              boxShadow: '0 12px 30px rgba(15,23,42,0.08)',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ fontSize: 16 }}>{item.title}</strong>
              <span style={{ color: '#94a3b8', fontSize: 12 }}>{item.time}</span>
            </div>
            <p style={{ margin: 0, color: '#475569', fontSize: 14 }}>{item.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
