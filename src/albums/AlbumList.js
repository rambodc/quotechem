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

  const [purchasedDrops, setPurchasedDrops] = useState([]);
  const [purchasesLoading, setPurchasesLoading] = useState(true);
  const [purchasesError, setPurchasesError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!appUser?.id) {
      setPurchasedDrops([]);
      setPurchasesLoading(false);
      setPurchasesError('');
      return;
    }

    let q = query(
      collection(db, 'drops'),
      where('purchasedByUid', '==', appUser.id),
      orderBy('purchasedAt', 'desc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map((docSnap) => {
          const data = docSnap.data() || {};
          const mediaUrl = data.mediaUrl || data.mediaPhoto || '';
          const derivedMediaType =
            data.mediaType ||
            (mediaUrl && mediaUrl.toLowerCase().endsWith('.mp4')
              ? 'video'
              : mediaUrl
              ? 'image'
              : '');
          return {
            id: docSnap.id,
            dropId: data.dropId || docSnap.id,
            title: data.title || 'Untitled Drop',
            artistName: data.artistName || '',
            artistId: data.artistId || '',
            albumTitle: data.albumTitle || '',
            albumId: data.albumId || '',
            mediaUrl,
            mediaType: derivedMediaType,
            purchasedAt: data.purchasedAt,
          };
        });
        setPurchasedDrops(list);
        setPurchasesLoading(false);
        setPurchasesError('');
      },
      (err) => {
        console.error('user purchased drops snapshot error:', err);
        setPurchasedDrops([]);
        setPurchasesLoading(false);
        setPurchasesError(err?.message || 'Failed to load your purchased drops.');
      }
    );

    return () => unsubscribe();
  }, [appUser?.id]);

  const truncate = (text, maxLength) => {
    if (!text) return '';
    return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
  };

  const isLoading = purchasesLoading;

  const content = useMemo(() => {
    if (isLoading) {
      return <p style={{ color: '#4b5563', textAlign: 'center' }}>Loading…</p>;
    }

    if (purchasesError) {
      return <div className={styles.error}>{purchasesError}</div>;
    }

    if (!purchasedDrops.length) {
      return <div className={styles.emptyState}>Your purchased drops will appear here.</div>;
    }

    const filtered = purchasedDrops.filter((drop) => {
      if (!search.trim()) return true;
      const term = search.trim().toLowerCase();
      return (
        (drop.title || '').toLowerCase().includes(term) ||
        (drop.artistName || '').toLowerCase().includes(term)
      );
    });

    return (
      <>
        <div className={styles.searchRow}>
          <input
            type="search"
            placeholder="Search by drop or artist"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={styles.searchInput}
          />
        </div>
        <div className={styles.list}>
          {filtered.map((drop) => (
            <button
              key={drop.id}
              type="button"
              className={styles.card}
              onClick={() => navigate(`/drop/${drop.dropId}`)}
            >
              <div className={styles.mediaThumb}>
                {drop.mediaUrl ? (
                  drop.mediaType === 'video' ? (
                    <video src={drop.mediaUrl} muted autoPlay loop playsInline />
                  ) : (
                    <img src={drop.mediaUrl} alt={drop.title} />
                  )
                ) : (
                  <div className={styles.placeholder}>No Media</div>
                )}
              </div>
              <div className={styles.cardBody}>
                <h2 className={styles.title}>{truncate(drop.title, 48)}</h2>
                {drop.artistName ? (
                  <p className={styles.description}>{truncate(drop.artistName, 80)}</p>
                ) : null}
                <div className={styles.metaRow}>
                  {drop.albumTitle ? <span>{drop.albumTitle}</span> : null}
                  {drop.purchasedAt ? <span>Purchased</span> : null}
                </div>
              </div>
            </button>
          ))}
          {filtered.length === 0 ? (
            <div className={styles.emptyState}>No matches for that search.</div>
          ) : null}
        </div>
      </>
    );
  }, [
    purchasedDrops,
    isLoading,
    purchasesError,
    search,
    navigate,
  ]);

  return (
    <div className={layoutStyles.homeContainer} style={{ paddingBottom: 0 }}>
      <TopBar hideLeft>
        <MobileNavTabs />
      </TopBar>

      <div className={styles.pageShell}>
        <header className={styles.header}>
          <h1>Purchased</h1>
          <p>Every drop you’ve bought lives here. Search by drop title or artist.</p>
        </header>

        {content}
      </div>
    </div>
  );
}
