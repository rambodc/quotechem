// src/drop/dropList.js
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import TopBar from '../components/TopBar';
import MobileNavTabs from '../components/MobileNavTabs';
import layoutStyles from '../styles/layout.module.css';
import { db } from '../firebase';

export default function DropList() {
  const navigate = useNavigate();
  const [drops, setDrops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const dropsQuery = query(collection(db, 'drops'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(
      dropsQuery,
      (snap) => {
        const list = snap.docs.map((docSnap) => {
          const data = docSnap.data() || {};
          const dropId = data.dropId || docSnap.id;
          return {
            id: docSnap.id,
            dropId,
            title: data.title || 'Untitled Drop',
            description: data.description || '',
            mediaPhoto: data.mediaPhoto || '',
            type: data.type || '',
            dropVersion: data.dropVersion || '',
            tokenId: data.tokenId || '',
          };
        });
        setDrops(list);
        setLoading(false);
        setError('');
      },
      (err) => {
        console.error('drops snapshot error:', err);
        setError(err?.message || 'Failed to load drops.');
        setDrops([]);
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
    if (drops.length === 0) return <p style={{ color: '#4b5563' }}>No drops yet.</p>;

    return (
      <div style={gridStyle}>
        {drops.map((drop) => (
          <button
            key={drop.dropId}
            type="button"
            onClick={() => navigate(`/drop/${drop.dropId}`)}
            style={cardStyle}
          >
            {drop.mediaPhoto ? (
              <div style={{ width: '100%', paddingBottom: '60%', position: 'relative', borderRadius: 16, overflow: 'hidden' }}>
                <img
                  src={drop.mediaPhoto}
                  alt={drop.title}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                  }}
                />
              </div>
            ) : (
              <div style={placeholderStyle}>No Image</div>
            )}

            <div style={{ textAlign: 'left', width: '100%' }}>
              <h2 style={titleStyle}>{truncate(drop.title, 60)}</h2>
              {drop.description && (
                <p style={descriptionStyle}>{truncate(drop.description, 140)}</p>
              )}
              <div style={metaRowStyle}>
                {drop.type && <span style={pillStyle}>{drop.type}</span>}
                {drop.dropVersion && <span style={pillStyle}>{drop.dropVersion.toUpperCase()}</span>}
                {drop.tokenId && <span style={pillStyle}>Token {truncate(drop.tokenId, 12)}</span>}
              </div>
            </div>
          </button>
        ))}
      </div>
    );
  }, [drops, error, loading, navigate]);

  return (
    <div className={layoutStyles.homeContainer} style={{ paddingBottom: 0 }}>
      <TopBar hideLeft>
        <MobileNavTabs />
      </TopBar>

      <div style={{ maxWidth: 1000, width: '100%', margin: '80px auto 40px', padding: '0 16px' }}>
        <header style={{ textAlign: 'center', marginBottom: 28 }}>
          <h1 style={{ margin: '8px 0 12px' }}>Drops</h1>
          <p style={{ color: '#4b5563' }}>View your latest drops and open any to see more details.</p>
        </header>

        {content}
      </div>
    </div>
  );
}

const gridStyle = {
  display: 'grid',
  gap: 20,
  gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
};

const cardStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  borderRadius: 20,
  border: '1px solid #e5e7eb',
  background: '#ffffff',
  boxShadow: '0 16px 32px rgba(15, 23, 42, 0.08)',
  padding: 18,
  cursor: 'pointer',
  textDecoration: 'none',
  color: '#111827',
  transition: 'transform 0.2s ease, box-shadow 0.2s ease',
};

const placeholderStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: 160,
  borderRadius: 16,
  background: '#f3f4f6',
  color: '#6b7280',
  fontWeight: 500,
};

const titleStyle = {
  margin: '0 0 8px',
  fontSize: 20,
  fontWeight: 600,
  color: '#0f172a',
};

const descriptionStyle = {
  margin: '0 0 12px',
  color: '#475569',
  lineHeight: 1.5,
  fontSize: 14.5,
};

const metaRowStyle = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
};

const pillStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '6px 12px',
  borderRadius: 999,
  background: '#eff6ff',
  color: '#1e3a8a',
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: 0.3,
  textTransform: 'uppercase',
};
