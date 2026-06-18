import React from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { getProductBySlug } from './productData';
import { ContactPanel, PublicShell } from './PublicLayout';

export default function ProductPage() {
  const { slug } = useParams();
  const product = getProductBySlug(slug);

  if (!product) return <Navigate to="/" replace />;

  return (
    <PublicShell pageClass="product-detail-page">
      <section className="product-hero" style={{ '--accent': product.accent }}>
        <div className="product-copy">
          <Link to="/chemicals" className="back-link">
            Back to Chemicals
          </Link>
          <p className="eyebrow">{product.category}</p>
          <h1>{product.name}</h1>
          <p>{product.description}</p>
          <div className="hero-actions">
            <Link to="/contact-us" className="primary-action">
              Contact Sales
            </Link>
            <Link to="/technology" className="secondary-action">
              Technical Support
            </Link>
          </div>
        </div>
        <div className="product-media">
          <img src={`${process.env.PUBLIC_URL}${product.image}`} alt="" />
        </div>
      </section>

      <section className="product-detail-grid" aria-label={`${product.name} details`} style={{ '--accent': product.accent }}>
        <article>
          <p className="eyebrow">Key benefits</p>
          <h2>Why teams use {product.name}</h2>
          <ul>
            {product.benefits.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>
        <article>
          <p className="eyebrow">Applications</p>
          <h2>Common field uses</h2>
          <ul>
            {product.applications.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>
      </section>

      <section className="readable-section product-summary">
        <p>
          Product selection depends on fluid conditions, application temperature, materials compatibility, logistics,
          and operational objectives. Kemko can help confirm whether {product.name} is the right fit or whether a custom
          formulation would better match the job.
        </p>
      </section>

      <ContactPanel heading={`Discuss ${product.name} with Kemko.`} />
    </PublicShell>
  );
}
