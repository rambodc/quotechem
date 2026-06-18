import React from 'react';
import { Link } from 'react-router-dom';
import { CATEGORIES, CONTACT } from './productData';
import { ContactPanel, PageHero, PublicShell } from './PublicLayout';

const PAGE_IMAGES = {
  hero: '/assets/chemicals/hydrochloric-acid.jpg',
  operations: '/assets/chemicals/sodium-hydroxide.jpg',
  chemicals: '/assets/chemicals/sulfuric-acid.jpg',
  technology: '/assets/chemicals/citric-acid.jpg',
};

function SectionIntro({ eyebrow, title, children }) {
  return (
    <div className="section-intro">
      <p className="eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      {children ? <p>{children}</p> : null}
    </div>
  );
}

function FeatureGrid({ items }) {
  return (
    <div className="feature-grid">
      {items.map((item) => (
        <article key={item.title} className="feature-item">
          <span>{item.stat}</span>
          <h3>{item.title}</h3>
          <p>{item.copy}</p>
        </article>
      ))}
    </div>
  );
}

function ImageBand({ image, eyebrow, title, children, reverse = false }) {
  return (
    <section className={`image-band ${reverse ? 'image-band-reverse' : ''}`}>
      <div className="image-band-media">
        <img src={`${process.env.PUBLIC_URL}${image}`} alt="" />
      </div>
      <div className="image-band-copy">
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        <p>{children}</p>
      </div>
    </section>
  );
}

function ProductCard({ product }) {
  return (
    <Link to={`/chemicals/${product.slug}`} className="kemko-product-card" style={{ '--accent': product.accent }}>
      <span className="product-card-media">
        <img src={`${process.env.PUBLIC_URL}${product.image}`} alt="" />
      </span>
      <span className="product-card-content">
        <small>{product.category}</small>
        <strong>{product.name}</strong>
        <span>{product.summary}</span>
        <b>View chemistry</b>
      </span>
    </Link>
  );
}

function HomePage() {
  return (
    <PublicShell pageClass="home-page">
      <section className="home-hero">
        <div className="home-hero-copy">
          <p className="eyebrow">Canadian specialty chemistry</p>
          <h1>Advanced Solutions in Specialty Chemicals</h1>
          <p>
            Kemko designs, formulates, blends, and supplies specialty chemical programs for oil and gas teams that need
            practical chemistry, technical support, and responsive local execution.
          </p>
          <div className="hero-actions">
            <Link to="/chemicals" className="primary-action">
              Explore Chemicals
            </Link>
            <Link to="/contact-us" className="secondary-action">
              Contact Sales
            </Link>
          </div>
        </div>
        <div className="home-hero-media">
          <img src={`${process.env.PUBLIC_URL}${PAGE_IMAGES.hero}`} alt="" />
        </div>
      </section>

      <section className="content-section">
        <SectionIntro eyebrow="About Kemko" title="Engineered chemistry for demanding field conditions.">
          Kemko works with application experts, chemical engineers, chemists, and technology partners to create
          cost-effective products that match the operational realities of completions, production, stimulation, and water
          treatment.
        </SectionIntro>
        <FeatureGrid
          items={[
            {
              stat: '01',
              title: 'Custom formulation',
              copy: 'Field requirements, fluid samples, application goals, and budgets are translated into fit-for-purpose chemistry.',
            },
            {
              stat: '02',
              title: 'Blending and supply',
              copy: 'Kemko supports local execution with specialty products, strategic manufacturing partnerships, and responsive service.',
            },
            {
              stat: '03',
              title: 'Responsible delivery',
              copy: 'Safety, environmental performance, and operational reliability are considered throughout product development and field use.',
            },
          ]}
        />
      </section>

      <ImageBand image={PAGE_IMAGES.operations} eyebrow="Operations" title="Chemistry aligned with the work in front of you.">
        From completion and production chemistry to stimulation programs and water treatment, Kemko brings practical
        application knowledge to teams working under real field constraints.
      </ImageBand>

      <section className="content-section content-section-tight">
        <SectionIntro eyebrow="Product families" title="A focused specialty chemical portfolio.">
          Kemko’s product line covers bacterial control, cleaning, completion support, inhibition, lubrication,
          scavenging, stimulation, and remediation needs.
        </SectionIntro>
        <div className="category-strip">
          {CATEGORIES.map((category) => (
            <Link key={category.name} to="/chemicals">
              <strong>{category.name}</strong>
              <span>{category.products.length} products</span>
            </Link>
          ))}
        </div>
      </section>

      <ContactPanel heading="Build the right chemical program with Kemko." />
    </PublicShell>
  );
}

