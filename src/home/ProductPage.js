import React from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { getProductBySlug } from './productData';
import './Catalog.css';

export default function ProductPage() {
  const { slug } = useParams();
  const product = getProductBySlug(slug);

  if (!product) return <Navigate to="/" replace />;

  return (
    <main className="product-page" style={{ '--accent': product.accent }}>
      <nav className="catalog-nav product-nav" aria-label="Product navigation">
        <Link to="/" className="catalog-brand" aria-label="QuoteChem home">
          <img src={`${process.env.PUBLIC_URL}/assets/QuoteChem Logo 500.png`} alt="QuoteChem" />
        </Link>
        <Link to="/chat" className="catalog-chat-link">
          Start a quote
        </Link>
      </nav>

      <section className="product-hero">
        <div className="product-copy">
          <Link to="/" className="back-link">
            Back to catalog
          </Link>
          <p className="catalog-kicker">{product.eyebrow}</p>
          <h1>{product.name}</h1>
          <p>{product.description}</p>
          <div className="catalog-actions">
            <Link to="/chat" className="primary-catalog-action">
              Start a quote for this product
            </Link>
            <a href="#product-video" className="secondary-catalog-action">
              Watch overview
            </a>
          </div>
        </div>

        <div className="product-media">
          <img src={`${process.env.PUBLIC_URL}${product.image}`} alt={`${product.name} supply example`} />
        </div>
      </section>

      <section id="product-video" className="product-video-section" aria-labelledby="product-video-title">
        <div className="video-placeholder" aria-label={`${product.name} overview video placeholder`}>
          <span className="video-orbit video-orbit-one" />
          <span className="video-orbit video-orbit-two" />
          <span className="video-play" aria-hidden>
            ▶
          </span>
        </div>
        <div>
          <p className="catalog-kicker">Process overview</p>
          <h2 id="product-video-title">A clearer path from chemical need to qualified supplier response.</h2>
          <p>
            This overview area is ready for a product video. For now it uses a motion-rich placeholder to show where real product media can live while keeping the page polished on mobile and desktop.
          </p>
        </div>
      </section>

      <section className="product-detail-grid" aria-label={`${product.name} details`}>
        <article>
          <h2>Common applications</h2>
          <ul>
            {product.applications.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>

        <article>
          <h2>Quote-ready details</h2>
          <ul>
            {product.specs.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>
      </section>
    </main>
  );
}
