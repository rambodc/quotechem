import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { FiBarChart2, FiClipboard, FiUsers, FiUser, FiLogOut, FiHome } from 'react-icons/fi';
import { auth } from '../firebase';
import './PortalLayout.css';

const ADMIN_LINKS = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: FiBarChart2 },
  { to: '/admin/leads', label: 'Leads', icon: FiClipboard },
  { to: '/admin/customers', label: 'Customers', icon: FiUsers },
  { to: '/admin/account', label: 'Account', icon: FiUser },
];

const USER_LINKS = [
  { to: '/user/home', label: 'Home', icon: FiHome },
  { to: '/user/account', label: 'Account', icon: FiUser },
];

export default function PortalLayout({ user, role, children }) {
  const navigate = useNavigate();
  const links = role === 'admin' ? ADMIN_LINKS : USER_LINKS;

  const onLogout = async () => {
    await signOut(auth);
    navigate('/', { replace: true });
  };

  return (
    <div className="portal-shell">
      <aside className="portal-sidebar">
        <div className="portal-brand">
          <img src={`${process.env.PUBLIC_URL}/assets/QuoteChem Logo 200.png`} alt="QuoteChem" />
          <div>
            <strong>QuoteChem</strong>
            <span>{role === 'admin' ? 'Admin Console' : 'User Portal'}</span>
          </div>
        </div>

        <nav className="portal-nav" aria-label="Primary">
          {links.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) => `portal-link ${isActive ? 'active' : ''}`}>
              <Icon size={17} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <button type="button" className="portal-logout" onClick={onLogout}>
          <FiLogOut size={16} />
          <span>Logout</span>
        </button>
      </aside>

      <div className="portal-main-wrap">
        <header className="portal-topbar">
          <div>
            <strong>{role === 'admin' ? 'Admin' : 'User'} Workspace</strong>
            <p>{user?.email || 'Authenticated user'}</p>
          </div>
          <button type="button" className="portal-logout mobile" onClick={onLogout}>
            <FiLogOut size={15} />
            <span>Logout</span>
          </button>
        </header>

        <main className="portal-content">{children}</main>

        <nav className="portal-mobile-nav" aria-label="Mobile Navigation" style={{ '--mobile-cols': links.length }}>
          {links.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) => `portal-mobile-link ${isActive ? 'active' : ''}`}>
              <Icon size={16} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
