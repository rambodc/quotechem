import React, { useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { FiHome, FiMenu, FiMoreHorizontal, FiX } from 'react-icons/fi';
import './AppShell.css';

const navItems = [
  { label: 'Home', to: '/home', icon: FiHome },
  { label: 'More', to: '/more', icon: FiMoreHorizontal },
];

function NavLinks({ onNavigate }) {
  return (
    <nav className="app-nav" aria-label="Primary">
      {navItems.map(({ label, to, icon: Icon }) => (
        <NavLink
          key={label}
          to={to}
          onClick={onNavigate}
          className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
        >
          <Icon size={18} />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

export default function AppShell({ user }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();

  const initials = useMemo(() => {
    const full = `${user?.firstName || ''} ${user?.lastName || ''}`.trim();
    if (!full) return (user?.username || 'QC').slice(0, 2).toUpperCase();
    return full
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('');
  }, [user?.firstName, user?.lastName, user?.username]);

  React.useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="brand-block">
          <img
            src={`${process.env.PUBLIC_URL}/assets/quotechem-logo.png`}
            alt="QuoteChem"
            className="brand-logo"
          />
          <div className="brand-meta">
            <h1>QuoteChem</h1>
            <p>Assistant Workspace</p>
          </div>
        </div>

        <NavLinks />

        <div className="sidebar-user">
          <div className="avatar">{initials}</div>
          <div className="user-meta">
            <strong>{user?.username || 'guest'}</strong>
            <span>{user?.email || 'Public session'}</span>
          </div>
        </div>
      </aside>

      <header className="mobile-topbar">
        <button
          type="button"
          className="mobile-icon-btn"
          aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
          onClick={() => setMobileMenuOpen((prev) => !prev)}
        >
          {mobileMenuOpen ? <FiX size={20} /> : <FiMenu size={20} />}
        </button>

        <img
          src={`${process.env.PUBLIC_URL}/assets/quotechem-logo.png`}
          alt="QuoteChem"
          className="mobile-logo"
        />

        <div className="mobile-avatar" aria-hidden>
          {initials}
        </div>
      </header>

      {mobileMenuOpen ? (
        <div className="mobile-drawer" role="dialog" aria-label="Navigation menu">
          <NavLinks onNavigate={() => setMobileMenuOpen(false)} />
        </div>
      ) : null}

      <main className="app-content">
        <Outlet />
      </main>
    </div>
  );
}
