import React from 'react';
import { Link } from 'react-router-dom';
import { visibleMiniAppsForRole } from './miniApps';
import './AppLauncher.css';

export default function AppLauncher({ role }) {
  const apps = visibleMiniAppsForRole(role);

  return (
    <section className="launcher-page" aria-labelledby="launcher-title">
      <header className="launcher-head">
        <p>QuoteChem Platform</p>
        <h1 id="launcher-title">Apps</h1>
      </header>

      <div className="mini-app-grid">
        {apps.map((app) => {
          const Icon = app.icon;
          return (
            <Link key={app.id} to={app.defaultPath} className="mini-app-tile">
              <span className={`mini-app-icon ${app.id}`}>
                <Icon size={34} aria-hidden />
              </span>
              <span className="mini-app-label">{app.label}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
