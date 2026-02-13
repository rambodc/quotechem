import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { updatePassword } from 'firebase/auth';
import { auth } from '../firebase';
import './CredentialPage.css';

export default function ChangePassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setStatus('');

    if (!auth.currentUser) {
      setError('No authenticated user found.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setSaving(true);
    try {
      await updatePassword(auth.currentUser, password);
      setStatus('Password updated successfully.');
      setPassword('');
      setConfirm('');
    } catch (err) {
      setError(err?.message || 'Unable to update password right now.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="credential-page">
      <header>
        <h2>Change Password</h2>
        <p>Choose a strong password with 8+ characters.</p>
      </header>

      <form className="credential-form" onSubmit={handleSubmit}>
        {error ? <p className="credential-error">{error}</p> : null}
        {status ? <p className="credential-success">{status}</p> : null}

        <label htmlFor="new-password">New password</label>
        <input
          id="new-password"
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="********"
        />

        <label htmlFor="confirm-password">Confirm password</label>
        <input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          placeholder="********"
        />

        <div className="credential-actions">
          <button type="button" className="secondary" onClick={() => navigate('/account')}>
            Back
          </button>
          <button type="submit" className="primary" disabled={saving}>
            {saving ? 'Saving...' : 'Update password'}
          </button>
        </div>
      </form>
    </section>
  );
}
