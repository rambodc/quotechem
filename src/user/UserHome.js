import React, { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserContext } from '../App';
import '../admin/AdminConsole.css';

export default function UserHome() {
  const navigate = useNavigate();
  const appUser = useContext(UserContext);

  return (
    <section className="admin-grid">
      <header className="admin-head">
        <div>
          <h1>User Home</h1>
          <p>Welcome back. Manage your profile and account settings.</p>
        </div>
      </header>

      <article className="panel">
        <h2 style={{ marginTop: 0 }}>Profile</h2>
        <p className="meta">Email: {appUser?.email || '—'}</p>
      </article>

      <article className="panel">
        <h2 style={{ marginTop: 0 }}>Quick Actions</h2>
        <div className="btn-row">
          <button type="button" className="primary-btn" onClick={() => navigate('/user/account')}>Account Settings</button>
          <button type="button" className="ghost-btn" onClick={() => navigate('/')}>Go to Quote Page</button>
        </div>
      </article>
    </section>
  );
}
