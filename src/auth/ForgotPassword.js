import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../firebase';
import './Auth.css';

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const onSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setStatus('');

    try {
      await sendPasswordResetEmail(auth, email.trim());
      setStatus('Password reset email sent.');
    } catch (err) {
      setError(err?.message || 'Unable to send reset link right now.');
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={onSubmit}>
        <img src={`${process.env.PUBLIC_URL}/assets/quotechem-logo.png`} alt="QuoteChem" className="auth-logo" />
        <div className="auth-brand">Quote<span>Chem</span></div>
        <p className="auth-eyebrow">Employee portal</p>
        <h1>Reset password</h1>

        {error ? <p className="auth-error">{error}</p> : null}
        {status ? <p className="auth-success">{status}</p> : null}

        <label htmlFor="reset-email">Email</label>
        <input
          id="reset-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />

        <button type="submit">Send reset link</button>

        <p className="auth-link" onClick={() => navigate('/signin')}>
          Back to sign in
        </p>
      </form>
    </div>
  );
}
