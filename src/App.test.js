import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

let mockAuthUser = null;
let mockProfile = { role: 'user', firstName: '', lastName: '', enabledMiniApps: null };
let mockLocalReports = [];

const mockMudProgramDraft = {
  draftId: 'draft-1',
  status: 'review_ready',
  sourceFileName: 'operator-drilling-program.pdf',
  overview: {
    programTitle: 'North Pad Mud Program',
    operator: 'North Operator',
    mudCompany: 'QuoteChem',
    wellName: 'Well 12-34',
    uwi: '100/12-34',
    rig: 'Rig 22',
    location: 'Muskeg Pad',
    programDate: '2026-06-13',
    programVersion: 'V1',
    warehouse: 'Lloydminster',
    attention: 'Jared Patterson',
    salesRep: 'Craig Bilick',
    salesRepPhone: '403-990-3455',
    consultant: 'Westrock Energy Consultants',
    fieldZone: 'Colony - Hz',
    license: 'TBD',
    afe: '25DRL00X',
    groundElevation: '557.16',
    rfElevation: '561.16',
    rfGround: '4.00',
    totalMd: '3200 m',
    totalMetersDrilled: '3200 m',
    lateralLength: '1100 m',
    kickoffPoint: '2100 m',
    objective: 'Build a field-ready mud program from the drilling source.',
    sourceSummary: 'Source PDF describes surface and production intervals.',
  },
  sections: [
    {
      id: 'section-1',
      name: 'Surface Hole',
      topDepth: '0 m',
      bottomDepth: '650 m',
      holeSize: '311 mm',
      casingSize: '244.5 mm',
      mudSystem: 'Fresh water gel',
      densityRange: '1000-1050 kg/m3',
      viscosityRange: '35-45 s/L',
      ph: 'Neutral',
      fluidLoss: 'No Control',
      keyProducts: 'Bentonite, caustic, soda ash',
      riskNotes: 'Monitor losses and hole cleaning.',
      programNotes: 'Keep simple water-based treatment.',
      properties: [
        { label: 'Viscosity (s/L)', value: '35-45' },
        { label: 'Density (kg/m3)', value: '1000-1050' },
      ],
      procedures: [{ heading: 'Maintenance', lines: ['Keep simple water-based treatment.'] }],
    },
  ],
  formationTops: [{ formation: 'Surface Casing', md: '100', tvd: '100', lithology: '-', gradient: '-', emd: '-', pressure: '-', h2s: '-', comment: 'High sand content expected' }],
  casingStrings: [{ name: 'Surface', od: '244.5', linearMass: '62.50', grade: 'H-40', capacity: '0.06225', endPoint: '650' }],
  volumes: [{ holeSection: 'Surface', bitSize: '311', start: '0', end: '650', length: '650', tanks: '20', casing: '0', sectionVolume: '11', totalOpenHole: '11', losses: '5', finalCirculating: '31', totalVolume: '36' }],
  pages: [
    {
      id: 'cover',
      type: 'cover',
      title: 'North Pad Mud Program',
      data: {
        programTitle: 'North Pad Mud Program',
        operator: 'North Operator',
        consultant: 'Westrock Energy Consultants',
        mudCompany: 'QuoteChem',
        wellName: 'Well 12-34',
        uwi: '100/12-34',
        fieldZone: 'Colony - Hz',
        attention: 'Jared Patterson',
        salesRep: 'Craig Bilick',
        salesRepPhone: '403-990-3455',
        programDate: '2026-06-13',
        programVersion: 'V1',
        warehouse: 'Lloydminster',
        rig: 'Rig 22',
        location: 'Muskeg Pad',
        totalMd: '3200 m',
        lateralLength: '1100 m',
        objective: 'Build a field-ready mud program from the drilling source.',
        executiveSummary: 'Source PDF describes surface and production intervals.',
      },
    },
    {
      id: 'well-info',
      type: 'wellInfo',
      title: 'Well Information',
      data: {
        overview: {
          programTitle: 'North Pad Mud Program',
          wellName: 'Well 12-34',
          uwi: '100/12-34',
          license: 'TBD',
          afe: '25DRL00X',
          rig: 'Rig 22',
          groundElevation: '557.16',
          rfElevation: '561.16',
          rfGround: '4.00',
          totalMd: '3200 m',
          lateralLength: '1100 m',
        },
        formationTops: [{ formation: 'Surface Casing', md: '100', tvd: '100', lithology: '-', gradient: '-', emd: '-', pressure: '-', h2s: '-', comment: 'High sand content expected' }],
        casingStrings: [{ name: 'Surface', od: '244.5', linearMass: '62.50', grade: 'H-40', capacity: '0.06225', endPoint: '650' }],
        volumes: [{ holeSection: 'Surface', bitSize: '311', start: '0', end: '650', length: '650', tanks: '20', casing: '0', sectionVolume: '11', totalOpenHole: '11', losses: '5', finalCirculating: '31', totalVolume: '36' }],
      },
    },
    {
      id: 'section-1',
      type: 'section',
      title: 'Surface Hole',
      sectionId: 'section-1',
      data: {
        name: 'Surface Hole',
        topDepth: '0 m',
        bottomDepth: '650 m',
        holeSize: '311 mm',
        casingSize: '244.5 mm',
        mudSystem: 'Fresh water gel',
        densityRange: '1000-1050 kg/m3',
        viscosityRange: '35-45 s/L',
        ph: 'Neutral',
        fluidLoss: 'No Control',
        keyProducts: 'Bentonite, caustic, soda ash',
        riskNotes: 'Monitor losses and hole cleaning.',
        programNotes: 'Keep simple water-based treatment.',
        properties: [
          { label: 'Viscosity (s/L)', value: '35-45' },
          { label: 'Density (kg/m3)', value: '1000-1050' },
        ],
        procedures: [{ heading: 'Maintenance', lines: ['Keep simple water-based treatment.'] }],
      },
    },
  ],
  createdAt: '2026-06-13T11:00:00.000Z',
  updatedAt: '2026-06-13T12:00:00.000Z',
};

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
      sku: 'CLAY-SHIELD',
      type: 'raw',
      unit: 'L',
      reorderPoint: 100,
      description: 'Amine clay control additive.',
      status: 'active',
      media: [{ kind: 'image', name: 'Clay Shield image', url: 'https://example.com/clay-shield.jpg' }],
    },
    {
      productId: 'product-2',
      name: 'Main Hole Blend',
      sku: 'MHB-200',
      type: 'blend',
      unit: 'L',
      reorderPoint: 50,
      description: 'Finished blend product.',
      status: 'active',
      media: [],
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

jest.mock('./apps/drilling-fluids-report/drillingFluidsStore', () => ({
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
  const { onAuthStateChanged, signInWithCustomToken, signOut, updatePassword } = require('firebase/auth');
  const { getDoc, onSnapshot, serverTimestamp, setDoc } = require('firebase/firestore');
  const { postJson } = require('./lib/api');
  const { auth } = require('./firebase');
  const drillingStore = require('./apps/drilling-fluids-report/drillingFluidsStore');

  mockLocalReports = [];
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
            enabledMiniApps: ['drilling-fluids-report'],
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
            enabledMiniApps: ['drilling-fluids-report'],
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
    if (path === 'listMudProgramDrafts') {
      return Promise.resolve({ items: [mockMudProgramDraft] });
    }
    if (path === 'createMudProgramDraft') {
      return Promise.resolve({ draft: { ...mockMudProgramDraft, draftId: 'draft-new', pages: [] } });
    }
    if (path === 'extractMudProgramDraft') {
      return Promise.resolve({ draft: { ...mockMudProgramDraft, draftId: 'draft-new' } });
    }
    if (path === 'updateMudProgramDraft') {
      return Promise.resolve({ draft: mockMudProgramDraft });
    }
    if (path === 'improveMudProgramPage') {
      const selected = mockMudProgramDraft.pages.find((page) => page.id === body?.pageId) || mockMudProgramDraft.pages[0];
      return Promise.resolve({
        page: {
          ...selected,
          data: {
            ...selected.data,
            executiveSummary: 'Improved field-ready overview from AI.',
            programTitle: 'Improved field-ready overview from AI.',
          },
        },
      });
    }
    if (path === 'listUniquemOperations') {
      return Promise.resolve(mockUniquemOperations);
    }
    if (
      [
        'saveUniquemProduct',
        'archiveUniquemProduct',
        'saveUniquemWarehouse',
        'receiveUniquemInventory',
        'transferUniquemInventory',
        'adjustUniquemInventory',
        'saveUniquemRecipe',
        'createUniquemBlendJob',
        'completeUniquemBlendJob',
        'cancelUniquemBlendJob',
        'saveUniquemPrice',
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
    expect(screen.getByRole('link', { name: /Testing Offline/i }).getAttribute('href')).toBe('/apps/drilling-fluids-report');
    expect(screen.getByRole('link', { name: /Drilling Programs/i }).getAttribute('href')).toBe('/apps/drilling-programs');
    expect(screen.getByRole('link', { name: /Uniquem/i }).getAttribute('href')).toBe('/apps/uniquem/dashboard');
    expect(screen.getByRole('link', { name: /User Access/i }).getAttribute('href')).toBe('/apps/user-access');
    expect(screen.getByRole('link', { name: /^Account$/i }).getAttribute('href')).toBe('/apps/account');
  });

  test('basic users without enabled access only see Account on the launcher', async () => {
    renderAt('/portal', 'user');

    expect(await screen.findByRole('heading', { name: 'Apps' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Quotes/i })).not.toBeTruthy();
    expect(screen.queryByRole('link', { name: /Testing Offline/i })).not.toBeTruthy();
    expect(screen.queryByRole('link', { name: /Drilling Programs/i })).not.toBeTruthy();
    expect(screen.queryByRole('link', { name: /Uniquem/i })).not.toBeTruthy();
    expect(screen.queryByRole('link', { name: /User Access/i })).not.toBeTruthy();
    expect(screen.getByRole('link', { name: /^Account$/i }).getAttribute('href')).toBe('/apps/account');
  });

  test('basic users with removed Quotes access only see Account', async () => {
    renderAt('/portal', 'user', ['quotes']);

    expect(await screen.findByRole('heading', { name: 'Apps' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Quotes/i })).not.toBeTruthy();
    expect(screen.queryByRole('link', { name: /Testing Offline/i })).not.toBeTruthy();
    expect(screen.queryByRole('link', { name: /Drilling Programs/i })).not.toBeTruthy();
    expect(screen.queryByRole('link', { name: /Uniquem/i })).not.toBeTruthy();
    expect(screen.getByRole('link', { name: /^Account$/i }).getAttribute('href')).toBe('/apps/account');
  });

  test('basic users with Testing Offline enabled see that app and Account only', async () => {
    renderAt('/portal', 'user', ['drilling-fluids-report']);

    expect(await screen.findByRole('heading', { name: 'Apps' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Quotes/i })).not.toBeTruthy();
    expect(screen.getByRole('link', { name: /Testing Offline/i }).getAttribute('href')).toBe('/apps/drilling-fluids-report');
    expect(screen.queryByRole('link', { name: /Drilling Programs/i })).not.toBeTruthy();
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
      ['/apps/uniquem/receive', 'Receive Stock'],
      ['/apps/uniquem/blending', 'Blending'],
      ['/apps/uniquem/movements', 'Movements'],
      ['/apps/uniquem/price-list', 'Price List'],
      ['/apps/uniquem/shipping', 'Shipping'],
      ['/apps/uniquem/orders', 'Orders'],
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

  test('Uniquem inventory and production pages show ledger-backed data', async () => {
    const { postJson } = require('./lib/api');
    renderAt('/apps/uniquem/products', 'admin');
    expect(await screen.findByText('Clay Shield SDS.pdf')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Edit/i })).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: /Archive/i })[0]);
    await waitFor(() => expect(postJson).toHaveBeenCalledWith('archiveUniquemProduct', { productId: 'product-1' }, { authed: true }));

    cleanup();
    renderAt('/apps/uniquem/inventory', 'admin');
    await screen.findByRole('heading', { name: 'Inventory' });
    await waitFor(() => expect(screen.getAllByText('Clay Shield (CLAY-SHIELD)').length).toBeGreaterThan(0));
    expect(screen.getAllByText('CLAY-001').length).toBeGreaterThan(0);
    expect(screen.getAllByText('250 L').length).toBeGreaterThan(0);

    cleanup();
    renderAt('/apps/uniquem/receive', 'admin');
    expect(await screen.findByText('Queued Receipt Files')).toBeTruthy();
    expect(screen.getByLabelText('Receiving photo')).toBeTruthy();

    cleanup();
    renderAt('/apps/uniquem/blending', 'admin');
    await waitFor(() => expect(screen.getAllByText('Blend Job 1').length).toBeGreaterThan(0));
    expect(screen.getByRole('button', { name: 'Complete' })).toBeTruthy();
    expect(screen.getByText(/Movement preview/i)).toBeTruthy();

    cleanup();
    renderAt('/apps/uniquem/price-list', 'admin');
    expect(await screen.findByText('CAD 12.50 / L')).toBeTruthy();
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

  test('basic users with Drilling Programs enabled can upload and review a mud program draft', async () => {
    const { postJson } = require('./lib/api');
    renderAt('/apps/drilling-programs', 'user', ['drilling-programs']);

    expect(await screen.findByRole('heading', { name: /Build portrait mud programs/i })).toBeTruthy();
    expect(await screen.findByText(/operator-drilling-program.pdf/i)).toBeTruthy();

    const file = new File(['pdf'], 'new-drilling-program.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText(/Choose PDF file/i), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: /Upload and extract/i }));

    await waitFor(() => expect(postJson).toHaveBeenCalledWith('createMudProgramDraft', expect.objectContaining({ fileName: 'new-drilling-program.pdf' }), { authed: true }));
    await waitFor(() => expect(postJson).toHaveBeenCalledWith('extractMudProgramDraft', { draftId: 'draft-new' }, { authed: true }));
    expect(await screen.findByRole('heading', { name: /Review extraction/i })).toBeTruthy();
    expect(screen.getByDisplayValue('Well 12-34')).toBeTruthy();
  });

  test('Drilling Programs review creates editable pages and updates preview fields', async () => {
    renderAt('/apps/drilling-programs', 'user', ['drilling-programs']);

    fireEvent.click(await screen.findByRole('button', { name: /North Pad Mud Program/i }));
    expect(await screen.findByRole('button', { name: /Print \/ Save PDF/i })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Review extraction/i }));
    expect(await screen.findByRole('heading', { name: /Review extraction/i })).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Well name/i), { target: { value: 'Edited Well 99' } });
    fireEvent.click(screen.getByRole('button', { name: /Create editable pages/i }));

    expect(await screen.findByRole('heading', { name: /Drilling Fluid Program/i })).toBeTruthy();
    expect(await screen.findByRole('heading', { name: /Well Information/i })).toBeTruthy();
    expect(screen.getByText(/Formation Tops/i)).toBeTruthy();
    expect(screen.getByText(/Surface Hole - Fresh water gel/i)).toBeTruthy();
    expect(document.querySelectorAll('.print-pages .mud-page')).toHaveLength(3);
    fireEvent.change(screen.getByLabelText(/Executive summary/i), { target: { value: 'Updated mud program summary.' } });
    await waitFor(() => expect(screen.getAllByText(/Updated mud program summary/i).length).toBeGreaterThanOrEqual(1));
    expect(document.querySelector('.wellbore-card')).toBeNull();
  });

  test('Drilling Programs AI assistant updates only the selected page and print is available', async () => {
    const { postJson } = require('./lib/api');
    renderAt('/apps/drilling-programs', 'user', ['drilling-programs']);

    fireEvent.click(await screen.findByRole('button', { name: /North Pad Mud Program/i }));
    fireEvent.change(await screen.findByLabelText(/Instruction for this page/i), { target: { value: 'Make the overview stronger.' } });
    fireEvent.click(screen.getByRole('button', { name: /Improve selected page/i }));

    await waitFor(() => expect(postJson).toHaveBeenCalledWith('improveMudProgramPage', expect.objectContaining({ draftId: 'draft-1', pageId: 'cover' }), { authed: true }));
    await waitFor(() => expect(screen.getAllByText(/Improved field-ready overview/i).length).toBeGreaterThanOrEqual(1));
    expect(document.querySelectorAll('.print-pages .mud-page')).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: /Print \/ Save PDF/i }));
    expect(window.print).toHaveBeenCalled();
  });

  test('Drilling Programs shows a desktop-only message on mobile widths', async () => {
    window.matchMedia = jest.fn((query) => ({
      matches: query.includes('max-width') ? true : false,
      media: query,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      addListener: jest.fn(),
      removeListener: jest.fn(),
    }));
    renderAt('/apps/drilling-programs', 'user', ['drilling-programs']);

    expect(await screen.findByRole('heading', { name: /desktop-only/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Upload and extract/i })).not.toBeTruthy();
  });

  test('removed Quotes routes redirect through the app fallback', async () => {
    renderAt('/apps/quotes/dashboard', 'admin');

    expect(await screen.findByRole('heading', { name: 'Apps' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Dashboard' })).not.toBeTruthy();
    expect(window.location.pathname).toBe('/portal');
  });

  test('basic users are redirected away from disabled mini apps', async () => {
    renderAt('/apps/uniquem/3d', 'user', []);

    expect(await screen.findByRole('heading', { name: 'Apps' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: '3D Warehouse' })).not.toBeTruthy();
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
    const drillingStore = require('./apps/drilling-fluids-report/drillingFluidsStore');
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
    const drillingStore = require('./apps/drilling-fluids-report/drillingFluidsStore');
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
    const drillingStore = require('./apps/drilling-fluids-report/drillingFluidsStore');
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

    expect(await screen.findByRole('heading', { name: /Explore industrial chemical sourcing workflows/i })).toBeTruthy();
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
    expect(screen.getByRole('button', { name: /Testing Offline/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Drilling Programs/i })).toBeTruthy();
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
