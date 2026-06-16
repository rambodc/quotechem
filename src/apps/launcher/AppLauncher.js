import React from 'react';
import { Link } from 'react-router-dom';
import { visibleMiniAppsForUser } from '../registry/miniApps';
import './AppLauncher.css';

export default function AppLauncher({ user }) {
  const apps = visibleMiniAppsForUser(user);

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
            <Link key={app.id} to={app.defaultPath} className={`mini-app-tile app-${app.id}`}>
              <span className={`mini-app-icon ${app.id}`}>
                {app.iconImage ? (
                  <img src={`${process.env.PUBLIC_URL}${app.iconImage}`} alt="" width="200" height="200" loading="eager" />
                ) : (
                  <Icon size={34} aria-hidden />
                )}
              </span>
              <span className="mini-app-label">{app.label}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
