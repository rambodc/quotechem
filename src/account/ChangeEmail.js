import React, { useContext, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { verifyBeforeUpdateEmail } from 'firebase/auth';
import { auth } from '../firebase';
import { UserContext } from '../App';
import { accountBaseForRole } from './routeUtils';
import './CredentialPage.css';

export default function ChangeEmail() {
  const navigate = useNavigate();
  const appUser = useContext(UserContext);
  const base = useMemo(() => accountBaseForRole(appUser?.role), [appUser?.role]);
  const [email, setEmail] = useState('');
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

    setSaving(true);
    try {
      await verifyBeforeUpdateEmail(auth.currentUser, email.trim());
      setStatus('Verification email sent. Confirm it to finish updating your address.');
      setEmail('');
    } catch (err) {
      setError(err?.message || 'Unable to update email right now.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="credential-page">
      <header>
        <h2>Change Email</h2>
        <p>We will send a verification link to the new address.</p>
      </header>

      <form className="credential-form" onSubmit={handleSubmit}>
        {error ? <p className="credential-error">{error}</p> : null}
        {status ? <p className="credential-success">{status}</p> : null}

        <label htmlFor="new-email">New email</label>
        <input
          id="new-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="new@email.com"
        />

        <div className="credential-actions">
          <button type="button" className="secondary" onClick={() => navigate(base)}>
            Back
          </button>
          <button type="submit" className="primary" disabled={saving}>
            {saving ? 'Saving...' : 'Send verification'}
          </button>
        </div>
      </form>
    </section>
  );
}
