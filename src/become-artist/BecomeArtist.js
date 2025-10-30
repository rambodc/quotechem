// src/become-artist/BecomeArtist.js
import React from 'react';
import TopBar from '../components/TopBar';
import MobileNavTabs from '../components/MobileNavTabs';
import layoutStyles from '../styles/layout.module.css';

export default function BecomeArtist() {
  return (
    <div className={layoutStyles.homeContainer} style={{ paddingBottom: 0 }}>
      <TopBar hideLeft>
        <MobileNavTabs />
      </TopBar>

      <div style={{ maxWidth: 640, margin: '60px auto', padding: '0 16px' }}>
        <h1>Become an Artist</h1>
        <p style={{ opacity: 0.8 }}>
          This space is reserved for the future artist onboarding flow. Check back soon!
        </p>
      </div>
    </div>
  );
}
