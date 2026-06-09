import React from 'react';
import { Link } from 'react-router-dom';
import { PRODUCTS } from './productData';
import './Catalog.css';

export default function CatalogHome() {
  return (
    <main className="catalog-page">
      <section className="catalog-hero">
        <nav className="catalog-nav" aria-label="Public navigation">
          <Link to="/" className="catalog-brand" aria-label="QuoteChem home">
            <img src={`${process.env.PUBLIC_URL}/assets/QuoteChem Logo 500.png`} alt="QuoteChem" />
          </Link>
          <Link to="/portal" className="catalog-chat-link">
            Portal
          </Link>
        </nav>

        <div className="catalog-hero-copy">
          <p className="catalog-kicker">AI-powered bulk chemical sourcing</p>
          <h1>Source industrial chemicals with cleaner RFQs and faster supplier conversations.</h1>
          <p>
            QuoteChem helps buyers organize product needs, quantities, packaging, delivery details, and documentation into supplier-ready requests.
          </p>
          <div className="catalog-actions">
            <Link to="/chat" className="primary-catalog-action">
              Start a quote
            </Link>
            <a href="#catalog-products" className="secondary-catalog-action">
              View examples
            </a>
          </div>
        </div>
      </section>

      <section id="catalog-products" className="catalog-products" aria-labelledby="catalog-products-title">
        <div className="section-heading">
          <p className="catalog-kicker">Example catalog</p>
          <h2 id="catalog-products-title">Explore common chemical sourcing workflows</h2>
        </div>

        <div className="product-grid">
          {PRODUCTS.map((product, index) => (
            <Link
              key={product.slug}
              to={`/chemicals/${product.slug}`}
              className="product-card"
              style={{ '--accent': product.accent, '--delay': `${index * 70}ms` }}
            >
              <span className="product-image-wrap">
                <img src={`${process.env.PUBLIC_URL}${product.image}`} alt="" />
              </span>
              <span className="product-card-body">
                <span className="product-eyebrow">{product.eyebrow}</span>
                <strong>{product.name}</strong>
                <span>{product.subtitle}</span>
                <span className="view-product">View product</span>
              </span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
