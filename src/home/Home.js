import React, { useMemo, useState, useEffect } from 'react';
import './Home.css';

const INITIAL_PROMPT =
  "Hey — I'm QuoteChem. Tell me what chemical you need, what industry/use it's for, quantity, and delivery location.";
const ROTATING_HEADLINES = [
  'Source Bulk Chemicals Smarter',
  'Verified Suppliers. Competitive Pricing.',
  'Quotes in Minutes, Not Days.',
];

const SHOW_MANUAL_FINALIZE = String(process.env.REACT_APP_SHOW_MANUAL_FINALIZE || 'false').toLowerCase() === 'true';

const EXTRACTED_FIELDS = [
  'chemicalName',
  'industryUse',
  'quantity',
  'deliveryLocation',
  'email',
  'contactName',
  'companyName',
  'phone',
  'jobTitle',
  'website',
  'companyAddress',
  'packagingPreference',
  'neededBy',
  'frequency',
  'additionalNotes',
  'specNotes',
  'chemicalIdentity',
];

function endpointBase() {
  const explicit = process.env.REACT_APP_QUOTECHEM_API_BASE;
  if (explicit) return explicit.replace(/\/$/, '');

  const projectId = process.env.REACT_APP_FIREBASE_PROJECT_ID;
  if (projectId) return `https://us-central1-${projectId}.cloudfunctions.net`;

  return '';
}

