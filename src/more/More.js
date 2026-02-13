import React, { useContext, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { FiChevronRight, FiLogIn, FiLogOut, FiMail, FiUser } from 'react-icons/fi';
import { UserContext } from '../App';
import { auth } from '../firebase';
import './More.css';

function endpointBase() {
  const explicit = process.env.REACT_APP_QUOTECHEM_API_BASE;
  if (explicit) return explicit.replace(/\/$/, '');

  const projectId = process.env.REACT_APP_FIREBASE_PROJECT_ID;
  if (projectId) return `https://us-central1-${projectId}.cloudfunctions.net`;

  return '';
}

async function postJson(path, payload) {
  const base = endpointBase();
  if (!base) throw new Error('Missing API base URL.');

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

function RowButton({ icon: Icon, label, onClick, danger = false }) {
  return (
    <button type="button" className={`more-row ${danger ? 'danger' : ''}`} onClick={onClick}>
      <span className="row-left">
        <Icon size={18} />
        <span>{label}</span>
      </span>
      <FiChevronRight size={18} />
    </button>
  );
}

export default function More() {
  const navigate = useNavigate();
  const appUser = useContext(UserContext);
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const onLogout = async () => {
    await signOut(auth);
    navigate('/home', { replace: true });
  };

  const sendTest = async (template) => {
    setError('');
    setStatus('');

    try {
      const data = await postJson('sendTestEmail', { email, template });
      setStatus(data.sent ? `Sent ${data.template} email.` : 'Email not sent.');
    } catch (err) {
      setError(err?.message || 'Failed to send test email.');
    }
  };

  return (
    <section className="more-page">
      <header>
        <h2>More</h2>
        <p>{appUser ? 'Signed in' : 'Guest mode'}</p>
      </header>

      <article className="more-profile">
        <dl>
          <div>
            <dt>Email</dt>
            <dd>{appUser?.email || 'Not signed in'}</dd>
          </div>
          <div>
            <dt>Username</dt>
            <dd>{appUser?.username || 'guest'}</dd>
          </div>
        </dl>
      </article>

      <div className="more-list">
        {appUser ? (
          <>
            <RowButton icon={FiUser} label="Account settings" onClick={() => navigate('/account')} />
            <RowButton icon={FiLogOut} label="Logout" danger onClick={onLogout} />
          </>
        ) : (
          <RowButton icon={FiLogIn} label="Open sign-in tools" onClick={() => navigate('/home')} />
        )}
      </div>

      <article className="more-profile">
        <h3 style={{ margin: '0 0 8px' }}>Email Test Buttons</h3>
        <div style={{ display: 'grid', gap: 8 }}>
          <input
            type="email"
            placeholder="test@company.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="more-row" style={{ justifyContent: 'center' }} onClick={() => sendTest('basic')}>
              <span className="row-left"><FiMail size={18} /><span>Send Basic</span></span>
            </button>
            <button type="button" className="more-row" style={{ justifyContent: 'center' }} onClick={() => sendTest('quote_status')}>
              <span className="row-left"><FiMail size={18} /><span>Send Quote Status</span></span>
            </button>
          </div>
          {error ? <p style={{ margin: 0, color: '#991b1b' }}>{error}</p> : null}
          {status ? <p style={{ margin: 0, color: '#166534' }}>{status}</p> : null}
        </div>
      </article>
    </section>
  );
}
