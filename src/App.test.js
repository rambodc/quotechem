import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

let mockAuthUser = null;
let mockProfile = { role: 'user', firstName: '', lastName: '', enabledMiniApps: null };

const mockThreeDScene = {
  title: 'Saved Stage Product',
  summary: 'Saved model from the shared 3D library.',
  cameraHint: { distance: 22, target: [0, 2, 0] },
  objects: [
    {
      id: 'saved-stage-base',
      type: 'platform',
      label: 'Saved Stage',
      position: [0, 0.1, 0],
      scale: [6, 0.2, 3],
      rotationY: 0,
      color: '#334155',
      materialKind: 'matte',
      textureKind: 'plain',
    },
  ],
};

const mockThreeDModel = {
  modelId: 'model-1',
  title: 'Saved Stage Product',
  summary: 'Saved model from the shared 3D library.',
  scene: mockThreeDScene,
  status: 'active',
  createdBy: 'user-1',
  createdByEmail: 'user@example.com',
  createdAt: '2026-06-15T12:00:00.000Z',
  updatedBy: 'user-1',
  updatedByEmail: 'user@example.com',
  updatedAt: '2026-06-15T12:30:00.000Z',
  latestPrompt: 'Create a saved stage product.',
  versionCount: 2,
};

const mockThreeDVersions = [
  {
    versionId: 'version-2',
    scene: mockThreeDScene,
    prompt: 'Add LED pillars.',
    model: 'test-model',
    source: 'ai-edit',
    createdBy: 'user-1',
    createdByEmail: 'user@example.com',
    createdAt: '2026-06-15T12:30:00.000Z',
  },
  {
    versionId: 'version-1',
    scene: mockThreeDScene,
    prompt: 'Create a saved stage product.',
    model: 'test-model',
    source: 'ai-generate',
    createdBy: 'user-1',
    createdByEmail: 'user@example.com',
    createdAt: '2026-06-15T12:00:00.000Z',
  },
];

const mockUniquemItems = {
  items: [{ productId: 'item-1', active: true, activeStatus: 'Active', item: 'ApHrox', description: 'ApHrox', quantityOnHand: 0, unitOfMeasure: 'Liters', color: '#0f766e', packaging: [] }],
  nextCursor: null,
  total: 1,
};

const mockUniquemInventory = {
  products: [{ productId: 'inventory-1', item: 'EpSealon', quantityOnHand: 770, unitOfMeasure: 'each (ea)', visible: true, color: '#2563eb', position: { x: 0, z: 0 }, rotation: 0, packaging: { representation: 'pallet', capacity: 48, packageLabel: 'bags', resolved: true, source: 'description' }, loadCount: 17, stackCount: 6, columns: 3, rows: 2, stackLimit: 3, partial: true, finalLoadQuantity: 2, finalLoadPercent: 4.2, footprint: { width: 4.05, depth: 2.7 } }],
  hiddenProducts: [], floor: { width: 35, depth: 20 }, revision: 'inventory-revision',
};

const mockUniquemAssembly = {
  items: [{ productId: 'item-1', item: 'ApHrox', active: true, activeStatus: 'Active', unitOfMeasure: 'Liters', quantityOnHand: 0 }],
  builds: [],
  nextHistoryCursor: null,
};

jest.mock('./firebase', () => ({
  auth: {},
  db: {},
  storage: {},
}));

