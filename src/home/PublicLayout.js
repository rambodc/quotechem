import React from 'react';
import { Link, NavLink } from 'react-router-dom';
import { CONTACT, NAV_LINKS } from './productData';
import './Catalog.css';

export function KemkoBrand() {
  return (
    <Link to="/" className="kemko-brand" aria-label="Kemko home">
      <span className="kemko-brand-mark">K</span>
      <span>
        <strong>KEMKO</strong>
        <small>Specialty Chemicals</small>
      </span>
    </Link>
  );
}

export function PublicNav() {
  return (
    <header className="public-header">
      <nav className="public-nav" aria-label="Public navigation">
        <KemkoBrand />
        <div className="public-nav-links">
          {NAV_LINKS.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'}>
              {item.label}
            </NavLink>
          ))}
        </div>
        <Link to="/portal" className="portal-link">
          Portal
        </Link>
      </nav>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="public-footer">
      <div>
        <KemkoBrand />
        <p>
          Canadian specialty chemical solutions for completion, production, stimulation, water treatment, and field
          operations.
        </p>
      </div>
      <div className="footer-contact">
        <strong>Get in Touch</strong>
        <span>{CONTACT.headOffice.address.join(', ')}</span>
        <a href={`tel:${CONTACT.headOffice.phone.replace(/[^\d+]/g, '')}`}>{CONTACT.headOffice.phone}</a>
      </div>
    </footer>
  );
}

export function PublicShell({ children, pageClass = '' }) {
  return (
    <main className={`kemko-page ${pageClass}`}>
      <PublicNav />
      {children}
      <PublicFooter />
    </main>
  );
}

export function PageHero({ eyebrow, title, children, image, dark = false }) {
  return (
    <section className={`page-hero ${dark ? 'page-hero-dark' : ''}`}>
      <div className="page-hero-copy">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {children ? <p>{children}</p> : null}
      </div>
      {image ? (
        <div className="page-hero-media">
          <img src={`${process.env.PUBLIC_URL}${image}`} alt="" />
        </div>
      ) : null}
    </section>
  );
}

export function ContactPanel({ heading = 'Speak with Kemko' }) {
  return (
    <section className="contact-panel" aria-labelledby="contact-panel-title">
      <div>
        <p className="eyebrow">Contact</p>
        <h2 id="contact-panel-title">{heading}</h2>
        <p>
          Bring Kemko into the conversation early so the chemistry, operating conditions, logistics, and budget can be
          aligned before work reaches the field.
        </p>
      </div>
      <div className="contact-list">
        {[CONTACT.headOffice, CONTACT.blendingFacility].map((location) => (
          <article key={location.name}>
            <strong>{location.name}</strong>
            {location.address.map((line) => (
              <span key={line}>{line}</span>
            ))}
            <a href={`tel:${location.phone.replace(/[^\d+]/g, '')}`}>{location.phone}</a>
          </article>
        ))}
      </div>
    </section>
  );
}
