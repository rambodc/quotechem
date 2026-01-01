import React from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { FiLock, FiMail, FiLogOut } from 'react-icons/fi';
import TopBar from '../components/TopBar';
import layoutStyles from '../styles/layout.module.css';
import { auth } from '../firebase';

export default function More() {
  const navigate = useNavigate();

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
    <div
      className={layoutStyles.pageShell}
      style={{
        maxWidth: 520,
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <TopBar
        variant="back"
        backLabel="Back"
        onBack={() => navigate(-1)}
      />

      <div
        style={{
          marginTop: 90,
          marginBottom: 40,
          width: '100%',
          background: '#fff',
          borderRadius: 18,
          boxShadow: '0 18px 40px rgba(15,23,42,0.12)',
          padding: 18,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          alignSelf: 'center',
        }}
      >
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
              textAlign: 'left',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
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
  );
}
