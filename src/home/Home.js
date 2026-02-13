import React, { useEffect, useMemo, useState } from 'react';
import './Home.css';

const LOCAL_SESSION_KEY = 'quotechem_public_session_id';

const suggestedPrompts = [
  'I need Sodium Benzoate for beverage production.',
  'Can you quote 2 metric tons of Citric Acid to California?',
  'What details do you need to provide shipping pricing?',
  'We need fast delivery for Caustic Soda. What should I share?',
];

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

export default function Home() {
  const [sessionId, setSessionId] = useState('');
  const [messages, setMessages] = useState([
    {
      id: 'intro',
      role: 'assistant',
      content:
        'Welcome to QuoteChem. Tell me the chemical you need, quantity, destination, and timeline so I can prepare your quote intake.',
    },
  ]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [profile, setProfile] = useState({});
  const [missingFields, setMissingFields] = useState([]);
  const [leadEmail, setLeadEmail] = useState('');
  const [leadSubmitting, setLeadSubmitting] = useState(false);
  const [leadStatus, setLeadStatus] = useState('');
  const [sessionRestored, setSessionRestored] = useState(false);

  const chatCount = useMemo(() => messages.length, [messages.length]);
  const leadReady = useMemo(() => missingFields.length === 0 && chatCount > 1, [missingFields.length, chatCount]);

  useEffect(() => {
    let active = true;

    const initSession = async () => {
      try {
        const existing = typeof window !== 'undefined' ? window.localStorage.getItem(LOCAL_SESSION_KEY) : '';
        const data = await postJson('createPublicSession', {
          sessionId: existing || undefined,
          metadata: {
            locale: typeof navigator !== 'undefined' ? navigator.language : '',
            userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
            referrer: typeof document !== 'undefined' ? document.referrer : '',
          },
        });

        if (!active) return;
        setSessionId(data.sessionId);
        setProfile(data.session?.profile || {});
        setLeadEmail(data.session?.profile?.email || '');
        setMissingFields(data.session?.missingFields || []);
        if (Array.isArray(data.session?.messages) && data.session.messages.length > 0) {
          setMessages(data.session.messages.map((message) => ({
            id: message.id || `${message.role}-${Date.now()}-${Math.random()}`,
            role: message.role || 'assistant',
            content: message.content || '',
          })));
          setSessionRestored(Boolean(existing));
        }
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(LOCAL_SESSION_KEY, data.sessionId);
        }
      } catch (err) {
        if (!active) return;
        setError(err?.message || 'Unable to initialize chat session.');
      }
    };

    initSession();
    return () => {
      active = false;
    };
  }, []);

  const sendMessage = async (input) => {
    const value = input.trim();
    if (!value || !sessionId || loading) return;

    setError('');
    setLeadStatus('');

    const userMessage = { id: `u-${Date.now()}`, role: 'user', content: value };
    setMessages((prev) => [...prev, userMessage]);
    setDraft('');
    setLoading(true);

    try {
      const data = await postJson('chatPublicAssistant', {
        sessionId,
        message: value,
      });

      setProfile(data.profile || {});
      setMissingFields(data.assistant?.missingFields || []);
      if (data.profile?.email) setLeadEmail(data.profile.email);

      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: data.assistant?.reply || 'I can help with that. Please share the remaining quote details.',
        },
      ]);
    } catch (err) {
      setError(err?.message || 'Unable to process message right now.');
      setMessages((prev) => [
        ...prev,
        {
          id: `a-err-${Date.now()}`,
          role: 'assistant',
          content: 'I hit a temporary issue. Please retry in a moment.',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const submitLead = async () => {
    if (!sessionId || !leadEmail || leadSubmitting) return;

    setLeadSubmitting(true);
    setLeadStatus('');
    setError('');

    try {
      const data = await postJson('submitQuoteLead', {
        sessionId,
        email: leadEmail,
        contactName: profile.contactName || '',
        companyName: profile.companyName || '',
        phone: profile.phone || '',
      });
      setLeadStatus(data.emailed ? 'Quote request sent. Our team will contact you.' : 'Lead saved. Email delivery is not configured yet.');
    } catch (err) {
      setError(err?.message || 'Unable to submit quote request.');
    } finally {
      setLeadSubmitting(false);
    }
  };

  return (
    <section className="chat-page">
      <header className="chat-header">
        <div>
          <h2>QuoteChem Assistant</h2>
          <p>Public quote intake for chemical sourcing and shipping.</p>
        </div>
        <span className="chat-count">{chatCount} messages</span>
      </header>

      <div className="chat-suggestions" aria-label="Quick prompts">
        {suggestedPrompts.map((prompt) => (
          <button key={prompt} type="button" className="suggestion-pill" onClick={() => sendMessage(prompt)}>
            {prompt}
          </button>
        ))}
      </div>

      <div className="chat-thread" role="log" aria-live="polite">
        {sessionRestored ? <p className="session-note">Previous session restored on this device.</p> : null}
        {messages.map((message) => (
          <article key={message.id} className={`chat-message ${message.role === 'user' ? 'user' : 'assistant'}`}>
            <span className="chat-role">{message.role === 'user' ? 'You' : 'QuoteChem AI'}</span>
            <p>{message.content}</p>
          </article>
        ))}
        {loading ? <p className="chat-loading">QuoteChem AI is thinking...</p> : null}
      </div>

      {error ? <p className="chat-error">{error}</p> : null}

      <form
        className="chat-composer"
        onSubmit={(event) => {
          event.preventDefault();
          sendMessage(draft);
        }}
      >
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Share chemical name, quantity, destination, and timeline..."
          rows={2}
          disabled={!sessionId || loading}
        />
        <div className="composer-actions">
          <span>{sessionId ? `Session ${sessionId.slice(0, 8)}...` : 'Initializing session...'}</span>
          <button type="submit" disabled={!sessionId || loading || !draft.trim()}>
            Send
          </button>
        </div>
      </form>

      <section className="lead-card">
        <h3>Request Quote Follow-up</h3>
        <p>Enter your email so our team can send formal quote details.</p>
        {missingFields.length > 0 ? (
          <p className="lead-missing">Still needed: {missingFields.join(', ')}</p>
        ) : (
          <p className="lead-ready">Required info captured. Submit your contact email.</p>
        )}
        <div className="lead-row">
          <input
            type="email"
            placeholder="you@company.com"
            value={leadEmail}
            onChange={(event) => setLeadEmail(event.target.value)}
          />
          <button type="button" onClick={submitLead} disabled={leadSubmitting || !leadEmail || !leadReady}>
            {leadSubmitting ? 'Submitting...' : 'Submit Lead'}
          </button>
        </div>
        {Object.keys(profile).length > 0 ? (
          <div className="profile-snapshot">
            <strong>Captured details</strong>
            <ul>
              {Object.entries(profile).map(([key, value]) => (
                <li key={key}>
                  <span>{key}</span>
                  <span>{String(value)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {leadStatus ? <p className="lead-status">{leadStatus}</p> : null}
      </section>
    </section>
  );
}
