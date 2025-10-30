// src/components/MobileNavTabs.js
import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FiHome, FiDroplet, FiUsers, FiBook, FiMoreHorizontal } from 'react-icons/fi';

export default function MobileNavTabs() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const tabs = [
    { label: 'Home', to: '/home', icon: FiHome },
    { label: 'Artists', to: '/artists', icon: FiUsers },
    { label: 'My Drops', to: '/drops', icon: FiDroplet },
    { label: 'Albums', to: '/albums', icon: FiBook },
    { label: 'More', to: '/more', icon: FiMoreHorizontal },
  ];

  const isActive = (to) => {
    if (to === '/home') return pathname === '/home';
    return pathname.startsWith(to);
  };

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        background: 'rgba(255,255,255,0.96)',
        padding: '2px 10px 2px',
        borderRadius: 18,
        boxShadow: '0 16px 32px rgba(15,23,42,0.1)',
      }}
    >
      {tabs.map(({ label, to, icon: Icon }) => {
        const active = isActive(to);
        const accent = '#0ea5e9';
        const inactiveText = '#475569';
        const inactiveIcon = '#94a3b8';
        const textColor = active ? accent : inactiveText;
        const iconColor = active ? accent : inactiveIcon;

        return (
          <button
            key={label}
            onClick={() => navigate(to)}
            aria-current={active ? 'page' : undefined}
            style={{
              display: 'inline-flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 3,
              minWidth: 64,
              padding: '4px 4px 6px',
              background: 'transparent',
              border: 'none',
              color: textColor,
              fontSize: 10.5,
              fontWeight: active ? 600 : 500,
              letterSpacing: 0.15,
              cursor: 'pointer',
              transition: 'color 160ms ease, transform 160ms ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'none';
            }}
          >
            <Icon size={14} color={iconColor} />
            <span style={{ fontSize: 10.5, lineHeight: 1.15 }}>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
