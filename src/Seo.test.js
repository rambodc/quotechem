import React from 'react';
import { readFileSync } from 'fs';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Seo, { HOME_DESCRIPTION, HOME_TITLE } from './Seo';

function renderSeo(path) {
  return render(<MemoryRouter initialEntries={[path]}><Seo /></MemoryRouter>);
}

describe('QuoteChem search metadata', () => {
  test('publishes canonical, indexable homepage metadata', async () => {
    renderSeo('/');
    await waitFor(() => expect(document.title).toBe(HOME_TITLE));
    expect(document.querySelector('meta[name="description"]').content).toBe(HOME_DESCRIPTION);
    expect(document.querySelector('meta[name="robots"]').content).toContain('index,follow');
    expect(document.querySelector('link[rel="canonical"]').href).toBe('https://quotechem.com/');
  });

  test('keeps workflow routes out of the index', async () => {
    renderSeo('/request/contact');
    await waitFor(() => expect(document.querySelector('meta[name="robots"]').content).toBe('noindex,follow'));
    expect(document.querySelector('link[rel="canonical"]').href).toBe('https://quotechem.com/');
  });

  test('ships crawler assets with only the public homepage in the sitemap', () => {
    const html = readFileSync('public/index.html', 'utf8');
    const robots = readFileSync('public/robots.txt', 'utf8');
    const sitemap = readFileSync('public/sitemap.xml', 'utf8');
    const firebase = JSON.parse(readFileSync('firebase.json', 'utf8'));
    expect(html).toContain('type="application/ld+json"');
    expect(html).toContain('https://schema.org');
    expect(html).toContain('QuoteChem | Global Oilfield Chemical Sourcing');
    expect(robots).toContain('Disallow: /portal');
    expect(robots).toContain('Sitemap: https://quotechem.com/sitemap.xml');
    expect(sitemap).toContain('<loc>https://quotechem.com/</loc>');
    expect(sitemap.match(/<url>/g)).toHaveLength(1);
    expect(firebase.hosting.headers.some(({ headers }) => headers.some(({ key, value }) => key === 'X-Robots-Tag' && value === 'noindex, follow'))).toBe(true);
  });
});
