import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FiEdit2, FiMail, FiMoreVertical, FiPlus, FiRefreshCw, FiSlash, FiX } from 'react-icons/fi';
import { postJson } from '../lib/api';
import { ACCESS_MANAGED_MINI_APPS, defaultMiniAppIdsForRole } from '../apps/registry/miniApps';
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
    inviteId: '',
    rowType: 'user',
    firstName: '',
    lastName: '',
    email: '',
    role: 'user',
    enabledMiniApps: managedDefaults('user'),
  };
}

function initialsForUser(user) {
  const name = `${user?.firstName || ''} ${user?.lastName || ''}`.trim();
  const source = name || user?.email || 'QC';
  return source
    .split(/\s|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'QC';
}

function displayNameForUser(user) {
  const name = `${user?.firstName || ''} ${user?.lastName || ''}`.trim();
  return name || 'No name set';
}

function formatInviteStatus(invite) {
  if (!invite?.expiresAt) return invite?.status || 'pending';
  if (invite.status === 'pending' && Number(invite.expiresAt) < Date.now()) return 'expired';
  return invite.status || 'pending';
}

function statusLabel(row) {
  if (row.rowType === 'user') return 'Active';
  const status = formatInviteStatus(row);
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function displayNameForRow(row) {
  if (row.rowType === 'user') return displayNameForUser(row);
  const name = `${row?.firstName || ''} ${row?.lastName || ''}`.trim();
  return name || 'Invited user';
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
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [drawerMode, setDrawerMode] = useState('');
  const [draft, setDraft] = useState(buildEmptyDraft);
  const [openMenuKey, setOpenMenuKey] = useState('');
  const managedAppIds = useMemo(() => ACCESS_MANAGED_MINI_APPS.map((app) => app.id), []);
  const roster = useMemo(() => {
    const userEmails = new Set(users.map((user) => String(user.email || '').toLowerCase()).filter(Boolean));
    const userRows = users.map((user) => ({ ...user, rowType: 'user', rosterKey: `user:${user.uid}` }));
    const inviteRows = invites
      .map((invite) => ({ ...invite, rowType: 'invite', rosterKey: `invite:${invite.inviteId}`, status: formatInviteStatus(invite) }))
      .filter((invite) => invite.status !== 'cancelled')
      .filter((invite) => !(invite.status === 'accepted' && userEmails.has(String(invite.email || '').toLowerCase())));
    return [...userRows, ...inviteRows];
  }, [invites, users]);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await postJson('adminListUsers', {}, { authed: true });
      setUsers(Array.isArray(data.items) ? data.items : []);
      setInvites(Array.isArray(data.invites) ? data.invites : []);
    } catch (err) {
      setError(err?.message || 'Failed to load users.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    if (!openMenuKey) return undefined;

    const closeMenuFromOutsideClick = (event) => {
      if (event.target?.closest?.('[data-access-menu-root]')) return;
      setOpenMenuKey('');
    };

    const closeMenuFromEscape = (event) => {
      if (event.key === 'Escape') setOpenMenuKey('');
    };

    document.addEventListener('pointerdown', closeMenuFromOutsideClick);
    document.addEventListener('keydown', closeMenuFromEscape);
    return () => {
      document.removeEventListener('pointerdown', closeMenuFromOutsideClick);
      document.removeEventListener('keydown', closeMenuFromEscape);
    };
  }, [openMenuKey]);

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
      inviteId: '',
      rowType: 'user',
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      email: user.email || '',
      role: user.role || 'user',
      enabledMiniApps: normalizeEnabled(user.enabledMiniApps, user.role || 'user'),
    });
    setDrawerMode('edit');
  };

  const openEditInvite = (invite) => {
    setError('');
    setStatus('');
    setDraft({
      uid: '',
      inviteId: invite.inviteId,
      rowType: 'invite',
      firstName: invite.firstName || '',
      lastName: invite.lastName || '',
      email: invite.email || '',
      role: invite.role || 'user',
      enabledMiniApps: normalizeEnabled(invite.enabledMiniApps, invite.role || 'user'),
    });
    setDrawerMode('edit-invite');
  };

  const closeDrawer = () => {
    if (saving) return;
    setDrawerMode('');
    setDraft(buildEmptyDraft());
  };

  const updateDraft = (patch) => setDraft((prev) => ({ ...prev, ...patch }));

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
          'adminInviteUser',
          {
            email: draft.email,
            firstName: draft.firstName,
            lastName: draft.lastName,
            role: draft.role,
            enabledMiniApps,
          },
          { authed: true }
        );
        setStatus(`Invite sent to ${draft.email}.`);
      } else if (drawerMode === 'edit-invite') {
        await postJson(
          'adminUpdateInvite',
          {
            inviteId: draft.inviteId,
            email: draft.email,
            firstName: draft.firstName,
            lastName: draft.lastName,
            role: draft.role,
            enabledMiniApps,
          },
          { authed: true }
        );
        setStatus(`Updated invite for ${draft.email}.`);
      } else {
        await postJson(
          'adminUpdateUserAccess',
          {
            uid: draft.uid,
            email: draft.email,
            firstName: draft.firstName,
            lastName: draft.lastName,
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
      setError(err?.message || (drawerMode === 'create' ? 'Failed to send invite.' : 'Failed to update access.'));
    } finally {
      setSaving(false);
    }
  };

  const resendInvite = async (invite) => {
    setError('');
    setStatus('');
    setSaving(true);
    try {
      await postJson('adminResendInvite', { inviteId: invite.inviteId }, { authed: true });
      setStatus(`Invite resent to ${invite.email}.`);
      await loadUsers();
    } catch (err) {
      setError(err?.message || 'Failed to resend invite.');
    } finally {
      setSaving(false);
    }
  };

  const cancelInvite = async (invite) => {
    setError('');
    setStatus('');
    setSaving(true);
    try {
      await postJson('adminCancelInvite', { inviteId: invite.inviteId }, { authed: true });
      setStatus(`Invite cancelled for ${invite.email}.`);
      await loadUsers();
    } catch (err) {
      setError(err?.message || 'Failed to cancel invite.');
    } finally {
      setSaving(false);
    }
  };

  const runMenuAction = (row, action) => {
    setOpenMenuKey('');
    if (action === 'edit-user') openEdit(row);
    if (action === 'edit-invite') openEditInvite(row);
    if (action === 'resend-invite') resendInvite(row);
    if (action === 'cancel-invite') cancelInvite(row);
  };

  return (
    <section className="user-access-page">
      <header className="admin-head">
        <div>
          <h1>User Access</h1>
          <p>Invite users and control which mini apps appear in their launcher.</p>
        </div>
        <button type="button" className="primary-btn" onClick={openCreate}>
          <FiPlus size={16} />
          Send invite
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

        <div className="access-user-list">
          {roster.map((row) => (
            <article key={row.rosterKey} className={`access-user-row ${row.rowType === 'invite' ? 'invite-row' : ''}`}>
              <div className="access-user-main">
                <span className={`access-avatar ${row.rowType === 'invite' ? 'invite' : ''}`}>
                  {row.rowType === 'user' && (row.profilePhotoThumbUrl || row.profilePhotoUrl) ? (
                    <img src={row.profilePhotoThumbUrl || row.profilePhotoUrl} alt="" />
                  ) : row.rowType === 'invite' ? (
                    <FiMail size={18} />
                  ) : (
                    initialsForUser(row)
                  )}
                </span>
                <span className="access-user-copy">
                  <strong>{displayNameForRow(row)}</strong>
                  <span>{row.email || row.uid}</span>
                </span>
              </div>
              <span className={`access-role ${row.rowType === 'user' ? 'active' : row.status}`}>{statusLabel(row)}</span>
              <div className="access-menu-wrap" data-access-menu-root>
                <button
                  type="button"
                  className="access-menu-button"
                  aria-label={`Actions for ${row.email || displayNameForRow(row)}`}
                  aria-expanded={openMenuKey === row.rosterKey}
                  onClick={() => setOpenMenuKey((current) => (current === row.rosterKey ? '' : row.rosterKey))}
                >
                  <FiMoreVertical size={17} />
                </button>
                {openMenuKey === row.rosterKey ? (
                  <div className="access-menu" role="menu">
                    {row.rowType === 'user' ? (
                      <button type="button" role="menuitem" onClick={() => runMenuAction(row, 'edit-user')}>
                        <FiEdit2 size={15} />
                        Edit
                      </button>
                    ) : (
                      <>
                        <button type="button" role="menuitem" onClick={() => runMenuAction(row, 'edit-invite')}>
                          <FiEdit2 size={15} />
                          Edit invite
                        </button>
                        <button type="button" role="menuitem" disabled={saving || !['pending', 'expired'].includes(row.status)} onClick={() => runMenuAction(row, 'resend-invite')}>
                          <FiRefreshCw size={15} />
                          Resend invite
                        </button>
                        <button type="button" role="menuitem" disabled={saving || row.status === 'accepted'} onClick={() => runMenuAction(row, 'cancel-invite')}>
                          <FiSlash size={15} />
                          Cancel invite
                        </button>
                      </>
                    )}
                  </div>
                ) : null}
              </div>
            </article>
          ))}
          {!loading && roster.length === 0 ? <p className="meta">No users found.</p> : null}
          {loading ? <p className="meta">Loading users...</p> : null}
        </div>
      </section>

      {drawerMode ? (
        <aside className="access-drawer" aria-label={drawerMode === 'create' ? 'Send invite' : drawerMode === 'edit-invite' ? 'Edit invite' : 'Edit user access'}>
          <div className="drawer-header">
            <h2>{drawerMode === 'create' ? 'Send Invite' : drawerMode === 'edit-invite' ? 'Edit Invite' : 'Edit User'}</h2>
            <button type="button" className="ghost-btn" onClick={closeDrawer} disabled={saving} aria-label="Close">
              <FiX size={16} />
            </button>
          </div>

          <form className="access-drawer-form" onSubmit={submitDrawer}>
            <label>
              <span>Email</span>
              <input type="email" required value={draft.email} onChange={(event) => updateDraft({ email: event.target.value })} />
            </label>

            <div className="access-name-grid">
              <label>
                <span>First name</span>
                <input type="text" value={draft.firstName} onChange={(event) => updateDraft({ firstName: event.target.value })} />
              </label>
              <label>
                <span>Last name</span>
                <input type="text" value={draft.lastName} onChange={(event) => updateDraft({ lastName: event.target.value })} />
              </label>
            </div>

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
              {saving ? 'Saving...' : drawerMode === 'create' ? 'Send invite' : drawerMode === 'edit-invite' ? 'Save invite' : 'Save access'}
            </button>
          </form>
        </aside>
      ) : null}
    </section>
  );
}
