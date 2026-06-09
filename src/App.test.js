import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

let mockAuthUser = null;
let mockProfile = { role: 'user', firstName: '', lastName: '', enabledMiniApps: null };

jest.mock('./firebase', () => ({
  auth: {},
  db: {},
  storage: {},
}));

jest.mock('firebase/auth', () => ({
  onAuthStateChanged: jest.fn(),
  signInWithEmailAndPassword: jest.fn(),
  signOut: jest.fn(),
  updatePassword: jest.fn(),
}));

jest.mock('firebase/firestore', () => ({
  doc: jest.fn((db, collection, id) => ({ collection, id })),
  getDoc: jest.fn(),
  onSnapshot: jest.fn(),
  serverTimestamp: jest.fn(),
  setDoc: jest.fn(),
}));

jest.mock('firebase/storage', () => ({
  getDownloadURL: jest.fn(() => Promise.resolve('https://example.com/avatar.jpg')),
  ref: jest.fn((storage, path) => ({ path })),
  uploadBytes: jest.fn(() => Promise.resolve()),
}));

jest.mock('./lib/api', () => ({
  postJson: jest.fn(),
}));

beforeEach(() => {
  const { onAuthStateChanged, signOut, updatePassword } = require('firebase/auth');
  const { getDoc, onSnapshot, serverTimestamp, setDoc } = require('firebase/firestore');
  const { postJson } = require('./lib/api');

  onAuthStateChanged.mockImplementation((auth, callback) => {
    const unsubscribe = jest.fn();
    Promise.resolve().then(() => callback(mockAuthUser));
    return unsubscribe;
  });
  signOut.mockImplementation(() => Promise.resolve());
  updatePassword.mockImplementation(() => Promise.resolve());

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
    if (path === 'adminListUsers') {
      return Promise.resolve({
        items: [
          {
            uid: 'user-1',
            email: 'user@example.com',
            firstName: 'Riley',
            lastName: 'Chen',
            role: 'user',
            profilePhotoThumbUrl: 'https://example.com/riley-50.jpg',
            enabledMiniApps: ['drilling-fluids-report'],
          },
        ],
      });
    }
    return Promise.resolve({});
  });
});

