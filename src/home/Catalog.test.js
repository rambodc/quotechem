import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CatalogHome from './CatalogHome';
import ProductPage from './ProductPage';

function renderPublicRoutes(initialEntries = ['/']) {
  return render(
    <MemoryRouter initialEntries={initialEntries} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/" element={<CatalogHome />} />
        <Route path="/chat" element={<div>Chat page target</div>} />
        <Route path="/chemicals/:slug" element={<ProductPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('public catalog pages', () => {
  test('home renders QuoteChem intro, chat link, and four product cards', () => {
    renderPublicRoutes();

    expect(screen.getByRole('heading', { name: /Source industrial chemicals/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Chat with QuoteChem/i }).getAttribute('href')).toBe('/chat');
    expect(screen.getByRole('link', { name: /Sodium Hydroxide/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Hydrochloric Acid/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Sulfuric Acid/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Citric Acid/i })).toBeTruthy();
  });

  test('clicking a product card opens its product page', () => {
    renderPublicRoutes();

    fireEvent.click(screen.getByRole('link', { name: /Sodium Hydroxide/i }));

    expect(screen.getByRole('heading', { name: 'Sodium Hydroxide' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Start a quote for this product/i }).getAttribute('href')).toBe('/chat');
  });

  test('product page shows rich content and chat CTA', () => {
    renderPublicRoutes(['/chemicals/citric-acid']);

    expect(screen.getByRole('heading', { name: 'Citric Acid' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Common applications/i })).toBeTruthy();
    expect(screen.getByLabelText(/Citric Acid overview video placeholder/i)).toBeTruthy();
    expect(screen.getByRole('link', { name: /Start a quote for this product/i }).getAttribute('href')).toBe('/chat');
  });

  test('unknown product slug falls back to catalog home', () => {
    renderPublicRoutes(['/chemicals/not-real']);

    expect(screen.getByRole('heading', { name: /Source industrial chemicals/i })).toBeTruthy();
  });
});