function OperationsPage() {
  return (
    <PublicShell>
      <PageHero eyebrow="Operations" title="Completion, production, stimulation, and water treatment support." image={PAGE_IMAGES.operations}>
        Kemko helps improve efficiency and profitability through field-ready chemistry, local support, and application
        knowledge shaped around the way each operation actually runs.
      </PageHero>
      <section className="content-section">
        <FeatureGrid
          items={[
            {
              stat: 'CP',
              title: 'Completion, production and stimulation chemistries',
              copy: 'Responsive local supply, strategic manufacturing partnerships, and tailored chemistry help teams meet requirements without pushing beyond budget.',
            },
            {
              stat: 'WT',
              title: 'Water treatment',
              copy: 'Kemko evaluates source water and builds treatment strategies that help operators reuse water, meet application needs, and strengthen environmental performance.',
            },
            {
              stat: 'DF',
              title: 'Drilling fluids',
              copy: 'Field teams can lean on Kemko for practical chemical support and recommendations across drilling-fluid and well-servicing applications.',
            },
          ]}
        />
      </section>
      <ImageBand image={PAGE_IMAGES.chemicals} eyebrow="Local response" title="Chemistry sourced for Western Canadian operations." reverse>
        Kemko combines local responsiveness with access to specialty chemical solutions from a broader technology and
        manufacturing network.
      </ImageBand>
      <ContactPanel heading="Discuss an operation-specific chemical need." />
    </PublicShell>
  );
}

