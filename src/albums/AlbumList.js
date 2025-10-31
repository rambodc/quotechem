// src/albums/AlbumList.js
import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import TopBar from '../components/TopBar';
import MobileNavTabs from '../components/MobileNavTabs';
import layoutStyles from '../styles/layout.module.css';
import styles from './AlbumList.module.css';
import { db } from '../firebase';
import { UserContext } from '../App';

export default function AlbumList() {
  const navigate = useNavigate();
  const appUser = useContext(UserContext);

  const [allAlbums, setAllAlbums] = useState([]);
  const [albumsLoading, setAlbumsLoading] = useState(true);
  const [albumError, setAlbumError] = useState('');

  const [purchasedAlbumIds, setPurchasedAlbumIds] = useState([]);
  const [purchasesLoading, setPurchasesLoading] = useState(true);
  const [purchasesError, setPurchasesError] = useState('');

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
        setAllAlbums(list);
        setAlbumsLoading(false);
        setAlbumError('');
      },
      (err) => {
        console.error('albums snapshot error:', err);
        setAlbumError(err?.message || 'Failed to load albums.');
        setAllAlbums([]);
        setAlbumsLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!appUser?.id) {
      setPurchasedAlbumIds([]);
      setPurchasesLoading(false);
      setPurchasesError('');
      return;
    }

    const dropsQuery = query(
      collection(db, 'drops'),
      where('ownedByUid', '==', appUser.id)
    );

    const unsubscribe = onSnapshot(
      dropsQuery,
      (snapshot) => {
        const unique = new Set();
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() || {};
          if (data.albumId) {
            unique.add(String(data.albumId));
          }
        });
        setPurchasedAlbumIds(Array.from(unique));
        setPurchasesLoading(false);
        setPurchasesError('');
      },
      (err) => {
        console.error('user drops snapshot error:', err);
        setPurchasedAlbumIds([]);
        setPurchasesLoading(false);
        setPurchasesError(err?.message || 'Failed to load your albums.');
      }
    );

    return () => unsubscribe();
  }, [appUser?.id]);

  const truncate = (text, maxLength) => {
    if (!text) return '';
    return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
  };

  const derivedAlbums = useMemo(() => {
    if (!purchasedAlbumIds.length) return [];
    const allowed = new Set(purchasedAlbumIds);
    return allAlbums.filter((album) => allowed.has(album.albumId));
  }, [allAlbums, purchasedAlbumIds]);

  const isLoading = albumsLoading || purchasesLoading;

  const content = useMemo(() => {
    if (isLoading) {
      return <p style={{ color: '#4b5563', textAlign: 'center' }}>Loading…</p>;
    }

    if (albumError) {
      return <div className={styles.error}>{albumError}</div>;
    }

    if (purchasesError) {
      return <div className={styles.error}>{purchasesError}</div>;
    }

    if (!purchasedAlbumIds.length) {
      return (
        <div className={styles.emptyState}>
          You have not collected any albums yet. Purchase a drop to see its album here.
        </div>
      );
    }

    if (derivedAlbums.length === 0) {
      return (
        <div className={styles.emptyState}>
          We could not find details for the albums tied to your drops right now.
        </div>
      );
    }

    return (
      <div className={styles.grid}>
        {derivedAlbums.map((album) => (
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
  }, [
    albumError,
    derivedAlbums,
    isLoading,
    navigate,
    purchasedAlbumIds.length,
    purchasesError,
  ]);

  return (
    <div className={layoutStyles.homeContainer} style={{ paddingBottom: 0 }}>
      <TopBar hideLeft>
        <MobileNavTabs />
      </TopBar>

      <div className={styles.pageShell}>
        <header className={styles.header}>
          <h1>My Albums</h1>
          <p>Albums appear here once you’ve collected at least one drop from them.</p>
        </header>

        {content}
      </div>
    </div>
  );
}
