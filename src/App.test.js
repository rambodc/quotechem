import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

let mockAuthUser = null;
let mockProfile = { role: 'user', firstName: '', lastName: '', enabledMiniApps: null };
let mockLocalReports = [];

const mockDrillingProgramTemplate = {
  id: 'template-1',
  name: 'Standard Drilling Program',
  description: 'Standard generated program.',
  published: true,
  sections: [
    {
      id: 'overview',
      title: 'Program Overview',
      description: 'Opening program section.',
      required: true,
      options: [
        {
          id: 'standard',
          label: 'Standard',
          instructions: 'Write a standard drilling program overview.',
          assets: [],
        },
      ],
    },
  ],
};

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

jest.mock('./apps/drillingFluidsStore', () => ({
  listDrillingFluidReports: jest.fn(() => Promise.resolve(mockLocalReports)),
  saveDrillingFluidReport: jest.fn((report) => {
    mockLocalReports = [report, ...mockLocalReports.filter((item) => item.localId !== report.localId)];
    return Promise.resolve(report);
  }),
  updateDrillingFluidReport: jest.fn((localId, patch) => {
    const existing = mockLocalReports.find((item) => item.localId === localId) || { localId, payload: {} };
    const updated = { ...existing, ...patch };
    mockLocalReports = [updated, ...mockLocalReports.filter((item) => item.localId !== localId)];
    return Promise.resolve(updated);
  }),
}));

beforeEach(() => {
  const { onAuthStateChanged, signOut, updatePassword } = require('firebase/auth');
  const { getDoc, onSnapshot, serverTimestamp, setDoc } = require('firebase/firestore');
  const { postJson } = require('./lib/api');
  const { auth } = require('./firebase');
  const drillingStore = require('./apps/drillingFluidsStore');

  mockLocalReports = [];
  window.localStorage.clear();
  auth.currentUser = mockAuthUser;
  document.head.querySelectorAll('link[rel="manifest"]').forEach((node) => node.remove());
  const manifestLink = document.createElement('link');
  manifestLink.rel = 'manifest';
  manifestLink.href = '/manifest.json';
  document.head.appendChild(manifestLink);
  const cachedUrls = new Map();
  const cache = {
    addAll: jest.fn((urls) => {
      urls.forEach((url) => cachedUrls.set(url, { ok: true }));
      return Promise.resolve();
    }),
    match: jest.fn((url) => Promise.resolve(cachedUrls.get(typeof url === 'string' ? url : url.url) || null)),
    put: jest.fn((url, response) => {
      cachedUrls.set(typeof url === 'string' ? url : url.url, response || { ok: true });
      return Promise.resolve();
    }),
  };
  Object.defineProperty(window, 'caches', {
    configurable: true,
    value: {
      open: jest.fn(() => Promise.resolve(cache)),
      match: jest.fn((url) => Promise.resolve(cachedUrls.get(typeof url === 'string' ? url : url.url) || null)),
      keys: jest.fn(() => Promise.resolve([])),
      delete: jest.fn(() => Promise.resolve(true)),
    },
  });
  Object.defineProperty(window, 'indexedDB', {
    configurable: true,
    value: {
      open: jest.fn(() => {
        const request = {
          result: {
            objectStoreNames: { contains: jest.fn(() => false) },
            createObjectStore: jest.fn(),
            close: jest.fn(),
          },
        };
        setTimeout(() => {
          if (request.onupgradeneeded) request.onupgradeneeded();
          if (request.onsuccess) request.onsuccess();
        }, 0);
        return request;
      }),
    },
  });
  Object.defineProperty(window.performance, 'getEntriesByType', {
    configurable: true,
    value: jest.fn(() => [{ name: `${window.location.origin}/static/js/main.js` }, { name: `${window.location.origin}/static/css/main.css` }]),
  });
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
  Object.defineProperty(window.navigator, 'serviceWorker', {
    configurable: true,
    value: {
      controller: {},
      ready: Promise.resolve({ active: {}, scope: `${window.location.origin}/offline/` }),
      getRegistration: jest.fn(() => Promise.resolve({ active: {}, scope: `${window.location.origin}/offline/` })),
      getRegistrations: jest.fn(() =>
        Promise.resolve([
          {
            scope: `${window.location.origin}/`,
            active: { scriptURL: `${window.location.origin}/drilling-fluids-sw.js` },
            unregister: jest.fn(() => Promise.resolve(true)),
          },
        ])
      ),
      register: jest.fn(() => Promise.resolve({ active: {}, scope: `${window.location.origin}/offline/` })),
    },
  });

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
  drillingStore.listDrillingFluidReports.mockImplementation(() => Promise.resolve(mockLocalReports));
  drillingStore.saveDrillingFluidReport.mockImplementation((report) => {
    mockLocalReports = [report, ...mockLocalReports.filter((item) => item.localId !== report.localId)];
    return Promise.resolve(report);
  });
  drillingStore.updateDrillingFluidReport.mockImplementation((localId, patch) => {
    const existing = mockLocalReports.find((item) => item.localId === localId) || { localId, payload: {} };
    const updated = { ...existing, ...patch };
    mockLocalReports = [updated, ...mockLocalReports.filter((item) => item.localId !== localId)];
    return Promise.resolve(updated);
  });

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
    if (path === 'listDrillingProgramTemplates') {
      return Promise.resolve({ items: [mockDrillingProgramTemplate] });
    }
    if (path === 'listDrillingProgramRuns') {
      return Promise.resolve({
        items: [
          {
            runId: 'run-1',
            templateName: 'Standard Drilling Program',
            programTitle: 'North Pad Program',
            status: 'completed',
            pdfUrl: 'https://example.com/north-pad.pdf',
            createdAt: '2026-06-13T12:00:00.000Z',
          },
          {
            runId: 'run-2',
            templateName: 'Standard Drilling Program',
            programTitle: 'Failed Program',
            status: 'failed',
            error: 'OpenAI document request failed',
            createdAt: '2026-06-13T11:00:00.000Z',
          },
        ],
      });
    }
    if (path === 'generateDrillingProgramPdf') {
      return Promise.resolve({
        run: {
          runId: 'run-new',
          templateName: 'Standard Drilling Program',
          programTitle: 'Generated Test Program',
          status: 'completed',
          pdfUrl: 'https://example.com/generated.pdf',
          createdAt: '2026-06-13T13:00:00.000Z',
        },
      });
    }
    if (path === 'adminSaveDrillingProgramTemplate') {
      return Promise.resolve({ template: mockDrillingProgramTemplate });
    }
    return Promise.resolve({});
  });
});

