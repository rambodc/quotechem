import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import './AdminLayout.css';

export default function AdminLayout({ user, children }) {
  const navigate = useNavigate();

  const onLogout = async () => {
    await signOut(auth);
    navigate('/', { replace: true });
  };

  return (
    <div className="admin-shell">
      <header className="admin-topbar">
        <div className="admin-brand">
          <img src={`${process.env.PUBLIC_URL}/assets/quotechem-logo.png`} alt="QuoteChem" />
          <div>
            <strong>QuoteChem Admin</strong>
            <span>{user?.email || 'Authenticated user'}</span>
          </div>
        </div>

        <nav className="admin-nav" aria-label="Admin">
          <NavLink to="/more" className={({ isActive }) => `admin-link ${isActive ? 'active' : ''}`}>
            More
          </NavLink>
          <NavLink to="/account" className={({ isActive }) => `admin-link ${isActive ? 'active' : ''}`}>
            Account
          </NavLink>
          <button type="button" className="admin-logout" onClick={onLogout}>
            Logout
          </button>
        </nav>
      </header>

      <main className="admin-content">{children}</main>
    </div>
  );
}
