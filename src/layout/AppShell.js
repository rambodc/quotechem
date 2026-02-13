import React from 'react';
import { Outlet } from 'react-router-dom';
import './AppShell.css';

export default function AppShell() {
  return (
    <div className="app-shell">
      <main className="app-content">
        <Outlet />
      </main>
    </div>
  );
}