async function postJson(path, payload, options = {}) {
  const allowAppError = Boolean(options.allowAppError);
  const base = endpointBase();
  if (!base) throw new Error('Missing API base URL. Set REACT_APP_QUOTECHEM_API_BASE or Firebase project id.');

  const response = await fetch(`${base}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || (data?.ok === false && !allowAppError)) {
    const err = new Error(data?.error || `Request failed (${response.status})`);
    err.data = data;
    throw err;
  }

  return data;
}

function normalizeMessage(message) {
  return {
    id: message.id || `msg-${Date.now()}-${Math.random()}`,
    role: message.role || 'assistant',
    content: message.content || '',
  };
}

function getLatestAssistant(messages) {
  const latest = [...messages].reverse().find((item) => item.role === 'assistant');
  if (!latest) return { id: 'initial', role: 'assistant', content: INITIAL_PROMPT };
  return latest;
}

function toFieldLabel(field) {
  const labels = {
    chemicalName: 'Chemical',
    industryUse: 'Industry / Use',
    quantity: 'Quantity',
    deliveryLocation: 'Delivery Location',
    email: 'Email',
    contactName: 'Contact Name',
    companyName: 'Company Name',
    phone: 'Phone',
    jobTitle: 'Job Title',
    website: 'Website',
    companyAddress: 'Company Address',
    packagingPreference: 'Packaging Preference',
    neededBy: 'Needed By',
    frequency: 'Frequency',
    additionalNotes: 'Additional Notes',
    specNotes: 'Spec Notes',
    chemicalIdentity: 'Chemical Identity',
  };
  return labels[field] || field;
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
  });

  const [completed, setCompleted] = useState(false);
  const [rfqId, setRfqId] = useState('');
  const [emailStatus, setEmailStatus] = useState('not_attempted');

  const [headlineIndex, setHeadlineIndex] = useState(0);
  const [headlineVisible, setHeadlineVisible] = useState(true);

  const [showUnderstood, setShowUnderstood] = useState(false);
  const [extractedState, setExtractedState] = useState({ confirm: false });
  const [missingRequired, setMissingRequired] = useState([]);
  const [readyToFinalize, setReadyToFinalize] = useState(false);

  const extractedRows = useMemo(
    () => EXTRACTED_FIELDS.map((field) => [toFieldLabel(field), extractedState[field]]).filter(([, value]) => value),
    [extractedState]
  );

  const bootSession = async () => {
    const payload = {
      metadata: {
        locale: typeof navigator !== 'undefined' ? navigator.language : '',
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        referrer: typeof document !== 'undefined' ? document.referrer : '',
      },
    };

    const data = await postJson('createPublicSession', payload);
    setSessionId(data.sessionId);

    const restored = Array.isArray(data?.session?.messages) ? data.session.messages.map(normalizeMessage) : [];
    setAssistantMessage(getLatestAssistant(restored));

    setCompleted(Boolean(data?.session?.completed));
    setRfqId(data?.session?.rfqId || '');
    setEmailStatus(data?.session?.emailStatus || 'not_attempted');

    if (data?.session?.latestExtractedState && typeof data.session.latestExtractedState === 'object') {
      setExtractedState(data.session.latestExtractedState);
      setReadyToFinalize(Boolean(data?.session?.readyToFinalize));
      setMissingRequired(Array.isArray(data?.session?.missingRequired) ? data.session.missingRequired : []);
    }

    if (data?.session?.lastFinalizedExtracted && typeof data.session.lastFinalizedExtracted === 'object') {
      setExtractedState({ ...data.session.lastFinalizedExtracted, confirm: true });
      setReadyToFinalize(true);
      setMissingRequired([]);
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

  const applyStateFromResponse = (data) => {
    const state = data?.state || {};
    setExtractedState(state.extracted || { confirm: false });
    setMissingRequired(Array.isArray(state.missingRequired) ? state.missingRequired : []);
    setReadyToFinalize(Boolean(state.readyToFinalize));

    const confirmed = Boolean(state.confirmed) || Boolean(data?.completed);
    setCompleted(confirmed);
    setRfqId(state.rfqId || data?.rfqId || '');
    if (state.emailStatus) setEmailStatus(state.emailStatus);
  };

  const sendMessage = async (input) => {
    const value = input.trim();
    if (!value || !sessionId || loading || completed) return;

    setError('');
    setDraft('');
    setLoading(true);

    try {
      const data = await postJson('chatPublicAssistant', { sessionId, message: value });
      setAssistantMessage({
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: data.assistant?.reply || 'Please continue with your requirement details.',
      });
      applyStateFromResponse(data);
    } catch (err) {
      setError(err?.message || 'Failed to send message.');
    } finally {
      setLoading(false);
    }
  };

  const runManualFinalize = async () => {
    if (!sessionId || loading || completed) return;
    setError('');
    setLoading(true);

    try {
      const data = await postJson(
        'finalizePublicSession',
        {
          sessionId,
          action: 'confirm',
          edits: extractedState,
        },
        { allowAppError: true }
      );

      if (data?.ok === false) {
        const missing = Array.isArray(data.missingRequired) ? data.missingRequired : [];
        setMissingRequired(missing);
        setReadyToFinalize(false);
        setError(missing.length ? `Missing: ${missing.join(', ')}` : 'Unable to finalize yet.');
        return;
      }

      setCompleted(Boolean(data.saved));
      setRfqId(data.rfqId || '');
      setEmailStatus(data.emailStatus || 'sent');
      setMissingRequired([]);
      setReadyToFinalize(true);
      setAssistantMessage({
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content:
          data.emailStatus === 'sent'
            ? 'Confirmed. Request submitted and email sent.'
            : `Confirmed. Request submitted. Email status: ${data.emailStatus || 'unknown'}.`,
      });
    } catch (err) {
      setError(err?.message || 'Manual finalize failed.');
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
      </header>

      <div className="home-rotator" aria-live="polite">
        <p className={`rotator-text ${headlineVisible ? 'is-visible' : ''}`}>{ROTATING_HEADLINES[headlineIndex]}</p>
      </div>

      <div className="chat-card">
        <div key={loading ? `loading-${assistantMessage.id}` : assistantMessage.id} className={`assistant-display ${loading ? 'is-loading' : ''}`}>
          {loading ? (
            <div className="assistant-progress" aria-label="Loading response" role="status">
              <div className="assistant-progress-track">
                <span className="assistant-progress-fill" />
              </div>
            </div>
          ) : (
            <p>{assistantMessage.content}</p>
          )}
        </div>

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
            disabled={!sessionId || loading || completed}
            rows={2}
          />
          <button type="submit" disabled={!sessionId || loading || !draft.trim() || completed}>
            Send
          </button>
        </form>

        <div className="chat-helper-actions">
          <button
            type="button"
            className="details-toggle"
            onClick={() => setShowUnderstood((prev) => !prev)}
            aria-expanded={showUnderstood}
          >
            <span className={`details-arrow ${showUnderstood ? 'is-open' : ''}`} aria-hidden>
              ▼
            </span>
            <span>What We Understood</span>
          </button>

          {showUnderstood ? (
            <div className="understood-card">
              {extractedRows.length > 0 ? (
                <div className="completion-grid">
                  {extractedRows.map(([label, value]) => (
                    <p key={label} className="completion-row">
                      <span>{label}: </span>
                      <strong>{value}</strong>
                    </p>
                  ))}
                </div>
              ) : (
                <p className="status-text">No extracted details yet.</p>
              )}

              {missingRequired.length > 0 ? <p className="status-text">Missing: {missingRequired.join(', ')}</p> : null}
              <p className="status-text">Ready to finalize: {readyToFinalize ? 'yes' : 'no'}</p>
              <p className="status-text">Confirm detected: {extractedState.confirm ? 'yes' : 'no'}</p>
            </div>
          ) : null}

          {SHOW_MANUAL_FINALIZE && !completed ? (
            <button type="button" className="notes-btn" disabled={!sessionId || loading} onClick={runManualFinalize}>
              Manual Finalize (Debug)
            </button>
          ) : null}
        </div>

        {completed ? (
          <div className="completion-card">
            <h2>Request Submitted</h2>
            <p>
              {emailStatus === 'sent'
                ? 'Your request was saved and confirmation email was sent.'
                : 'Your request was saved. Email is pending/failed; please check logs.'}
            </p>
            <p className="status-text">Email status: {emailStatus || 'unknown'}</p>
          </div>
        ) : null}

        {error ? <p className="status-text status-error">{error}</p> : null}
      </div>
    </section>
  );
}
