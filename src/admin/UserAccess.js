import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FiEdit2, FiMail, FiPlus, FiRefreshCw, FiSend, FiX } from 'react-icons/fi';
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
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [templateDraft, setTemplateDraft] = useState(null);
  const [testEmail, setTestEmail] = useState('');
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
      setInvites(Array.isArray(data.invites) ? data.invites : []);
    } catch (err) {
      setError(err?.message || 'Failed to load users.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTemplates = useCallback(async () => {
    try {
      const data = await postJson('adminListEmailTemplates', {}, { authed: true });
      const items = Array.isArray(data.items) ? data.items : [];
      setTemplates(items);
      setSelectedTemplateId((current) => current || items[0]?.templateId || '');
      setTemplateDraft((current) => current || items[0] || null);
    } catch (err) {
      setError(err?.message || 'Failed to load email templates.');
    }
  }, []);

  useEffect(() => {
    loadUsers();
    loadTemplates();
  }, [loadUsers, loadTemplates]);

  useEffect(() => {
    const selected = templates.find((template) => template.templateId === selectedTemplateId);
    if (selected) setTemplateDraft({ ...selected });
  }, [selectedTemplateId, templates]);

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
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      email: user.email || '',
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

  const updateDraft = (patch) => setDraft((prev) => ({ ...prev, ...patch }));
  const updateTemplateDraft = (patch) => setTemplateDraft((prev) => ({ ...prev, ...patch }));

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
      } else {
        await postJson(
          'adminUpdateUserAccess',
          {
            uid: draft.uid,
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

  const saveTemplate = async () => {
    if (!templateDraft) return;
    setError('');
    setStatus('');
    setSaving(true);
    try {
      const data = await postJson('adminSaveEmailTemplate', templateDraft, { authed: true });
      setStatus('Email template saved.');
      setTemplates((prev) => prev.map((item) => (item.templateId === data.template?.templateId ? data.template : item)));
      setTemplateDraft(data.template || templateDraft);
    } catch (err) {
      setError(err?.message || 'Failed to save email template.');
    } finally {
      setSaving(false);
    }
  };

  const sendTestEmail = async () => {
    if (!templateDraft) return;
    setError('');
    setStatus('');
    setSaving(true);
    try {
      await postJson('adminSendTestEmail', { templateId: templateDraft.templateId, to: testEmail }, { authed: true });
      setStatus(`Test email sent to ${testEmail}.`);
    } catch (err) {
      setError(err?.message || 'Failed to send test email.');
    } finally {
      setSaving(false);
    }
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
          {users.map((user) => (
            <article key={user.uid} className="access-user-row">
              <div className="access-user-main">
                <span className="access-avatar">
                  {user.profilePhotoThumbUrl || user.profilePhotoUrl ? (
                    <img src={user.profilePhotoThumbUrl || user.profilePhotoUrl} alt="" />
                  ) : (
                    initialsForUser(user)
                  )}
                </span>
                <span className="access-user-copy">
                  <strong>{displayNameForUser(user)}</strong>
                  <span>{user.email || user.uid}</span>
                </span>
              </div>
              <span className={`access-role ${user.role === 'admin' ? 'admin' : ''}`}>{user.role || 'user'}</span>
              <button type="button" className="action-btn" onClick={() => openEdit(user)}>
                <FiEdit2 size={15} />
                Edit
              </button>
            </article>
          ))}
          {!loading && users.length === 0 ? <p className="meta">No users found.</p> : null}
          {loading ? <p className="meta">Loading users...</p> : null}
        </div>
      </section>

      <section className="access-panel">
        <div className="access-section-head">
          <h2>Pending invites</h2>
          <span className="meta">{invites.length} invites</span>
        </div>
        <div className="access-user-list">
          {invites.map((invite) => (
            <article key={invite.inviteId} className="access-user-row invite-row">
              <div className="access-user-main">
                <span className="access-avatar invite">
                  <FiMail size={18} />
                </span>
                <span className="access-user-copy">
                  <strong>{invite.email}</strong>
                  <span>{formatInviteStatus(invite)}</span>
                </span>
              </div>
              <span className={`access-role ${formatInviteStatus(invite)}`}>{formatInviteStatus(invite)}</span>
              <button type="button" className="action-btn" disabled={saving || formatInviteStatus(invite) !== 'pending'} onClick={() => resendInvite(invite)}>
                <FiRefreshCw size={15} />
                Resend
              </button>
            </article>
          ))}
          {!invites.length ? <p className="meta">No pending invites.</p> : null}
        </div>
      </section>

      <section className="access-panel email-template-panel">
        <div className="access-section-head">
          <div>
            <h2>Email Templates</h2>
            <p className="meta">Gmail SMTP sends these from the configured QuoteChem sender.</p>
          </div>
          <select value={selectedTemplateId} onChange={(event) => setSelectedTemplateId(event.target.value)}>
            {templates.map((template) => (
              <option key={template.templateId} value={template.templateId}>
                {template.label}
              </option>
            ))}
          </select>
        </div>

        {templateDraft ? (
          <div className="email-template-grid">
            <label>
              <span>Subject</span>
              <input value={templateDraft.subject || ''} onChange={(event) => updateTemplateDraft({ subject: event.target.value })} />
            </label>
            <label>
              <span>Button label</span>
              <input value={templateDraft.actionLabel || ''} onChange={(event) => updateTemplateDraft({ actionLabel: event.target.value })} />
            </label>
            <label>
              <span>Text body</span>
              <textarea rows={7} value={templateDraft.text || ''} onChange={(event) => updateTemplateDraft({ text: event.target.value })} />
            </label>
            <label>
              <span>HTML body</span>
              <textarea rows={7} value={templateDraft.html || ''} onChange={(event) => updateTemplateDraft({ html: event.target.value })} />
            </label>
            <label className="span-2">
              <span>Footer</span>
              <input value={templateDraft.footer || ''} onChange={(event) => updateTemplateDraft({ footer: event.target.value })} />
            </label>
            <div className="email-template-actions span-2">
              <button type="button" className="primary-btn" disabled={saving} onClick={saveTemplate}>
                Save template
              </button>
              <input type="email" value={testEmail} onChange={(event) => setTestEmail(event.target.value)} placeholder="test@example.com" />
              <button type="button" className="action-btn" disabled={saving || !testEmail} onClick={sendTestEmail}>
                <FiSend size={15} />
                Send test
              </button>
            </div>
          </div>
        ) : (
          <p className="meta">Loading email templates...</p>
        )}
      </section>

      {drawerMode ? (
        <aside className="access-drawer" aria-label={drawerMode === 'create' ? 'Send invite' : 'Edit user access'}>
          <div className="drawer-header">
            <h2>{drawerMode === 'create' ? 'Send Invite' : 'Edit User'}</h2>
            <button type="button" className="ghost-btn" onClick={closeDrawer} disabled={saving} aria-label="Close">
              <FiX size={16} />
            </button>
          </div>

          <form className="access-drawer-form" onSubmit={submitDrawer}>
            <label>
              <span>Email</span>
              <input type="email" required disabled={drawerMode === 'edit'} value={draft.email} onChange={(event) => updateDraft({ email: event.target.value })} />
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
              {saving ? 'Saving...' : drawerMode === 'create' ? 'Send invite' : 'Save access'}
            </button>
          </form>
        </aside>
      ) : null}
    </section>
  );
}
