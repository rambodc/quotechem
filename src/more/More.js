import React, { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { FiChevronRight, FiInfo, FiLogIn, FiLogOut, FiUser } from 'react-icons/fi';
import { UserContext } from '../App';
import { auth } from '../firebase';
import './More.css';

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

  const onLogout = async () => {
    await signOut(auth);
    navigate('/signin', { replace: true });
  };

  return (
    <section className="more-page">
      <header>
        <h2>More</h2>
        <p>QuoteChem assistant settings and account options.</p>
      </header>

      <article className="more-profile">
        <h3>{appUser ? 'Signed-in Profile' : 'Guest Session'}</h3>
        <dl>
          <div>
            <dt>Status</dt>
            <dd>{appUser ? 'Authenticated user' : 'Public anonymous visitor'}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{appUser?.email || 'Not signed in'}</dd>
          </div>
          <div>
            <dt>Username</dt>
            <dd>{appUser?.username || 'Guest'}</dd>
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
          <RowButton icon={FiLogIn} label="Sign in (internal tools)" onClick={() => navigate('/signin')} />
        )}
        <RowButton icon={FiInfo} label="Back to chat" onClick={() => navigate('/')} />
      </div>
    </section>
  );
}
