import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { signInWithCustomToken } from 'firebase/auth';
import { auth } from '../firebase';
import { postJson } from '../lib/api';
import './Auth.css';

function messageFromError(err) {
  const text = String(err?.message || '');
  if (text.toLowerCase().includes('expired')) return 'This invite has expired. Ask an admin to send a new invite.';
  if (text.toLowerCase().includes('accepted')) return 'This invite was already accepted. Sign in to continue.';
  if (text.toLowerCase().includes('registered')) return 'This email is already registered. Sign in to continue.';
  if (text.toLowerCase().includes('not found')) return 'This invite link is invalid.';
  return text || 'Unable to load invite.';
}

export default function InviteRegister() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [invite, setInvite] = useState(null);
  const [form, setForm] = useState({ firstName: '', lastName: '', password: '', confirmPassword: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    let active = true;
    async function loadInvite() {
      setLoading(true);
      setError('');
      try {
        const data = await postJson('previewInvite', { token });
        if (!active) return;
        setInvite(data.invite || null);
        setForm((prev) => ({
          ...prev,
          firstName: data.invite?.firstName || '',
          lastName: data.invite?.lastName || '',
        }));
      } catch (err) {
        if (active) setError(messageFromError(err));
      } finally {
        if (active) setLoading(false);
      }
    }
    loadInvite();
    return () => {
      active = false;
    };
  }, [token]);

  const updateForm = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const acceptInvite = async (event) => {
    event.preventDefault();
    setError('');
    setStatus('');
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setSaving(true);
    try {
      const data = await postJson('acceptInvite', {
        token,
        password: form.password,
      });
      if (data.customToken) {
        await signInWithCustomToken(auth, data.customToken);
        navigate('/portal', { replace: true });
        return;
      }
      setStatus('Registration complete. Sign in to continue.');
      window.setTimeout(() => navigate(`/signin?email=${encodeURIComponent(data.email || invite?.email || '')}`, { replace: true }), 900);
    } catch (err) {
      setError(messageFromError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={acceptInvite}>
        <img src={`${process.env.PUBLIC_URL}/assets/quotechem-logo.png`} alt="QuoteChem" className="auth-logo" />
        <h1>Finish registration</h1>

        {loading ? <p className="auth-status">Loading invite...</p> : null}
        {error ? <p className="auth-error">{error}</p> : null}
        {status ? <p className="auth-status">{status}</p> : null}

        {invite && !error ? (
          <>
            <label htmlFor="invite-email">Email</label>
            <input id="invite-email" type="email" value={invite.email || ''} readOnly />

            <label htmlFor="invite-first-name">First name</label>
            <input id="invite-first-name" required value={form.firstName} readOnly />

            <label htmlFor="invite-last-name">Last name</label>
            <input id="invite-last-name" required value={form.lastName} readOnly />

            <label htmlFor="invite-password">Password</label>
            <input
              id="invite-password"
              type="password"
              minLength={6}
              required
              value={form.password}
              onChange={(event) => updateForm('password', event.target.value)}
            />

            <label htmlFor="invite-confirm-password">Confirm password</label>
            <input
              id="invite-confirm-password"
              type="password"
              minLength={6}
              required
              value={form.confirmPassword}
              onChange={(event) => updateForm('confirmPassword', event.target.value)}
            />

            <button type="submit" disabled={saving}>
              {saving ? 'Creating account...' : 'Create account'}
            </button>
          </>
        ) : null}

        <p className="auth-link">
          <button type="button" onClick={() => navigate('/signin')}>
            Back to sign in
          </button>
        </p>
      </form>
    </div>
  );
}
