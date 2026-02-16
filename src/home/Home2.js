import React, { useMemo, useState, useEffect } from 'react';
import './Home2.css';

const INITIAL_PROMPT =
  "Hey — I'm QuoteChem V2. Tell me what chemical you need, what industry/use it's for, quantity, and delivery location.";
const ROTATING_HEADLINES = [
  'Source Bulk Chemicals Smarter',
  'Verified Suppliers. Competitive Pricing.',
  'Quotes in Minutes, Not Days.',
];

const EDITABLE_FIELDS = [
  'chemicalName',
  'industryUse',
  'quantity',
  'locationCity',
  'locationStateProvince',
  'locationCountry',
  'email',
  'packagingPreference',
  'neededBy',
  'frequency',
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
    locationCity: 'Delivery City',
    locationStateProvince: 'State / Province',
    locationCountry: 'Country',
    email: 'Email',
    packagingPreference: 'Packaging Preference',
    neededBy: 'Needed By',
    frequency: 'Frequency',
    specNotes: 'Spec Notes',
    chemicalIdentity: 'Chemical Identity',
  };
  return labels[field] || field;
}

export default function Home2() {
  const [sessionId, setSessionId] = useState('');
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [assistantMessage, setAssistantMessage] = useState({
    id: 'initial',
    role: 'assistant',
    content: INITIAL_PROMPT,
  });

  const [completed, setCompleted] = useState(false);
  const [rfqId, setRfqId] = useState('');
  const [headlineIndex, setHeadlineIndex] = useState(0);
  const [headlineVisible, setHeadlineVisible] = useState(true);

  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewExtracted, setReviewExtracted] = useState({});
  const [validationErrors, setValidationErrors] = useState([]);
  const [canConfirm, setCanConfirm] = useState(false);

  const validationByField = useMemo(() => {
    const out = {};
    (Array.isArray(validationErrors) ? validationErrors : []).forEach((item) => {
      const field = item?.field || '_';
      out[field] = item?.message || 'Invalid value';
    });
    return out;
  }, [validationErrors]);

  const summaryRows = useMemo(() => {
    return EDITABLE_FIELDS
      .map((field) => [toFieldLabel(field), reviewExtracted[field]])
      .filter(([, value]) => value);
  }, [reviewExtracted]);

  const bootSession = async () => {
    const payload = {
      metadata: {
        locale: typeof navigator !== 'undefined' ? navigator.language : '',
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        referrer: typeof document !== 'undefined' ? document.referrer : '',
      },
    };

    const data = await postJson('createPublicSessionV2', payload);
    setSessionId(data.sessionId);

    const restored = Array.isArray(data?.session?.messages) ? data.session.messages.map(normalizeMessage) : [];
    const latestAssistant = getLatestAssistant(restored);
    setAssistantMessage(latestAssistant);
    setCompleted(Boolean(data?.session?.completed));
    setRfqId(data?.session?.rfqId || '');
  };

  useEffect(() => {
    let active = true;

    const init = async () => {
      try {
        await bootSession();
      } catch (err) {
        if (!active) return;
        setError(err?.message || 'Unable to initialize Home2 session.');
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
    if (!value || !sessionId || loading || submitting || completed) return;

    setError('');
    setDraft('');
    setReviewOpen(false);
    setValidationErrors([]);
    setCanConfirm(false);
    setLoading(true);

    try {
      const data = await postJson('chatPublicAssistantV2', { sessionId, message: value });
      const assistantReply = data.assistant?.reply || 'Tell me more about your requirements.';

      const assistant = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: assistantReply,
      };

      setAssistantMessage(assistant);
    } catch (err) {
      setError(err?.message || 'Failed to send message.');
    } finally {
      setLoading(false);
    }
  };

  const previewExtraction = async () => {
    if (!sessionId || loading || submitting || completed) return;
    setError('');
    setSubmitting(true);

    try {
      const data = await postJson('finalizePublicSessionV2', { sessionId, action: 'preview' });
      setReviewExtracted(data.extracted || {});
      setValidationErrors(Array.isArray(data.validationErrors) ? data.validationErrors : []);
      setCanConfirm(Boolean(data.canConfirm));
      setReviewOpen(true);
    } catch (err) {
      setError(err?.message || 'Failed to generate extraction preview.');
    } finally {
      setSubmitting(false);
    }
  };

  const onEditField = (field, value) => {
    setReviewExtracted((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const confirmExtraction = async () => {
    if (!sessionId || loading || submitting || completed) return;
    setError('');
    setSubmitting(true);

    try {
      const data = await postJson('finalizePublicSessionV2', {
        sessionId,
        action: 'confirm',
        edits: reviewExtracted,
      }, { allowAppError: true });

      if (data?.ok === false) {
        setValidationErrors(Array.isArray(data.validationErrors) ? data.validationErrors : []);
        setCanConfirm(false);
        return;
      }
      setCompleted(Boolean(data.saved));
      setRfqId(data.rfqId || '');
      setReviewOpen(false);
    } catch (err) {
      setError(err?.message || 'Failed to confirm extraction.');
    } finally {
      setSubmitting(false);
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
          {loading || submitting ? (
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
            disabled={!sessionId || loading || submitting || completed}
            rows={2}
          />
          <button type="submit" disabled={!sessionId || loading || submitting || !draft.trim() || completed}>
            Send
          </button>
        </form>

        {!completed ? (
          <div className="chat-helper-actions">
            <button
              type="button"
              className="details-toggle"
              disabled={!sessionId || loading || submitting}
              onClick={previewExtraction}
            >
              Submit Request
            </button>
          </div>
        ) : null}

        {reviewOpen ? (
          <div className="review-card">
            <h3>Review Extracted Fields</h3>
            <div className="review-grid">
              {EDITABLE_FIELDS.map((field) => (
                <label key={field} className="review-field">
                  <span>{toFieldLabel(field)}</span>
                  <input
                    type={field === 'email' ? 'email' : 'text'}
                    value={reviewExtracted[field] || ''}
                    onChange={(event) => onEditField(field, event.target.value)}
                    disabled={submitting || completed}
                  />
                  {validationByField[field] ? <em>{validationByField[field]}</em> : null}
                </label>
              ))}
            </div>
            {validationByField._ ? <p className="status-text status-error">{validationByField._}</p> : null}
            <div className="review-actions">
              <button type="button" className="notes-btn" disabled={submitting || completed} onClick={previewExtraction}>
                Re-run Preview
              </button>
              <button type="button" className="details-toggle" disabled={submitting || completed || !canConfirm} onClick={confirmExtraction}>
                Confirm & Save
              </button>
            </div>
          </div>
        ) : null}

        {completed ? (
          <div className="completion-card">
            <h2>Request Saved (Home2)</h2>
            <p>Structured extraction has been saved to V2 collections.</p>
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

        {error ? <p className="status-text status-error">{error}</p> : null}
      </div>
    </section>
  );
}
