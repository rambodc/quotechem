import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

let mockAuthUser = null;
let mockProfile = { role: 'user', firstName: '', lastName: '' };

jest.mock('./firebase', () => ({
  auth: {},
  db: {},
}));

jest.mock('firebase/auth', () => ({
  onAuthStateChanged: jest.fn(),
  signInWithEmailAndPassword: jest.fn(),
  signOut: jest.fn(),
}));

jest.mock('firebase/firestore', () => ({
  doc: jest.fn((db, collection, id) => ({ collection, id })),
  getDoc: jest.fn(),
  onSnapshot: jest.fn(),
  serverTimestamp: jest.fn(),
  setDoc: jest.fn(),
}));

jest.mock('./lib/api', () => ({
  postJson: jest.fn(),
}));

beforeEach(() => {
  const { onAuthStateChanged, signOut } = require('firebase/auth');
  const { getDoc, onSnapshot, serverTimestamp, setDoc } = require('firebase/firestore');
  const { postJson } = require('./lib/api');

  onAuthStateChanged.mockImplementation((auth, callback) => {
    const unsubscribe = jest.fn();
    Promise.resolve().then(() => callback(mockAuthUser));
    return unsubscribe;
  });
  signOut.mockImplementation(() => Promise.resolve());

  getDoc.mockImplementation(() => Promise.resolve({ exists: () => true }));
  onSnapshot.mockImplementation((ref, callback) => {
    callback({
      exists: () => true,
      data: () => mockProfile,
    });
    return jest.fn();
  });
  serverTimestamp.mockImplementation(() => 'server-timestamp');
  setDoc.mockImplementation(() => Promise.resolve());

  postJson.mockImplementation((path) => {
    if (path === 'adminDashboardSummary') {
      return Promise.resolve({
        summary: {
          newLeads: 0,
          inProgressLeads: 0,
          completedLeads: 0,
          uniqueCustomers: 0,
          recentActivity: [],
        },
      });
    }
    if (path === 'adminListLeads') return Promise.resolve({ items: [] });
    if (path === 'adminListCustomers') return Promise.resolve({ items: [] });
    return Promise.resolve({});
  });
});

function renderAt(path, role = 'user') {
  mockAuthUser = { uid: `${role}-1`, email: `${role}@example.com` };
  mockProfile = { role, firstName: '', lastName: '' };
  window.history.pushState({}, '', path);
  const App = require('./App').default;
  return render(<App />);
}

function renderSignedOutAt(path) {
  mockAuthUser = null;
  mockProfile = { role: 'user', firstName: '', lastName: '' };
  window.history.pushState({}, '', path);
  const App = require('./App').default;
  return render(<App />);
}

describe('mini-app portal routing', () => {
  test('admin users see Quotes and Account on the launcher', async () => {
    renderAt('/portal', 'admin');

    expect(await screen.findByRole('heading', { name: 'Apps' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Quotes/i }).getAttribute('href')).toBe('/apps/quotes/dashboard');
    expect(screen.getByRole('link', { name: /^Account$/i }).getAttribute('href')).toBe('/apps/account');
  });

  test('basic users only see Account on the launcher', async () => {
    renderAt('/portal', 'user');

    expect(await screen.findByRole('heading', { name: 'Apps' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Quotes/i })).not.toBeTruthy();
    expect(screen.getByRole('link', { name: /^Account$/i }).getAttribute('href')).toBe('/apps/account');
  });

  test('admin users can open Quotes mini-app pages', async () => {
    renderAt('/apps/quotes/dashboard', 'admin');
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeTruthy();

    cleanup();
    renderAt('/apps/quotes/leads', 'admin');
    expect(await screen.findByRole('heading', { name: 'Leads' })).toBeTruthy();

    cleanup();
    renderAt('/apps/quotes/customers', 'admin');
    expect(await screen.findByRole('heading', { name: 'Customers' })).toBeTruthy();
  });

  test('basic users are redirected away from the Quotes mini app', async () => {
    renderAt('/apps/quotes/dashboard', 'user');

    expect(await screen.findByRole('heading', { name: 'Apps' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Dashboard' })).not.toBeTruthy();
    expect(window.location.pathname).toBe('/portal');
  });

  test('admin and basic users can open the Account mini app', async () => {
    renderAt('/apps/account', 'admin');
    expect(await screen.findByRole('heading', { name: 'Account' })).toBeTruthy();

    cleanup();
    renderAt('/apps/account', 'user');
    expect(await screen.findByRole('heading', { name: 'Account' })).toBeTruthy();
  });

  test('signed-out users visiting portal routes are sent to sign in', async () => {
    renderSignedOutAt('/apps/account');

    expect(await screen.findByRole('heading', { name: /Admin Sign in/i })).toBeTruthy();
    await waitFor(() => expect(window.location.pathname).toBe('/signin'));
  });
});
