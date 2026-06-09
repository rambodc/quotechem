import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { postJson } from '../lib/api';
import { ACCESS_MANAGED_MINI_APPS, defaultMiniAppIdsForRole } from '../apps/miniApps';
import './UserAccess.css';

function normalizeEnabled(value, role) {
  return Array.isArray(value) ? value : defaultMiniAppIdsForRole(role).filter((id) => ACCESS_MANAGED_MINI_APPS.some((app) => app.id === id));
}

function MiniAppToggle({ app, checked, onChange }) {
  const Icon = app.icon;
  return (
    <button
      type="button"
      className={`access-app-toggle ${checked ? 'enabled' : ''}`}
      onClick={() => onChange(app.id)}
      aria-pressed={checked}
    >
      <span className={`access-app-icon ${app.id}`}>
        <Icon size={22} aria-hidden />
      </span>
      <span>{app.label}</span>
    </button>
  );
}

export default function UserAccess() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingUid, setSavingUid] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [createForm, setCreateForm] = useState({
    email: '',
    password: '',
    role: 'user',
    enabledMiniApps: defaultMiniAppIdsForRole('user').filter((id) => ACCESS_MANAGED_MINI_APPS.some((app) => app.id === id)),
  });

  const managedAppIds = useMemo(() => ACCESS_MANAGED_MINI_APPS.map((app) => app.id), []);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await postJson('adminListUsers', {}, { authed: true });
      setUsers(Array.isArray(data.items) ? data.items : []);
    } catch (err) {
      setError(err?.message || 'Failed to load users.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const toggleCreateApp = (appId) => {
    setCreateForm((prev) => {
      const current = normalizeEnabled(prev.enabledMiniApps, prev.role);
      return {
        ...prev,
        enabledMiniApps: current.includes(appId) ? current.filter((id) => id !== appId) : [...current, appId],
      };
    });
  };

  const createUser = async (event) => {
    event.preventDefault();
    setError('');
    setStatus('');
    setSavingUid('new');
    try {
      await postJson(
        'adminCreateUser',
        {
          email: createForm.email,
          password: createForm.password,
          role: createForm.role,
          enabledMiniApps: createForm.enabledMiniApps.filter((id) => managedAppIds.includes(id)),
        },
        { authed: true }
      );
      setCreateForm({
        email: '',
        password: '',
        role: 'user',
        enabledMiniApps: defaultMiniAppIdsForRole('user').filter((id) => managedAppIds.includes(id)),
      });
      setStatus('User created.');
      await loadUsers();
    } catch (err) {
      setError(err?.message || 'Failed to create user.');
    } finally {
      setSavingUid('');
    }
  };

  const updateUserDraft = (uid, patch) => {
    setUsers((prev) => prev.map((user) => (user.uid === uid ? { ...user, ...patch } : user)));
  };

  const toggleUserApp = (uid, appId) => {
    setUsers((prev) =>
      prev.map((user) => {
        if (user.uid !== uid) return user;
        const current = normalizeEnabled(user.enabledMiniApps, user.role);
        const enabledMiniApps = current.includes(appId) ? current.filter((id) => id !== appId) : [...current, appId];
        return { ...user, enabledMiniApps };
      })
    );
  };

  const saveUser = async (user) => {
    setError('');
    setStatus('');
    setSavingUid(user.uid);
    try {
      await postJson(
        'adminUpdateUserAccess',
        {
          uid: user.uid,
          role: user.role,
          enabledMiniApps: normalizeEnabled(user.enabledMiniApps, user.role).filter((id) => managedAppIds.includes(id)),
        },
        { authed: true }
      );
      setStatus(`Updated ${user.email}.`);
      await loadUsers();
    } catch (err) {
      setError(err?.message || 'Failed to update access.');
    } finally {
      setSavingUid('');
    }
  };

  return (
    <section className="user-access-page">
      <header className="admin-head">
        <div>
          <h1>User Access</h1>
          <p>Create users and control which mini apps appear in their launcher.</p>
        </div>
      </header>

      {error ? <p className="access-message error">{error}</p> : null}
      {status ? <p className="access-message success">{status}</p> : null}

      <form className="access-panel" onSubmit={createUser}>
        <h2>Create user</h2>
        <div className="access-form-grid">
          <label>
            <span>Email</span>
            <input type="email" required value={createForm.email} onChange={(event) => setCreateForm((prev) => ({ ...prev, email: event.target.value }))} />
          </label>
          <label>
            <span>Temporary password</span>
            <input type="password" required minLength={8} value={createForm.password} onChange={(event) => setCreateForm((prev) => ({ ...prev, password: event.target.value }))} />
          </label>
          <label>
            <span>Role</span>
            <select value={createForm.role} onChange={(event) => setCreateForm((prev) => ({ ...prev, role: event.target.value }))}>
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </label>
        </div>

        <div className="access-toggle-grid" aria-label="Initial mini app access">
          {ACCESS_MANAGED_MINI_APPS.map((app) => (
            <MiniAppToggle key={app.id} app={app} checked={normalizeEnabled(createForm.enabledMiniApps, createForm.role).includes(app.id)} onChange={toggleCreateApp} />
          ))}
        </div>

        <button type="submit" className="primary-btn" disabled={savingUid === 'new'}>
          {savingUid === 'new' ? 'Creating...' : 'Create user'}
        </button>
      </form>

      <section className="access-panel">
        <div className="access-section-head">
          <h2>Existing users</h2>
          <button type="button" className="ghost-btn" onClick={loadUsers} disabled={loading}>
            Refresh
          </button>
        </div>

        <div className="access-user-list">
          {users.map((user) => (
            <article key={user.uid} className="access-user-card">
              <div>
                <h3>{user.email || user.uid}</h3>
                <p>{user.uid}</p>
              </div>

              <label className="access-role-select">
                <span>Role</span>
                <select value={user.role || 'user'} onChange={(event) => updateUserDraft(user.uid, { role: event.target.value })}>
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </label>

              <div className="access-toggle-grid">
                {ACCESS_MANAGED_MINI_APPS.map((app) => (
                  <MiniAppToggle key={app.id} app={app} checked={normalizeEnabled(user.enabledMiniApps, user.role).includes(app.id)} onChange={() => toggleUserApp(user.uid, app.id)} />
                ))}
              </div>

              <button type="button" className="primary-btn" onClick={() => saveUser(user)} disabled={savingUid === user.uid}>
                {savingUid === user.uid ? 'Saving...' : 'Save access'}
              </button>
            </article>
          ))}
          {!loading && users.length === 0 ? <p className="meta">No users found.</p> : null}
          {loading ? <p className="meta">Loading users...</p> : null}
        </div>
      </section>
    </section>
  );
}
