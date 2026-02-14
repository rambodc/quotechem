import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import './Home.css';

const INITIAL_PROMPT =
  "Hey — I'm QuoteChem. I can get you pricing from suppliers. What chemical are you looking for, how much, and where should it be delivered?";

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

function latestQuickChoices(messages) {
  const latestAssistant = [...messages].reverse().find((item) => item.role === 'assistant');
  if (!latestAssistant) return [];
  return Array.isArray(latestAssistant.quickReplies) ? latestAssistant.quickReplies : [];
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
    ['Notes', profile.specNotes],
  ];

  return rows.filter(([, value]) => value);
}

export default function Home() {
  const [sessionId, setSessionId] = useState('');
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [messages, setMessages] = useState([]);
  const [profile, setProfile] = useState({});
  const [intakeStage, setIntakeStage] = useState('collecting_core');
  const [missingRequired, setMissingRequired] = useState([]);
  const [missingPreferred, setMissingPreferred] = useState([]);
  const [profileCompleteness, setProfileCompleteness] = useState(0);
  const [readyForEmail, setReadyForEmail] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [rfqId, setRfqId] = useState('');

  const listRef = useRef(null);

  const quickChoices = useMemo(() => latestQuickChoices(messages), [messages]);
  const summaryRows = useMemo(() => buildSummaryRows(profile), [profile]);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, loading, completed]);

  const bootSession = async () => {
    const data = await postJson('createPublicSession', {
      metadata: {
        locale: typeof navigator !== 'undefined' ? navigator.language : '',
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        referrer: typeof document !== 'undefined' ? document.referrer : '',
      },
    });

    setSessionId(data.sessionId);

    const restored = Array.isArray(data?.session?.messages) ? data.session.messages.map(normalizeMessage) : [];

    if (restored.length === 0) {
      restored.push({
        id: `init-${Date.now()}`,
        role: 'assistant',
        content: INITIAL_PROMPT,
        quickReplies: [],
      });
    }

    setMessages(restored);
    setProfile(data?.session?.profile || {});
    setIntakeStage(data?.session?.intakeStage || 'collecting_core');
    setMissingRequired(Array.isArray(data?.session?.missingRequired) ? data.session.missingRequired : []);
    setMissingPreferred(Array.isArray(data?.session?.missingPreferred) ? data.session.missingPreferred : []);
    setProfileCompleteness(Number(data?.session?.profileCompleteness || 0));
    setReadyForEmail(Boolean(data?.session?.readyForEmail));
    setCompleted(Boolean(data?.session?.completed));
    setRfqId(data?.session?.rfqId || '');
  };

  const startNewSession = async () => {
    setError('');
    setDraft('');
    setMessages([]);
    setProfile({});
    setIntakeStage('collecting_core');
    setMissingRequired([]);
    setMissingPreferred([]);
    setProfileCompleteness(0);
    setReadyForEmail(false);
    setCompleted(false);
    setRfqId('');
    setLoading(true);

    try {
      await bootSession();
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

  const sendMessage = async (input) => {
    const value = input.trim();
    if (!value || !sessionId || loading) return;

    setError('');
    setDraft('');
    setLoading(true);

    setMessages((prev) => [
      ...prev,
      {
        id: `user-${Date.now()}`,
        role: 'user',
        content: value,
        quickReplies: [],
      },
    ]);

    try {
      const data = await postJson('chatPublicAssistant', { sessionId, message: value });
      const assistantReply = data.assistant?.reply || 'Tell me more about your requirements.';
      const assistantChoices = Array.isArray(data.quickChoices)
        ? data.quickChoices
        : Array.isArray(data.assistant?.quickReplies)
          ? data.assistant.quickReplies
          : [];

      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: assistantReply,
          quickReplies: assistantChoices,
        },
      ]);

      setProfile(data.profile || {});
      setIntakeStage(data.intakeStage || 'collecting_core');
      setMissingRequired(Array.isArray(data.missingRequired) ? data.missingRequired : []);
      setMissingPreferred(Array.isArray(data.missingPreferred) ? data.missingPreferred : []);
      setProfileCompleteness(Number(data.profileCompleteness || 0));
      setReadyForEmail(Boolean(data.readyForEmail));
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
          <span>QuoteChem</span>
        </div>
        <div className="home-actions">
          <button type="button" className="home-ghost-btn" onClick={startNewSession} disabled={loading}>
            New Session
          </button>
          <Link to="/signin" className="home-admin-link">
            Admin Sign in
          </Link>
        </div>
      </header>

      <div className="home-intro" aria-live="polite">
        <h1>Get Bulk Chemical Quotes Fast.</h1>
        <p>Tell us what you need. We&apos;ll match verified suppliers and email you quotes.</p>
        <div className="home-intro-pills">
          <span>Fast</span>
          <span>Verified suppliers</span>
          <span>No spam</span>
        </div>
      </div>

      <div className="chat-card">
        <div className="chat-meta-row">
          <span>Stage: {intakeStage.replace(/_/g, ' ')}</span>
          <span>Profile completeness: {profileCompleteness}%</span>
        </div>

        <div className="chat-thread" ref={listRef}>
          {messages.map((message) => (
            <article key={message.id} className={`bubble ${message.role === 'user' ? 'bubble-user' : 'bubble-assistant'}`}>
              <p>{message.content}</p>
            </article>
          ))}
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
            placeholder="Type your message..."
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
            className="notes-btn"
            disabled={loading || !sessionId}
            onClick={() => setDraft((prev) => (prev ? `${prev}\nSpec/notes: ` : 'Spec/notes: '))}
          >
            Paste spec / notes
          </button>
          {readyForEmail ? <p className="status-text">Email needed to complete this RFQ.</p> : null}
          {missingRequired.length > 0 ? (
            <p className="status-text">Missing required: {missingRequired.join(', ')}</p>
          ) : null}
          {missingPreferred.length > 0 && !completed ? (
            <p className="status-text">Optional details: {missingPreferred.join(', ')}</p>
          ) : null}
        </div>

        {completed ? (
          <div className="completion-card">
            <h2>Request Submitted</h2>
            <p>
              We sent your confirmation email and started supplier outreach. You&apos;ll receive quote options soon.
            </p>
            {rfqId ? <p className="rfq-id">RFQ ID: {rfqId}</p> : null}
            <div className="completion-grid">
              {summaryRows.map(([label, value]) => (
                <div key={label} className="completion-row">
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
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
