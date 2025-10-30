// src/ValidateDrops.js
import React, { useCallback } from 'react';
import TopBar from '../components/TopBar';
import { useNavigate } from 'react-router-dom';
import layoutStyles from '../styles/layout.module.css';

export default function ValidateDrops() {
  const navigate = useNavigate();
  const handleBack = useCallback(() => {
    if (window.history.length > 2) navigate(-1); else navigate('/home');
  }, [navigate]);
  return (
    <div className={layoutStyles.detailPage}>
      <TopBar variant="back" backLabel="Back" onBack={handleBack} />
      <div style={{ maxWidth: 800, width: '100%', margin: '80px auto', padding: '0 16px' }}>
        <h1>Validate Drops</h1>
        <p style={{ color: '#4b5563' }}>Coming soon.</p>
      </div>
    </div>
  );
}
