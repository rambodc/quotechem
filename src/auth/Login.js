import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase';
import './Auth.css';

function mapLoginError(err) {
  const code = err?.code || '';
  if (code === 'auth/invalid-credential') return 'Invalid email or password.';
  if (code === 'auth/user-disabled') return 'This account is disabled.';
  if (code === 'auth/too-many-requests') return 'Too many attempts. Try again later.';
  return err?.message || 'Unable to sign in right now.';
}

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      navigate('/portal', { replace: true });
    } catch (err) {
      setError(mapLoginError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <img src={`${process.env.PUBLIC_URL}/assets/quotechem-logo.png`} alt="QuoteChem" className="auth-logo" />
        <h1>Admin Sign in</h1>

        {error ? <p className="auth-error">{error}</p> : null}

        <label htmlFor="login-email">Email</label>
        <input
          id="login-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />

        <label htmlFor="login-password">Password</label>
        <input
          id="login-password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />

        <button type="submit" disabled={loading}>
          {loading ? 'Signing in...' : 'Sign in'}
        </button>

        <p className="auth-link">
          <Link to="/forgot">Forgot password</Link>
        </p>
        <p className="auth-link">
          <Link to="/signup">Create account</Link>
        </p>
        <p className="auth-link">
          <Link to="/">Back to public home</Link>
        </p>
      </form>
    </div>
  );
}
