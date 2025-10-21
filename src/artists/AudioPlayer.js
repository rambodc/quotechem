// src/artists/AudioPlayer.js
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  FaBars,
  FaStepBackward,
  FaStepForward,
  FaPlay,
  FaPause,
  FaHeart,
} from 'react-icons/fa';
import './AudioPlayer.css';

/**
 * Minimal, reusable audio player (black bar style).
 *
 * Props:
 * - src?: string
 * - playlist?: Array<{ id?: string, title?: string, url: string }>
 * - title?: string                         // fallback if playlist item has no title
 * - autoPlay?: boolean
 * - startTime?: number
 */
export default function AudioPlayer({
  src,
  playlist,
  title = '',
  autoPlay = false,
  startTime = 0,
}) {
  const hasList = Array.isArray(playlist) && playlist.length > 0;
  const [index, setIndex] = useState(0);

  const active = useMemo(() => {
    if (hasList) {
      const it = playlist[index] || playlist[0];
      return { url: it?.url || '', title: it?.title || title || 'Audio' };
    }
    return { url: src || '', title: title || 'Audio' };
  }, [hasList, playlist, index, src, title]);

  const audioRef = useRef(null);

  // Core state
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);

  // Track whether we should auto-play after a manual next/prev change
  const shouldAutoplayRef = useRef(false);

  // % for slider fill
  const pct = useMemo(
    () => (duration > 0 ? Math.max(0, Math.min(100, (current / duration) * 100)) : 0),
    [current, duration]
  );

  // Format mm:ss
  const fmt = (s) => {
    if (!isFinite(s)) return '0:00';
    const m = Math.floor(s / 60);
    const ss = `${Math.floor(s % 60)}`.padStart(2, '0');
    return `${m}:${ss}`;
  };

  // Wire audio element
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;

    const onLoaded = () => {
      const d = isFinite(a.duration) ? a.duration : 0;
      setDuration(d);
      if (startTime > 0 && d > startTime) {
        a.currentTime = startTime;
        setCurrent(startTime);
      }
      // Auto-play on load if requested OR when we navigated via next/prev
      if (autoPlay || shouldAutoplayRef.current) {
        a.play().catch(() => {});
        shouldAutoplayRef.current = false; // reset the one-shot flag
      }
    };
    const onTime = () => setCurrent(a.currentTime || 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnd = () => setPlaying(false);

    a.addEventListener('loadedmetadata', onLoaded);
    a.addEventListener('durationchange', onLoaded);
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('play', onPlay);
    a.addEventListener('pause', onPause);
    a.addEventListener('ended', onEnd);

    return () => {
      a.removeEventListener('loadedmetadata', onLoaded);
      a.removeEventListener('durationchange', onLoaded);
      a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('play', onPlay);
      a.removeEventListener('pause', onPause);
      a.removeEventListener('ended', onEnd);
    };
  }, [autoPlay, startTime]);

  // Load / swap source when active url changes
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    setPlaying(false);
    setDuration(0);
    setCurrent(0);
    a.src = active.url || '';
    a.load();
  }, [active.url]);

  // Controls
  const toggle = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) a.play().catch(() => {});
    else a.pause();
  }, []);

  const seek = useCallback(
    (value) => {
      const a = audioRef.current;
      if (!a || !isFinite(value)) return;
      a.currentTime = Math.max(0, Math.min(value, duration || 0));
    },
    [duration]
  );

  const hasPrev = hasList && index > 0;
  const hasNext = hasList && index < (playlist?.length || 0) - 1;

  const prev = () => {
    if (!hasPrev) return;
    shouldAutoplayRef.current = true;    // ensure auto-play after swap
    setIndex((i) => i - 1);
  };

  const next = () => {
    if (!hasNext) return;
    shouldAutoplayRef.current = true;    // ensure auto-play after swap
    setIndex((i) => i + 1);
  };

  // Keyboard: space toggles, arrows seek
  const onKey = (e) => {
    if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault();
      toggle();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      seek((audioRef.current?.currentTime || 0) - 5);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      seek((audioRef.current?.currentTime || 0) + 5);
    }
  };

  return (
    <div
      className="apx apx--v2"
      tabIndex={0}
      onKeyDown={onKey}
      role="group"
      aria-label={active.title ? `Audio player for ${active.title}` : 'Audio player'}
    >
      <audio ref={audioRef} preload="auto" />

      {/* Title above the slider */}
      <div className="apx2__title" title={active.title}>
        {active.title}
      </div>

      {/* Slider row */}
      <div className="apx2__slider">
        <input
          className="apx2__range"
          type="range"
          min={0}
          max={duration || 0}
          step="0.1"
          value={current}
          onChange={(e) => seek(parseFloat(e.target.value))}
          aria-label="Seek"
          style={{ '--apx-pct': `${pct}%` }}
        />
      </div>

      {/* Times just beneath slider */}
      <div className="apx2__times" aria-hidden="true">
        <span className="apx2__time apx2__time--left">{fmt(current)}</span>
        <span className="apx2__time apx2__time--right">{fmt(duration)}</span>
      </div>

      {/* Controls row */}
      <div className="apx2__controls">
        <button className="apx2__icon" aria-label="More (placeholder)" title="More">
          <FaBars />
        </button>

        <button
          className="apx2__icon"
          onClick={prev}
          disabled={!hasPrev}
          aria-label="Previous"
          title="Previous"
        >
          <FaStepBackward />
        </button>

        <button
          className="apx2__play"
          onClick={toggle}
          aria-label={playing ? 'Pause' : 'Play'}
          aria-pressed={playing}
          title={playing ? 'Pause' : 'Play'}
        >
          {/* nudge the play glyph ~1px for optical centering */}
          {playing ? (
            <FaPause />
          ) : (
            <FaPlay style={{ transform: 'translateX(1px)' }} />
          )}
        </button>

        <button
          className="apx2__icon"
          onClick={next}
          disabled={!hasNext}
          aria-label="Next"
          title="Next"
        >
          <FaStepForward />
        </button>

        <button className="apx2__icon" aria-label="Love (placeholder)" title="Love">
          <FaHeart />
        </button>
      </div>
    </div>
  );
}
