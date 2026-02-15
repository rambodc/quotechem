import React, { useMemo, useState, useEffect } from 'react';
import './Home.css';

const INITIAL_PROMPT =
  "Hey — I'm QuoteChem. I can get you pricing from suppliers. What chemical are you looking for, how much, and where should it be delivered?";
const ROTATING_HEADLINES = [
  'Source Bulk Chemicals Smarter',
  'Verified Suppliers. Competitive Pricing.',
  'Quotes in Minutes, Not Days.',
];
const SESSION_STORAGE_KEY = 'quotechem.publicSessionId';

function readStoredSessionId() {
  try {
    return window.localStorage.getItem(SESSION_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

function writeStoredSessionId(sessionId) {
  try {
    if (!sessionId) return;
    window.localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
  } catch {
    // ignore storage failures
  }
}

function clearStoredSessionId() {
  try {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // ignore storage failures
  }
}

function endpointBase() {
  const explicit = process.env.REACT_APP_QUOTECHEM_API_BASE;
  if (explicit) return explicit.replace(/\/$/, '');

  const projectId = process.env.REACT_APP_FIREBASE_PROJECT_ID;
  if (projectId) return `https://us-central1-${projectId}.cloudfunctions.net`;

  return '';
}

async function postJson(path, payload) {
  const base = endpointBase();
  if (!base) throw new Error('Missing API base URL. Set REACT_APP_QUOTECHEM_API_BASE or Firebase project id.');

  const response = await fetch(`${base}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok === false) {
    throw new Error(data?.error || `Request failed (${response.status})`);
  }

  return data;
}

function normalizeMessage(message) {
  return {
    id: message.id || `msg-${Date.now()}-${Math.random()}`,
    role: message.role || 'assistant',
    content: message.content || '',
    quickReplies: Array.isArray(message.quickReplies) ? message.quickReplies : [],
  };
}

function getLatestAssistant(messages) {
  const latest = [...messages].reverse().find((item) => item.role === 'assistant');
  if (!latest) return { id: 'initial', role: 'assistant', content: INITIAL_PROMPT, quickReplies: [] };
  return latest;
}

function buildSummaryRows(profile) {
  const location = [profile.locationCity, profile.locationStateProvince, profile.locationCountry].filter(Boolean).join(', ');

  const rows = [
    ['Chemical', profile.chemicalName],
    ['Quantity', profile.quantity || profile.quantityRaw],
    ['Delivery', location],
    ['Packaging', profile.packagingPreference],
    ['Grade', profile.gradeSpec],
    ['Needed by', profile.neededBy],
    ['Frequency', profile.frequency],
    ['Email', profile.email],
  ];

  return rows.filter(([, value]) => value);
}

export default function Home() {
  const [sessionId, setSessionId] = useState('');
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [assistantMessage, setAssistantMessage] = useState({
    id: 'initial',
    role: 'assistant',
    content: INITIAL_PROMPT,
    quickReplies: [],
  });

  const [profile, setProfile] = useState({});
  const [missingRequired, setMissingRequired] = useState([]);
  const [completed, setCompleted] = useState(false);
  const [rfqId, setRfqId] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const [headlineIndex, setHeadlineIndex] = useState(0);
  const [headlineVisible, setHeadlineVisible] = useState(true);

  const quickChoices = useMemo(() => assistantMessage.quickReplies || [], [assistantMessage]);
  const summaryRows = useMemo(() => buildSummaryRows(profile), [profile]);

  const bootSession = async ({ forceNew = false } = {}) => {
    const storedSessionId = !forceNew ? readStoredSessionId() : '';
    const payload = {
      metadata: {
        locale: typeof navigator !== 'undefined' ? navigator.language : '',
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        referrer: typeof document !== 'undefined' ? document.referrer : '',
      },
      ...(storedSessionId ? { sessionId: storedSessionId } : {}),
    };

    const data = await postJson('createPublicSession', payload);

    setSessionId(data.sessionId);
    writeStoredSessionId(data.sessionId);

    const restored = Array.isArray(data?.session?.messages) ? data.session.messages.map(normalizeMessage) : [];
    const latestAssistant = getLatestAssistant(restored);

    setAssistantMessage(latestAssistant);
    setProfile(data?.session?.profile || {});
    setMissingRequired(Array.isArray(data?.session?.missingRequired) ? data.session.missingRequired : []);
    setCompleted(Boolean(data?.session?.completed));
    setRfqId(data?.session?.rfqId || '');
  };

  const startFreshSession = async () => {
    const confirmed = window.confirm('Start a new chat session? This will clear current chat context.');
    if (!confirmed || loading) return;

    clearStoredSessionId();
    setError('');
    setDraft('');
    setShowDetails(false);
    setCompleted(false);
    setRfqId('');
    setProfile({});
    setMissingRequired([]);
    setAssistantMessage({
      id: 'initial',
      role: 'assistant',
      content: INITIAL_PROMPT,
      quickReplies: [],
    });

    try {
      setLoading(true);
      await bootSession({ forceNew: true });
    } catch (err) {
      setError(err?.message || 'Unable to start a new session.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;

    const init = async () => {
      try {
        await bootSession();
      } catch (err) {
        if (!active) return;
        setError(err?.message || 'Unable to initialize session.');
      }
    };

    init();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let fadeTimer = null;
    const timer = setInterval(() => {
      setHeadlineVisible(false);
      fadeTimer = setTimeout(() => {
        setHeadlineIndex((prev) => (prev + 1) % ROTATING_HEADLINES.length);
        setHeadlineVisible(true);
      }, 220);
    }, 2500);

    return () => {
      clearInterval(timer);
      if (fadeTimer) clearTimeout(fadeTimer);
    };
  }, []);

  const sendMessage = async (input) => {
    const value = input.trim();
    if (!value || !sessionId || loading) return;

    setError('');
    setDraft('');
    setLoading(true);

    try {
      const data = await postJson('chatPublicAssistant', { sessionId, message: value });
      const assistantReply = data.assistant?.reply || 'Tell me more about your requirements.';
      const assistantChoices = Array.isArray(data.quickChoices)
        ? data.quickChoices
        : Array.isArray(data.assistant?.quickReplies)
          ? data.assistant.quickReplies
          : [];

      setAssistantMessage({
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: assistantReply,
        quickReplies: assistantChoices,
      });

      setProfile(data.profile || {});
      setMissingRequired(Array.isArray(data.missingRequired) ? data.missingRequired : []);
      setCompleted(Boolean(data.completed));
      setRfqId(data.rfqId || '');
    } catch (err) {
      setError(err?.message || 'Failed to send message.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="public-home">
      <div className="public-home-glow" aria-hidden />

      <header className="home-topbar">
        <div className="home-brand">
          <img src={`${process.env.PUBLIC_URL}/assets/quotechem-logo.png`} alt="QuoteChem" className="home-logo" />
        </div>
        <button type="button" className="session-reset-btn" onClick={startFreshSession} title="Start new chat" disabled={loading}>
          ↻
        </button>
      </header>

      <div className="home-rotator" aria-live="polite">
        <p className={`rotator-text ${headlineVisible ? 'is-visible' : ''}`}>
          {ROTATING_HEADLINES[headlineIndex]}
        </p>
      </div>

      <div className="chat-card">
        <div key={assistantMessage.id} className="assistant-display">
          <p>{assistantMessage.content}</p>
        </div>

        {quickChoices.length > 0 ? (
          <div className="quick-choice-row">
            {quickChoices.map((choice) => (
              <button key={choice} type="button" className="quick-choice" disabled={loading} onClick={() => sendMessage(choice)}>
                {choice}
              </button>
            ))}
          </div>
        ) : null}

        <form
          className="chat-input-row"
          onSubmit={(event) => {
            event.preventDefault();
            sendMessage(draft);
          }}
        >
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                sendMessage(draft);
              }
            }}
            placeholder="Type what you need..."
            disabled={!sessionId || loading}
            rows={2}
          />
          <button type="submit" disabled={!sessionId || loading || !draft.trim()}>
            Send
          </button>
        </form>

        <div className="chat-helper-actions">
          <button
            type="button"
            className="details-toggle"
            onClick={() => setShowDetails((prev) => !prev)}
            aria-expanded={showDetails}
          >
            <span className={`details-arrow ${showDetails ? 'is-open' : ''}`} aria-hidden>
              ▼
            </span>
            <span>Details</span>
          </button>
          {showDetails ? (
            <div className="details-panel">
              <button
                type="button"
                className="notes-btn"
                disabled={loading || !sessionId}
                onClick={() => setDraft((prev) => (prev ? `${prev}\nSpec/notes: ` : 'Spec/notes: '))}
              >
                Paste spec / notes
              </button>
              {missingRequired.length > 0 ? <p className="status-text">Missing: {missingRequired.join(', ')}</p> : null}
            </div>
          ) : null}
        </div>

        {completed ? (
          <div className="completion-card">
            <h2>Request Submitted</h2>
            <p>We sent your confirmation email and started supplier outreach.</p>
            {rfqId ? <p className="rfq-id">RFQ ID: {rfqId}</p> : null}
            <div className="completion-grid">
              {summaryRows.map(([label, value]) => (
                <p key={label} className="completion-row">
                  <span>{label}: </span>
                  <strong>{value}</strong>
                </p>
              ))}
            </div>
          </div>
        ) : null}

        {loading ? <p className="status-text">Working on it...</p> : null}
        {error ? <p className="status-text status-error">{error}</p> : null}
      </div>
    </section>
  );
}
