import React, { useContext } from 'react';
import TopBar from '../components/TopBar';
import layoutStyles from '../styles/layout.module.css';
import { UserContext } from '../App';
import { FiUser, FiMail, FiHash } from 'react-icons/fi';

export default function Profile() {
  const appUser = useContext(UserContext);

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
          gap: 16,
        }}
      >
        <div
          style={{
            background: '#fff',
            borderRadius: 18,
            padding: 18,
            boxShadow: '0 18px 40px rgba(15,23,42,0.12)',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 54,
                height: 54,
                borderRadius: 16,
                background: '#e0f2fe',
                display: 'grid',
                placeItems: 'center',
                color: '#0369a1',
              }}
            >
              <FiUser size={22} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <strong style={{ fontSize: 18 }}>
                {`${appUser?.firstName || ''} ${appUser?.lastName || ''}`.trim() || 'Unnamed User'}
              </strong>
              <span style={{ color: '#475569', fontSize: 14 }}>{appUser?.email || 'No email'}</span>
            </div>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'auto 1fr',
              gap: 10,
              alignItems: 'center',
              color: '#475569',
              fontSize: 14,
              wordBreak: 'break-all',
            }}
          >
            <FiMail />
            <span>{appUser?.email || 'No email'}</span>
            <FiHash />
            <span>{appUser?.id || 'No UID'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
