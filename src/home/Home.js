import React, { useEffect, useMemo, useState } from 'react';
import { signInWithCustomToken } from 'firebase/auth';
import { auth } from '../firebase';
import './Home.css';

const LOCAL_SESSION_KEY = 'quotechem_public_session_id';

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

export default function Home() {
  const [sessionId, setSessionId] = useState('');
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sessionRestored, setSessionRestored] = useState(false);

  const [profile, setProfile] = useState({});
  const [intakeMissingFields, setIntakeMissingFields] = useState([]);
  const [authMissingFields, setAuthMissingFields] = useState([]);
  const [authReady, setAuthReady] = useState(false);

  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [sendingCode, setSendingCode] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [authStatus, setAuthStatus] = useState('');

  const [testEmail, setTestEmail] = useState('');
  const [testEmailStatus, setTestEmailStatus] = useState('');

  const messageCount = useMemo(() => messages.length, [messages.length]);

  useEffect(() => {
    let active = true;

    const init = async () => {
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
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(LOCAL_SESSION_KEY, data.sessionId);
        }

        const session = data.session || {};
        const restoredMessages = Array.isArray(session.messages) ? session.messages.map(normalizeMessage) : [];

        if (restoredMessages.length > 0) {
          setMessages(restoredMessages);
          setSessionRestored(Boolean(existing));
        }

        setProfile(session.profile || {});
        setContactName(session.profile?.contactName || '');
        setEmail(session.profile?.email || '');
        setIntakeMissingFields(session.intakeMissingFields || []);
        setAuthMissingFields(session.authMissingFields || []);
        setAuthReady(Boolean(session.authReady));
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

  const appendMessage = (message) => {
    setMessages((prev) => [...prev, normalizeMessage(message)]);
  };

  const sendMessage = async (input) => {
    const value = input.trim();
    if (!value || !sessionId || loading) return;

    setError('');
    setAuthStatus('');

    appendMessage({ role: 'user', content: value });
    setDraft('');
    setLoading(true);

    try {
      const data = await postJson('chatPublicAssistant', { sessionId, message: value });

      appendMessage({
        role: 'assistant',
        content: data.assistant?.reply || 'Please continue with your quote details.',
        quickReplies: data.assistant?.quickReplies || [],
      });

      setProfile(data.profile || {});
      setContactName((prev) => prev || data.profile?.contactName || '');
      setEmail((prev) => prev || data.profile?.email || '');
      setIntakeMissingFields(data.intakeMissingFields || []);
      setAuthMissingFields(data.authMissingFields || []);
      setAuthReady(Boolean(data.authReady));
    } catch (err) {
      setError(err?.message || 'Failed to send message.');
      appendMessage({ role: 'assistant', content: 'Temporary error. Please retry.' });
    } finally {
      setLoading(false);
    }
  };

  const sendCode = async () => {
    if (!sessionId || !email || sendingCode) return;

    setSendingCode(true);
    setError('');
    setAuthStatus('');

    try {
      const data = await postJson('sendLoginCode', {
        sessionId,
        email,
        contactName,
      });

      setCodeSent(Boolean(data.codeSent));
      setAuthStatus('Code sent to your email. Enter the 6-digit code below.');
    } catch (err) {
      setError(err?.message || 'Unable to send code.');
    } finally {
      setSendingCode(false);
    }
  };

  const verifyCode = async () => {
    if (!sessionId || !email || !otpCode || verifyingCode) return;

    setVerifyingCode(true);
    setError('');
    setAuthStatus('');

    try {
      const data = await postJson('verifyLoginCode', {
        sessionId,
        email,
        code: otpCode,
      });

      if (!data.customToken) {
        throw new Error('Missing auth token in response.');
      }

      await signInWithCustomToken(auth, data.customToken);

      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(LOCAL_SESSION_KEY);
      }

      setAuthStatus('Authenticated. Your session data was migrated to your user account.');
      const fresh = await postJson('createPublicSession', {
        metadata: {
          locale: typeof navigator !== 'undefined' ? navigator.language : '',
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
          referrer: typeof document !== 'undefined' ? document.referrer : '',
        },
      });

      if (typeof window !== 'undefined') {
        window.localStorage.setItem(LOCAL_SESSION_KEY, fresh.sessionId);
      }

      setSessionId(fresh.sessionId);
      setMessages([]);
      setProfile({});
      setIntakeMissingFields(fresh.session?.intakeMissingFields || []);
      setAuthMissingFields(fresh.session?.authMissingFields || []);
      setOtpCode('');
      setCodeSent(false);
      setAuthReady(false);
    } catch (err) {
      setError(err?.message || 'Unable to verify code.');
    } finally {
      setVerifyingCode(false);
    }
  };

  const sendTemplateTest = async (template) => {
    if (!testEmail) {
      setError('Enter test email first.');
      return;
    }

    setError('');
    setTestEmailStatus('Sending test email...');

    try {
      const data = await postJson('sendTestEmail', {
        email: testEmail,
        template,
      });
      setTestEmailStatus(data.sent ? `Sent ${data.template} test email.` : 'Email was not sent.');
    } catch (err) {
      setError(err?.message || 'Failed to send test email.');
      setTestEmailStatus('');
    }
  };

  return (
    <section className="chat-page">
      <div className="chat-thread" role="log" aria-live="polite">
        {sessionRestored ? <p className="session-note">Session restored</p> : null}

        {messages.map((message) => (
          <article key={message.id} className={`chat-message ${message.role === 'user' ? 'user' : 'assistant'}`}>
            {message.content ? <p>{message.content}</p> : null}
            {message.role === 'assistant' && message.quickReplies.length > 0 ? (
              <div className="quick-replies">
                {message.quickReplies.map((reply) => (
                  <button key={`${message.id}-${reply}`} type="button" onClick={() => sendMessage(reply)}>
                    {reply}
                  </button>
                ))}
              </div>
            ) : null}
          </article>
        ))}

        {loading ? <p className="chat-loading">...</p> : null}
      </div>

      {error ? <p className="chat-error">{error}</p> : null}
      {authStatus ? <p className="chat-success">{authStatus}</p> : null}

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
          <span>{sessionId ? `${messageCount} msgs` : 'no session'}</span>
          <button type="submit" disabled={!sessionId || loading || !draft.trim()}>
            Send
          </button>
        </div>
      </form>

      <section className="intake-card">
        <div className="intake-row">
          <strong>Missing intake fields:</strong>
          <span>{intakeMissingFields.length ? intakeMissingFields.join(', ') : 'none'}</span>
        </div>
      </section>

      <section className="auth-card">
        <h3>Passwordless Sign-in</h3>
        <p>Authenticate after quote intake with a 6-digit email code.</p>

        <div className="auth-grid">
          <input
            type="text"
            placeholder="Name"
            value={contactName}
            onChange={(event) => setContactName(event.target.value)}
          />
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>

        <div className="auth-actions">
          <button type="button" onClick={sendCode} disabled={!authReady || !email || sendingCode}>
            {sendingCode ? 'Sending...' : 'Send Code'}
          </button>
          <input
            type="text"
            maxLength={6}
            placeholder="6-digit code"
            value={otpCode}
            onChange={(event) => setOtpCode(event.target.value)}
          />
          <button type="button" onClick={verifyCode} disabled={!codeSent || otpCode.length !== 6 || verifyingCode}>
            {verifyingCode ? 'Verifying...' : 'Verify & Sign In'}
          </button>
        </div>

        {!authReady ? <p className="auth-note">Still needed for auth: {authMissingFields.join(', ') || 'continue chat'}</p> : null}
      </section>

      <section className="email-lab-card">
        <h3>Email Test Lab</h3>
        <div className="auth-grid">
          <input
            type="email"
            placeholder="test@company.com"
            value={testEmail}
            onChange={(event) => setTestEmail(event.target.value)}
          />
        </div>
        <div className="email-lab-actions">
          <button type="button" onClick={() => sendTemplateTest('basic')}>Send Basic</button>
          <button type="button" onClick={() => sendTemplateTest('quote_status')}>Send Quote Status</button>
        </div>
        {testEmailStatus ? <p className="auth-note">{testEmailStatus}</p> : null}
      </section>
    </section>
  );
}
