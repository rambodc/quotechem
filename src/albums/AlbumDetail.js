// src/albums/AlbumDetail.js
import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import TopBar from '../components/TopBar';
import layoutStyles from '../styles/layout.module.css';
import styles from './AlbumDetail.module.css';
import { db } from '../firebase';
import { UserContext } from '../App';

export default function AlbumDetail() {
  const { albumId } = useParams();
  const navigate = useNavigate();
  const appUser = useContext(UserContext);

  const [album, setAlbum] = useState(null);
  const [albumLoading, setAlbumLoading] = useState(true);
  const [albumError, setAlbumError] = useState('');

  const [drops, setDrops] = useState([]);
  const [dropsLoading, setDropsLoading] = useState(true);
  const [dropsError, setDropsError] = useState('');

  const handleBack = useCallback(() => {
    if (drop?.albumId) {
      navigate(`/set/${drop.albumId}`, { replace: false });
      return;
    }
    navigate('/purchased');
  }, [drop?.albumId, navigate]);

  useEffect(() => {
    let active = true;

    const loadAlbum = async () => {
      try {
        setAlbumLoading(true);
        setAlbumError('');

        const snap = await getDoc(doc(db, 'sets', albumId));
        if (!active) return;

        if (snap.exists()) {
          setAlbum(snap.data());
        } else {
          setAlbum(null);
          setAlbumError('Set not found.');
        }
      } catch (err) {
        if (!active) return;
        console.error('album fetch error:', err);
        setAlbum(null);
        setAlbumError(err?.message || 'Failed to load set.');
      } finally {
        if (active) setAlbumLoading(false);
      }
    };

    if (albumId) loadAlbum();

    return () => {
      active = false;
    };
  }, [albumId]);

  useEffect(() => {
    if (!albumId) return undefined;

    setDropsLoading(true);
    setDropsError('');

    const dropsCollection = collection(db, 'drops');
    const baseQuery = query(dropsCollection, where('albumId', '==', albumId));
    const orderedQuery = query(
      dropsCollection,
      where('albumId', '==', albumId),
      orderBy('createdAt', 'desc')
    );

    let usingOrdered = true;
    let unsubscribe = () => {};

    const attach = (q) =>
      onSnapshot(
        q,
        (snap) => {
          const list = snap.docs.map((docSnap) => {
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
              mediaUrl,
              mediaType: derivedMediaType,
              type: data.type || '',
              dropVersion: data.dropVersion || '',
              tokenId: data.tokenId || '',
              purchasedByUid: data.purchasedByUid || '',
              purchasedAt: data.purchasedAt || null,
            };
          });

          setDrops(list);
          setDropsLoading(false);
          setDropsError('');
        },
        (err) => {
          console.error('album drops snapshot error:', err);

          if (usingOrdered && err?.code === 'failed-precondition') {
            usingOrdered = false;
            unsubscribe();
            unsubscribe = attach(baseQuery);
            return;
          }

          setDrops([]);
          setDropsLoading(false);
          setDropsError(err?.message || 'Failed to load drops for this set.');
        }
      );

    unsubscribe = attach(orderedQuery);

    return () => unsubscribe();
  }, [albumId]);

  const dropCards = useMemo(() => {
    if (dropsLoading) {
      return <p className={styles.statusText}>Loading drops…</p>;
    }

    if (dropsError) {
      return <p className={styles.error}>{dropsError}</p>;
    }

    if (drops.length === 0) {
      return <p className={styles.statusText}>No drops assigned to this set yet.</p>;
    }

    return (
      <div className={styles.dropsGrid}>
        {drops.map((drop) => (
          <button
            key={drop.id}
            type="button"
            className={styles.dropCard}
            onClick={() => navigate(`/drop/${drop.dropId}`)}
          >
            <div className={styles.dropMedia}>
              {drop.mediaUrl ? (
                drop.mediaType === 'video' ? (
                  <video src={drop.mediaUrl} muted autoPlay loop playsInline />
                ) : (
                  <img src={drop.mediaUrl} alt={drop.title} />
                )
              ) : (
                <div className={styles.dropPlaceholder}>No Media</div>
              )}
            </div>
            <div>
              <h3 className={styles.dropTitle}>{drop.title}</h3>
              <div className={styles.dropMeta}>
                {drop.type ? <span>{drop.type}</span> : null}
                {drop.dropVersion ? <span>{drop.dropVersion.toUpperCase()}</span> : null}
                {drop.tokenId ? <span>Token {drop.tokenId}</span> : null}
              </div>
            </div>
          </button>
        ))}
      </div>
    );
  }, [drops, dropsError, dropsLoading, navigate]);

  const dropCountLabel = album?.dropCount === 1 ? '1 drop' : `${album?.dropCount || 0} drops`;

  return (
    <div className={layoutStyles.detailPage}>
      <TopBar variant="back" backLabel="Set" onBack={handleBack} />

      <div className={styles.pageShell}>
        {albumLoading ? (
          <p className={styles.statusText}>Loading set…</p>
        ) : albumError ? (
          <p className={styles.error}>{albumError}</p>
        ) : album ? (
          <>
            <section className={styles.hero}>
              <div className={styles.coverFrame}>
                {album.coverUrl ? (
                  <img src={album.coverUrl} alt={album.title} />
                ) : (
                  <div className={styles.coverPlaceholder}>No Cover Image</div>
                )}
              </div>

              <div className={styles.info}>
                <h1 className={styles.title}>{album.title || 'Untitled Set'}</h1>
                {album.description ? (
                  <p className={styles.description}>{album.description}</p>
                ) : null}
                <div className={styles.meta}>
                  <span>{dropCountLabel}</span>
                  <span>Set ID: {album.albumId || albumId}</span>
                </div>
              </div>
            </section>

            <section className={styles.dropsSection}>
              <div className={styles.dropsHeader}>
                <h2>Drops in this set</h2>
              </div>
              {dropCards}
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}
