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
        <Route path="/operations" element={<CatalogHome page="operations" />} />
        <Route path="/chemicals" element={<CatalogHome page="chemicals" />} />
        <Route path="/technology" element={<CatalogHome page="technology" />} />
        <Route path="/health-safety" element={<CatalogHome page="safety" />} />
        <Route path="/careers" element={<CatalogHome page="careers" />} />
        <Route path="/locations" element={<CatalogHome page="locations" />} />
        <Route path="/contact-us" element={<CatalogHome page="contact" />} />
        <Route path="/chemicals/:slug" element={<ProductPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('Kemko public pages', () => {
  test('home renders Kemko hero, public navigation, and portal link', () => {
    renderPublicRoutes();

    expect(screen.getByRole('heading', { name: /Advanced Solutions in Specialty Chemicals/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Portal/i }).getAttribute('href')).toBe('/portal');
    expect(screen.getByRole('link', { name: /Operations/i }).getAttribute('href')).toBe('/operations');
    expect(screen.getByRole('link', { name: /^Chemicals$/i }).getAttribute('href')).toBe('/chemicals');
    expect(screen.getByRole('link', { name: /Technology/i }).getAttribute('href')).toBe('/technology');
    expect(screen.getByRole('link', { name: /Health & Safety/i }).getAttribute('href')).toBe('/health-safety');
    expect(screen.getByRole('link', { name: /Careers/i }).getAttribute('href')).toBe('/careers');
    expect(screen.getByRole('link', { name: /Locations/i }).getAttribute('href')).toBe('/locations');
    expect(screen.getByRole('link', { name: /Contact Us/i }).getAttribute('href')).toBe('/contact-us');
  });

  test('chemicals page renders product families and representative products', () => {
    renderPublicRoutes(['/chemicals']);

    expect(screen.getByRole('heading', { name: /Specialty products for oilfield applications/i })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Biocides' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Cleaners' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Completion Chemicals' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Scavengers' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /UniCide G15/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /ApHrox Syn/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /UniVive W/i })).toBeTruthy();
  });

  test('clicking a product opens its Kemko product page', () => {
    renderPublicRoutes(['/chemicals']);

    fireEvent.click(screen.getByRole('link', { name: /UniCide G15/i }));

    expect(screen.getByRole('heading', { name: 'UniCide G15' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Why teams use UniCide G15/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Back to Chemicals/i }).getAttribute('href')).toBe('/chemicals');
  });

  test('public supporting pages render rewritten Kemko content', () => {
    renderPublicRoutes(['/technology']);
    expect(screen.getByRole('heading', { name: /Custom solutions backed by technical expertise/i })).toBeTruthy();

    renderPublicRoutes(['/contact-us']);
    expect(screen.getByRole('heading', { name: /Tell Kemko what you need to solve/i })).toBeTruthy();
    expect(screen.getAllByText(/Suite 1900, 635 - 8th Avenue SW/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\(250\) 616-8592/i).length).toBeGreaterThan(0);
  });

  test('unknown product slug falls back to home', () => {
    renderPublicRoutes(['/chemicals/not-real']);

    expect(screen.getByRole('heading', { name: /Advanced Solutions in Specialty Chemicals/i })).toBeTruthy();
  });
});
