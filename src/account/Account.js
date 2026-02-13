import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FiChevronRight, FiKey, FiMail, FiUser } from 'react-icons/fi';
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

  return (
    <section className="account-page">
      <header>
        <h2>Account</h2>
        <p>Update identity and sign-in credentials.</p>
      </header>

      <div className="account-list">
        <AccountAction icon={FiMail} title="Change email" onClick={() => navigate('/account/email')} />
        <AccountAction
          icon={FiKey}
          title="Change password"
          onClick={() => navigate('/account/password')}
        />
        <AccountAction
          icon={FiUser}
          title="Edit username"
          onClick={() => navigate('/account/username')}
        />
      </div>
    </section>
  );
}
