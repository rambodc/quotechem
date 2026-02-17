import React, { useContext, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiChevronRight, FiKey, FiMail } from 'react-icons/fi';
import { UserContext } from '../App';
import { accountBaseForRole } from './routeUtils';
import './Account.css';

function AccountAction({ icon: Icon, title, onClick }) {
  return (
    <button type="button" className="account-action" onClick={onClick}>
      <span className="account-action-left">
        <Icon size={18} />
        <span>{title}</span>
      </span>
      <FiChevronRight size={18} />
    </button>
  );
}

export default function Account() {
  const navigate = useNavigate();
  const appUser = useContext(UserContext);
  const base = useMemo(() => accountBaseForRole(appUser?.role), [appUser?.role]);

  return (
    <section className="account-page">
      <header>
        <h2>Account</h2>
        <p>Update identity and sign-in credentials.</p>
      </header>

      <div className="account-list">
        <AccountAction icon={FiMail} title="Change email" onClick={() => navigate(`${base}/email`)} />
        <AccountAction
          icon={FiKey}
          title="Change password"
          onClick={() => navigate(`${base}/password`)}
        />
      </div>
    </section>
  );
}
