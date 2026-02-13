import React from 'react';
import { useNavigate } from 'react-router-dom';
import '../auth/Auth.css';

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="auth-page">
      <div className="auth-card">
        <img src={`${process.env.PUBLIC_URL}/assets/quotechem-logo.png`} alt="QuoteChem" className="auth-logo" />
        <h1>QuoteChem</h1>
        <p style={{ margin: 0, color: '#475569' }}>
          Clean production starter with an interactive assistant workspace.
        </p>
        <button type="button" onClick={() => navigate('/signin')}>
          Sign in
        </button>
        <button type="button" onClick={() => navigate('/signup')}>
          Create account
        </button>
      </div>
    </div>
  );
}
