import React, { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { FiLock, FiMail, FiLogOut, FiUser, FiHash } from 'react-icons/fi';
import TopBar from '../components/TopBar';
import layoutStyles from '../styles/layout.module.css';
import { auth } from '../firebase';
import { UserContext } from '../App';

export default function More() {
  const navigate = useNavigate();
  const appUser = useContext(UserContext);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/signin', { replace: true });
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  const items = [
    { label: 'Change Password', icon: <FiLock />, onClick: () => {} },
    { label: 'Change Email', icon: <FiMail />, onClick: () => {} },
  ];

  return (
    <div className={layoutStyles.pageShell} style={{ minHeight: '100vh' }}>
      <TopBar
        variant="back"
        backLabel="Back"
        onBack={() => navigate(-1)}
      />

      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '100px 16px 40px',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 420,
            background: '#fff',
            borderRadius: 18,
            boxShadow: '0 18px 40px rgba(15,23,42,0.12)',
            padding: 18,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <div
            style={{
              padding: '14px 16px',
              borderRadius: 14,
              border: '1px solid #e2e8f0',
              background: 'linear-gradient(135deg, #f8fafc, #ffffff)',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              boxShadow: '0 12px 28px rgba(15,23,42,0.08)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 12,
                  background: '#e0f2fe',
                  display: 'grid',
                  placeItems: 'center',
                  color: '#0369a1',
                  fontSize: 18,
                  fontWeight: 700,
                }}
              >
                <FiUser />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontWeight: 700, color: '#0f172a' }}>
                  {`${appUser?.firstName || ''} ${appUser?.lastName || ''}`.trim() || 'Unnamed User'}
                </span>
                <span style={{ color: '#475569', fontSize: 13 }}>{appUser?.email || 'No email'}</span>
              </div>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'auto 1fr',
                alignItems: 'center',
                gap: 8,
                paddingTop: 4,
                color: '#475569',
                fontSize: 13,
                wordBreak: 'break-all',
              }}
            >
              <FiHash />
              <span>{appUser?.id || 'No UID'}</span>
            </div>
          </div>

          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={item.onClick}
              style={{
                width: '100%',
                padding: '14px 16px',
                borderRadius: 12,
                border: '1px solid #e2e8f0',
                background: '#f8fafc',
                textAlign: 'center',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                justifyContent: 'center',
              }}
            >
              <span style={{ fontSize: 18, color: '#475569' }}>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}

          <button
            type="button"
            onClick={handleLogout}
            style={{
              width: '100%',
              padding: '14px 16px',
              borderRadius: 12,
              border: 'none',
              background: 'linear-gradient(120deg, #ef4444, #dc2626)',
              color: '#fff',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 12px 30px rgba(239,68,68,0.35)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              justifyContent: 'center',
            }}
          >
            <FiLogOut />
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}
