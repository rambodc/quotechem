import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export const SITE_URL = 'https://quotechem.com';
export const HOME_TITLE = 'QuoteChem | Global Oilfield Chemical Sourcing';
export const HOME_DESCRIPTION = 'Source production, drilling, completion, stimulation, water-treatment, and flow-assurance chemicals globally with QuoteChem.';

export const STRUCTURED_DATA = [
  { '@context': 'https://schema.org', '@type': 'Organization', '@id': `${SITE_URL}/#organization`, name: 'QuoteChem', url: `${SITE_URL}/`, logo: `${SITE_URL}/assets/quotechem-logo.png`, description: HOME_DESCRIPTION },
  { '@context': 'https://schema.org', '@type': 'WebSite', '@id': `${SITE_URL}/#website`, url: `${SITE_URL}/`, name: 'QuoteChem', publisher: { '@id': `${SITE_URL}/#organization` } },
  { '@context': 'https://schema.org', '@type': 'Service', '@id': `${SITE_URL}/#service`, name: 'Global Oilfield Chemical Sourcing', serviceType: 'Oilfield chemical sourcing', provider: { '@id': `${SITE_URL}/#organization` }, areaServed: 'Worldwide', url: `${SITE_URL}/`, description: HOME_DESCRIPTION },
  {
    '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: [
      { '@type': 'Question', name: 'What oilfield chemicals can QuoteChem help source?', acceptedAnswer: { '@type': 'Answer', text: 'QuoteChem supports sourcing across production, drilling, completion, stimulation, water-treatment, and flow-assurance chemical families.' } },
      { '@type': 'Question', name: 'Can QuoteChem help find an alternative chemical supplier?', acceptedAnswer: { '@type': 'Answer', text: 'Yes. Share the product, chemistry, specification, or operating need and QuoteChem can help define the requirement for alternative supplier sourcing.' } },
      { '@type': 'Question', name: 'Do I need to know the exact chemical product?', acceptedAnswer: { '@type': 'Answer', text: 'No. You can describe the field problem or application and the guided sourcing conversation will collect the technical context needed for review.' } },
    ],
  },
];

function setMeta(selector, attributes) {
  let element = document.head.querySelector(selector);
  if (!element) { element = document.createElement('meta'); document.head.appendChild(element); }
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
}

export default function Seo() {
  const { pathname } = useLocation();
  useEffect(() => {
    const isHome = pathname === '/';
    const title = isHome ? HOME_TITLE : 'QuoteChem | Secure Sourcing Request';
    const description = isHome ? HOME_DESCRIPTION : 'Secure QuoteChem sourcing workflow.';
    document.title = title;
    setMeta('meta[name="description"]', { name: 'description', content: description });
    setMeta('meta[name="robots"]', { name: 'robots', content: isHome ? 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1' : 'noindex,follow' });
    setMeta('meta[property="og:title"]', { property: 'og:title', content: title });
    setMeta('meta[property="og:description"]', { property: 'og:description', content: description });
    setMeta('meta[property="og:url"]', { property: 'og:url', content: `${SITE_URL}/` });
    setMeta('meta[name="twitter:title"]', { name: 'twitter:title', content: title });
    setMeta('meta[name="twitter:description"]', { name: 'twitter:description', content: description });
    let canonical = document.head.querySelector('link[rel="canonical"]');
    if (!canonical) { canonical = document.createElement('link'); canonical.rel = 'canonical'; document.head.appendChild(canonical); }
    canonical.href = `${SITE_URL}/`;
    const schema = document.getElementById('quotechem-structured-data');
    if (schema) schema.textContent = isHome ? JSON.stringify(STRUCTURED_DATA) : '[]';
  }, [pathname]);
  return null;
}