function renderAt(path, role = 'user', enabledMiniApps = null) {
  mockAuthUser = { uid: `${role}-1`, email: `${role}@example.com` };
  mockProfile = { role, firstName: '', lastName: '', enabledMiniApps };
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
    expect(screen.getByRole('link', { name: /Quotes/i }).getAttribute('href')).toBe('/apps/quotes');
    expect(screen.getByRole('link', { name: /Drilling Fluids Report/i }).getAttribute('href')).toBe('/apps/drilling-fluids-report');
    expect(screen.getByRole('link', { name: /User Access/i }).getAttribute('href')).toBe('/apps/user-access');
    expect(screen.getByRole('link', { name: /^Account$/i }).getAttribute('href')).toBe('/apps/account');
  });

  test('basic users without enabled access only see Account on the launcher', async () => {
    renderAt('/portal', 'user');

    expect(await screen.findByRole('heading', { name: 'Apps' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Quotes/i })).not.toBeTruthy();
    expect(screen.queryByRole('link', { name: /Drilling Fluids Report/i })).not.toBeTruthy();
    expect(screen.queryByRole('link', { name: /User Access/i })).not.toBeTruthy();
    expect(screen.getByRole('link', { name: /^Account$/i }).getAttribute('href')).toBe('/apps/account');
  });

  test('basic users with Quotes enabled see Quotes and Account only', async () => {
    renderAt('/portal', 'user', ['quotes']);

    expect(await screen.findByRole('heading', { name: 'Apps' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Quotes/i }).getAttribute('href')).toBe('/apps/quotes');
    expect(screen.queryByRole('link', { name: /Drilling Fluids Report/i })).not.toBeTruthy();
    expect(screen.getByRole('link', { name: /^Account$/i }).getAttribute('href')).toBe('/apps/account');
  });

  test('basic users with Drilling Fluids Report enabled see that app and Account only', async () => {
    renderAt('/portal', 'user', ['drilling-fluids-report']);

    expect(await screen.findByRole('heading', { name: 'Apps' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Quotes/i })).not.toBeTruthy();
    expect(screen.getByRole('link', { name: /Drilling Fluids Report/i }).getAttribute('href')).toBe('/apps/drilling-fluids-report');
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

  test('basic users with Quotes enabled see the user-facing Quotes placeholder', async () => {
    renderAt('/apps/quotes', 'user', ['quotes']);

    expect(await screen.findByRole('heading', { name: 'Quotes' })).toBeTruthy();
    expect(screen.getByText(/User-facing tools will be added here next/i)).toBeTruthy();
  });

  test('basic users with Quotes enabled are redirected away from quote admin tools', async () => {
    renderAt('/apps/quotes/dashboard', 'user', ['quotes']);

    expect(await screen.findByRole('heading', { name: 'Quotes' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Dashboard' })).not.toBeTruthy();
    expect(window.location.pathname).toBe('/apps/quotes');
  });

  test('basic users are redirected away from disabled mini apps', async () => {
    renderAt('/apps/drilling-fluids-report', 'user', []);

    expect(await screen.findByRole('heading', { name: 'Apps' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Drilling Fluids Report' })).not.toBeTruthy();
    expect(window.location.pathname).toBe('/portal');
  });

  test('admin users can open User Access and Drilling Fluids Report mini apps', async () => {
    renderAt('/apps/user-access', 'admin');
    expect(await screen.findByRole('heading', { name: 'User Access' })).toBeTruthy();

    cleanup();
    renderAt('/apps/drilling-fluids-report', 'admin');
    expect(await screen.findByRole('heading', { name: 'Drilling Fluids Report' })).toBeTruthy();
  });

  test('admin and basic users can open the Account mini app', async () => {
    renderAt('/apps/account', 'admin');
    expect(await screen.findByRole('heading', { name: 'Account' })).toBeTruthy();
    expect(screen.getByText(/Upload photo/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Logout/i })).toBeTruthy();

    cleanup();
    renderAt('/apps/account', 'user');
    expect(await screen.findByRole('heading', { name: 'Account' })).toBeTruthy();
  });

  test('User Access shows the list first and opens add and edit drawers', async () => {
    renderAt('/apps/user-access', 'admin');

    expect(await screen.findByRole('heading', { name: 'User Access' })).toBeTruthy();
    expect(await screen.findByText('Riley Chen')).toBeTruthy();
    expect(await screen.findByText('user@example.com')).toBeTruthy();
    expect(screen.queryByLabelText(/Temporary password/i)).not.toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Add user/i }));
    expect(await screen.findByRole('heading', { name: 'Add User' })).toBeTruthy();
    expect(screen.getByLabelText(/First name/i)).toBeTruthy();
    expect(screen.getByLabelText(/Last name/i)).toBeTruthy();
    expect(screen.getByLabelText(/Temporary password/i).getAttribute('minLength')).toBe('6');
    expect(screen.getByRole('button', { name: /Quotes/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Drilling Fluids Report/i })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Close/i }));
    fireEvent.click(screen.getByRole('button', { name: /Edit/i }));
    expect(await screen.findByRole('heading', { name: 'Edit User' })).toBeTruthy();
    expect(screen.getByDisplayValue('Riley')).toBeTruthy();
    expect(screen.getByDisplayValue('Chen')).toBeTruthy();
    expect(screen.queryByLabelText(/Temporary password/i)).not.toBeTruthy();
    expect(screen.getByDisplayValue('user@example.com').disabled).toBe(true);
  });

  test('Change Password only requires a six character minimum', async () => {
    renderAt('/apps/account/password', 'user');

    expect(await screen.findByRole('heading', { name: 'Change Password' })).toBeTruthy();
    expect(screen.getByText(/at least 6 characters/i)).toBeTruthy();
    expect(screen.getByLabelText(/New password/i).getAttribute('minLength')).toBe('6');
    expect(screen.getByLabelText(/Confirm password/i).getAttribute('minLength')).toBe('6');
  });

  test('signed-out users visiting portal routes are sent to sign in', async () => {
    renderSignedOutAt('/apps/account');

    expect(await screen.findByRole('heading', { name: /^Sign in$/i })).toBeTruthy();
    await waitFor(() => expect(window.location.pathname).toBe('/signin'));
  });

  test('signed-out users visiting signup are sent to sign in', async () => {
    renderSignedOutAt('/signup');

    expect(await screen.findByRole('heading', { name: /^Sign in$/i })).toBeTruthy();
    await waitFor(() => expect(window.location.pathname).toBe('/signin'));
  });
});
