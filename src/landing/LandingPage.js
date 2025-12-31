import React from 'react';
import { useNavigate } from 'react-router-dom';
import '../auth/Auth.css'; // Reuse your clean styles

function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="auth-container">
      <div className="auth-box">
        <h1>Welcome to Showmaster</h1>
        <h2>Music. Culture. Identity.</h2>

        <p style={{ textAlign: 'center', fontWeight: 300 }}>
          Connect with your music community and own your voice.
        </p>

        <button onClick={() => navigate('/signin')}>Sign In</button>
        <button onClick={() => navigate('/signup')}>Create Account</button>
      </div>
    </div>
  );
}

export default LandingPage;
