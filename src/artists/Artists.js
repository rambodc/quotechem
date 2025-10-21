// src/Artists.js
import React, { useContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { db } from '../firebase';
import { collection, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import TopBar from '../components/TopBar';
import AudioPlayer from '../components/AudioPlayer';
import { UserContext } from '../App';
import layoutStyles from '../styles/layout.module.css';
import { FiCheckCircle } from 'react-icons/fi';

function Artists() {
  const appUser = useContext(UserContext); // null when signed out (public view)
  const { artistUid } = useParams();
  const navigate = useNavigate();

  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [markingInterest, setMarkingInterest] = useState(false);
  const [interestSuccess, setInterestSuccess] = useState(false);
  const [interestError, setInterestError] = useState('');
  const interestTimerRef = useRef(null);
  // No sidebar; keep layout simple

  // --------- Track helpers ----------
  const cleanTrackTitle = (title) => {
    if (!title) return '';
    const cleaned = `${title}`.replace(/\s*Track$/i, '').trim();
    return cleaned || title;
  };

  const normalizeTracks = (src, singleTrackUrl, artistName) => {
    const list = Array.isArray(src) ? src : [];
    const normalized = list
      .slice(0, 3)
      .map((t, i) => ({
        id: t.id || `trk_${i}`,
        title: cleanTrackTitle(t.title) || `Song ${i + 1}`,
        url: t.url || t.file || '',
      }))
      .filter((t) => t.url);
    if (normalized.length) return normalized;
    if (singleTrackUrl) {
      return [
        {
          id: 'artist_track',
          title: cleanTrackTitle(artistName) || 'Featured',
          url: singleTrackUrl,
        },
      ];
    }
    return [];
  };

  // --------- Fetch detail (public page) ----------
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const ref = doc(db, 'artists', artistUid);
        const snap = await getDoc(ref);

        if (!alive) return;
        if (snap.exists()) {
          const data = snap.data();
          const artistFullName = data.artistFullName || 'Untitled';
          const artistAudioUrl = data.artistAudioUrl || '';
          setItem({
            title:  data.artistFullName || 'Untitled',
            desc:   data.artistDescription || '',
            rating: data.rating || '',
            nights: data.nights || '',
            img:    data.artistProfilePhoto || '',
            video:     data.video || data.videoMp4 || data.videoUrl || '',
            videoWebm: data.videoWebm || '',
            animWebp:  data.animWebp || '',
            poster:    data.poster || '',
            tracks: normalizeTracks(data.tracks, artistAudioUrl, artistFullName),
            artistId: data.artistId || snap.id,
            audioUrl: artistAudioUrl,
          });
        } else {
          setError('Artist not found.');
        }
      } catch (e) {
        setError(e.message || 'Failed to load.');
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => { alive = false; };
  }, [artistUid]);

  // --------- Back handler with smart fallback ----------
  const handleBack = useCallback(() => {
    if (window.history.length > 2) {
      navigate(-1);
    } else {
      navigate(appUser ? '/home' : '/');
    }
  }, [navigate, appUser]);

  // --------- Build hero media set ----------
  const hero = useMemo(() => {
    return {
      mp4: item?.video || '',
      webm: item?.videoWebm || '',
      webp: item?.animWebp || '',
      poster: item?.poster || item?.img || '',
      title: item?.title || 'Untitled',
    };
  }, [item]);

  // Tracks to feed the player (if provided)
  const tracks = useMemo(() => {
    if (item?.tracks && item.tracks.length) return item.tracks;
    if (item?.audioUrl) {
      return [
        {
          id: 'artist_track',
          title: cleanTrackTitle(item?.title) || 'Featured',
          url: item.audioUrl,
        },
      ];
    }
    return [];
  }, [item]);

  useEffect(() => {
    return () => {
      if (interestTimerRef.current) {
        clearTimeout(interestTimerRef.current);
      }
    };
  }, []);

  const handleMarkInterested = useCallback(async () => {
    if (!appUser?.id) {
      navigate('/signin');
      return;
    }
    if (markingInterest) return;
    try {
      setMarkingInterest(true);
      setInterestError('');
      const artistRef = doc(db, 'artists', artistUid);
      const interestedRef = doc(collection(artistRef, 'Interested'), appUser.id);
      await setDoc(
        interestedRef,
        {
          userId: appUser.id,
          lastMarkedAt: serverTimestamp(),
        },
        { merge: true }
      );
      setInterestSuccess(true);
      if (interestTimerRef.current) clearTimeout(interestTimerRef.current);
      interestTimerRef.current = setTimeout(() => setInterestSuccess(false), 2000);
    } catch (err) {
      console.error('mark interested error:', err);
      setInterestError('Failed to record interest. Please try again.');
    } finally {
      setMarkingInterest(false);
    }
  }, [appUser?.id, artistUid, markingInterest, navigate]);

  return (
    <div className={layoutStyles.detailPage}>
      {/* Reusable top bar: public page, with Back on the left; optional center tabs */}
      <TopBar variant="back" backLabel="Back" onBack={handleBack} />

      {/* Page content; offset for fixed TopBar */}
      <div className={layoutStyles.detailContent} style={{ marginTop: 64 }}>
        {loading ? (
          <p>Loading…</p>
        ) : error ? (
          <p className="error">{error}</p>
        ) : (
          <div className={layoutStyles.detailShell}>
            {/* Responsive grid:
                - < 1100px: single column, max 500px, centered
                - ≥ 1100px: two columns 500 / 500 with gap, left hero is sticky
            */}
            <div className={layoutStyles.detailGrid}>
              {/* Left: Hero (video/image) */}
              <div className={layoutStyles.detailLeft}>
                <div className={`${layoutStyles.overlayHero} ${layoutStyles.detailHero}`}>
                  <VideoHero {...hero} />
                </div>
              </div>

              {/* Right: Content + Custom Audio Player */}
              <div className={layoutStyles.detailRight}>
                <div className={layoutStyles.overlayBody}>
                  <h2 className={layoutStyles.overlayTitle}>{item?.title || 'Untitled'}</h2>

                  {(item?.rating || item?.nights) && (
                    <div className={layoutStyles.chips}>
                      {item?.rating && <span>{item.rating}</span>}
                      {item?.nights && <span>{item.nights}</span>}
                    </div>
                  )}

                  {item?.desc && <p className={layoutStyles.overlayDesc}>{item.desc}</p>}

                  {tracks.length > 0 && (
                    <AudioPlayer playlist={tracks.map((t) => ({ title: t.title, url: t.url }))} />
                  )}

                  <div style={{ marginTop: tracks.length > 0 ? 18 : 12 }}>
                    <p style={{ marginBottom: 10, fontWeight: 600, color: '#0f172a' }}>
                      Interested in this artist’s collectibles?
                    </p>
                    <button
                      type="button"
                      onClick={handleMarkInterested}
                      disabled={markingInterest}
                      style={{
                        padding: '12px 24px',
                        borderRadius: 14,
                        border: 'none',
                        background: markingInterest ? '#94a3b8' : '#0ea5e9',
                        color: '#fff',
                        fontWeight: 600,
                        letterSpacing: 0.2,
                        cursor: markingInterest ? 'default' : 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        boxShadow: '0 20px 36px rgba(14,165,233,0.28)',
                        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                      }}
                      onMouseEnter={(e) => {
                        if (!markingInterest) {
                          e.currentTarget.style.transform = 'translateY(-1px)';
                          e.currentTarget.style.boxShadow = '0 24px 40px rgba(14,165,233,0.32)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = '0 20px 36px rgba(14,165,233,0.28)';
                      }}
                    >
                      {markingInterest ? 'Saving…' : 'Interested'}
                    </button>
                    {interestError && (
                      <p style={{ marginTop: 10, color: '#b91c1c', fontSize: 13 }}>{interestError}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {interestSuccess && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,23,42,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: 20,
              padding: '32px 36px',
              boxShadow: '0 32px 60px rgba(15,23,42,0.32)',
              textAlign: 'center',
              maxWidth: 340,
              width: '90%',
            }}
          >
            <FiCheckCircle size={46} color="#10b981" style={{ marginBottom: 12 }} />
            <h3 style={{ margin: '0 0 8px', color: '#0f172a' }}>Marked as Interested!</h3>
            <p style={{ margin: 0, color: '#475569', fontSize: 15 }}>
              You’ve registered interest in this artist’s collectibles.
            </p>
          </div>
        </div>
      )}

      {/* No sidebar */}
    </div>
  );
}

/* ==================== VideoHero ==================== */
function VideoHero({ mp4, webm, webp, poster, title }) {
  const videoRef = useRef(null);
  const [mode, setMode] = useState(() => (mp4 || webm ? 'video' : (webp ? 'webp' : 'poster')));

  useEffect(() => {
    setMode(mp4 || webm ? 'video' : (webp ? 'webp' : 'poster'));
  }, [mp4, webm, webp, poster]);

  useEffect(() => {
    if (mode !== 'video') return;
    const v = videoRef.current;
    if (!v) return;

    v.muted = true;
    v.playsInline = true;

    const onCanPlay = async () => {
      try {
        await v.play();
      } catch {
        setMode(webp ? 'webp' : 'poster');
      }
    };

    v.addEventListener('canplay', onCanPlay, { once: true });
    return () => v.removeEventListener('canplay', onCanPlay);
  }, [mode, webp]);

  if (mode === 'webp' && webp) {
    return (
      <img
        src={webp}
        alt={title}
        style={{ width: '100%', height: 'auto', objectFit: 'cover', display: 'block', background: '#000' }}
      />
    );
  }

  if (mode === 'poster') {
    return (
      <img
        src={poster || ''}
        alt={title}
        style={{ width: '100%', height: 'auto', objectFit: 'cover', display: 'block', background: '#000' }}
      />
    );
  }

  return (
    <video
      ref={videoRef}
      autoPlay
      loop
      muted
      playsInline
      preload="auto"
      poster={poster || undefined}
      style={{ width: '100%', height: 'auto', objectFit: 'cover', display: 'block', background: '#000' }}
      onError={() => setMode(webp ? 'webp' : 'poster')}
    >
      {mp4 ? <source src={mp4} type="video/mp4" /> : null}
      {webm ? <source src={webm} type="video/webm" /> : null}
    </video>
  );
}

export default Artists;
