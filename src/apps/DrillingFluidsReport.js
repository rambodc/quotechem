import React from 'react';
import { FiDroplet } from 'react-icons/fi';
import './DrillingFluidsReport.css';

export default function DrillingFluidsReport() {
  return (
    <section className="drilling-report-page" aria-labelledby="drilling-report-title">
      <div className="drilling-report-card">
        <span className="drilling-report-icon">
          <FiDroplet size={46} aria-hidden />
        </span>
        <p>Mini App</p>
        <h1 id="drilling-report-title">Drilling Fluids Report</h1>
      </div>
    </section>
  );
}