jest.mock('firebase/auth', () => ({
  onAuthStateChanged: jest.fn(),
  signInWithCustomToken: jest.fn(),
  signInWithEmailAndPassword: jest.fn(),
  signInAnonymously: jest.fn(),
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

jest.mock('three/examples/jsm/controls/OrbitControls', () => ({
  OrbitControls: jest.fn().mockImplementation(() => ({
    target: { set: jest.fn(), copy: jest.fn(), clone: jest.fn(() => ({ set: jest.fn(), copy: jest.fn() })) },
    update: jest.fn(),
    dispose: jest.fn(),
    enableDamping: false,
    dampingFactor: 0,
    autoRotate: false,
    autoRotateSpeed: 0,
    minDistance: 0,
    maxDistance: 0,
    maxPolarAngle: 0,
  })),
}));

beforeEach(() => {
  const { onAuthStateChanged, signInWithCustomToken, signInAnonymously, signOut, updatePassword } = require('firebase/auth');
  const { getDoc, onSnapshot, serverTimestamp, setDoc } = require('firebase/firestore');
  const { postJson } = require('./lib/api');
  const { auth } = require('./firebase');
  window.localStorage.clear();
  window.innerWidth = 1280;
  window.print = jest.fn();
  window.matchMedia = jest.fn((query) => ({
    matches: !query.includes('max-width'),
    media: query,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    addListener: jest.fn(),
    removeListener: jest.fn(),
  }));
  global.FileReader = class {
    readAsDataURL(file) {
      this.result = `data:${file.type || 'application/pdf'};base64,JVBERi0xLjQK`;
      setTimeout(() => this.onload && this.onload());
    }
  };
  auth.currentUser = mockAuthUser;
  onAuthStateChanged.mockImplementation((auth, callback) => {
    const unsubscribe = jest.fn();
    Promise.resolve().then(() => callback(mockAuthUser));
    return unsubscribe;
  });
  signOut.mockImplementation(() => Promise.resolve());
  signInWithCustomToken.mockImplementation(() => Promise.resolve());
  signInAnonymously.mockImplementation(() => { auth.currentUser = { uid: 'anonymous-1', isAnonymous: true, getIdToken: jest.fn(() => Promise.resolve('token')) }; return Promise.resolve({ user: auth.currentUser }); });
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

  postJson.mockImplementation((path, body) => {
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
            enabledMiniApps: [],
          },
        ],
        invites: [
          {
            inviteId: 'invite-1',
            email: 'pending@example.com',
            status: 'pending',
            firstName: 'Pending',
            lastName: 'Person',
            role: 'user',
            enabledMiniApps: ['uniquem'],
            expiresAt: Date.now() + 86400000,
          },
          {
            inviteId: 'invite-accepted-duplicate',
            email: 'user@example.com',
            status: 'accepted',
            firstName: 'Riley',
            lastName: 'Chen',
            role: 'user',
            enabledMiniApps: [],
            expiresAt: Date.now() + 86400000,
          },
        ],
      });
    }
    if (path === 'quotechemListRequests') return Promise.resolve({ items: [] });
    if (path === 'adminInviteUser') return Promise.resolve({ mode: 'invited', invite: { email: 'new@example.com', status: 'pending' } });
    if (path === 'adminResendInvite') return Promise.resolve({ ok: true });
    if (path === 'adminUpdateInvite') return Promise.resolve({ invite: { ...(body || {}) } });
    if (path === 'adminCancelInvite') return Promise.resolve({ ok: true });
    if (path === 'adminUpdateUserAccess') return Promise.resolve({ user: { ...(body || {}) } });
    if (path === 'previewInvite') {
      return Promise.resolve({
        invite: {
          email: 'invited@example.com',
          status: 'pending',
          firstName: 'Invited',
          lastName: 'User',
        },
      });
    }
    if (path === 'acceptInvite') return Promise.resolve({ email: 'invited@example.com', customToken: 'custom-token' });
    if (path === 'listUniquemItems') return Promise.resolve(mockUniquemItems);
    if (path === 'getUniquemAssemblyWorkspace') return Promise.resolve(mockUniquemAssembly);
    if (path === 'getUniquemInventory') return Promise.resolve(mockUniquemInventory);
    if (path === 'saveUniquemInventoryLayout') return Promise.resolve(mockUniquemInventory);
    if (path === 'listThreeDModels') {
      return Promise.resolve({ items: [mockThreeDModel] });
    }
    if (path === 'getThreeDModel') {
      return Promise.resolve({ model: mockThreeDModel, versions: mockThreeDVersions });
    }
    if (path === 'createThreeDModel') {
      return Promise.resolve({
        model: {
          ...mockThreeDModel,
          modelId: 'model-new',
          title: 'Generated Stage Entrance',
          summary: 'A new saved stage entrance.',
          scene: {
            ...mockThreeDScene,
            title: 'Generated Stage Entrance',
            summary: 'A new saved stage entrance.',
          },
          versionCount: 1,
        },
        versions: [{ ...mockThreeDVersions[1], versionId: 'version-new', prompt: body?.prompt || '' }],
      });
    }
    if (path === 'reviseThreeDModel') {
      return Promise.resolve({
        model: {
          ...mockThreeDModel,
          title: 'Edited Stage Product',
          summary: 'Edited saved model from AI.',
          scene: {
            ...mockThreeDScene,
            title: 'Edited Stage Product',
            summary: 'Edited saved model from AI.',
          },
          latestPrompt: body?.prompt || '',
          versionCount: 3,
        },
        versions: [{ ...mockThreeDVersions[0], versionId: 'version-3', prompt: body?.prompt || '' }, ...mockThreeDVersions],
      });
    }
    if (path === 'restoreThreeDModelVersion') {
      return Promise.resolve({
        model: mockThreeDModel,
        versions: [{ ...mockThreeDVersions[0], versionId: 'version-restore', source: 'restore', prompt: 'Restored version version-1' }, ...mockThreeDVersions],
      });
    }
    if (path === 'archiveThreeDModel') {
      return Promise.resolve({ ok: true, modelId: body?.modelId });
    }
    if (path === 'generateThreeDScene') {
      return Promise.resolve({
        ok: true,
        model: 'test-model',
        scene: {
          title: 'Generated Stage Entrance',
          summary: 'A stage entrance generated from the prompt.',
          cameraHint: { distance: 22, target: [0, 2, 0] },
          objects: [
            {
              id: 'stage-base',
              type: 'platform',
              label: 'Stage',
              position: [0, 0.1, 0],
              scale: [6, 0.2, 3],
              rotationY: 0,
              color: '#334155',
              materialKind: 'matte',
              textureKind: 'plain',
            },
          ],
        },
      });
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
  test('QuoteChem mini app opens the staff sourcing inbox', async () => {
    renderAt('/apps/quotechem', 'admin');
    expect(await screen.findByRole('heading', { name: /Requests and conversations/i })).toBeTruthy();
    expect(await screen.findByText(/New public conversations will appear here/i)).toBeTruthy();
  });

  test('QuoteChem inbox rejects users without app access', async () => {
    renderAt('/apps/quotechem', 'user', []);

    expect(await screen.findByRole('heading', { name: 'Apps' })).toBeTruthy();
    expect(screen.queryByPlaceholderText('Message QuoteChem…')).toBeNull();
  });

  test('admin users do not see removed Quotes app on the launcher', async () => {
    renderAt('/portal', 'admin');

    expect(await screen.findByRole('heading', { name: 'Apps' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Quotes/i })).not.toBeTruthy();
    expect(screen.getByRole('link', { name: /Uniquem/i }).getAttribute('href')).toBe('/apps/uniquem/dashboard');
    expect(screen.getByRole('link', { name: /^3D$/i }).getAttribute('href')).toBe('/apps/3d/viewer');
    expect(screen.getByRole('link', { name: /User Access/i }).getAttribute('href')).toBe('/apps/user-access');
    expect(screen.getByRole('link', { name: /^Account$/i }).getAttribute('href')).toBe('/apps/account');
  });

  test('basic users without enabled access only see Account on the launcher', async () => {
    renderAt('/portal', 'user');

    expect(await screen.findByRole('heading', { name: 'Apps' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Quotes/i })).not.toBeTruthy();
    expect(screen.queryByRole('link', { name: /Uniquem/i })).not.toBeTruthy();
    expect(screen.queryByRole('link', { name: /User Access/i })).not.toBeTruthy();
    expect(screen.getByRole('link', { name: /^Account$/i }).getAttribute('href')).toBe('/apps/account');
  });

  test('basic users with removed Quotes access only see Account', async () => {
    renderAt('/portal', 'user', ['quotes']);

    expect(await screen.findByRole('heading', { name: 'Apps' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Quotes/i })).not.toBeTruthy();
    expect(screen.queryByRole('link', { name: /Uniquem/i })).not.toBeTruthy();
    expect(screen.getByRole('link', { name: /^Account$/i }).getAttribute('href')).toBe('/apps/account');
  });

  test('basic users receive Uniquem and 3D access independently', async () => {
    renderAt('/portal', 'user', ['uniquem']);

    expect(await screen.findByRole('heading', { name: 'Apps' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Uniquem/i }).getAttribute('href')).toBe('/apps/uniquem/dashboard');
    expect(screen.queryByRole('link', { name: /^3D$/i })).not.toBeTruthy();
    expect(screen.getByRole('link', { name: /^Account$/i }).getAttribute('href')).toBe('/apps/account');

    cleanup();
    renderAt('/portal', 'user', ['three-d']);
    expect(await screen.findByRole('heading', { name: 'Apps' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /^3D$/i }).getAttribute('href')).toBe('/apps/3d/viewer');
    expect(screen.queryByRole('link', { name: /Uniquem/i })).not.toBeTruthy();

    cleanup();
    renderAt('/apps/3d/viewer', 'user', ['three-d']);
    expect(await screen.findByRole('heading', { name: '3D Warehouse' })).toBeTruthy();
    expect(screen.getByTestId('three-d-warehouse-canvas')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Auto/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Reset/i })).toBeTruthy();

    cleanup();
    renderAt('/apps/3d/creator', 'user', ['three-d']);
    expect(await screen.findByRole('heading', { name: '3D Creator' })).toBeTruthy();
    expect(screen.getByTestId('three-d-creator-canvas')).toBeTruthy();
  });

  test('Uniquem exposes Dashboard, Items, Assembly, and 3D Inventory routes', async () => {
    const cases = [
      ['/apps/uniquem/dashboard', 'Dashboard'],
      ['/apps/uniquem/items', 'Items'],
      ['/apps/uniquem/assembly', 'Assembly'],
      ['/apps/uniquem/inventory', '3D Inventory'],
    ];

    for (const [path, title] of cases) {
      renderAt(path, 'admin');
      expect((await screen.findAllByRole('heading', { name: title })).length).toBeGreaterThan(0);
      cleanup();
    }

    renderAt('/apps/uniquem', 'admin');
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeTruthy();
    expect(window.location.pathname).toBe('/apps/uniquem/dashboard');
    expect(screen.getByLabelText('Blank dashboard')).toBeTruthy();
  });

  test('Uniquem Items displays the manual catalog controls', async () => {
    renderAt('/apps/uniquem/items', 'admin');
    expect((await screen.findAllByText('ApHrox')).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /New item/i })).toBeTruthy();
    expect(screen.queryByText(/QuickBooks/i)).not.toBeTruthy();
  });

  test('3D Creator creates a saved model with prompt and optional image', async () => {
    const { postJson } = require('./lib/api');
    renderAt('/apps/3d/creator', 'user', ['three-d']);

    expect(await screen.findByRole('heading', { name: '3D Creator' })).toBeTruthy();
    expect(await screen.findByText('Saved Stage Product')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'New' }));
    fireEvent.change(screen.getByLabelText('Prompt'), { target: { value: 'Create a festival stage gate with LED pillars.' } });
    const file = new File(['image'], 'stage-reference.webp', { type: 'image/webp' });
    fireEvent.change(screen.getByLabelText(/Image reference/i), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: /Create Saved Model/i }));

    await waitFor(() =>
      expect(postJson).toHaveBeenCalledWith(
        'createThreeDModel',
        expect.objectContaining({
          prompt: 'Create a festival stage gate with LED pillars.',
          image: expect.objectContaining({ name: 'stage-reference.webp', contentType: 'image/webp' }),
        }),
        { authed: true }
      )
    );
    await waitFor(() => expect(screen.getAllByText('Generated Stage Entrance').length).toBeGreaterThanOrEqual(1));
    expect(screen.getByRole('button', { name: /Generated Stage Entrance/i })).toBeTruthy();
    expect(screen.getByText(/A new saved stage entrance/i)).toBeTruthy();
  });

  test('3D Creator keeps a created model visible when refresh fails after save', async () => {
    const { postJson } = require('./lib/api');
    let listCalls = 0;
    postJson.mockImplementation((path, body) => {
      if (path === 'listThreeDModels') {
        listCalls += 1;
        if (listCalls === 1) return Promise.resolve({ items: [] });
        return Promise.reject(new Error('Could not load saved products.'));
      }
      if (path === 'createThreeDModel') {
        return Promise.resolve({
          model: {
            ...mockThreeDModel,
            modelId: 'model-new',
            title: 'Generated Stage Entrance',
            summary: 'A new saved stage entrance.',
            scene: {
              ...mockThreeDScene,
              title: 'Generated Stage Entrance',
              summary: 'A new saved stage entrance.',
            },
            latestPrompt: body?.prompt || '',
            versionCount: 1,
          },
          versions: [{ ...mockThreeDVersions[1], versionId: 'version-new', prompt: body?.prompt || '' }],
        });
      }
      return Promise.resolve({});
    });

    renderAt('/apps/3d/creator', 'user', ['three-d']);

    expect(await screen.findByText(/No saved models yet/i)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Prompt'), { target: { value: 'Create a saved stage model.' } });
    fireEvent.click(screen.getByRole('button', { name: /Create Saved Model/i }));

    await waitFor(() => expect(postJson).toHaveBeenCalledWith('createThreeDModel', expect.objectContaining({ prompt: 'Create a saved stage model.' }), { authed: true }));
    expect(await screen.findByRole('button', { name: /Generated Stage Entrance/i })).toBeTruthy();
    expect(screen.getAllByText('Generated Stage Entrance').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/Failed to save 3D model/i)).not.toBeTruthy();
  });

  test('3D Creator can select, edit, restore, and archive saved models', async () => {
    const { postJson } = require('./lib/api');
    renderAt('/apps/3d/creator', 'user', ['three-d']);

    expect(await screen.findByText('Saved Stage Product')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Saved Stage Product/i }));
    await waitFor(() => expect(postJson).toHaveBeenCalledWith('getThreeDModel', { modelId: 'model-1' }, { authed: true }));
    expect(await screen.findByText(/Editing saved model/i)).toBeTruthy();
    expect(screen.getByText(/Add LED pillars/i)).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Prompt'), { target: { value: 'Make the LED wall wider and add side speakers.' } });
    fireEvent.click(screen.getByRole('button', { name: /Edit And Save/i }));
    await waitFor(() =>
      expect(postJson).toHaveBeenCalledWith(
        'reviseThreeDModel',
        expect.objectContaining({ modelId: 'model-1', prompt: 'Make the LED wall wider and add side speakers.' }),
        { authed: true }
      )
    );
    expect(await screen.findByText('Edited Stage Product')).toBeTruthy();

    fireEvent.click(screen.getAllByRole('button', { name: /Restore/i })[0]);
    await waitFor(() =>
      expect(postJson).toHaveBeenCalledWith('restoreThreeDModelVersion', expect.objectContaining({ modelId: 'model-1' }), { authed: true })
    );

    fireEvent.click(screen.getByRole('button', { name: /Archive Model/i }));
    await waitFor(() => expect(postJson).toHaveBeenCalledWith('archiveThreeDModel', { modelId: 'model-1' }, { authed: true }));
  });


  test('removed Quotes routes redirect through the app fallback', async () => {
    renderAt('/apps/quotes/dashboard', 'admin');

    expect(await screen.findByRole('heading', { name: 'Apps' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Dashboard' })).not.toBeTruthy();
    expect(window.location.pathname).toBe('/portal');
  });

  test('removed Drilling Programs route redirects through the app fallback', async () => {
    renderAt('/apps/drilling-programs', 'admin');

    expect(await screen.findByRole('heading', { name: 'Apps' })).toBeTruthy();
    expect(window.location.pathname).toBe('/portal');
  });

  test('basic users are redirected away from disabled mini apps', async () => {
    renderAt('/apps/3d/viewer', 'user', []);

    expect(await screen.findByRole('heading', { name: 'Apps' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: '3D Warehouse' })).not.toBeTruthy();
    expect(window.location.pathname).toBe('/portal');
  });

  test('admin users can open User Access', async () => {
    renderAt('/apps/user-access', 'admin');
    expect(await screen.findByRole('heading', { name: 'User Access' })).toBeTruthy();
  });

  test('admin and basic users can open the Account mini app', async () => {
    renderAt('/apps/account', 'admin');
    expect(await screen.findByRole('heading', { name: 'Account' })).toBeTruthy();
    expect(screen.getByText(/Upload photo/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Change email/i })).not.toBeTruthy();
    expect(screen.getByRole('button', { name: /Logout/i })).toBeTruthy();

    cleanup();
    renderAt('/apps/account', 'user');
    expect(await screen.findByRole('heading', { name: 'Account' })).toBeTruthy();
  });

  test('account email route is not available to staff users', async () => {
    renderAt('/apps/account/email', 'user');

    expect(await screen.findByRole('heading', { name: 'Apps' })).toBeTruthy();
    await waitFor(() => expect(window.location.pathname).toBe('/portal'));
    expect(screen.queryByRole('heading', { name: /Change Email/i })).not.toBeTruthy();
  });

  test('public chat route is available without portal access', async () => {
    renderSignedOutAt('/chat');
    expect(await screen.findByRole('heading', { name: /what should we know/i })).toBeTruthy();
    expect(screen.getByPlaceholderText('Message QuoteChem…')).toBeTruthy();
  });

  test('User Access uses one roster with dropdown actions for users and invites', async () => {
    const { postJson } = require('./lib/api');
    renderAt('/apps/user-access', 'admin');

    expect(await screen.findByRole('heading', { name: 'User Access' })).toBeTruthy();
    expect(await screen.findByText('Riley Chen')).toBeTruthy();
    expect(await screen.findByText('user@example.com')).toBeTruthy();
    expect(screen.getAllByText('user@example.com')).toHaveLength(1);
    expect(await screen.findByText('pending@example.com')).toBeTruthy();
    expect(screen.getByText('Active')).toBeTruthy();
    expect(screen.getByText('Pending')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /Pending invites/i })).not.toBeTruthy();
    expect(screen.queryByRole('heading', { name: /Email Templates/i })).not.toBeTruthy();
    expect(screen.queryByLabelText(/Temporary password/i)).not.toBeTruthy();

    fireEvent.click(screen.getByLabelText('Actions for pending@example.com'));
    expect(await screen.findByRole('menuitem', { name: /Edit invite/i })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /Resend invite/i })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /Cancel invite/i })).toBeTruthy();
    fireEvent.pointerDown(document.body);
    await waitFor(() => expect(screen.queryByRole('menuitem', { name: /Edit invite/i })).not.toBeTruthy());

    fireEvent.click(screen.getByLabelText('Actions for pending@example.com'));
    fireEvent.click(screen.getByRole('menuitem', { name: /Resend invite/i }));
    await waitFor(() => expect(postJson).toHaveBeenCalledWith('adminResendInvite', { inviteId: 'invite-1' }, { authed: true }));

    fireEvent.click(screen.getByLabelText('Actions for pending@example.com'));
    fireEvent.click(await screen.findByRole('menuitem', { name: /Cancel invite/i }));
    await waitFor(() => expect(postJson).toHaveBeenCalledWith('adminCancelInvite', { inviteId: 'invite-1' }, { authed: true }));

    fireEvent.click(screen.getByLabelText('Actions for pending@example.com'));
    fireEvent.click(await screen.findByRole('menuitem', { name: /Edit invite/i }));
    expect(await screen.findByRole('heading', { name: 'Edit Invite' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/^Email$/i), { target: { value: 'edited-pending@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /Save invite/i }));
    await waitFor(() =>
      expect(postJson).toHaveBeenCalledWith(
        'adminUpdateInvite',
        expect.objectContaining({ inviteId: 'invite-1', email: 'edited-pending@example.com' }),
        { authed: true }
      )
    );

    fireEvent.click(screen.getByRole('button', { name: /Send invite/i }));
    expect(await screen.findByRole('heading', { name: 'Send Invite' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/^Email$/i), { target: { value: 'new@example.com' } });
    expect(screen.getByLabelText(/First name/i)).toBeTruthy();
    expect(screen.getByLabelText(/Last name/i)).toBeTruthy();
    expect(screen.queryByLabelText(/Temporary password/i)).not.toBeTruthy();
    expect(screen.queryByRole('button', { name: /Quotes/i })).not.toBeTruthy();
    expect(screen.getByRole('button', { name: /Uniquem/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^3D$/i })).toBeTruthy();
    const sendButtons = screen.getAllByRole('button', { name: /^Send invite$/i });
    fireEvent.click(sendButtons[sendButtons.length - 1]);
    await waitFor(() => expect(postJson).toHaveBeenCalledWith('adminInviteUser', expect.objectContaining({ email: 'new@example.com' }), { authed: true }));

    fireEvent.click(screen.getByLabelText('Actions for user@example.com'));
    fireEvent.click(await screen.findByRole('menuitem', { name: /^Edit$/i }));
    expect(await screen.findByRole('heading', { name: 'Edit User' })).toBeTruthy();
    expect(screen.getByDisplayValue('Riley')).toBeTruthy();
    expect(screen.getByDisplayValue('Chen')).toBeTruthy();
    expect(screen.queryByLabelText(/Temporary password/i)).not.toBeTruthy();
    expect(screen.getByDisplayValue('user@example.com').disabled).toBe(false);
    fireEvent.change(screen.getByLabelText(/^Email$/i), { target: { value: 'riley@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /Save access/i }));
    await waitFor(() =>
      expect(postJson).toHaveBeenCalledWith(
        'adminUpdateUserAccess',
        expect.objectContaining({ uid: 'user-1', email: 'riley@example.com' }),
        { authed: true }
      )
    );
  });

  test('invite registration previews invite and accepts with custom token sign in', async () => {
    const { signInWithCustomToken } = require('firebase/auth');
    const { postJson } = require('./lib/api');
    renderSignedOutAt('/invite/test-token');

    expect(await screen.findByRole('heading', { name: /Finish registration/i })).toBeTruthy();
    await waitFor(() => expect(postJson).toHaveBeenCalledWith('previewInvite', { token: 'test-token' }));
    expect(screen.getByDisplayValue('invited@example.com').readOnly).toBe(true);
    expect(screen.getByDisplayValue('Invited').readOnly).toBe(true);
    expect(screen.getByDisplayValue('User').readOnly).toBe(true);
    fireEvent.change(screen.getByLabelText(/^Password$/i), { target: { value: '123456' } });
    fireEvent.change(screen.getByLabelText(/Confirm password/i), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /Create account/i }));

    await waitFor(() => expect(postJson).toHaveBeenCalledWith('acceptInvite', { token: 'test-token', password: '123456' }));
    await waitFor(() => expect(signInWithCustomToken).toHaveBeenCalledWith(expect.anything(), 'custom-token'));
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
