import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase';
import './Auth.css';

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
      setError(err.message);
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
        <h1>Showmaster</h1>
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
