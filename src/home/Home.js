import React, { useEffect, useMemo, useState } from 'react';
import { signInWithCustomToken } from 'firebase/auth';
import { auth } from '../firebase';
import './Home.css';

const LOCAL_SESSION_KEY = 'quotechem_session_id';

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

function extractEmail(text) {
  const match = String(text || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0].toLowerCase() : '';
}

function extractOtp(text) {
  const match = String(text || '').match(/\b(\d{6})\b/);
  return match ? match[1] : '';
}

function parseTestCommand(text) {
  const normalized = String(text || '').trim();
  const basic = normalized.match(/^\/test\s+basic\s+(.+)$/i);
  if (basic) return { template: 'basic', email: extractEmail(basic[1]) };

  const quoteStatus = normalized.match(/^\/test\s+quote_status\s+(.+)$/i);
  if (quoteStatus) return { template: 'quote_status', email: extractEmail(quoteStatus[1]) };

  return null;
}

export default function Home() {
  const [sessionId, setSessionId] = useState('');
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sessionRestored, setSessionRestored] = useState(false);

  const [profile, setProfile] = useState({});
  const [authReady, setAuthReady] = useState(false);
  const [pendingEmail, setPendingEmail] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [emailPrompted, setEmailPrompted] = useState(false);

  const messageCount = useMemo(() => messages.length, [messages.length]);

  const appendMessage = (message) => {
    setMessages((prev) => [...prev, normalizeMessage(message)]);
  };

  const bootSession = async (keepExisting = true) => {
    const existing =
      keepExisting && typeof window !== 'undefined' ? window.localStorage.getItem(LOCAL_SESSION_KEY) : '';

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

    const session = data.session || {};
    const restored = Array.isArray(session.messages) ? session.messages.map(normalizeMessage) : [];

    setMessages(restored);
    setSessionRestored(Boolean(existing) && restored.length > 0);

    setProfile(session.profile || {});
    setAuthReady(Boolean(session.authReady));

    const emailFromSession = session.profile?.email || '';
    setPendingEmail(emailFromSession);
    setCodeSent(false);
    setEmailPrompted(Boolean(emailFromSession));
  };

  useEffect(() => {
    let active = true;

    const init = async () => {
      try {
        await bootSession(true);
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

  const sendLoginCodeByChat = async (email) => {
    const data = await postJson('sendLoginCode', {
      sessionId,
      email,
      contactName: profile.contactName || '',
    });

    if (data.codeSent) {
      setPendingEmail(email);
      setCodeSent(true);
      appendMessage({
        role: 'assistant',
        content: `Code sent to ${email}. Check your inbox, then reply here with the 6-digit code.`,
      });
    }
  };

  const verifyCodeByChat = async (code) => {
    const data = await postJson('verifyLoginCode', {
      sessionId,
      email: pendingEmail,
      code,
    });

    if (!data.customToken) throw new Error('Missing auth token in response.');

    await signInWithCustomToken(auth, data.customToken);

    appendMessage({ role: 'assistant', content: 'Authenticated successfully.' });

    setCodeSent(false);
    setPendingEmail('');
    setAuthReady(false);
  };

  const handleCommand = async (value) => {
    const testCommand = parseTestCommand(value);
    if (testCommand) {
      if (!testCommand.email) {
        appendMessage({ role: 'assistant', content: 'Invalid test command.' });
        return true;
      }

      const data = await postJson('sendTestEmail', {
        email: testCommand.email,
        template: testCommand.template,
      });

      appendMessage({
        role: 'assistant',
        content: data.sent ? `Test email (${data.template}) sent.` : 'Test email request completed.',
      });
      return true;
    }

    const otp = extractOtp(value);
    if (codeSent && otp) {
      await verifyCodeByChat(otp);
      return true;
    }

    const email = extractEmail(value);
    if (authReady && email && !codeSent) {
      await sendLoginCodeByChat(email);
      return true;
    }

    return false;
  };

  const sendMessage = async (input) => {
    const value = input.trim();
    if (!value || !sessionId || loading) return;

    setError('');
    appendMessage({ role: 'user', content: value });
    setDraft('');
    setLoading(true);

    try {
      const handled = await handleCommand(value);
      if (handled) return;

      const data = await postJson('chatPublicAssistant', { sessionId, message: value });

      appendMessage({ role: 'assistant', content: data.assistant?.reply || 'Continue.' });
      setProfile(data.profile || {});
      const nextAuthReady = Boolean(data.authReady);
      setAuthReady(nextAuthReady);

      const nextEmail = extractEmail(data.profile?.email || '');
      if (nextEmail) {
        setPendingEmail(nextEmail);
        setEmailPrompted(true);
      }

      if (nextAuthReady && !nextEmail && !emailPrompted) {
        appendMessage({
          role: 'assistant',
          content: 'To continue, send your email in chat so I can send your 6-digit sign-in code.',
        });
        setEmailPrompted(true);
      }
    } catch (err) {
      setError(err?.message || 'Failed to send message.');
      appendMessage({ role: 'assistant', content: 'Temporary error. Please retry.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="chat-page">
      <div className="chat-thread" role="log" aria-live="polite">
        {sessionRestored ? <p className="session-note">Session restored</p> : null}

        {messages.map((message) => (
          <article key={message.id} className={`chat-message ${message.role === 'user' ? 'user' : 'assistant'}`}>
            {message.content ? <p>{message.content}</p> : null}
          </article>
        ))}

        {loading ? <p className="chat-loading">...</p> : null}
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
          placeholder=""
          rows={2}
          disabled={!sessionId || loading}
        />
        <div className="composer-actions">
          <span>{sessionId ? `${messageCount}` : ''}</span>
          <button type="submit" disabled={!sessionId || loading || !draft.trim()}>
            Send
          </button>
        </div>
      </form>
    </section>
  );
}
