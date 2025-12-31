import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../firebase';
import './Auth.css';

function ForgotPassword() {
  const isPortrait = typeof window !== 'undefined'
    ? window.matchMedia('(orientation: portrait)').matches
    : false;
  const bgUrl = `${process.env.PUBLIC_URL}/assets/${isPortrait ? 'auth-portrait.png' : 'auth-landscape.png'}`;

  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleReset = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    try {
      await sendPasswordResetEmail(auth, email);
      setMessage('Password reset email sent. Check your inbox.');
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
      <form className="auth-box" onSubmit={handleReset}>
        <h1>Showmaster</h1>
        <h2>Reset Password</h2>

        {error && <p className="error">{error}</p>}
        {message && <p style={{ color: 'green', textAlign: 'center' }}>{message}</p>}

        <input
          type="email"
          placeholder="Enter your email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <button type="submit">Send Reset Link</button>

        <p className="link" onClick={() => navigate('/signin')}>
          Back to Login
        </p>
      </form>
    </div>
  );
}

export default ForgotPassword;