function renderAt(path, role = 'user', enabledMiniApps = null) {
  mockAuthUser = { uid: `${role}-1`, email: `${role}@example.com` };
  const { auth } = require('./firebase');
  auth.currentUser = mockAuthUser;
  mockProfile = { role, firstName: '', lastName: '', enabledMiniApps };
  window.history.pushState({}, '', path);
  const App = require('./App').default;
  return render(<App />);
}

function renderSignedOutAt(path) {
  mockAuthUser = null;
  const { auth } = require('./firebase');
  auth.currentUser = null;
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
    expect(screen.getByRole('link', { name: /Testing Offline/i }).getAttribute('href')).toBe('/apps/drilling-fluids-report');
    expect(screen.getByRole('link', { name: /Drilling Programs/i }).getAttribute('href')).toBe('/apps/drilling-programs');
    expect(screen.getByRole('link', { name: /User Access/i }).getAttribute('href')).toBe('/apps/user-access');
    expect(screen.getByRole('link', { name: /^Account$/i }).getAttribute('href')).toBe('/apps/account');
  });

  test('basic users without enabled access only see Account on the launcher', async () => {
    renderAt('/portal', 'user');

    expect(await screen.findByRole('heading', { name: 'Apps' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Quotes/i })).not.toBeTruthy();
    expect(screen.queryByRole('link', { name: /Testing Offline/i })).not.toBeTruthy();
    expect(screen.queryByRole('link', { name: /Drilling Programs/i })).not.toBeTruthy();
    expect(screen.queryByRole('link', { name: /User Access/i })).not.toBeTruthy();
    expect(screen.getByRole('link', { name: /^Account$/i }).getAttribute('href')).toBe('/apps/account');
  });

  test('basic users with Quotes enabled see Quotes and Account only', async () => {
    renderAt('/portal', 'user', ['quotes']);

    expect(await screen.findByRole('heading', { name: 'Apps' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Quotes/i }).getAttribute('href')).toBe('/apps/quotes');
    expect(screen.queryByRole('link', { name: /Testing Offline/i })).not.toBeTruthy();
    expect(screen.queryByRole('link', { name: /Drilling Programs/i })).not.toBeTruthy();
    expect(screen.getByRole('link', { name: /^Account$/i }).getAttribute('href')).toBe('/apps/account');
  });

  test('basic users with Testing Offline enabled see that app and Account only', async () => {
    renderAt('/portal', 'user', ['drilling-fluids-report']);

    expect(await screen.findByRole('heading', { name: 'Apps' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Quotes/i })).not.toBeTruthy();
    expect(screen.getByRole('link', { name: /Testing Offline/i }).getAttribute('href')).toBe('/apps/drilling-fluids-report');
    expect(screen.queryByRole('link', { name: /Drilling Programs/i })).not.toBeTruthy();
    expect(screen.getByRole('link', { name: /^Account$/i }).getAttribute('href')).toBe('/apps/account');
  });

  test('basic users with Drilling Programs enabled see that app and can generate a PDF', async () => {
    const { postJson } = require('./lib/api');
    renderAt('/apps/drilling-programs', 'user', ['drilling-programs']);

    expect(await screen.findByRole('heading', { name: /Generate field-ready PDF programs/i })).toBeTruthy();
    expect(await screen.findByText(/North Pad Program/i)).toBeTruthy();
    expect(await screen.findByText(/OpenAI document request failed/i)).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/Program title/i), { target: { value: 'Generated Test Program' } });
    fireEvent.change(screen.getByLabelText(/Well name/i), { target: { value: 'Well 12-34' } });
    fireEvent.click(screen.getByRole('button', { name: /Generate PDF/i }));

    await waitFor(() => expect(postJson).toHaveBeenCalledWith('generateDrillingProgramPdf', expect.objectContaining({ templateId: 'template-1' }), { authed: true }));
    expect(await screen.findByText(/Drilling program PDF generated/i)).toBeTruthy();
    expect(await screen.findByText(/Generated Test Program/i)).toBeTruthy();
  });

  test('admin users can manage Drilling Programs templates', async () => {
    const { postJson } = require('./lib/api');
    renderAt('/apps/drilling-programs', 'admin');

    expect(await screen.findByRole('heading', { name: /Generate field-ready PDF programs/i })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Admin Instruction Library/i })).toBeTruthy();
    const templateNameInput = await screen.findByLabelText(/Template name/i);
    expect(templateNameInput.value).toBe('Standard Drilling Program');
    fireEvent.change(templateNameInput, { target: { value: 'Updated Program Template' } });
    fireEvent.click(screen.getByRole('button', { name: /Save template/i }));

    await waitFor(() => expect(postJson).toHaveBeenCalledWith('adminSaveDrillingProgramTemplate', expect.objectContaining({ name: 'Updated Program Template' }), { authed: true }));
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
    expect(screen.queryByRole('heading', { name: 'Testing Offline' })).not.toBeTruthy();
    expect(window.location.pathname).toBe('/portal');
  });

  test('admin users can open User Access and Testing Offline mini apps', async () => {
    renderAt('/apps/user-access', 'admin');
    expect(await screen.findByRole('heading', { name: 'User Access' })).toBeTruthy();

    cleanup();
    renderAt('/apps/drilling-fluids-report', 'admin');
    expect(await screen.findByRole('heading', { name: 'Testing Offline' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Prepare Offline App/i })).toBeTruthy();
    expect(screen.getByText(/Account prepared/i)).toBeTruthy();
    expect(screen.getByText(/Offline page cached/i)).toBeTruthy();
    expect(screen.getByText(/Add to Home Screen/i)).toBeTruthy();
    expect(screen.getByRole('link', { name: /Test Offline Page/i }).getAttribute('href')).toBe('/offline/drilling-fluids-report?offline-check=1');
    expect(screen.getByRole('link', { name: /Open Offline Report/i }).getAttribute('href')).toBe('/offline/drilling-fluids-report');
    fireEvent.click(screen.getByRole('button', { name: /Prepare Offline App/i }));
    await waitFor(() => expect(window.navigator.serviceWorker.register).toHaveBeenCalledWith('/offline/drilling-fluids-sw.js', { scope: '/offline/' }));
    expect(window.navigator.serviceWorker.getRegistrations).toHaveBeenCalled();
    await waitFor(() => expect(window.localStorage.getItem('quotechem:offline-drilling-user')).toContain('admin@example.com'));
  });

  test('offline Testing Offline renders outside the portal and saves locally', async () => {
    const drillingStore = require('./apps/drillingFluidsStore');
    renderAt('/offline/drilling-fluids-report', 'user', ['drilling-fluids-report']);

    expect(await screen.findByRole('heading', { name: 'Testing Offline' })).toBeTruthy();
    expect(document.querySelector('link[rel="manifest"]').getAttribute('href')).toBe('/offline/drilling-fluids-manifest.json');
    expect(screen.queryByRole('button', { name: /Apps/i })).not.toBeTruthy();
    expect(screen.getByLabelText(/Density/i)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Well name/i), { target: { value: 'Offline Well' } });
    fireEvent.click(screen.getByRole('button', { name: /Save locally/i }));

    await waitFor(() => expect(drillingStore.saveDrillingFluidReport).toHaveBeenCalled());
    expect(await screen.findByText(/Saved locally on this device/i)).toBeTruthy();
    expect(await screen.findByText(/Offline Well/i)).toBeTruthy();
  });

  test('offline Testing Offline uploads pending reports when prepared and signed in', async () => {
    const { setDoc } = require('firebase/firestore');
    const drillingStore = require('./apps/drillingFluidsStore');
    window.localStorage.setItem(
      'quotechem:offline-drilling-user',
      JSON.stringify({ uid: 'user-1', email: 'user@example.com', preparedAt: '2026-06-09T00:00:00.000Z' })
    );
    renderAt('/offline/drilling-fluids-report', 'user', ['drilling-fluids-report']);

    expect(await screen.findByRole('heading', { name: 'Testing Offline' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Well name/i), { target: { value: 'North Pad 12' } });
    fireEvent.change(screen.getByLabelText(/Density/i), { target: { value: '10.2 ppg' } });
    fireEvent.click(screen.getByRole('button', { name: /Save locally/i }));

    await waitFor(() => expect(drillingStore.saveDrillingFluidReport).toHaveBeenCalled());
    expect(await screen.findByText(/Saved locally on this device/i)).toBeTruthy();
    expect(await screen.findByText(/North Pad 12/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /^Upload$/i }));
    await waitFor(() => expect(setDoc).toHaveBeenCalled());
    expect(await screen.findByText(/1 report uploaded/i)).toBeTruthy();
  });

  test('offline Testing Offline asks users to sign in before upload without identity', async () => {
    renderSignedOutAt('/offline/drilling-fluids-report');

    expect(await screen.findByRole('heading', { name: 'Testing Offline' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Upload$/i }));

    expect(await screen.findByText(/Sign in to upload/i)).toBeTruthy();
  });

  test('offline Testing Offline disables upload offline but keeps local save available', async () => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false });
    const drillingStore = require('./apps/drillingFluidsStore');
    renderAt('/offline/drilling-fluids-report', 'user', ['drilling-fluids-report']);

    expect(await screen.findByRole('heading', { name: 'Testing Offline' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Upload$/i }).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Well name/i), { target: { value: 'Offline Well' } });
    fireEvent.click(screen.getByRole('button', { name: /Save locally/i }));

    await waitFor(() => expect(drillingStore.saveDrillingFluidReport).toHaveBeenCalled());
    expect(await screen.findByText(/Saved locally on this device/i)).toBeTruthy();
  });

  test('drilling service worker only falls back for the dedicated offline route', () => {
    const fs = require('fs');
    const source = fs.readFileSync(`${process.cwd()}/public/offline/drilling-fluids-sw.js`, 'utf8');
    expect(source).toContain("const OFFLINE_ROUTE = '/offline/drilling-fluids-report'");
    expect(source).not.toContain("const SHELL_URLS = ['/'");
    expect(source).not.toContain("caches.match('/')");
    expect(source).not.toContain('caches.match(\'/\')');
    expect(source).not.toContain("const OFFLINE_ROUTE = '/apps/drilling-fluids-report'");
  });

  test('drilling manifest is scoped to offline routes only', () => {
    const fs = require('fs');
    const manifest = JSON.parse(fs.readFileSync(`${process.cwd()}/public/offline/drilling-fluids-manifest.json`, 'utf8'));
    expect(manifest.start_url).toBe('/offline/drilling-fluids-report');
    expect(manifest.scope).toBe('/offline/');
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
    expect(screen.getByRole('button', { name: /Testing Offline/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Drilling Programs/i })).toBeTruthy();

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