function ChemicalsPage() {
  return (
    <PublicShell>
      <PageHero eyebrow="Chemicals" title="Specialty products for oilfield applications." image={PAGE_IMAGES.chemicals}>
        Browse Kemko’s chemical portfolio by product family. Each chemistry is presented with its primary field role,
        practical benefits, and common applications.
      </PageHero>
      <section className="content-section">
        <div className="category-sections">
          {CATEGORIES.map((category) => (
            <section key={category.name} className="chemical-category" aria-labelledby={`${category.name}-title`}>
              <div className="category-heading">
                <p className="eyebrow">Product family</p>
                <h2 id={`${category.name}-title`}>{category.name}</h2>
              </div>
              <div className="product-grid">
                {category.products.map((product) => (
                  <ProductCard key={product.slug} product={product} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>
      <ContactPanel heading="Need more detail on a Kemko chemistry?" />
    </PublicShell>
  );
}

function TechnologyPage() {
  return (
    <PublicShell>
      <PageHero eyebrow="Technology" title="Custom solutions backed by technical expertise." image={PAGE_IMAGES.technology}>
        Kemko combines local application support with laboratories, scientists, engineers, and field technicians who can
        evaluate fluids and recommend fit-for-purpose chemistry.
      </PageHero>
      <section className="content-section">
        <FeatureGrid
          items={[
            {
              stat: 'CS',
              title: 'Custom solutions',
              copy: 'Kemko develops solutions collaboratively, using field requirements and technical evaluation to improve efficiency without losing sight of budget.',
            },
            {
              stat: 'TE',
              title: 'Technical expertise',
              copy: 'Multiple laboratories and experienced technical teams support fluid analysis, recommendations, and well-servicing fluid design.',
            },
            {
              stat: 'ER',
              title: 'Environmental responsibility',
              copy: 'Responsible product development remains a major consideration when Kemko evaluates new technologies and field options.',
            },
          ]}
        />
      </section>
      <ContactPanel heading="Bring Kemko technical support into your next project." />
    </PublicShell>
  );
}

function SafetyPage() {
  return (
    <PublicShell>
      <PageHero eyebrow="Health & Safety" title="Committed to excellence in safety." image={PAGE_IMAGES.operations}>
        Kemko puts employee, client, and public safety at the center of its work through policies, training, compliance
        systems, and continuous improvement.
      </PageHero>
      <section className="content-section readable-section">
        <p>
          Kemko maintains a valid COR certification and supports its safety program with stringent procedures,
          industry-leading tracking, and up-to-date compliance data. Every employee has a role in protecting health,
          safety, and the environment.
        </p>
        <p>
          The company continually works to identify and correct risks, adhere to regulatory requirements, and keep HSE
          policies current. Clients can evaluate Kemko through compliance systems including Energy Safety Canada,
          ComplyWorks, ISNetworld, and COR.
        </p>
      </section>
      <ContactPanel heading="Review Kemko safety and compliance expectations." />
    </PublicShell>
  );
}

function CareersPage() {
  return (
    <PublicShell>
      <PageHero eyebrow="Careers" title="Grow with a close-knit technical team." image={PAGE_IMAGES.technology}>
        Kemko’s work environment supports continuous learning, practical problem-solving, and adaptation in a technology
        driven industry.
      </PageHero>
      <section className="content-section readable-section">
        <p>
          Kemko’s success is built by dedicated people whose ideas, leadership, and field experience move the company
          forward. Team members are encouraged to keep learning, contribute to better solutions, and take ownership of
          work that matters to customers.
        </p>
        <p>
          If you are interested in specialty chemistry, field operations, technical service, or responsive customer
          support, Kemko offers a setting where growth and accountability work together.
        </p>
      </section>
      <ContactPanel heading="Connect with Kemko about future opportunities." />
    </PublicShell>
  );
}

function LocationsPage() {
  return (
    <PublicShell>
      <PageHero eyebrow="Locations" title="Warehouse access across Western Canada." image={PAGE_IMAGES.chemicals}>
        Kemko has access to traditional mud storage warehouses across Western Canada, supporting remote locations and
        responsive field supply.
      </PageHero>
      <section className="content-section">
        <div className="location-grid">
          {[CONTACT.headOffice, CONTACT.blendingFacility].map((location) => (
            <article key={location.name}>
              <p className="eyebrow">Kemko location</p>
              <h2>{location.name}</h2>
              {location.address.map((line) => (
                <span key={line}>{line}</span>
              ))}
              <a href={`tel:${location.phone.replace(/[^\d+]/g, '')}`}>{location.phone}</a>
            </article>
          ))}
        </div>
      </section>
      <ContactPanel heading="Coordinate supply from the right Kemko location." />
    </PublicShell>
  );
}

function ContactPage() {
  return (
    <PublicShell>
      <PageHero eyebrow="Contact Us" title="Tell Kemko what you need to solve." image={PAGE_IMAGES.hero}>
        Whether you need a known product, a custom formulation, or a technical conversation around operating conditions,
        Kemko welcomes new challenges.
      </PageHero>
      <section className="content-section">
        <div className="location-grid contact-page-grid">
          {[CONTACT.headOffice, CONTACT.blendingFacility].map((location) => (
            <article key={location.name}>
              <p className="eyebrow">Contact</p>
              <h2>{location.name}</h2>
              {location.address.map((line) => (
                <span key={line}>{line}</span>
              ))}
              <a href={`tel:${location.phone.replace(/[^\d+]/g, '')}`}>{location.phone}</a>
            </article>
          ))}
        </div>
      </section>
    </PublicShell>
  );
}

const PAGES = {
  home: HomePage,
  operations: OperationsPage,
  chemicals: ChemicalsPage,
  technology: TechnologyPage,
  safety: SafetyPage,
  careers: CareersPage,
  locations: LocationsPage,
  contact: ContactPage,
};

export { ProductCard };

export default function CatalogHome({ page = 'home' }) {
  const Page = PAGES[page] || HomePage;
  return <Page />;
}
