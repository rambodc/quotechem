import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase';
import './Auth.css';

function mapLoginError(err) {
  const code = err?.code || '';
  if (code === 'auth/invalid-credential') return 'Invalid email or password.';
  if (code === 'auth/user-disabled') return 'This account is disabled. Contact support.';
  if (code === 'auth/too-many-requests') return 'Too many attempts. Try again in a few minutes.';
  if (code === 'auth/network-request-failed') return 'Network error. Check internet and retry.';
  return err?.message || 'Unable to sign in right now.';
}

function Login() {
  const isPortrait = typeof window !== 'undefined'
    ? window.matchMedia('(orientation: portrait)').matches
    : false;
  const bgUrl = `${process.env.PUBLIC_URL}/assets/${isPortrait ? 'auth-portrait.png' : 'auth-landscape.png'}`;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');

    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate('/home'); // ✅ redirect to home
    } catch (err) {
      setError(mapLoginError(err));
    }
  };

  return (
    <div
      className="auth-container"
      style={{
        backgroundImage: `url(${bgUrl})`,
        backgroundPosition: 'center',
        backgroundSize: 'cover',
        backgroundRepeat: 'no-repeat',
      }}
    >
      <form className="auth-box" onSubmit={handleLogin}>
        <h1>Razzberry</h1>
        <h2>Login</h2>

        {error && <p className="error">{error}</p>}

        <input
          type="email"
          placeholder="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        <button type="submit">Login</button>

        <p className="link" onClick={() => navigate('/forgot')}>
          Forgot Password?
        </p>

        <p className="link" onClick={() => navigate('/signup')}>
          Create Account
        </p>
      </form>
    </div>
  );
}

export default Login;
