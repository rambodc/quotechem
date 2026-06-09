import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FiEdit2, FiPlus, FiX } from 'react-icons/fi';
import { postJson } from '../lib/api';
import { ACCESS_MANAGED_MINI_APPS, defaultMiniAppIdsForRole } from '../apps/miniApps';
import './UserAccess.css';

function managedDefaults(role) {
  return defaultMiniAppIdsForRole(role).filter((id) => ACCESS_MANAGED_MINI_APPS.some((app) => app.id === id));
}

function normalizeEnabled(value, role) {
  return Array.isArray(value) ? value : managedDefaults(role);
}

function buildEmptyDraft() {
  return {
    uid: '',
    email: '',
    password: '',
    role: 'user',
    enabledMiniApps: managedDefaults('user'),
  };
}

function MiniAppToggle({ app, checked, onChange }) {
  const Icon = app.icon;
  return (
    <button type="button" className={`access-app-toggle ${checked ? 'enabled' : ''}`} onClick={() => onChange(app.id)} aria-pressed={checked}>
      <span className={`access-app-icon ${app.id}`}>
        <Icon size={24} aria-hidden />
      </span>
      <span>{app.label}</span>
    </button>
  );
}

export default function UserAccess() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [drawerMode, setDrawerMode] = useState('');
  const [draft, setDraft] = useState(buildEmptyDraft);
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

  const openCreate = () => {
    setError('');
    setStatus('');
    setDraft(buildEmptyDraft());
    setDrawerMode('create');
  };

  const openEdit = (user) => {
    setError('');
    setStatus('');
    setDraft({
      uid: user.uid,
      email: user.email || '',
      password: '',
      role: user.role || 'user',
      enabledMiniApps: normalizeEnabled(user.enabledMiniApps, user.role || 'user'),
    });
    setDrawerMode('edit');
  };

  const closeDrawer = () => {
    if (saving) return;
    setDrawerMode('');
    setDraft(buildEmptyDraft());
  };

  const updateDraft = (patch) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  };

  const changeRole = (role) => {
    setDraft((prev) => ({
      ...prev,
      role,
      enabledMiniApps: normalizeEnabled(prev.enabledMiniApps, role).filter((id) => managedAppIds.includes(id)),
    }));
  };

  const toggleApp = (appId) => {
    setDraft((prev) => {
      const current = normalizeEnabled(prev.enabledMiniApps, prev.role);
      return {
        ...prev,
        enabledMiniApps: current.includes(appId) ? current.filter((id) => id !== appId) : [...current, appId],
      };
    });
  };

  const submitDrawer = async (event) => {
    event.preventDefault();
    setError('');
    setStatus('');
    setSaving(true);

    try {
      const enabledMiniApps = normalizeEnabled(draft.enabledMiniApps, draft.role).filter((id) => managedAppIds.includes(id));
      if (drawerMode === 'create') {
        await postJson(
          'adminCreateUser',
          {
            email: draft.email,
            password: draft.password,
            role: draft.role,
            enabledMiniApps,
          },
          { authed: true }
        );
        setStatus('User created.');
      } else {
        await postJson(
          'adminUpdateUserAccess',
          {
            uid: draft.uid,
            role: draft.role,
            enabledMiniApps,
          },
          { authed: true }
        );
        setStatus(`Updated ${draft.email}.`);
      }
      await loadUsers();
      closeDrawer();
    } catch (err) {
      setError(err?.message || (drawerMode === 'create' ? 'Failed to create user.' : 'Failed to update access.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="user-access-page">
      <header className="admin-head">
        <div>
          <h1>User Access</h1>
          <p>Create users and control which mini apps appear in their launcher.</p>
        </div>
        <button type="button" className="primary-btn" onClick={openCreate}>
          <FiPlus size={16} />
          Add user
        </button>
      </header>

      {error ? <p className="access-message error">{error}</p> : null}
      {status ? <p className="access-message success">{status}</p> : null}

      <section className="access-panel">
        <div className="access-section-head">
          <h2>Users</h2>
          <button type="button" className="ghost-btn" onClick={loadUsers} disabled={loading}>
            Refresh
          </button>
        </div>

        <div className="access-table-wrap">
          <table className="access-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Mini Apps</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const enabled = normalizeEnabled(user.enabledMiniApps, user.role);
                return (
                  <tr key={user.uid}>
                    <td>
                      <strong>{user.email || user.uid}</strong>
                      <span>{user.uid}</span>
                    </td>
                    <td>{user.role || 'user'}</td>
                    <td>
                      {enabled.length > 0
                        ? enabled.map((id) => ACCESS_MANAGED_MINI_APPS.find((app) => app.id === id)?.label || id).join(', ')
                        : 'None'}
                    </td>
                    <td>
                      <button type="button" className="action-btn" onClick={() => openEdit(user)}>
                        <FiEdit2 size={15} />
                        Edit
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!loading && users.length === 0 ? <p className="meta">No users found.</p> : null}
          {loading ? <p className="meta">Loading users...</p> : null}
        </div>
      </section>

      {drawerMode ? (
        <aside className="access-drawer" aria-label={drawerMode === 'create' ? 'Add user' : 'Edit user access'}>
          <div className="drawer-header">
            <h2>{drawerMode === 'create' ? 'Add User' : 'Edit User'}</h2>
            <button type="button" className="ghost-btn" onClick={closeDrawer} disabled={saving} aria-label="Close">
              <FiX size={16} />
            </button>
          </div>

          <form className="access-drawer-form" onSubmit={submitDrawer}>
            <label>
              <span>Email</span>
              <input type="email" required disabled={drawerMode === 'edit'} value={draft.email} onChange={(event) => updateDraft({ email: event.target.value })} />
            </label>

            {drawerMode === 'create' ? (
              <label>
                <span>Temporary password</span>
                <input type="password" required minLength={6} value={draft.password} onChange={(event) => updateDraft({ password: event.target.value })} />
              </label>
            ) : null}

            <label>
              <span>Role</span>
              <select value={draft.role} onChange={(event) => changeRole(event.target.value)}>
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </label>

            <div className="access-toggle-grid" aria-label="Mini app access">
              {ACCESS_MANAGED_MINI_APPS.map((app) => (
                <MiniAppToggle key={app.id} app={app} checked={normalizeEnabled(draft.enabledMiniApps, draft.role).includes(app.id)} onChange={toggleApp} />
              ))}
            </div>

            <button type="submit" className="primary-btn" disabled={saving}>
              {saving ? 'Saving...' : drawerMode === 'create' ? 'Create user' : 'Save access'}
            </button>
          </form>
        </aside>
      ) : null}
    </section>
  );
}
