// src/albums/AlbumList.js
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import TopBar from '../components/TopBar';
import MobileNavTabs from '../components/MobileNavTabs';
import layoutStyles from '../styles/layout.module.css';
import styles from './AlbumList.module.css';
import { db } from '../firebase';

export default function AlbumList() {
  const navigate = useNavigate();
  const [albums, setAlbums] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const albumsQuery = query(collection(db, 'albums'), orderBy('updatedAt', 'desc'));
    const unsubscribe = onSnapshot(
      albumsQuery,
      (snapshot) => {
        const list = snapshot.docs.map((docSnap) => {
          const data = docSnap.data() || {};
          return {
            id: docSnap.id,
            albumId: data.albumId || docSnap.id,
            title: data.title || 'Untitled Album',
            description: data.description || '',
            coverUrl: data.coverUrl || '',
            dropCount: typeof data.dropCount === 'number' ? data.dropCount : 0,
            updatedAt: data.updatedAt,
          };
        });
        setAlbums(list);
        setLoading(false);
        setError('');
      },
      (err) => {
        console.error('albums snapshot error:', err);
        setError(err?.message || 'Failed to load albums.');
        setAlbums([]);
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
    if (loading) {
      return <p style={{ color: '#4b5563', textAlign: 'center' }}>Loading…</p>;
    }

    if (error) {
      return <div className={styles.error}>{error}</div>;
    }

    if (albums.length === 0) {
      return <div className={styles.emptyState}>No albums yet. Create one to get started.</div>;
    }

    return (
      <div className={styles.grid}>
        {albums.map((album) => (
          <button
            key={album.id}
            type="button"
            onClick={() => navigate(`/album/${album.albumId}`)}
            className={styles.card}
          >
            <div className={styles.cover}>
              {album.coverUrl ? (
                <img src={album.coverUrl} alt={album.title} />
              ) : (
                <div className={styles.placeholder}>No Cover</div>
              )}
            </div>

            <div>
              <h2 className={styles.title}>{truncate(album.title, 60)}</h2>
              {album.description ? (
                <p className={styles.description}>{truncate(album.description, 140)}</p>
              ) : null}
            </div>

            <div className={styles.metaRow}>
              <span>{album.dropCount} {album.dropCount === 1 ? 'drop' : 'drops'}</span>
            </div>
          </button>
        ))}
      </div>
    );
  }, [albums, error, loading, navigate]);

  return (
    <div className={layoutStyles.homeContainer} style={{ paddingBottom: 0 }}>
      <TopBar hideLeft>
        <MobileNavTabs />
      </TopBar>

      <div className={styles.pageShell}>
        <header className={styles.header}>
          <h1>Albums</h1>
          <p>Organize drops into curated albums for easy browsing and storytelling.</p>
        </header>

        <div className={styles.actions}>
          <button
            type="button"
            className={layoutStyles.createBtn}
            onClick={() => navigate('/create-album')}
          >
            Create Album
          </button>
        </div>

        {content}
      </div>
    </div>
  );
}
