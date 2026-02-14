import React, { useEffect, useRef, useState } from 'react';
import './Home.css';

const LOCAL_SESSION_KEY = 'quotechem_session_id';
const INITIAL_PROMPT = 'We help you find the best price chemicals. Tell me what chemicals you are looking for?';

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
  };
}

function deriveStage(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return { prompt: INITIAL_PROMPT, response: '' };
  }

  const last = messages[messages.length - 1];

  if (last.role === 'assistant') {
    return { prompt: last.content || INITIAL_PROMPT, response: '' };
  }

  if (last.role === 'user') {
    const previousAssistant = [...messages]
      .reverse()
      .find((message, index) => index > 0 && message.role === 'assistant');

    return {
      prompt: previousAssistant?.content || INITIAL_PROMPT,
      response: last.content || '',
    };
  }

  return { prompt: INITIAL_PROMPT, response: '' };
}

export default function Home() {
  const [sessionId, setSessionId] = useState('');
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [prompt, setPrompt] = useState(INITIAL_PROMPT);
  const [response, setResponse] = useState('');
  const [isTransitioning, setIsTransitioning] = useState(false);

  const transitionTimerRef = useRef(null);

  const appendMessage = (message) => {
    setMessages((prev) => [...prev, normalizeMessage(message)]);
  };

  const updateStageWithTransition = (nextPrompt, nextResponse) => {
    if (transitionTimerRef.current) {
      clearTimeout(transitionTimerRef.current);
    }

    setIsTransitioning(true);
    transitionTimerRef.current = setTimeout(() => {
      setPrompt(nextPrompt || INITIAL_PROMPT);
      setResponse(nextResponse || '');
      setIsTransitioning(false);
    }, 220);
  };

  const bootSession = async () => {
    const existing = typeof window !== 'undefined' ? window.localStorage.getItem(LOCAL_SESSION_KEY) : '';

    const data = await postJson('createPublicSession', {
      sessionId: existing || undefined,
      metadata: {
        locale: typeof navigator !== 'undefined' ? navigator.language : '',
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        referrer: typeof document !== 'undefined' ? document.referrer : '',
      },
    });

    setSessionId(data.sessionId);

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(LOCAL_SESSION_KEY, data.sessionId);
    }

    const restored = Array.isArray(data?.session?.messages)
      ? data.session.messages.map(normalizeMessage)
      : [];

    setMessages(restored);

    const stage = deriveStage(restored);
    setPrompt(stage.prompt);
    setResponse(stage.response);
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
      if (transitionTimerRef.current) {
        clearTimeout(transitionTimerRef.current);
      }
    };
  }, []);

  const sendMessage = async (input) => {
    const value = input.trim();
    if (!value || !sessionId || loading) return;

    setError('');
    appendMessage({ role: 'user', content: value });
    setResponse(value);
    setDraft('');
    setLoading(true);

    try {
      const data = await postJson('chatPublicAssistant', { sessionId, message: value });

      const assistantReply = data.assistant?.reply || 'Tell me more about the chemical requirements.';

      appendMessage({ role: 'assistant', content: assistantReply });
      updateStageWithTransition(assistantReply, '');
    } catch (err) {
      setError(err?.message || 'Failed to send message.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="public-home">
      <div className="public-home-glow" aria-hidden />

      <div className="chat-card">
        <img src={`${process.env.PUBLIC_URL}/assets/quotechem-logo.png`} alt="QuoteChem" className="home-logo" />

        <div className={`stage-bubbles ${isTransitioning ? 'is-transitioning' : ''}`}>
          <article className="bubble bubble-prompt">
            <p>{prompt}</p>
          </article>

          {response ? (
            <article className="bubble bubble-response">
              <p>{response}</p>
            </article>
          ) : null}
        </div>

        <form
          className="chat-input-row"
          onSubmit={(event) => {
            event.preventDefault();
            sendMessage(draft);
          }}
        >
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Type your answer..."
            disabled={!sessionId || loading}
          />
          <button type="submit" disabled={!sessionId || loading || !draft.trim()}>
            Send
          </button>
        </form>

        {loading ? <p className="status-text">Thinking...</p> : null}
        {error ? <p className="status-text status-error">{error}</p> : null}
      </div>
    </section>
  );
}
