// src/artists/artistList.js
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import TopBar from '../components/TopBar';
import MobileNavTabs from '../components/MobileNavTabs';
import layoutStyles from '../styles/layout.module.css';
import { db } from '../firebase';

export default function ArtistList() {
  const navigate = useNavigate();
  const [artists, setArtists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const artistsQuery = query(collection(db, 'artists'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(
      artistsQuery,
      (snap) => {
        const list = snap.docs.map((docSnap) => {
          const data = docSnap.data() || {};
          const artistId = data.artistId || docSnap.id;
          return {
            id: docSnap.id,
            artistId,
            name: data.artistFullName || 'Untitled Artist',
            description: data.artistDescription || '',
            photo: data.artistProfilePhoto || '',
            rating: data.rating || '',
            nights: data.nights || '',
          };
        });
        setArtists(list);
        setLoading(false);
        setError('');
      },
      (err) => {
        console.error('artists snapshot error:', err);
        setError(err?.message || 'Failed to load artists.');
        setArtists([]);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const truncate = (text, maxLength) => {
    if (!text) return '';
    return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
  };

  const content = useMemo(() => {
    if (loading) return <p style={{ color: '#4b5563' }}>Loading…</p>;
    if (error) return <p style={{ color: '#b91c1c' }}>{error}</p>;
    if (artists.length === 0) return <p style={{ color: '#4b5563' }}>No artists yet.</p>;

    return (
      <div style={listStyle}>
        {artists.map((artist) => (
          <button
            key={artist.artistId}
            type="button"
            onClick={() => navigate(`/artist/${artist.artistId}`)}
            style={itemStyle}
          >
            <div style={thumbWrapperStyle}>
              {artist.photo ? (
                <img
                  src={artist.photo}
                  alt={artist.name}
                  style={thumbImageStyle}
                />
              ) : (
                <div style={thumbPlaceholderStyle}>No Image</div>
              )}
            </div>

            <div style={infoStyle}>
              <h2 style={nameStyle}>{truncate(artist.name, 48)}</h2>
              {artist.description && (
                <p style={descriptionStyle}>{truncate(artist.description, 140)}</p>
              )}
              {(artist.rating || artist.nights) && (
                <div style={chipRowStyle}>
                  {artist.rating && <span style={chipStyle}>{artist.rating}</span>}
                  {artist.nights && <span style={chipStyle}>{artist.nights}</span>}
                </div>
              )}
            </div>
          </button>
        ))}
      </div>
    );
  }, [artists, error, loading, navigate]);

  return (
    <div className={layoutStyles.homeContainer} style={{ paddingBottom: 0 }}>
      <TopBar hideLeft>
        <MobileNavTabs />
      </TopBar>

      <div style={{ maxWidth: 960, width: '100%', margin: '80px auto 40px', padding: '0 16px' }}>
        <header style={{ textAlign: 'center', marginBottom: 24 }}>
          <h1 style={{ margin: '8px 0 12px' }}>Artists</h1>
          <p style={{ color: '#4b5563' }}>Browse the roster and tap any artist to view their full profile.</p>
        </header>

        {content}
      </div>
    </div>
  );
}

const listStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
};

const itemStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 16,
  padding: '12px 16px',
  borderRadius: 20,
  border: '1px solid #e5e7eb',
  background: '#ffffff',
  boxShadow: '0 12px 26px rgba(15, 23, 42, 0.08)',
  cursor: 'pointer',
  textAlign: 'left',
  textDecoration: 'none',
  transition: 'transform 0.2s ease, box-shadow 0.2s ease',
};

const thumbWrapperStyle = {
  flexShrink: 0,
  width: 88,
  height: 88,
  borderRadius: 18,
  overflow: 'hidden',
  background: '#f1f5f9',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const thumbImageStyle = {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
};

const thumbPlaceholderStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
  height: '100%',
  color: '#94a3b8',
  fontSize: 12,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: 0.7,
};

const infoStyle = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};

const nameStyle = {
  margin: 0,
  fontSize: 18,
  fontWeight: 600,
  color: '#0f172a',
};

const descriptionStyle = {
  margin: 0,
  color: '#475569',
  lineHeight: 1.45,
  fontSize: 14,
};

const chipRowStyle = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
};

const chipStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '4px 10px',
  borderRadius: 999,
  background: '#eff6ff',
  color: '#1e3a8a',
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: 0.2,
  textTransform: 'uppercase',
};

