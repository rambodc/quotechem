import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

let mockAuthUser = null;
let mockProfile = { role: 'user', firstName: '', lastName: '', enabledMiniApps: null };

const mockUniquemScene = {
  title: 'Saved Stage Product',
  summary: 'Saved model from the shared Uniquem library.',
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

const mockUniquemModel = {
  modelId: 'model-1',
  title: 'Saved Stage Product',
  summary: 'Saved model from the shared Uniquem library.',
  scene: mockUniquemScene,
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

const mockUniquemVersions = [
  {
    versionId: 'version-2',
    scene: mockUniquemScene,
    prompt: 'Add LED pillars.',
    model: 'test-model',
    source: 'ai-edit',
    createdBy: 'user-1',
    createdByEmail: 'user@example.com',
    createdAt: '2026-06-15T12:30:00.000Z',
  },
  {
    versionId: 'version-1',
    scene: mockUniquemScene,
    prompt: 'Create a saved stage product.',
    model: 'test-model',
    source: 'ai-generate',
    createdBy: 'user-1',
    createdByEmail: 'user@example.com',
    createdAt: '2026-06-15T12:00:00.000Z',
  },
];

const mockUniquemOperations = {
  products: [
    {
      productId: 'product-1',
      name: 'Clay Shield',
      description: 'Amine clay control additive.',
      packageType: 'Bag',
      packageAmount: 20,
      measurementUnit: 'kg',
      packagesPerPallet: 20,
      status: 'active',
    },
    {
      productId: 'product-2',
      name: 'Main Hole Blend',
      description: 'Finished blend product.',
      packageType: 'Tote',
      packageAmount: 1000,
      measurementUnit: 'L',
      packagesPerPallet: null,
      status: 'active',
    },
  ],
  warehouses: [
    {
      warehouseId: 'warehouse-1',
      name: 'Lloydminster',
      code: 'LLD',
      locations: ['Main', 'Blend Bay'],
      status: 'active',
    },
  ],
  lots: [
    {
      lotId: 'lot-1',
      productId: 'product-1',
      lotNumber: 'CLAY-001',
      supplier: 'Supplier Co',
      supplierLot: 'SUP-1',
      receivedAt: '2026-06-15',
      expiryDate: '2026-07-01',
      status: 'active',
    },
  ],
  movements: [
    {
      movementId: 'movement-1',
      type: 'receipt',
      productId: 'product-1',
      lotId: 'lot-1',
      warehouseId: 'warehouse-1',
      location: 'Main',
      quantity: 250,
      unit: 'L',
      createdAt: '2026-06-15T12:00:00.000Z',
    },
  ],
  recipes: [
    {
      recipeId: 'recipe-1',
      name: 'Main Hole Blend Recipe',
      outputProductId: 'product-2',
      outputQuantity: 100,
      outputUnit: 'L',
      inputs: [{ productId: 'product-1', quantity: 25, unit: 'L' }],
      status: 'active',
    },
  ],
  blendJobs: [
    {
      jobId: 'job-1',
      name: 'Blend Job 1',
      outputProductId: 'product-2',
      outputQuantity: 100,
      outputUnit: 'L',
      warehouseId: 'warehouse-1',
      location: 'Blend Bay',
      inputs: [{ productId: 'product-1', lotId: 'lot-1', warehouseId: 'warehouse-1', location: 'Main', quantity: 25, unit: 'L' }],
      status: 'planned',
    },
  ],
  prices: [
    {
      priceId: 'price-1',
      productId: 'product-1',
      price: 12.5,
      currency: 'CAD',
      unit: 'L',
      effectiveDate: '2026-06-15',
      status: 'active',
    },
  ],
  balances: [
    {
      productId: 'product-1',
      lotId: 'lot-1',
      warehouseId: 'warehouse-1',
      location: 'Main',
      quantity: 250,
      unit: 'L',
    },
  ],
  batches: [{ batchId: 'batch-1', productId: 'product-1', warehouseId: 'warehouse-1', location: 'Main', lotNumber: 'CLAY-001', packageQuantity: 12.5, sourceType: 'receipt', sourceId: 'receipt-1' }],
  ledger: [{ ledgerId: 'ledger-1', type: 'receiving', batchId: 'batch-1', productId: 'product-1', warehouseId: 'warehouse-1', location: 'Main', packageQuantity: 12.5, referenceId: 'receipt-1', createdAt: '2026-06-15T12:00:00.000Z' }],
  receipts: [{ receiptId: 'receipt-1', batchId: 'batch-1', productId: 'product-1', warehouseId: 'warehouse-1', location: 'Main', lotNumber: 'CLAY-001', packageQuantity: 12.5, supplier: 'Supplier Co', receivedDate: '2026-06-15', status: 'posted' }],
  shipments: [{ shipmentId: 'shipment-1', customer: 'Field Customer', destination: 'Rig 12', shippingDate: '2026-06-16', referenceNumber: 'SHIP-1', status: 'draft', lines: [{ batchId: 'batch-1', packageQuantity: 1 }] }],
  productionRuns: [{ runId: 'run-1', recipeId: 'recipe-1', outputPackages: 1, warehouseId: 'warehouse-1', location: 'Blend Bay', status: 'draft', allocations: [{ batchId: 'batch-1', packageQuantity: 1.25 }] }],
  attachments: [
    {
      attachmentId: 'attachment-1',
      entityType: 'product',
      entityId: 'product-1',
      kind: 'sds',
      name: 'Clay Shield SDS.pdf',
      fileName: 'Clay Shield SDS.pdf',
      contentType: 'application/pdf',
      size: 1200,
      path: 'uniquem/product/product-1/attachment-1-Clay-Shield-SDS.pdf',
      url: 'https://example.com/clay-shield-sds.pdf',
      status: 'active',
      uploadedAt: '2026-06-15T12:00:00.000Z',
    },
  ],
  attachmentsByEntity: {
    'product:product-1': [
      {
        attachmentId: 'attachment-1',
        entityType: 'product',
        entityId: 'product-1',
        kind: 'sds',
        name: 'Clay Shield SDS.pdf',
        fileName: 'Clay Shield SDS.pdf',
        contentType: 'application/pdf',
        size: 1200,
        path: 'uniquem/product/product-1/attachment-1-Clay-Shield-SDS.pdf',
        url: 'https://example.com/clay-shield-sds.pdf',
        status: 'active',
        uploadedAt: '2026-06-15T12:00:00.000Z',
      },
    ],
  },
  dashboard: {
    productCount: 2,
    lotCount: 1,
    onHandPositions: 1,
    openBlendJobs: 1,
    lowStock: [],
    expiringLots: [],
  },
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
  const { onAuthStateChanged, signInWithCustomToken, signOut, updatePassword } = require('firebase/auth');
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
    if (path === 'listUniquemWorkspace') {
      return Promise.resolve(mockUniquemOperations);
    }
    if (
      [
        'saveUniquemProduct',
        'saveUniquemWarehouseV2', 'deleteUniquemWarehouse', 'adjustUniquemInventoryV2', 'createUniquemReceipt',
        'saveUniquemShipment', 'deleteUniquemShipment', 'completeUniquemShipment',
        'saveUniquemRecipeV2', 'deleteUniquemRecipeV2', 'saveUniquemProductionRun', 'deleteUniquemProductionRun', 'completeUniquemProductionRun', 'deleteUniquemProduct',
        'saveUniquemAttachment',
        'archiveUniquemAttachment',
      ].includes(path)
    ) {
      return Promise.resolve(mockUniquemOperations);
    }
    if (path === 'createUniquemAttachmentUpload') {
      return Promise.resolve({
        attachmentId: 'attachment-new',
        path: `uniquem/${body?.entityType}/${body?.entityId}/attachment-new-${body?.fileName || 'file'}`,
        entityType: body?.entityType,
        entityId: body?.entityId,
        fileName: body?.fileName,
        contentType: body?.contentType,
      });
    }
    if (path === 'listUniquemAttachments') {
      return Promise.resolve({ items: mockUniquemOperations.attachments, attachmentsByEntity: mockUniquemOperations.attachmentsByEntity });
    }
    if (path === 'listUniquem3DModels') {
      return Promise.resolve({ items: [mockUniquemModel] });
    }
    if (path === 'getUniquem3DModel') {
      return Promise.resolve({ model: mockUniquemModel, versions: mockUniquemVersions });
    }
    if (path === 'createUniquem3DModel') {
      return Promise.resolve({
        model: {
          ...mockUniquemModel,
          modelId: 'model-new',
          title: 'Generated Stage Entrance',
          summary: 'A new saved stage entrance.',
          scene: {
            ...mockUniquemScene,
            title: 'Generated Stage Entrance',
            summary: 'A new saved stage entrance.',
          },
          versionCount: 1,
        },
        versions: [{ ...mockUniquemVersions[1], versionId: 'version-new', prompt: body?.prompt || '' }],
      });
    }
    if (path === 'reviseUniquem3DModel') {
      return Promise.resolve({
        model: {
          ...mockUniquemModel,
          title: 'Edited Stage Product',
          summary: 'Edited saved model from AI.',
          scene: {
            ...mockUniquemScene,
            title: 'Edited Stage Product',
            summary: 'Edited saved model from AI.',
          },
          latestPrompt: body?.prompt || '',
          versionCount: 3,
        },
        versions: [{ ...mockUniquemVersions[0], versionId: 'version-3', prompt: body?.prompt || '' }, ...mockUniquemVersions],
      });
    }
    if (path === 'restoreUniquem3DModelVersion') {
      return Promise.resolve({
        model: mockUniquemModel,
        versions: [{ ...mockUniquemVersions[0], versionId: 'version-restore', source: 'restore', prompt: 'Restored version version-1' }, ...mockUniquemVersions],
      });
    }
    if (path === 'archiveUniquem3DModel') {
      return Promise.resolve({ ok: true, modelId: body?.modelId });
    }
    if (path === 'generateUniquem3DScene') {
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
  test('admin users do not see removed Quotes app on the launcher', async () => {
    renderAt('/portal', 'admin');

    expect(await screen.findByRole('heading', { name: 'Apps' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Quotes/i })).not.toBeTruthy();
    expect(screen.getByRole('link', { name: /Uniquem/i }).getAttribute('href')).toBe('/apps/uniquem/dashboard');
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

  test('basic users with Uniquem enabled see it and can open the 3D page', async () => {
    renderAt('/portal', 'user', ['uniquem']);

    expect(await screen.findByRole('heading', { name: 'Apps' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Uniquem/i }).getAttribute('href')).toBe('/apps/uniquem/dashboard');
    expect(screen.getByRole('link', { name: /^Account$/i }).getAttribute('href')).toBe('/apps/account');

    cleanup();
    renderAt('/apps/uniquem/3d', 'user', ['uniquem']);
    expect(await screen.findByRole('heading', { name: '3D Warehouse' })).toBeTruthy();
    expect(screen.getByTestId('uniquem-warehouse-canvas')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Auto/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Reset/i })).toBeTruthy();

    cleanup();
    renderAt('/apps/uniquem/3d-creator', 'user', ['uniquem']);
    expect(await screen.findByRole('heading', { name: '3D Creator' })).toBeTruthy();
    expect(screen.getByTestId('uniquem-creator-canvas')).toBeTruthy();
  });

  test('Uniquem operations pages render real inventory system views and base route opens dashboard', async () => {
    const cases = [
      ['/apps/uniquem/dashboard', 'Dashboard'],
      ['/apps/uniquem/products', 'Products'],
      ['/apps/uniquem/inventory', 'Inventory'],
      ['/apps/uniquem/receiving', 'Receiving'],
      ['/apps/uniquem/shipping', 'Shipping'],
      ['/apps/uniquem/production', 'Production'],
    ];

    for (const [path, title] of cases) {
      renderAt(path, 'admin');
      expect(await screen.findByRole('heading', { name: title })).toBeTruthy();
      cleanup();
    }

    renderAt('/apps/uniquem', 'admin');
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeTruthy();
    expect(window.location.pathname).toBe('/apps/uniquem/dashboard');
  });

  test('Uniquem products use list, view, create, and edit drawers', async () => {
    renderAt('/apps/uniquem/products', 'admin');
    expect(await screen.findByText('20 kg per bag • 20 bags per pallet • 400 kg per pallet')).toBeTruthy();
    expect(screen.queryByText('Clay Shield SDS.pdf')).not.toBeTruthy();

    fireEvent.click(screen.getByText('Clay Shield'));
    expect(await screen.findByRole('complementary', { name: 'View product' })).toBeTruthy();
    expect(screen.getByText('Clay Shield SDS.pdf')).toBeTruthy();
    expect(screen.queryByLabelText('Add SDS')).not.toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('complementary', { name: 'View product' })).not.toBeTruthy());
    fireEvent.click(screen.getByText('Clay Shield').closest('article').querySelector('button'));
    expect(await screen.findByRole('complementary', { name: 'Edit product' })).toBeTruthy();
    expect(screen.getByText('Add SDS')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('complementary', { name: 'Edit product' })).not.toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Create Product/i }));
    expect(await screen.findByRole('complementary', { name: 'Create product' })).toBeTruthy();
    expect(screen.getByText('SDS')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Create product' }));
    expect(screen.getByText('Product name is required.')).toBeTruthy();
    expect(screen.getByText('Enter an amount greater than zero.')).toBeTruthy();
  });

  test('Uniquem inventory and production pages show ledger-backed data', async () => {
    renderAt('/apps/uniquem/inventory', 'admin');
    await screen.findByRole('heading', { name: 'Inventory' });
    await waitFor(() => expect(screen.getAllByText('Clay Shield').length).toBeGreaterThan(0));
    expect(screen.getAllByText('CLAY-001').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/12.5 packages/).length).toBeGreaterThan(0);

    cleanup();
    renderAt('/apps/uniquem/receiving', 'admin');
    expect(await screen.findByText('Supplier Co')).toBeTruthy();

    cleanup();
    renderAt('/apps/uniquem/production', 'admin');
    expect((await screen.findAllByText('Main Hole Blend Recipe')).length).toBeGreaterThan(0);
    expect(screen.getByText('draft')).toBeTruthy();
  });

  test('Uniquem 3D Creator creates a saved model with prompt and optional image', async () => {
    const { postJson } = require('./lib/api');
    renderAt('/apps/uniquem/3d-creator', 'user', ['uniquem']);

    expect(await screen.findByRole('heading', { name: '3D Creator' })).toBeTruthy();
    expect(await screen.findByText('Saved Stage Product')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'New' }));
    fireEvent.change(screen.getByLabelText('Prompt'), { target: { value: 'Create a festival stage gate with LED pillars.' } });
    const file = new File(['image'], 'stage-reference.webp', { type: 'image/webp' });
    fireEvent.change(screen.getByLabelText(/Image reference/i), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: /Create Saved Model/i }));

    await waitFor(() =>
      expect(postJson).toHaveBeenCalledWith(
        'createUniquem3DModel',
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

  test('Uniquem 3D Creator keeps a created model visible when refresh fails after save', async () => {
    const { postJson } = require('./lib/api');
    let listCalls = 0;
    postJson.mockImplementation((path, body) => {
      if (path === 'listUniquem3DModels') {
        listCalls += 1;
        if (listCalls === 1) return Promise.resolve({ items: [] });
        return Promise.reject(new Error('Could not load saved products.'));
      }
      if (path === 'createUniquem3DModel') {
        return Promise.resolve({
          model: {
            ...mockUniquemModel,
            modelId: 'model-new',
            title: 'Generated Stage Entrance',
            summary: 'A new saved stage entrance.',
            scene: {
              ...mockUniquemScene,
              title: 'Generated Stage Entrance',
              summary: 'A new saved stage entrance.',
            },
            latestPrompt: body?.prompt || '',
            versionCount: 1,
          },
          versions: [{ ...mockUniquemVersions[1], versionId: 'version-new', prompt: body?.prompt || '' }],
        });
      }
      return Promise.resolve({});
    });

    renderAt('/apps/uniquem/3d-creator', 'user', ['uniquem']);

    expect(await screen.findByText(/No saved models yet/i)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Prompt'), { target: { value: 'Create a saved stage model.' } });
    fireEvent.click(screen.getByRole('button', { name: /Create Saved Model/i }));

    await waitFor(() => expect(postJson).toHaveBeenCalledWith('createUniquem3DModel', expect.objectContaining({ prompt: 'Create a saved stage model.' }), { authed: true }));
    expect(await screen.findByRole('button', { name: /Generated Stage Entrance/i })).toBeTruthy();
    expect(screen.getAllByText('Generated Stage Entrance').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/Failed to save 3D model/i)).not.toBeTruthy();
  });

  test('Uniquem 3D Creator can select, edit, restore, and archive saved models', async () => {
    const { postJson } = require('./lib/api');
    renderAt('/apps/uniquem/3d-creator', 'user', ['uniquem']);

    expect(await screen.findByText('Saved Stage Product')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Saved Stage Product/i }));
    await waitFor(() => expect(postJson).toHaveBeenCalledWith('getUniquem3DModel', { modelId: 'model-1' }, { authed: true }));
    expect(await screen.findByText(/Editing saved model/i)).toBeTruthy();
    expect(screen.getByText(/Add LED pillars/i)).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Prompt'), { target: { value: 'Make the LED wall wider and add side speakers.' } });
    fireEvent.click(screen.getByRole('button', { name: /Edit And Save/i }));
    await waitFor(() =>
      expect(postJson).toHaveBeenCalledWith(
        'reviseUniquem3DModel',
        expect.objectContaining({ modelId: 'model-1', prompt: 'Make the LED wall wider and add side speakers.' }),
        { authed: true }
      )
    );
    expect(await screen.findByText('Edited Stage Product')).toBeTruthy();

    fireEvent.click(screen.getAllByRole('button', { name: /Restore/i })[0]);
    await waitFor(() =>
      expect(postJson).toHaveBeenCalledWith('restoreUniquem3DModelVersion', expect.objectContaining({ modelId: 'model-1' }), { authed: true })
    );

    fireEvent.click(screen.getByRole('button', { name: /Archive Model/i }));
    await waitFor(() => expect(postJson).toHaveBeenCalledWith('archiveUniquem3DModel', { modelId: 'model-1' }, { authed: true }));
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
    renderAt('/apps/uniquem/3d', 'user', []);

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

  test('public chat route is not available', async () => {
    renderSignedOutAt('/chat');

    expect(await screen.findByRole('heading', { name: /Advanced Solutions in Specialty Chemicals/i })).toBeTruthy();
    await waitFor(() => expect(window.location.pathname).toBe('/'));
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
