import React from 'react';
import { FiClipboard } from 'react-icons/fi';
import './QuotesMiniApp.css';

export default function QuotesMiniApp() {
  return (
    <section className="quotes-mini-page" aria-labelledby="quotes-mini-title">
      <div className="quotes-mini-card">
        <span className="quotes-mini-icon">
          <FiClipboard size={44} aria-hidden />
        </span>
        <p>Mini App</p>
        <h1 id="quotes-mini-title">Quotes</h1>
        <span>Quote workspace access is enabled. User-facing tools will be added here next.</span>
      </div>
    </section>
  );
}
