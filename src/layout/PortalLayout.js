import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { FiGrid, FiLogOut, FiUser } from 'react-icons/fi';
import { auth } from '../firebase';
import './PortalLayout.css';

export default function PortalLayout({ user, app, children }) {
  const navigate = useNavigate();
  const navItems = app?.navItems || [];

  const onLogout = async () => {
    await signOut(auth);
    navigate('/', { replace: true });
  };

  return (
    <div className="portal-shell">
      <header className="portal-topbar">
        <button type="button" className="portal-brand" onClick={() => navigate('/portal')}>
          <img src={`${process.env.PUBLIC_URL}/assets/QuoteChem Logo 200.png`} alt="" />
          <div>
            <strong>QuoteChem</strong>
            <span>{app?.label || 'Platform'}</span>
          </div>
        </button>

        <div className="portal-actions">
          <button type="button" className="portal-icon-btn" onClick={() => navigate('/portal')} aria-label="Apps">
            <FiGrid size={17} />
            <span>Apps</span>
          </button>
          <button type="button" className="portal-icon-btn" onClick={() => navigate('/apps/account')} aria-label="Account">
            <FiUser size={17} />
            <span>{user?.email || 'Account'}</span>
          </button>
          <button type="button" className="portal-logout" onClick={onLogout}>
            <FiLogOut size={16} />
            <span>Logout</span>
          </button>
        </div>
      </header>

      {navItems.length > 0 ? (
        <nav className="portal-app-nav" aria-label={`${app.label} navigation`}>
          {navItems.map((item) => (
            <NavLink key={item.path} to={item.path} end className={({ isActive }) => `portal-app-link ${isActive ? 'active' : ''}`}>
              {item.label}
            </NavLink>
          ))}
        </nav>
      ) : null}

      <main className="portal-content">{children}</main>
    </div>
  );
}
