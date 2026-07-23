import { createHash, randomBytes, randomUUID } from 'node:crypto';
import PDFDocument from 'pdfkit';
import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { defineSecret } from 'firebase-functions/params';
import { EMAIL_SECRETS, DEFAULT_EMAIL_TEMPLATE_IDS, getDefaultEmailTemplate, sendTemplatedEmail } from './email.js';
import { admin, db, storage } from './firebaseAdmin.js';

const REGION = 'us-central1';
const INVITATION_COLLECTION = 'invitations';
const EMAIL_TEMPLATE_COLLECTION = 'emailTemplates';
const DRILLING_PROGRAM_TEMPLATE_COLLECTION = 'drillingProgramTemplates';
const DRILLING_PROGRAM_RUN_COLLECTION = 'drillingProgramRuns';
const MUD_PROGRAM_DRAFT_COLLECTION = 'mudProgramDrafts';
const UNIQUEM_3D_MODEL_COLLECTION = 'uniquem3DModels';
const UNIQUEM_PRODUCT_COLLECTION = 'uniquemProducts';
const UNIQUEM_WAREHOUSE_COLLECTION = 'uniquemWarehouses';
const UNIQUEM_LOT_COLLECTION = 'uniquemLots';
const UNIQUEM_MOVEMENT_COLLECTION = 'uniquemStockMovements';
const UNIQUEM_RECIPE_COLLECTION = 'uniquemRecipes';
const UNIQUEM_BLEND_JOB_COLLECTION = 'uniquemBlendJobs';
const UNIQUEM_PRICE_COLLECTION = 'uniquemPrices';
const UNIQUEM_ATTACHMENT_COLLECTION = 'uniquemAttachments';
const OPENAI_REFERENCE_FILE_MAX_BYTES = 12 * 1024 * 1024;
const OPENAI_REFERENCE_TOTAL_MAX_BYTES = 18 * 1024 * 1024;
const MUD_PROGRAM_SOURCE_MAX_BYTES = 25 * 1024 * 1024;
const UNIQUEM_CREATOR_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const UNIQUEM_CREATOR_PROMPT_MAX_CHARS = 2200;
const UNIQUEM_SCENE_OBJECT_MAX = 80;
const UNIQUEM_OBJECT_TYPES = ['box', 'cylinder', 'plane', 'platform', 'stairs', 'trussTower', 'speakerStack', 'ledPanel', 'lightBeam', 'label'];
const UNIQUEM_MATERIAL_KINDS = ['matte', 'metal', 'glow', 'screen'];
const UNIQUEM_TEXTURE_KINDS = ['plain', 'grid', 'cosmic', 'sunset'];

const OPENAI_API_KEY = defineSecret('OPENAI_API_KEY');

function setCors(res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function preflight(req, res) {
  if (req.method === 'OPTIONS') {
    setCors(res);
    res.status(204).send('');
    return true;
  }
  return false;
}

function jsonError(res, status, message, extra = {}) {
  setCors(res);
  res.status(status).json({ ok: false, error: message, ...extra });
}

function asString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function cellString(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return asString(value);
}

function normalizeEmail(value) {
  return asString(value).toLowerCase();
}

function isEmail(value) {
  const normalized = normalizeEmail(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

function readSecret(secretRef) {
  try {
    return asString(secretRef.value());
  } catch {
    return '';
  }
}

function normalizeRole(value) {
  const role = asString(value).toLowerCase();
  return role === 'admin' ? 'admin' : 'user';
}

async function authenticateRequest(req) {
  const header = asString(req.headers?.authorization || req.headers?.Authorization);
  if (!header.toLowerCase().startsWith('bearer ')) {
    const err = new Error('Missing Bearer token');
    err.status = 401;
    throw err;
  }

  const idToken = header.slice(7).trim();
  if (!idToken) {
    const err = new Error('Missing Bearer token');
    err.status = 401;
    throw err;
  }

  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    const userSnap = await db.collection('users').doc(decoded.uid).get();
    const userData = userSnap.data() || {};
    return {
      uid: decoded.uid,
      email: asString(decoded.email) || asString(userData.email),
      role: normalizeRole(userData.role),
    };
  } catch (error) {
    const err = new Error('Invalid authentication token');
    err.status = 401;
    err.cause = error;
    throw err;
  }
}

async function requireAdmin(req) {
  const user = await authenticateRequest(req);
  if (user.role !== 'admin') {
    const err = new Error('Forbidden');
    err.status = 403;
    throw err;
  }
  return user;
}

const MINI_APP_IDS = ['drilling-programs', 'uniquem', 'user-access', 'account'];
const ACCESS_MANAGED_MINI_APP_IDS = ['drilling-programs', 'uniquem'];

function normalizeMiniAppIds(value) {
  if (!Array.isArray(value)) return null;
  const seen = new Set();
  for (const item of value) {
    const id = asString(item);
    if (ACCESS_MANAGED_MINI_APP_IDS.includes(id)) seen.add(id);
  }
  return Array.from(seen);
}

function defaultEnabledMiniAppsForRole(role) {
  return role === 'admin' ? [...ACCESS_MANAGED_MINI_APP_IDS] : [];
}

function isValidTemporaryPassword(value) {
  return asString(value).length >= 6;
}

function mapUserDoc(doc) {
  const data = doc.data() || {};
  const role = normalizeRole(data.role);
  return {
    uid: asString(data.uid) || doc.id,
    email: asString(data.email),
    role,
    firstName: asString(data.firstName),
    lastName: asString(data.lastName),
    profilePhotoUrl: asString(data.profilePhotoUrl),
    profilePhotoThumbUrl: asString(data.profilePhotoThumbUrl),
    enabledMiniApps: normalizeMiniAppIds(data.enabledMiniApps) || defaultEnabledMiniAppsForRole(role),
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
    createdBy: asString(data.createdBy),
  };
}

function normalizeDocId(value) {
  return asString(value).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 90);
}

function normalizeAsset(value = {}) {
  return {
    id: normalizeDocId(value.id) || randomUUID(),
    name: asString(value.name).slice(0, 160),
    path: asString(value.path).slice(0, 500),
    url: asString(value.url).slice(0, 1000),
    contentType: asString(value.contentType).slice(0, 120),
  };
}

function normalizeProgramTemplate(input = {}) {
  const sections = Array.isArray(input.sections) ? input.sections : [];
  return {
    name: asString(input.name).slice(0, 160),
    description: asString(input.description).slice(0, 1000),
    published: Boolean(input.published),
    sections: sections.slice(0, 20).map((section) => ({
      id: normalizeDocId(section.id) || randomUUID(),
      title: asString(section.title).slice(0, 160),
      description: asString(section.description).slice(0, 800),
      required: section.required !== false,
      options: (Array.isArray(section.options) ? section.options : []).slice(0, 12).map((option) => ({
        id: normalizeDocId(option.id) || randomUUID(),
        label: asString(option.label).slice(0, 160),
        instructions: asString(option.instructions).slice(0, 12000),
        assets: (Array.isArray(option.assets) ? option.assets : []).slice(0, 12).map(normalizeAsset),
      })),
    })),
  };
}

function validateProgramTemplate(template) {
  if (!template.name) return 'Template name is required';
  if (!template.sections.length) return 'At least one section is required';
  for (const section of template.sections) {
    if (!section.title) return 'Every section needs a title';
    if (!section.options.length) return `Section "${section.title}" needs at least one option`;
    for (const option of section.options) {
      if (!option.label) return `Every option in "${section.title}" needs a label`;
      if (!option.instructions) return `Option "${option.label}" needs instructions`;
    }
  }
  return '';
}

function mapProgramTemplateDoc(doc) {
  const data = doc.data() || {};
  return {
    id: doc.id,
    name: asString(data.name),
    description: asString(data.description),
    published: Boolean(data.published),
    sections: Array.isArray(data.sections) ? data.sections : [],
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
    createdBy: asString(data.createdBy),
    updatedBy: asString(data.updatedBy),
  };
}

function normalizeProgramJob(input = {}) {
  return {
    programTitle: asString(input.programTitle).slice(0, 160),
    customer: asString(input.customer).slice(0, 160),
    wellName: asString(input.wellName).slice(0, 160),
    location: asString(input.location).slice(0, 200),
    rig: asString(input.rig).slice(0, 160),
    programDate: asString(input.programDate).slice(0, 40),
    notes: asString(input.notes).slice(0, 3000),
    extraRequirements: asString(input.extraRequirements).slice(0, 3000),
  };
}

function mapProgramRunDoc(doc) {
  const data = doc.data() || {};
  return {
    runId: doc.id,
    templateId: asString(data.templateId),
    templateName: asString(data.templateName),
    programTitle: asString(data.programTitle),
    status: asString(data.status) || 'pending',
    pdfPath: asString(data.pdfPath),
    pdfUrl: asString(data.pdfUrl),
    error: asString(data.error),
    createdBy: asString(data.createdBy),
    createdByEmail: asString(data.createdByEmail),
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  };
}

const emptyMudOverview = {
  programTitle: '',
  operator: '',
  consultant: '',
  mudCompany: 'QuoteChem',
  wellName: '',
  uwi: '',
  license: '',
  afe: '',
  rig: '',
  location: '',
  fieldZone: '',
  programDate: '',
  programVersion: '',
  warehouse: '',
  attention: '',
  salesRep: '',
  salesRepPhone: '',
  groundElevation: '',
  rfElevation: '',
  rfGround: '',
  totalMd: '',
  totalMetersDrilled: '',
  lateralLength: '',
  kickoffPoint: '',
  objective: '',
  sourceSummary: '',
};

const emptyMudSection = {
  id: '',
  name: '',
  topDepth: '',
  bottomDepth: '',
  holeSize: '',
  casingSize: '',
  mudSystem: '',
  densityRange: '',
  viscosityRange: '',
  ph: '',
  fluidLoss: '',
  keyProducts: '',
  riskNotes: '',
  programNotes: '',
  properties: [],
  procedures: [],
};

const emptyFormationTop = {
  formation: '',
  md: '',
  tvd: '',
  lithology: '',
  gradient: '',
  emd: '',
  pressure: '',
  h2s: '',
  comment: '',
};

const emptyCasingString = {
  name: '',
  od: '',
  linearMass: '',
  grade: '',
  capacity: '',
  endPoint: '',
};

const emptyVolumeRow = {
  holeSection: '',
  bitSize: '',
  start: '',
  end: '',
  length: '',
  tanks: '',
  casing: '',
  sectionVolume: '',
  totalOpenHole: '',
  losses: '',
  finalCirculating: '',
  totalVolume: '',
};

function normalizeMudProperties(value = [], section = {}) {
  const input = Array.isArray(value) ? value : [];
  const rows = input
    .slice(0, 18)
    .map((item) => ({
      label: asString(item?.label || item?.name).slice(0, 80),
      value: asString(item?.value).slice(0, 160),
    }))
    .filter((item) => item.label || item.value);
  if (rows.length) return rows;
  return [
    ['Viscosity (s/L)', section.viscosityRange],
    ['Density (kg/m3)', section.densityRange],
    ['pH', section.ph],
    ['Fluid Loss (cc/30min)', section.fluidLoss],
  ]
    .filter(([, value]) => asString(value))
    .map(([label, value]) => ({ label, value: asString(value).slice(0, 160) }));
}

function normalizeMudProcedures(value = [], section = {}) {
  const input = Array.isArray(value) ? value : [];
  const groups = input
    .slice(0, 18)
    .map((item) => ({
      heading: asString(item?.heading || item?.title).slice(0, 120),
      lines: (Array.isArray(item?.lines) ? item.lines : splitPlainLines(item?.body || item?.text)).slice(0, 80).map((line) => asString(line).slice(0, 500)).filter(Boolean),
    }))
    .filter((item) => item.heading || item.lines.length);
  if (groups.length) return groups;
  const fallback = [
    ['Mud Up / Treatment', section.keyProducts],
    ['Operational Procedure', section.programNotes],
    ['Risks / Contingencies', section.riskNotes],
  ].filter(([, body]) => asString(body));
  return fallback.map(([heading, body]) => ({ heading, lines: splitPlainLines(body).slice(0, 80) }));
}

function splitPlainLines(value) {
  return asString(value)
    .split(/\n+|\s\*\s+|•\s+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function normalizeFormationTops(value = []) {
  const rows = Array.isArray(value) ? value : [];
  return rows.slice(0, 40).map((row) => ({
    formation: cellString(row.formation || row.name).slice(0, 120),
    md: cellString(row.md || row.measuredDepth).slice(0, 60),
    tvd: cellString(row.tvd).slice(0, 60),
    lithology: cellString(row.lithology).slice(0, 120),
    gradient: cellString(row.gradient).slice(0, 60),
    emd: cellString(row.emd).slice(0, 60),
    pressure: cellString(row.pressure).slice(0, 60),
    h2s: cellString(row.h2s).slice(0, 60),
    comment: cellString(row.comment || row.notes).slice(0, 240),
  }));
}

function normalizeCasingStrings(value = []) {
  const rows = Array.isArray(value) ? value : [];
  return rows.slice(0, 16).map((row) => ({
    name: cellString(row.name).slice(0, 120),
    od: cellString(row.od || row.outerDiameter).slice(0, 60),
    linearMass: cellString(row.linearMass || row.weight).slice(0, 60),
    grade: cellString(row.grade).slice(0, 60),
    capacity: cellString(row.capacity).slice(0, 60),
    endPoint: cellString(row.endPoint || row.endMd).slice(0, 60),
  }));
}

function normalizeVolumeRows(value = []) {
  const rows = Array.isArray(value) ? value : [];
  return rows.slice(0, 20).map((row) => ({
    holeSection: cellString(row.holeSection || row.section).slice(0, 120),
    bitSize: cellString(row.bitSize).slice(0, 60),
    start: cellString(row.start || row.startMd).slice(0, 60),
    end: cellString(row.end || row.endMd).slice(0, 60),
    length: cellString(row.length).slice(0, 60),
    tanks: cellString(row.tanks).slice(0, 60),
    casing: cellString(row.casing).slice(0, 60),
    sectionVolume: cellString(row.sectionVolume).slice(0, 60),
    totalOpenHole: cellString(row.totalOpenHole).slice(0, 60),
    losses: cellString(row.losses).slice(0, 60),
    finalCirculating: cellString(row.finalCirculating).slice(0, 60),
    totalVolume: cellString(row.totalVolume).slice(0, 60),
  }));
}

function isPdfContentType(value) {
  return asString(value).toLowerCase() === 'application/pdf';
}

function parsePdfDataUrl(value) {
  const raw = asString(value);
  const match = raw.match(/^data:([^;]+);base64,([a-zA-Z0-9+/=\s]+)$/);
  if (!match) {
    const err = new Error('PDF file data is required');
    err.status = 400;
    throw err;
  }
  const contentType = asString(match[1]).toLowerCase();
  if (!isPdfContentType(contentType)) {
    const err = new Error('Only PDF files are supported');
    err.status = 400;
    throw err;
  }
  const buffer = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
  if (!buffer.length || buffer.length > MUD_PROGRAM_SOURCE_MAX_BYTES) {
    const err = new Error('PDF must be smaller than 25 MB');
    err.status = 400;
    throw err;
  }
  if (buffer.slice(0, 4).toString('utf8') !== '%PDF') {
    const err = new Error('Uploaded file does not look like a PDF');
    err.status = 400;
    throw err;
  }
  return { contentType, buffer };
}

function normalizeMudOverview(value = {}) {
  return {
    programTitle: asString(value.programTitle).slice(0, 180),
    operator: asString(value.operator || value.customer).slice(0, 160),
    consultant: asString(value.consultant).slice(0, 160),
    mudCompany: asString(value.mudCompany).slice(0, 160) || 'QuoteChem',
    wellName: asString(value.wellName).slice(0, 160),
    uwi: asString(value.uwi || value.api).slice(0, 100),
    license: asString(value.license).slice(0, 80),
    afe: asString(value.afe).slice(0, 80),
    rig: asString(value.rig).slice(0, 160),
    location: asString(value.location).slice(0, 220),
    fieldZone: asString(value.fieldZone || value.field || value.zone).slice(0, 160),
    programDate: asString(value.programDate || value.date).slice(0, 60),
    programVersion: asString(value.programVersion || value.version).slice(0, 60),
    warehouse: asString(value.warehouse).slice(0, 120),
    attention: asString(value.attention).slice(0, 120),
    salesRep: asString(value.salesRep || value.salesRepresentative).slice(0, 120),
    salesRepPhone: asString(value.salesRepPhone || value.phone).slice(0, 80),
    groundElevation: asString(value.groundElevation).slice(0, 80),
    rfElevation: asString(value.rfElevation).slice(0, 80),
    rfGround: asString(value.rfGround).slice(0, 80),
    totalMd: asString(value.totalMd || value.totalDepth).slice(0, 80),
    totalMetersDrilled: asString(value.totalMetersDrilled).slice(0, 80),
    lateralLength: asString(value.lateralLength).slice(0, 80),
    kickoffPoint: asString(value.kickoffPoint || value.kop).slice(0, 80),
    objective: asString(value.objective).slice(0, 3000),
    sourceSummary: asString(value.sourceSummary || value.summary).slice(0, 3000),
  };
}

function normalizeMudSections(value = []) {
  const sections = Array.isArray(value) ? value : [];
  return sections.slice(0, 16).map((section, index) => ({
    id: normalizeDocId(section.id) || `section-${index + 1}`,
    name: asString(section.name || section.title).slice(0, 160) || `Section ${index + 1}`,
    topDepth: asString(section.topDepth || section.fromDepth).slice(0, 80),
    bottomDepth: asString(section.bottomDepth || section.toDepth).slice(0, 80),
    holeSize: asString(section.holeSize).slice(0, 80),
    casingSize: asString(section.casingSize).slice(0, 80),
    mudSystem: asString(section.mudSystem).slice(0, 180),
    densityRange: asString(section.densityRange || section.mudWeight).slice(0, 120),
    viscosityRange: asString(section.viscosityRange).slice(0, 120),
    ph: asString(section.ph || section.pH).slice(0, 80),
    fluidLoss: asString(section.fluidLoss).slice(0, 100),
    keyProducts: asString(section.keyProducts || section.products).slice(0, 3000),
    riskNotes: asString(section.riskNotes || section.risks).slice(0, 3000),
    programNotes: asString(section.programNotes || section.notes).slice(0, 3000),
    properties: normalizeMudProperties(section.properties, section),
    procedures: normalizeMudProcedures(section.procedures, section),
  }));
}

function normalizeMudPages(value = [], overview = emptyMudOverview, sections = [], wellInfo = {}) {
  const pages = Array.isArray(value) ? value : [];
  if (!pages.length) return buildMudProgramPagesFromExtraction({ overview, sections, ...wellInfo });
  return pages.slice(0, 20).map((page, index) => ({
    id: normalizeDocId(page.id) || (index === 0 ? 'cover' : `page-${index}`),
    type: ['cover', 'wellInfo', 'section'].includes(asString(page.type)) ? asString(page.type) : asString(page.type) === 'overview' ? 'cover' : 'section',
    title: asString(page.title).slice(0, 180) || (index === 0 ? 'Mud Program Overview' : `Section ${index}`),
    sectionId: normalizeDocId(page.sectionId),
    data: typeof page.data === 'object' && page.data ? page.data : {},
  }));
}

function buildMudProgramPagesFromExtraction({ overview = {}, sections = [], formationTops = [], casingStrings = [], volumes = [] } = {}) {
  const normalizedOverview = normalizeMudOverview(overview);
  const normalizedSections = normalizeMudSections(sections);
  const normalizedFormationTops = normalizeFormationTops(formationTops);
  const normalizedCasingStrings = normalizeCasingStrings(casingStrings);
  const normalizedVolumes = normalizeVolumeRows(volumes);
  return [
    {
      id: 'cover',
      type: 'cover',
      title: normalizedOverview.programTitle || 'Drilling Fluid Program',
      data: {
        ...normalizedOverview,
        executiveSummary:
          normalizedOverview.sourceSummary ||
          normalizedOverview.objective ||
          'Review the extracted drilling program details and confirm mud program requirements before export.',
      },
    },
    {
      id: 'well-info',
      type: 'wellInfo',
      title: 'Well Information',
      data: {
        overview: normalizedOverview,
        formationTops: normalizedFormationTops,
        casingStrings: normalizedCasingStrings,
        volumes: normalizedVolumes,
      },
    },
    ...normalizedSections.map((section) => ({
      id: section.id,
      type: 'section',
      title: section.name,
      sectionId: section.id,
      data: section,
    })),
  ];
}

function mapMudProgramDraftDoc(doc) {
  const data = doc.data() || {};
  const overview = normalizeMudOverview(data.overview || {});
  const sections = normalizeMudSections(data.sections || []);
  const formationTops = normalizeFormationTops(data.formationTops || []);
  const casingStrings = normalizeCasingStrings(data.casingStrings || []);
  const volumes = normalizeVolumeRows(data.volumes || []);
  return {
    draftId: doc.id,
    status: asString(data.status) || 'uploaded',
    sourceFileName: asString(data.sourceFileName),
    sourcePdfPath: asString(data.sourcePdfPath),
    sourcePdfUrl: asString(data.sourcePdfUrl),
    overview,
    sections,
    formationTops,
    casingStrings,
    volumes,
    pages: normalizeMudPages(data.pages || [], overview, sections, { formationTops, casingStrings, volumes }),
    extractionError: asString(data.extractionError),
    createdBy: asString(data.createdBy),
    createdByEmail: asString(data.createdByEmail),
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  };
}

function parseOpenAIJson(raw) {
  const text = asString(raw).replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return {};
      }
    }
    return {};
  }
}

async function ensureMudProgramAccess(req) {
  const user = await authenticateRequest(req);
  const userSnap = await db.collection('users').doc(user.uid).get();
  const appUser = userSnap.data() || {};
  const allowed = user.role === 'admin' || normalizeMiniAppIds(appUser.enabledMiniApps)?.includes('drilling-programs');
  if (!allowed) {
    const err = new Error('Forbidden');
    err.status = 403;
    throw err;
  }
  return user;
}

async function ensureUniquemAccess(req) {
  const user = await authenticateRequest(req);
  const userSnap = await db.collection('users').doc(user.uid).get();
  const appUser = userSnap.data() || {};
  const allowed = user.role === 'admin' || normalizeMiniAppIds(appUser.enabledMiniApps)?.includes('uniquem');
  if (!allowed) {
    const err = new Error('Forbidden');
    err.status = 403;
    throw err;
  }
  return user;
}

function clampNumber(value, min, max, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

function normalizeVector3(value, fallback = [0, 0, 0], min = -35, max = 35) {
  const source = Array.isArray(value) ? value : [];
  return [0, 1, 2].map((index) => clampNumber(source[index], min, max, fallback[index]));
}

function normalizeHexColor(value, fallback = '#64748b') {
  const text = asString(value);
  return /^#[0-9a-fA-F]{6}$/.test(text) ? text.toLowerCase() : fallback;
}

function normalizeUniquemSceneObject(item = {}, index = 0) {
  const type = asString(item.type);
  if (!UNIQUEM_OBJECT_TYPES.includes(type)) return null;
  const materialKind = UNIQUEM_MATERIAL_KINDS.includes(asString(item.materialKind)) ? asString(item.materialKind) : 'matte';
  const textureKind = UNIQUEM_TEXTURE_KINDS.includes(asString(item.textureKind)) ? asString(item.textureKind) : 'plain';
  return {
    id: asString(item.id).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) || `object-${index + 1}`,
    type,
    label: asString(item.label).slice(0, 48),
    position: normalizeVector3(item.position, [0, 0.5, 0], -35, 35),
    scale: normalizeVector3(item.scale, [1, 1, 1], 0.05, 14),
    rotationY: clampNumber(item.rotationY, -Math.PI * 2, Math.PI * 2, 0),
    color: normalizeHexColor(item.color),
    materialKind,
    textureKind,
  };
}

function fallbackUniquemScene() {
  return {
    title: 'Generated Object Group',
    summary: 'The request produced a safe starter object group. Regenerate with more detail for a richer preview.',
    cameraHint: { distance: 24, target: [0, 2, 0] },
    objects: [
      {
        id: 'concept-platform',
        type: 'platform',
        label: 'Base',
        position: [0, 0.1, 0],
        scale: [7, 0.2, 4],
        rotationY: 0,
        color: '#334155',
        materialKind: 'matte',
        textureKind: 'plain',
      },
      {
        id: 'concept-panel',
        type: 'ledPanel',
        label: 'Concept',
        position: [0, 2.4, -1.9],
        scale: [4, 2.4, 1],
        rotationY: 0,
        color: '#db2777',
        materialKind: 'screen',
        textureKind: 'cosmic',
      },
    ],
  };
}

function normalizeUniquemScene(value = {}) {
  const rawObjects = Array.isArray(value.objects) ? value.objects : [];
  const objects = rawObjects
    .slice(0, UNIQUEM_SCENE_OBJECT_MAX)
    .map((item, index) => normalizeUniquemSceneObject(item, index))
    .filter(Boolean);
  if (!objects.length) return fallbackUniquemScene();

  return {
    title: asString(value.title).slice(0, 80) || 'Generated 3D Concept',
    summary: asString(value.summary).slice(0, 220) || 'A procedural 3D object group generated from the prompt.',
    cameraHint: {
      distance: clampNumber(value.cameraHint?.distance, 8, 70, 28),
      target: normalizeVector3(value.cameraHint?.target, [0, 2, 0], -30, 30),
    },
    objects,
  };
}

function isUniquemCreatorImageContentType(value) {
  return ['image/png', 'image/jpeg', 'image/webp'].includes(asString(value).toLowerCase());
}

function normalizeUniquemCreatorImage(image) {
  if (!image) return null;
  const contentType = asString(image.contentType).toLowerCase();
  if (!isUniquemCreatorImageContentType(contentType)) {
    const err = new Error('Use a PNG, JPG, or WebP image.');
    err.status = 400;
    throw err;
  }
  const dataUrl = asString(image.dataUrl);
  const prefix = `data:${contentType};base64,`;
  if (!dataUrl.startsWith(prefix)) {
    const err = new Error('Image data is invalid.');
    err.status = 400;
    throw err;
  }
  const base64 = dataUrl.slice(prefix.length);
  const bytes = Buffer.byteLength(base64, 'base64');
  if (!bytes || bytes > UNIQUEM_CREATOR_IMAGE_MAX_BYTES) {
    const err = new Error('Image must be 8 MB or smaller.');
    err.status = 400;
    throw err;
  }
  return {
    name: asString(image.name).slice(0, 120) || 'reference-image',
    contentType,
    dataUrl,
    bytes,
  };
}

function normalizeUniquemModelStatus(value) {
  return asString(value) === 'archived' ? 'archived' : 'active';
}

function mapUniquem3DModelDoc(doc) {
  const data = doc.data() || {};
  const scene = normalizeUniquemScene(data.scene || {});
  return {
    modelId: asString(data.modelId) || doc.id,
    title: asString(data.title) || scene.title,
    summary: asString(data.summary) || scene.summary,
    scene,
    status: normalizeUniquemModelStatus(data.status),
    createdBy: asString(data.createdBy),
    createdByEmail: asString(data.createdByEmail),
    createdAt: toIso(data.createdAt),
    updatedBy: asString(data.updatedBy),
    updatedByEmail: asString(data.updatedByEmail),
    updatedAt: toIso(data.updatedAt),
    latestPrompt: asString(data.latestPrompt),
    versionCount: Math.max(0, Number(data.versionCount || 0)),
  };
}

function mapUniquem3DVersionDoc(doc) {
  const data = doc.data() || {};
  return {
    versionId: asString(data.versionId) || doc.id,
    scene: normalizeUniquemScene(data.scene || {}),
    prompt: asString(data.prompt),
    model: asString(data.model),
    source: ['ai-generate', 'ai-edit', 'restore'].includes(asString(data.source)) ? asString(data.source) : 'ai-edit',
    createdBy: asString(data.createdBy),
    createdByEmail: asString(data.createdByEmail),
    createdAt: toIso(data.createdAt),
  };
}

function filterActiveUniquem3DModels(models = [], limit = 100) {
  return (Array.isArray(models) ? models : [])
    .filter((model) => normalizeUniquemModelStatus(model.status) === 'active')
    .sort((a, b) => {
      const aTime = asString(a.updatedAt);
      const bTime = asString(b.updatedAt);
      return bTime.localeCompare(aTime);
    })
    .slice(0, limit);
}

function buildUniquemVersionDoc({ versionId, scene, prompt, model, source, user }) {
  return {
    versionId,
    scene: normalizeUniquemScene(scene),
    prompt: asString(prompt).slice(0, UNIQUEM_CREATOR_PROMPT_MAX_CHARS),
    model: asString(model).slice(0, 80),
    source: ['ai-generate', 'ai-edit', 'restore'].includes(asString(source)) ? asString(source) : 'ai-edit',
    createdBy: user.uid,
    createdByEmail: user.email,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

async function loadActiveUniquem3DModel(modelId) {
  const id = normalizeDocId(modelId);
  if (!id) {
    const err = new Error('modelId is required');
    err.status = 400;
    throw err;
  }
  const ref = db.collection(UNIQUEM_3D_MODEL_COLLECTION).doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    const err = new Error('Model not found');
    err.status = 404;
    throw err;
  }
  const model = mapUniquem3DModelDoc(snap);
  if (model.status === 'archived') {
    const err = new Error('Model not found');
    err.status = 404;
    throw err;
  }
  return { ref, snap, model };
}

function normalizeUniquemUnit(value) {
  const unit = asString(value).toLowerCase();
  if (['l', 'litre', 'liter', 'litres', 'liters'].includes(unit)) return 'L';
  if (['kg', 'kilogram', 'kilograms'].includes(unit)) return 'kg';
  if (['gal', 'gallon', 'gallons'].includes(unit)) return 'gal';
  if (['drum', 'drums'].includes(unit)) return 'drum';
  if (['tote', 'totes'].includes(unit)) return 'tote';
  if (['bag', 'bags'].includes(unit)) return 'bag';
  return asString(value).slice(0, 24) || 'L';
}

function normalizeUniquemQuantity(value, { allowNegative = false, fallback = 0 } = {}) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  const rounded = Math.round(num * 1000) / 1000;
  if (allowNegative) return Math.max(-100000000, Math.min(100000000, rounded));
  return Math.max(0, Math.min(100000000, rounded));
}

function normalizeUniquemStatus(value, allowed = ['active', 'archived'], fallback = 'active') {
  const status = asString(value).toLowerCase();
  return allowed.includes(status) ? status : fallback;
}

function normalizeUniquemProduct(input = {}) {
  const name = asString(input.name).slice(0, 160);
  if (!name) {
    const err = new Error('Product name is required.');
    err.status = 400;
    throw err;
  }
  const packageTypes = ['Bag', 'Pail', 'Drum', 'Tote', 'Box/Case', 'Other'];
  const packageType = packageTypes.includes(asString(input.packageType)) ? asString(input.packageType) : '';
  if (!packageType) {
    const err = new Error('Packaging type is required.');
    err.status = 400;
    throw err;
  }
  const packageAmount = normalizeUniquemQuantity(input.packageAmount);
  if (packageAmount <= 0) {
    const err = new Error('Package amount must be greater than zero.');
    err.status = 400;
    throw err;
  }
  const measurementUnit = ['kg', 'L'].includes(asString(input.measurementUnit)) ? asString(input.measurementUnit) : '';
  if (!measurementUnit) {
    const err = new Error('Measurement unit must be kg or L.');
    err.status = 400;
    throw err;
  }
  const packagesPerPallet = input.packagesPerPallet === null || input.packagesPerPallet === '' || input.packagesPerPallet === undefined
    ? null
    : Number(input.packagesPerPallet);
  if (packagesPerPallet !== null && (!Number.isInteger(packagesPerPallet) || packagesPerPallet <= 0)) {
    const err = new Error('Packages per pallet must be a whole number greater than zero.');
    err.status = 400;
    throw err;
  }
  return {
    name,
    description: asString(input.description).slice(0, 1200),
    packageType,
    packageAmount,
    measurementUnit,
    packagesPerPallet,
    status: 'active',
  };
}

function normalizeUniquemWarehouse(input = {}) {
  const name = asString(input.name).slice(0, 120);
  if (!name) {
    const err = new Error('Warehouse name is required.');
    err.status = 400;
    throw err;
  }
  const locations = (Array.isArray(input.locations) ? input.locations : [])
    .map((item) => asString(item).slice(0, 80))
    .filter(Boolean)
    .slice(0, 80);
  return {
    name,
    code: asString(input.code).toUpperCase().replace(/[^A-Z0-9._-]/g, '').slice(0, 40),
    locations: Array.from(new Set(locations.length ? locations : ['Main'])),
    status: normalizeUniquemStatus(input.status),
  };
}

function normalizeUniquemLot(input = {}) {
  const productId = normalizeDocId(input.productId);
  if (!productId) {
    const err = new Error('Product is required.');
    err.status = 400;
    throw err;
  }
  return {
    productId,
    lotNumber: asString(input.lotNumber).slice(0, 80) || `LOT-${new Date().toISOString().slice(0, 10)}`,
    supplier: asString(input.supplier).slice(0, 160),
    supplierLot: asString(input.supplierLot).slice(0, 100),
    receivedAt: asString(input.receivedAt).slice(0, 40),
    expiryDate: asString(input.expiryDate).slice(0, 40),
    notes: asString(input.notes).slice(0, 1200),
    status: normalizeUniquemStatus(input.status, ['active', 'hold', 'archived'], 'active'),
  };
}

function normalizeUniquemMovement(input = {}) {
  const productId = normalizeDocId(input.productId);
  const lotId = normalizeDocId(input.lotId);
  const warehouseId = normalizeDocId(input.warehouseId);
  const location = asString(input.location).slice(0, 80) || 'Main';
  const quantity = normalizeUniquemQuantity(input.quantity, { allowNegative: true });
  if (!productId || !lotId || !warehouseId || !quantity) {
    const err = new Error('Product, lot, warehouse, location, and non-zero quantity are required.');
    err.status = 400;
    throw err;
  }
  return {
    type: asString(input.type).slice(0, 40) || 'adjustment',
    productId,
    lotId,
    warehouseId,
    location,
    quantity,
    unit: normalizeUniquemUnit(input.unit),
    reason: asString(input.reason).slice(0, 280),
    referenceType: asString(input.referenceType).slice(0, 60),
    referenceId: normalizeDocId(input.referenceId),
    notes: asString(input.notes).slice(0, 1200),
  };
}

function normalizeUniquemRecipe(input = {}) {
  const outputProductId = normalizeDocId(input.outputProductId);
  if (!outputProductId) {
    const err = new Error('Output product is required.');
    err.status = 400;
    throw err;
  }
  const inputs = (Array.isArray(input.inputs) ? input.inputs : [])
    .slice(0, 40)
    .map((item = {}) => ({
      productId: normalizeDocId(item.productId),
      quantity: normalizeUniquemQuantity(item.quantity),
      unit: normalizeUniquemUnit(item.unit),
      notes: asString(item.notes).slice(0, 280),
    }))
    .filter((item) => item.productId && item.quantity > 0);
  if (!inputs.length) {
    const err = new Error('At least one recipe input is required.');
    err.status = 400;
    throw err;
  }
  return {
    name: asString(input.name).slice(0, 160) || 'Blend recipe',
    outputProductId,
    outputQuantity: normalizeUniquemQuantity(input.outputQuantity) || 1,
    outputUnit: normalizeUniquemUnit(input.outputUnit),
    yieldLossPercent: clampNumber(input.yieldLossPercent, 0, 100, 0),
    instructions: asString(input.instructions).slice(0, 3000),
    inputs,
    status: normalizeUniquemStatus(input.status),
  };
}

function normalizeUniquemBlendJob(input = {}) {
  const outputProductId = normalizeDocId(input.outputProductId);
  const warehouseId = normalizeDocId(input.warehouseId);
  if (!outputProductId || !warehouseId) {
    const err = new Error('Output product and warehouse are required.');
    err.status = 400;
    throw err;
  }
  const inputs = (Array.isArray(input.inputs) ? input.inputs : [])
    .slice(0, 60)
    .map((item = {}) => ({
      productId: normalizeDocId(item.productId),
      lotId: normalizeDocId(item.lotId),
      warehouseId: normalizeDocId(item.warehouseId) || warehouseId,
      location: asString(item.location).slice(0, 80) || 'Main',
      quantity: normalizeUniquemQuantity(item.quantity),
      unit: normalizeUniquemUnit(item.unit),
    }))
    .filter((item) => item.productId && item.lotId && item.warehouseId && item.quantity > 0);
  if (!inputs.length) {
    const err = new Error('At least one input lot is required.');
    err.status = 400;
    throw err;
  }
  return {
    recipeId: normalizeDocId(input.recipeId),
    name: asString(input.name).slice(0, 160) || 'Blend job',
    outputProductId,
    outputLotNumber: asString(input.outputLotNumber).slice(0, 80) || `BLEND-${new Date().toISOString().slice(0, 10)}`,
    outputQuantity: normalizeUniquemQuantity(input.outputQuantity),
    outputUnit: normalizeUniquemUnit(input.outputUnit),
    warehouseId,
    location: asString(input.location).slice(0, 80) || 'Main',
    notes: asString(input.notes).slice(0, 1200),
    inputs,
  };
}

function normalizeUniquemPrice(input = {}) {
  const productId = normalizeDocId(input.productId);
  if (!productId) {
    const err = new Error('Product is required.');
    err.status = 400;
    throw err;
  }
  const price = normalizeUniquemQuantity(input.price);
  if (!price) {
    const err = new Error('Price must be greater than zero.');
    err.status = 400;
    throw err;
  }
  const currency = asString(input.currency).toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) || 'CAD';
  return {
    productId,
    price,
    currency: currency.length === 3 ? currency : 'CAD',
    unit: normalizeUniquemUnit(input.unit),
    effectiveDate: asString(input.effectiveDate).slice(0, 40) || new Date().toISOString().slice(0, 10),
    status: normalizeUniquemStatus(input.status),
    notes: asString(input.notes).slice(0, 800),
  };
}

function normalizeUniquemAttachmentEntityType(value) {
  const type = asString(value).toLowerCase();
  if (['product', 'receipt', 'shipment', 'production-run'].includes(type)) return type;
  const err = new Error('Attachment entity type is invalid.');
  err.status = 400;
  throw err;
}

function normalizeUniquemAttachmentKind(value) {
  const kind = asString(value).toLowerCase();
  if (['image', 'sds', 'label', 'spec', 'coa', 'delivery-ticket', 'batch-sheet', 'bol', 'packing-slip', 'proof', 'po', 'video', 'document', 'other'].includes(kind)) return kind;
  return 'other';
}

function isUniquemAttachmentContentType(value) {
  const contentType = asString(value).toLowerCase();
  if (contentType.startsWith('image/')) return true;
  if (contentType.startsWith('video/')) return true;
  return [
    'application/pdf',
    'text/plain',
    'text/csv',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ].includes(contentType);
}

function sanitizeUniquemFileName(value) {
  return asString(value)
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 120) || 'attachment';
}

function normalizeUniquemAttachment(input = {}) {
  const entityType = normalizeUniquemAttachmentEntityType(input.entityType);
  const entityId = normalizeDocId(input.entityId);
  if (!entityId) {
    const err = new Error('Attachment entity is required.');
    err.status = 400;
    throw err;
  }
  const contentType = asString(input.contentType).toLowerCase();
  if (!isUniquemAttachmentContentType(contentType)) {
    const err = new Error('Unsupported attachment file type.');
    err.status = 400;
    throw err;
  }
  return {
    entityType,
    entityId,
    kind: normalizeUniquemAttachmentKind(input.kind),
    name: asString(input.name).slice(0, 180) || 'Attachment',
    fileName: sanitizeUniquemFileName(input.fileName || input.name),
    contentType,
    size: normalizeUniquemQuantity(input.size, { fallback: 0 }),
    path: asString(input.path).slice(0, 500),
    url: asString(input.url).slice(0, 1200),
    notes: asString(input.notes).slice(0, 800),
    status: normalizeUniquemStatus(input.status),
  };
}

function buildUniquemAttachmentPath({ entityType, entityId, attachmentId, fileName }) {
  return `uniquem/${entityType}/${entityId}/${attachmentId}-${sanitizeUniquemFileName(fileName)}`;
}

function mapUniquemAttachmentDoc(doc) {
  const data = doc.data() || {};
  return {
    attachmentId: asString(data.attachmentId) || doc.id,
    entityType: asString(data.entityType),
    entityId: asString(data.entityId),
    kind: normalizeUniquemAttachmentKind(data.kind),
    name: asString(data.name),
    fileName: asString(data.fileName),
    contentType: asString(data.contentType),
    size: normalizeUniquemQuantity(data.size),
    path: asString(data.path),
    url: asString(data.url),
    notes: asString(data.notes),
    status: normalizeUniquemStatus(data.status),
    uploadedBy: asString(data.uploadedBy),
    uploadedByEmail: asString(data.uploadedByEmail),
    uploadedAt: toUniquemIso(data.uploadedAt),
    updatedAt: toUniquemIso(data.updatedAt),
  };
}

function groupUniquemAttachments(attachments = []) {
  const grouped = {};
  for (const attachment of Array.isArray(attachments) ? attachments : []) {
    if (attachment.status === 'archived') continue;
    const key = `${attachment.entityType}:${attachment.entityId}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(attachment);
  }
  return grouped;
}

function uniquemAvailableQuantity(balances = [], target = {}) {
  return (Array.isArray(balances) ? balances : [])
    .filter(
      (item) =>
        item.productId === target.productId &&
        item.lotId === target.lotId &&
        item.warehouseId === target.warehouseId &&
        (item.location || 'Main') === (target.location || 'Main')
    )
    .reduce((sum, item) => sum + normalizeUniquemQuantity(item.quantity, { allowNegative: true }), 0);
}

function assertUniquemSufficientStock(balances = [], target = {}, quantity = 0) {
  const needed = normalizeUniquemQuantity(quantity);
  const available = uniquemAvailableQuantity(balances, target);
  if (available + 0.0001 < needed) {
    const err = new Error('Insufficient stock for this lot and location.');
    err.status = 400;
    throw err;
  }
  return true;
}

function toUniquemIso(value) {
  return toIso(value);
}

function mapUniquemProductDoc(doc) {
  const data = doc.data() || {};
  return {
    productId: asString(data.productId) || doc.id,
    name: asString(data.name),
    description: asString(data.description),
    packageType: asString(data.packageType),
    packageAmount: normalizeUniquemQuantity(data.packageAmount),
    measurementUnit: asString(data.measurementUnit),
    packagesPerPallet: data.packagesPerPallet === null || data.packagesPerPallet === undefined ? null : Number(data.packagesPerPallet),
    status: normalizeUniquemStatus(data.status),
    createdAt: toUniquemIso(data.createdAt),
    updatedAt: toUniquemIso(data.updatedAt),
  };
}

function mapUniquemWarehouseDoc(doc) {
  const data = doc.data() || {};
  return {
    warehouseId: asString(data.warehouseId) || doc.id,
    name: asString(data.name),
    code: asString(data.code),
    locations: (Array.isArray(data.locations) ? data.locations : []).map(asString).filter(Boolean),
    status: normalizeUniquemStatus(data.status),
    updatedAt: toUniquemIso(data.updatedAt),
  };
}

function mapUniquemLotDoc(doc) {
  const data = doc.data() || {};
  return {
    lotId: asString(data.lotId) || doc.id,
    productId: asString(data.productId),
    lotNumber: asString(data.lotNumber),
    supplier: asString(data.supplier),
    supplierLot: asString(data.supplierLot),
    receivedAt: asString(data.receivedAt),
    expiryDate: asString(data.expiryDate),
    notes: asString(data.notes),
    status: normalizeUniquemStatus(data.status, ['active', 'hold', 'archived'], 'active'),
    createdAt: toUniquemIso(data.createdAt),
    updatedAt: toUniquemIso(data.updatedAt),
  };
}

function mapUniquemMovementDoc(doc) {
  const data = doc.data() || {};
  return {
    movementId: asString(data.movementId) || doc.id,
    type: asString(data.type),
    productId: asString(data.productId),
    lotId: asString(data.lotId),
    warehouseId: asString(data.warehouseId),
    location: asString(data.location) || 'Main',
    quantity: normalizeUniquemQuantity(data.quantity, { allowNegative: true }),
    unit: normalizeUniquemUnit(data.unit),
    reason: asString(data.reason),
    referenceType: asString(data.referenceType),
    referenceId: asString(data.referenceId),
    notes: asString(data.notes),
    createdBy: asString(data.createdBy),
    createdByEmail: asString(data.createdByEmail),
    createdAt: toUniquemIso(data.createdAt),
  };
}

function mapUniquemRecipeDoc(doc) {
  const data = doc.data() || {};
  return {
    recipeId: asString(data.recipeId) || doc.id,
    name: asString(data.name),
    outputProductId: asString(data.outputProductId),
    outputQuantity: normalizeUniquemQuantity(data.outputQuantity) || 1,
    outputUnit: normalizeUniquemUnit(data.outputUnit),
    yieldLossPercent: clampNumber(data.yieldLossPercent, 0, 100, 0),
    instructions: asString(data.instructions),
    inputs: Array.isArray(data.inputs) ? data.inputs.map((item) => ({ ...item, quantity: normalizeUniquemQuantity(item.quantity), unit: normalizeUniquemUnit(item.unit) })) : [],
    status: normalizeUniquemStatus(data.status),
    updatedAt: toUniquemIso(data.updatedAt),
  };
}

function mapUniquemBlendJobDoc(doc) {
  const data = doc.data() || {};
  return {
    jobId: asString(data.jobId) || doc.id,
    recipeId: asString(data.recipeId),
    name: asString(data.name),
    outputProductId: asString(data.outputProductId),
    outputLotId: asString(data.outputLotId),
    outputLotNumber: asString(data.outputLotNumber),
    outputQuantity: normalizeUniquemQuantity(data.outputQuantity),
    outputUnit: normalizeUniquemUnit(data.outputUnit),
    warehouseId: asString(data.warehouseId),
    location: asString(data.location) || 'Main',
    inputs: Array.isArray(data.inputs) ? data.inputs : [],
    status: normalizeUniquemStatus(data.status, ['planned', 'completed', 'cancelled'], 'planned'),
    notes: asString(data.notes),
    createdAt: toUniquemIso(data.createdAt),
    completedAt: toUniquemIso(data.completedAt),
  };
}

function mapUniquemPriceDoc(doc) {
  const data = doc.data() || {};
  return {
    priceId: asString(data.priceId) || doc.id,
    productId: asString(data.productId),
    price: normalizeUniquemQuantity(data.price),
    currency: asString(data.currency).toUpperCase() || 'CAD',
    unit: normalizeUniquemUnit(data.unit),
    effectiveDate: asString(data.effectiveDate),
    status: normalizeUniquemStatus(data.status),
    notes: asString(data.notes),
    updatedAt: toUniquemIso(data.updatedAt),
  };
}

function uniquemBalanceKey({ productId, lotId, warehouseId, location }) {
  return [productId, lotId, warehouseId, location || 'Main'].join('|');
}

function calculateUniquemBalances(movements = []) {
  const map = new Map();
  for (const movement of Array.isArray(movements) ? movements : []) {
    const quantity = normalizeUniquemQuantity(movement.quantity, { allowNegative: true });
    if (!movement.productId || !movement.lotId || !movement.warehouseId || !quantity) continue;
    const location = asString(movement.location) || 'Main';
    const key = uniquemBalanceKey({ ...movement, location });
    const current = map.get(key) || {
      productId: movement.productId,
      lotId: movement.lotId,
      warehouseId: movement.warehouseId,
      location,
      unit: normalizeUniquemUnit(movement.unit),
      quantity: 0,
    };
    current.quantity = Math.round((current.quantity + quantity) * 1000) / 1000;
    map.set(key, current);
  }
  return Array.from(map.values()).filter((item) => Math.abs(item.quantity) > 0.0001);
}

async function loadUniquemOperationsData() {
  const [productSnap, warehouseSnap, lotSnap, movementSnap, recipeSnap, jobSnap, priceSnap, attachmentSnap] = await Promise.all([
    db.collection(UNIQUEM_PRODUCT_COLLECTION).orderBy('name').limit(500).get(),
    db.collection(UNIQUEM_WAREHOUSE_COLLECTION).orderBy('name').limit(100).get(),
    db.collection(UNIQUEM_LOT_COLLECTION).orderBy('createdAt', 'desc').limit(1000).get(),
    db.collection(UNIQUEM_MOVEMENT_COLLECTION).orderBy('createdAt', 'desc').limit(2000).get(),
    db.collection(UNIQUEM_RECIPE_COLLECTION).orderBy('updatedAt', 'desc').limit(300).get(),
    db.collection(UNIQUEM_BLEND_JOB_COLLECTION).orderBy('createdAt', 'desc').limit(300).get(),
    db.collection(UNIQUEM_PRICE_COLLECTION).orderBy('effectiveDate', 'desc').limit(500).get(),
    db.collection(UNIQUEM_ATTACHMENT_COLLECTION).orderBy('updatedAt', 'desc').limit(1000).get(),
  ]);
  const products = productSnap.docs.map(mapUniquemProductDoc).filter((product) => product.status === 'active');
  const warehouses = warehouseSnap.docs.map(mapUniquemWarehouseDoc);
  const lots = lotSnap.docs.map(mapUniquemLotDoc);
  const movements = movementSnap.docs.map(mapUniquemMovementDoc);
  const recipes = recipeSnap.docs.map(mapUniquemRecipeDoc);
  const blendJobs = jobSnap.docs.map(mapUniquemBlendJobDoc);
  const prices = priceSnap.docs.map(mapUniquemPriceDoc);
  const attachments = attachmentSnap.docs.map(mapUniquemAttachmentDoc);
  return {
    products,
    warehouses,
    lots,
    movements,
    recipes,
    blendJobs,
    prices,
    attachments,
    attachmentsByEntity: groupUniquemAttachments(attachments),
    balances: calculateUniquemBalances(movements),
  };
}

function buildUniquemDashboard(data = {}) {
  const products = Array.isArray(data.products) ? data.products : [];
  const lots = Array.isArray(data.lots) ? data.lots : [];
  const balances = Array.isArray(data.balances) ? data.balances : [];
  const blendJobs = Array.isArray(data.blendJobs) ? data.blendJobs : [];
  const activeLots = new Set(lots.filter((lot) => lot.status !== 'archived').map((lot) => lot.lotId));
  const onHandByProduct = new Map();
  for (const balance of balances) {
    if (!activeLots.has(balance.lotId)) continue;
    onHandByProduct.set(balance.productId, (onHandByProduct.get(balance.productId) || 0) + balance.quantity);
  }
  const lowStock = [];
  const today = new Date();
  const soon = new Date(today.getTime() + 1000 * 60 * 60 * 24 * 60);
  const expiringLots = lots
    .filter((lot) => {
      if (!lot.expiryDate || lot.status === 'archived') return false;
      const expiry = new Date(lot.expiryDate);
      return Number.isFinite(expiry.getTime()) && expiry <= soon;
    })
    .slice(0, 20);
  return {
    productCount: products.filter((item) => item.status === 'active').length,
    lotCount: lots.filter((item) => item.status !== 'archived').length,
    onHandPositions: balances.length,
    openBlendJobs: blendJobs.filter((item) => item.status === 'planned').length,
    lowStock,
    expiringLots,
  };
}

async function loadOwnedMudDraft(draftId, user) {
  const id = normalizeDocId(draftId);
  if (!id) {
    const err = new Error('draftId is required');
    err.status = 400;
    throw err;
  }
  const ref = db.collection(MUD_PROGRAM_DRAFT_COLLECTION).doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    const err = new Error('Draft not found');
    err.status = 404;
    throw err;
  }
  const data = snap.data() || {};
  if (user.role !== 'admin' && asString(data.createdBy) !== user.uid) {
    const err = new Error('Forbidden');
    err.status = 403;
    throw err;
  }
  return { ref, snap, data };
}

async function callOpenAIMudExtraction({ pdfBuffer, fileName }) {
  const apiKey = readSecret(OPENAI_API_KEY);
  const model = process.env.OPENAI_DOCUMENT_MODEL || 'gpt-5.5';
  if (!apiKey) throw new Error('Missing OPENAI_API_KEY');

  const prompt = [
    'You are extracting data from an oil-company drilling program PDF so QuoteChem can build a portrait mud program.',
    'Return strict JSON only with keys overview, formationTops, casingStrings, volumes, and sections.',
    'overview keys: programTitle, operator, consultant, mudCompany, wellName, uwi, license, afe, rig, location, fieldZone, programDate, programVersion, warehouse, attention, salesRep, salesRepPhone, groundElevation, rfElevation, rfGround, totalMd, totalMetersDrilled, lateralLength, kickoffPoint, objective, sourceSummary.',
    'formationTops rows use keys: formation, md, tvd, lithology, gradient, emd, pressure, h2s, comment.',
    'casingStrings rows use keys: name, od, linearMass, grade, capacity, endPoint.',
    'volumes rows use keys: holeSection, bitSize, start, end, length, tanks, casing, sectionVolume, totalOpenHole, losses, finalCirculating, totalVolume.',
    'sections is an array. Each section keys: id, name, topDepth, bottomDepth, holeSize, casingSize, mudSystem, densityRange, viscosityRange, ph, fluidLoss, keyProducts, riskNotes, programNotes, properties, procedures.',
    'For each section, properties is an array of label/value pairs. procedures is an array of heading/lines groups.',
    'Do not invent exact values. If the source does not contain a value, leave it blank or write a concise note in programNotes/riskNotes.',
    `Source file name: ${fileName || 'drilling-program.pdf'}`,
  ].join('\n');

  const stringObjectSchema = (shape) => ({
    type: 'object',
    additionalProperties: false,
    properties: Object.fromEntries(Object.keys(shape).map((key) => [key, { type: 'string' }])),
    required: Object.keys(shape),
  });

  const propertySchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      label: { type: 'string' },
      value: { type: 'string' },
    },
    required: ['label', 'value'],
  };

  const procedureSchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      heading: { type: 'string' },
      lines: { type: 'array', items: { type: 'string' } },
    },
    required: ['heading', 'lines'],
  };

  const sectionSchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      ...Object.fromEntries(Object.keys(emptyMudSection).filter((key) => !['properties', 'procedures'].includes(key)).map((key) => [key, { type: 'string' }])),
      properties: { type: 'array', items: propertySchema },
      procedures: { type: 'array', items: procedureSchema },
    },
    required: Object.keys(emptyMudSection),
  };

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: prompt,
            },
            {
              type: 'input_file',
              filename: fileName || 'drilling-program.pdf',
              file_data: `data:application/pdf;base64,${pdfBuffer.toString('base64')}`,
            },
          ],
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'mud_program_extraction',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              overview: {
                type: 'object',
                additionalProperties: false,
                properties: Object.fromEntries(Object.keys(emptyMudOverview).map((key) => [key, { type: 'string' }])),
                required: Object.keys(emptyMudOverview),
              },
              formationTops: {
                type: 'array',
                items: stringObjectSchema(emptyFormationTop),
              },
              casingStrings: {
                type: 'array',
                items: stringObjectSchema(emptyCasingString),
              },
              volumes: {
                type: 'array',
                items: stringObjectSchema(emptyVolumeRow),
              },
              sections: {
                type: 'array',
                items: sectionSchema,
              },
            },
            required: ['overview', 'formationTops', 'casingStrings', 'volumes', 'sections'],
          },
        },
      },
    }),
  });

  if (!response.ok) {
    const failureText = await response.text();
    throw new Error(`OpenAI mud program extraction failed: ${response.status} ${failureText}`);
  }

  const data = await response.json();
  const parsed = parseOpenAIJson(extractResponsesText(data));
  return {
    overview: normalizeMudOverview(parsed.overview || {}),
    formationTops: normalizeFormationTops(parsed.formationTops || []),
    casingStrings: normalizeCasingStrings(parsed.casingStrings || []),
    volumes: normalizeVolumeRows(parsed.volumes || []),
    sections: normalizeMudSections(parsed.sections || []),
    model,
  };
}

async function callOpenAIMudPageImprove({ draft, page, instruction }) {
  const apiKey = readSecret(OPENAI_API_KEY);
  const model = process.env.OPENAI_DOCUMENT_MODEL || 'gpt-5.5';
  if (!apiKey) throw new Error('Missing OPENAI_API_KEY');

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: [
                'Improve one editable QuoteChem mud program page.',
                'Return strict JSON with the same shape as the provided page: id, type, title, sectionId, data.',
                'Keep field values editable and concise. Do not invent exact technical values not present in the draft.',
                `User instruction: ${instruction || 'Improve clarity and field usefulness.'}`,
                `Draft overview: ${JSON.stringify(draft.overview || {})}`,
                `Current page: ${JSON.stringify(page || {})}`,
              ].join('\n'),
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const failureText = await response.text();
    throw new Error(`OpenAI mud page improvement failed: ${response.status} ${failureText}`);
  }

  const parsed = parseOpenAIJson(extractResponsesText(await response.json()));
  return normalizeMudPages([parsed], draft.overview, draft.sections)[0];
}

function uniquemSceneJsonSchema() {
  const vectorSchema = {
    type: 'array',
    minItems: 3,
    maxItems: 3,
    items: { type: 'number' },
  };
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      title: { type: 'string' },
      summary: { type: 'string' },
      cameraHint: {
        type: 'object',
        additionalProperties: false,
        properties: {
          distance: { type: 'number' },
          target: vectorSchema,
        },
        required: ['distance', 'target'],
      },
      objects: {
        type: 'array',
        maxItems: UNIQUEM_SCENE_OBJECT_MAX,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            id: { type: 'string' },
            type: { type: 'string', enum: UNIQUEM_OBJECT_TYPES },
            label: { type: 'string' },
            position: vectorSchema,
            scale: vectorSchema,
            rotationY: { type: 'number' },
            color: { type: 'string' },
            materialKind: { type: 'string', enum: UNIQUEM_MATERIAL_KINDS },
            textureKind: { type: 'string', enum: UNIQUEM_TEXTURE_KINDS },
          },
          required: ['id', 'type', 'label', 'position', 'scale', 'rotationY', 'color', 'materialKind', 'textureKind'],
        },
      },
    },
    required: ['title', 'summary', 'cameraHint', 'objects'],
  };
}

async function callOpenAIUniquemScene({ prompt, image, previousScene }) {
  const apiKey = readSecret(OPENAI_API_KEY);
  const model = asString(process.env.OPENAI_DOCUMENT_MODEL) || 'gpt-5.5';
  if (!apiKey) throw new Error('Missing OPENAI_API_KEY');

  const content = [
    {
      type: 'input_text',
      text: [
        'Create one procedural Three.js object group as JSON for QuoteChem Uniquem 3D Creator.',
        'Describe the requested object with safe primitive objects only. Do not return code, URLs, external assets, GLB files, SVG, CSS, or markdown.',
        'Use these object types only: box, cylinder, plane, platform, stairs, trussTower, speakerStack, ledPanel, lightBeam, label.',
        'Use scale and positions in meters. Keep the full object group near the origin and camera-friendly.',
        'For screens, signage, neon, or artwork, use ledPanel with textureKind cosmic, sunset, or grid.',
        'Use labels sparingly for useful signage or major parts.',
        `User prompt: ${prompt}`,
        previousScene ? `Previous scene to refine or replace: ${JSON.stringify(normalizeUniquemScene(previousScene)).slice(0, 9000)}` : 'No previous scene.',
      ].join('\n'),
    },
  ];
  if (image) {
    content.unshift({
      type: 'input_image',
      image_url: image.dataUrl,
    });
  }

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      reasoning: { effort: 'medium' },
      input: [
        {
          role: 'system',
          content:
            'You convert text and image references into compact procedural 3D scene JSON. Output must obey the provided schema. Prefer recognizable arrangements over excessive object counts.',
        },
        {
          role: 'user',
          content,
        },
      ],
      text: {
        verbosity: 'medium',
        format: {
          type: 'json_schema',
          name: 'uniquem_3d_scene',
          strict: true,
          schema: uniquemSceneJsonSchema(),
        },
      },
    }),
  });

  if (!response.ok) {
    const failureText = await response.text();
    throw new Error(`OpenAI Uniquem 3D scene generation failed: ${response.status} ${failureText}`);
  }

  const parsed = parseOpenAIJson(extractResponsesText(await response.json()));
  return {
    scene: normalizeUniquemScene(parsed),
    model,
  };
}

function selectedProgramOptions(template, selections = {}) {
  const selected = [];
  for (const section of template.sections || []) {
    const selectedOptionId = normalizeDocId(selections[section.id]);
    const option = (section.options || []).find((item) => item.id === selectedOptionId);
    if (section.required !== false && !option) {
      const err = new Error(`Choose an option for ${section.title}`);
      err.status = 400;
      throw err;
    }
    if (option) selected.push({ section, option });
  }
  return selected;
}

function extractResponsesText(data) {
  if (typeof data?.output_text === 'string') return data.output_text;
  const chunks = [];
  for (const item of data?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === 'string') chunks.push(content.text);
    }
  }
  return chunks.join('\n').trim();
}

function fallbackProgramContent({ template, job, selectedOptions }) {
  return {
    title: job.programTitle || template.name || 'Drilling Program',
    subtitle: [job.wellName, job.location].filter(Boolean).join(' - '),
    summary:
      job.notes ||
      template.description ||
      'This drilling program was generated from the selected admin instruction set. Fields not provided by the user or template are intentionally left unspecified.',
    sections: selectedOptions.map(({ section, option }) => ({
      title: section.title,
      body: option.instructions,
      bullets: [
        job.extraRequirements ? `Additional requirement: ${job.extraRequirements}` : '',
        'Confirm all operational values against the approved field program before execution.',
      ].filter(Boolean),
      table: [],
      notes: section.description,
      assetIds: (option.assets || []).map((asset) => asset.id),
    })),
  };
}

function normalizeGeneratedProgramContent(value = {}, fallback) {
  const sections = Array.isArray(value.sections) ? value.sections : [];
  return {
    title: asString(value.title) || fallback.title,
    subtitle: asString(value.subtitle) || fallback.subtitle,
    summary: asString(value.summary) || fallback.summary,
    sections: sections.length
      ? sections.slice(0, 30).map((section, index) => ({
          title: asString(section.title) || fallback.sections[index]?.title || `Section ${index + 1}`,
          body: asString(section.body) || fallback.sections[index]?.body || '',
          bullets: (Array.isArray(section.bullets) ? section.bullets : []).map(asString).filter(Boolean).slice(0, 12),
          table: (Array.isArray(section.table) ? section.table : []).slice(0, 20).map((row) => (Array.isArray(row) ? row.map(asString).slice(0, 6) : [])),
          notes: asString(section.notes),
          assetIds: (Array.isArray(section.assetIds) ? section.assetIds : []).map(asString).filter(Boolean).slice(0, 12),
        }))
      : fallback.sections,
  };
}

function firestoreSafeGeneratedProgramContent(content = {}) {
  return {
    title: asString(content.title),
    subtitle: asString(content.subtitle),
    summary: asString(content.summary),
    sections: (Array.isArray(content.sections) ? content.sections : []).map((section) => ({
      title: asString(section.title),
      body: asString(section.body),
      bullets: (Array.isArray(section.bullets) ? section.bullets : []).map(asString).filter(Boolean),
      table: (Array.isArray(section.table) ? section.table : []).map((row) => ({
        cells: (Array.isArray(row) ? row : []).map(asString).filter(Boolean),
      })),
      notes: asString(section.notes),
      assetIds: (Array.isArray(section.assetIds) ? section.assetIds : []).map(asString).filter(Boolean),
    })),
  };
}

function isOpenAIReferenceAsset(asset = {}) {
  const contentType = asString(asset.contentType).toLowerCase();
  return contentType === 'application/pdf' || contentType.startsWith('image/');
}

async function buildOpenAIReferenceInputs(selectedOptions = []) {
  const assetsByPath = new Map();
  for (const { option } of selectedOptions) {
    for (const asset of option.assets || []) {
      if (asset.path && isOpenAIReferenceAsset(asset)) assetsByPath.set(asset.path, asset);
    }
  }

  const contentItems = [];
  const summaries = [];
  let totalBytes = 0;

  for (const asset of assetsByPath.values()) {
    if (totalBytes >= OPENAI_REFERENCE_TOTAL_MAX_BYTES) {
      summaries.push({ name: asset.name, contentType: asset.contentType, status: 'skipped_total_size_limit' });
      continue;
    }

    try {
      const [buffer] = await storage.bucket().file(asset.path).download();
      if (!buffer?.length) continue;
      if (buffer.length > OPENAI_REFERENCE_FILE_MAX_BYTES) {
        summaries.push({ name: asset.name, contentType: asset.contentType, status: 'skipped_file_size_limit', bytes: buffer.length });
        continue;
      }
      if (totalBytes + buffer.length > OPENAI_REFERENCE_TOTAL_MAX_BYTES) {
        summaries.push({ name: asset.name, contentType: asset.contentType, status: 'skipped_total_size_limit', bytes: buffer.length });
        continue;
      }

      const contentType = asString(asset.contentType).toLowerCase();
      const base64 = buffer.toString('base64');
      if (contentType === 'application/pdf') {
        contentItems.push({
          type: 'input_file',
          filename: asset.name || 'reference.pdf',
          file_data: `data:application/pdf;base64,${base64}`,
        });
      } else if (contentType.startsWith('image/')) {
        contentItems.push({
          type: 'input_image',
          image_url: `data:${contentType};base64,${base64}`,
        });
      }
      totalBytes += buffer.length;
      summaries.push({ name: asset.name, contentType: asset.contentType, status: 'attached', bytes: buffer.length });
    } catch (error) {
      summaries.push({ name: asset.name, contentType: asset.contentType, status: 'failed_to_load', error: asString(error?.message || String(error)) });
    }
  }

  return { contentItems, summaries };
}

async function callOpenAIDrillingProgram({ template, job, selectedOptions }) {
  const apiKey = readSecret(OPENAI_API_KEY);
  const model = asString(process.env.OPENAI_DOCUMENT_MODEL) || 'gpt-5.5';
  if (!apiKey) throw new Error('Missing OPENAI_API_KEY');

  const fallback = fallbackProgramContent({ template, job, selectedOptions });
  const references = await buildOpenAIReferenceInputs(selectedOptions);
  const prompt = [
    'Create a professional drilling program PDF draft as strict JSON.',
    'Use the selected admin instructions as the controlling source.',
    references.contentItems.length
      ? 'Reference PDFs/images are attached. Study their structure, headings, tables, wording style, page organization, and visual intent. Use them as style/context examples while creating a new program for the provided job details.'
      : 'No usable reference PDF/image content was attached. Use only the admin instructions and job details.',
    'Do not invent depths, formations, mud weights, casing sizes, equipment, dates, safety limits, regulatory requirements, costs, or operational values.',
    'If a value is not present in the job details or admin instructions, write "Not specified" or omit the claim.',
    'If the admin instructions are generic or incomplete, produce a concise template-based section that says what should be completed, not fake technical facts.',
    'Return JSON with title, subtitle, summary, and sections. Each section has title, body, bullets, table, notes, and assetIds.',
    'Keep the content polished, concise, practical, and suitable for a one-pass generated PDF. Avoid filler.',
    'Job details:',
    JSON.stringify(job),
    'Template:',
    JSON.stringify({ name: template.name, description: template.description }),
    'Selected sections/options:',
    JSON.stringify(
      selectedOptions.map(({ section, option }) => ({
        sectionId: section.id,
        sectionTitle: section.title,
        sectionDescription: section.description,
        optionId: option.id,
        optionLabel: option.label,
        instructions: option.instructions,
        assets: (option.assets || []).map((asset) => ({ id: asset.id, name: asset.name, contentType: asset.contentType })),
      }))
    ),
    'Reference file load status:',
    JSON.stringify(references.summaries),
  ].join('\n');

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      reasoning: { effort: 'medium' },
      input: [
        {
          role: 'system',
          content:
            'You are a drilling program technical writer. Return valid JSON only. Stay grounded in the supplied job details and admin instructions. Never fabricate technical field values. Do not include markdown fences.',
        },
        {
          role: 'user',
          content: [
            ...references.contentItems,
            {
              type: 'input_text',
              text: prompt,
            },
          ],
        },
      ],
      text: {
        verbosity: 'medium',
        format: {
          type: 'json_schema',
          name: 'drilling_program_pdf',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              title: { type: 'string' },
              subtitle: { type: 'string' },
              summary: { type: 'string' },
              sections: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    title: { type: 'string' },
                    body: { type: 'string' },
                    bullets: { type: 'array', items: { type: 'string' } },
                    table: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
                    notes: { type: 'string' },
                    assetIds: { type: 'array', items: { type: 'string' } },
                  },
                  required: ['title', 'body', 'bullets', 'table', 'notes', 'assetIds'],
                },
              },
            },
            required: ['title', 'subtitle', 'summary', 'sections'],
          },
        },
      },
    }),
  });

  if (!response.ok) {
    const failureText = await response.text();
    throw new Error(`OpenAI document request failed: ${response.status} ${failureText}`);
  }

  const data = await response.json();
  const raw = extractResponsesText(data);
  const parsed = raw ? JSON.parse(raw) : {};
  return {
    content: normalizeGeneratedProgramContent(parsed, fallback),
    model,
    referenceFiles: references.summaries,
  };
}

function collectProgramAssets(selectedOptions) {
  const byId = new Map();
  for (const { option } of selectedOptions) {
    for (const asset of option.assets || []) {
      if (asset.id) byId.set(asset.id, asset);
    }
  }
  return byId;
}

async function loadImageAsset(asset) {
  if (!asset?.path || !asset.contentType?.startsWith('image/')) return null;
  try {
    const [buffer] = await storage.bucket().file(asset.path).download();
    return buffer;
  } catch {
    return null;
  }
}

function pdfBufferFromDoc(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

function drawKeyValue(doc, label, value) {
  if (!value) return;
  doc.font('Helvetica-Bold').fillColor('#334155').text(`${label}: `, { continued: true });
  doc.font('Helvetica').fillColor('#0f172a').text(value);
}

function ensurePdfSpace(doc, requiredHeight = 90) {
  const bottomLimit = doc.page.height - 54;
  if (doc.y + requiredHeight > bottomLimit) doc.addPage();
}

function drawSectionHeading(doc, title) {
  ensurePdfSpace(doc, 100);
  doc.moveDown(1);
  doc.font('Helvetica-Bold').fontSize(15).fillColor('#0f2a56').text(title || 'Program Section', { lineGap: 2 });
  doc.moveDown(0.25);
}

function drawProgramTable(doc, table = []) {
  const rows = table
    .map((row) => (Array.isArray(row) ? row.map(asString).filter(Boolean) : []))
    .filter((row) => row.length);
  if (!rows.length) return;

  ensurePdfSpace(doc, 80);
  doc.moveDown(0.5);
  for (const row of rows) {
    ensurePdfSpace(doc, 24);
    doc.font('Helvetica').fontSize(9).fillColor('#0f172a').text(row.join('  |  '), {
      lineGap: 2,
    });
  }
}

function drawRoundedRect(doc, x, y, width, height, color, stroke = '#d8e5f2') {
  doc.roundedRect(x, y, width, height, 10).fillAndStroke(color, stroke);
}

function drawMetricCard(doc, x, y, width, label, value, accent) {
  drawRoundedRect(doc, x, y, width, 58, '#ffffff', '#d8e5f2');
  doc.roundedRect(x, y, width, 8, 5).fill(accent);
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#475569').text(label.toUpperCase(), x + 10, y + 17, { width: width - 20 });
  doc.font('Helvetica-Bold').fontSize(16).fillColor('#0f172a').text(value || 'Not specified', x + 10, y + 31, { width: width - 20 });
}

function drawWellPathGraphic(doc, x, y, width, height) {
  drawRoundedRect(doc, x, y, width, height, '#f8fafc', '#cbd8e6');
  doc.font('Helvetica-Bold').fontSize(12).fillColor('#0f172a').text('Well Section Visual - Fluid Path and Hole Program', x + 16, y + 14);
  doc.font('Helvetica').fontSize(7).fillColor('#64748b').text('Illustrative schematic generated from program data', x + 16, y + 29);

  const groundY = y + 70;
  const verticalX = x + 96;
  const heelY = y + height - 78;
  const toeX = x + width - 52;
  doc.lineWidth(3).strokeColor('#775a3a').moveTo(x + 38, groundY).lineTo(x + width - 26, groundY).stroke();
  doc.lineWidth(5).strokeColor('#1f2937').moveTo(verticalX, groundY).lineTo(verticalX, heelY - 16).quadraticCurveTo(verticalX, heelY, verticalX + 44, heelY).lineTo(toeX, heelY).stroke();
  doc.lineWidth(2).strokeColor('#0b5fc0').moveTo(verticalX + 8, groundY - 6).lineTo(verticalX + 8, heelY - 20).quadraticCurveTo(verticalX + 8, heelY - 6, verticalX + 50, heelY - 6).lineTo(toeX - 18, heelY - 6).stroke();

  doc.fillColor('#0b5fc0').font('Helvetica-Bold').fontSize(9).text('Blue: mud pumped down drill pipe', x + width - 210, y + 45);
  doc.fillColor('#14823b').text('Green: returns up annulus', x + width - 210, y + 59);
  doc.strokeColor('#14823b').lineWidth(1.8);
  for (const arrowX of [verticalX - 14, verticalX - 8, toeX - 260, toeX - 160, toeX - 60]) {
    if (arrowX < verticalX + 20) {
      doc.moveTo(arrowX, heelY - 42).lineTo(arrowX, heelY - 58).stroke();
      doc.moveTo(arrowX - 4, heelY - 53).lineTo(arrowX, heelY - 59).lineTo(arrowX + 4, heelY - 53).stroke();
    } else {
      doc.moveTo(arrowX + 18, heelY + 13).lineTo(arrowX, heelY + 13).stroke();
      doc.moveTo(arrowX + 6, heelY + 9).lineTo(arrowX, heelY + 13).lineTo(arrowX + 6, heelY + 17).stroke();
    }
  }

  const stages = [
    ['Surface Gel Slurry', '#14823b'],
    ['Top Hole Floc Water', '#0b5fc0'],
    ['Intermediate Polymer', '#e38119'],
    ['Main Amine Polymer', '#b93636'],
  ];
  let stageX = x + 16;
  const stageY = y + height - 34;
  for (const [label, color] of stages) {
    const stageW = label.length > 18 ? 165 : 96;
    doc.roundedRect(stageX, stageY, stageW, 12, 3).fill(color);
    doc.font('Helvetica-Bold').fontSize(5.8).fillColor('#ffffff').text(label, stageX + 4, stageY + 3, { width: stageW - 8, align: 'center' });
    stageX += stageW + 3;
  }
}

function drawProgramCoverPage(doc, { content, job }) {
  doc.rect(0, 0, 792, 118).fill('#0f5a2d');
  doc.font('Helvetica-Bold').fontSize(28).fillColor('#ffffff').text('Drilling Fluid Program', 36, 30);
  doc.font('Helvetica').fontSize(12).fillColor('#ecfdf5').text(content.subtitle || [job.wellName, job.location].filter(Boolean).join(' - ') || 'Mud program', 36, 65);
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#d9f99d').text('GENERATED PROGRAM - REVIEW ALL FIELD VALUES BEFORE USE', 36, 88);
  drawRoundedRect(doc, 650, 28, 96, 52, '#ffffff', '#ffffff');
  doc.font('Helvetica-Bold').fontSize(22).fillColor('#0f5a2d').text('QC', 650, 42, { width: 96, align: 'center' });
  doc.font('Helvetica').fontSize(7).fillColor('#0f5a2d').text('QuoteChem', 650, 66, { width: 96, align: 'center' });

  drawRoundedRect(doc, 36, 148, 256, 178, '#ffffff', '#d8e5f2');
  doc.roundedRect(36, 148, 256, 24, 8).fill('#16833c');
  doc.font('Helvetica-Bold').fontSize(12).fillColor('#ffffff').text('Program Header', 48, 155);
  const headerRows = [
    ['Customer', job.customer],
    ['Well Name', job.wellName],
    ['Location', job.location],
    ['Rig', job.rig],
    ['Program Date', job.programDate],
  ];
  let rowY = 188;
  for (const [label, value] of headerRows) {
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#475569').text(label, 52, rowY, { width: 76 });
    doc.font('Helvetica').fontSize(8).fillColor('#0f172a').text(value || 'Not specified', 132, rowY, { width: 140 });
    rowY += 24;
  }

  drawMetricCard(doc, 36, 342, 120, 'Well', job.wellName, '#16833c');
  drawMetricCard(doc, 170, 342, 122, 'Rig', job.rig, '#0b5fc0');
  drawMetricCard(doc, 36, 414, 120, 'Location', job.location, '#e38119');
  drawMetricCard(doc, 170, 414, 122, 'Date', job.programDate, '#b93636');
  drawWellPathGraphic(doc, 320, 148, 430, 270);

  drawRoundedRect(doc, 36, 490, 714, 76, '#fffdf3', '#eab308');
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#ca6a10').text('Purpose of this program', 52, 506);
  doc.font('Helvetica').fontSize(8.5).fillColor('#0f172a').text(content.summary || 'Program generated from selected instructions and uploaded references.', 52, 526, {
    width: 680,
    lineGap: 2,
  });
}

async function buildDrillingProgramPdf({ content, job, selectedOptions }) {
  const doc = new PDFDocument({ size: 'LETTER', layout: 'landscape', margin: 36, bufferPages: true });
  const assetsById = collectProgramAssets(selectedOptions);

  drawProgramCoverPage(doc, { content, job });

  for (const section of content.sections || []) {
    if (doc.y > 485) doc.addPage();
    drawSectionHeading(doc, section.title);
    if (section.body) {
      ensurePdfSpace(doc, 80);
      doc.font('Helvetica').fontSize(10).fillColor('#0f172a').text(section.body, { lineGap: 3 });
    }
    if (section.bullets?.length) {
      doc.moveDown(0.45);
      for (const bullet of section.bullets) {
        ensurePdfSpace(doc, 24);
        doc.font('Helvetica').fontSize(9.5).fillColor('#0f172a').text(`- ${bullet}`, { indent: 12, lineGap: 2 });
      }
    }
    drawProgramTable(doc, section.table || []);
    if (section.notes) {
      ensurePdfSpace(doc, 50);
      doc.moveDown(0.5);
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#475569').text('Notes');
      doc.font('Helvetica').fontSize(9).fillColor('#475569').text(section.notes, { lineGap: 2 });
    }

    const imageAsset = (section.assetIds || []).map((id) => assetsById.get(id)).find((asset) => asset?.contentType?.startsWith('image/'));
    const imageBuffer = await loadImageAsset(imageAsset);
    if (imageBuffer) {
      if (doc.y > 500) doc.addPage();
      doc.moveDown(1);
      try {
        doc.image(imageBuffer, { fit: [480, 180], align: 'center' });
      } catch {}
    }
  }

  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i += 1) {
    doc.switchToPage(i);
    doc.font('Helvetica').fontSize(8).fillColor('#94a3b8').text(`QuoteChem Drilling Program • Page ${i + 1} of ${pages.count}`, 36, doc.page.height - 24, {
      width: doc.page.width - 72,
      align: 'center',
    });
  }

  return pdfBufferFromDoc(doc);
}

function mapEmailTemplateDoc(doc) {
  const data = doc.data() || {};
  const defaults = getDefaultEmailTemplate(doc.id) || {};
  return {
    templateId: doc.id,
    label: asString(data.label) || defaults.label || doc.id,
    description: asString(data.description) || defaults.description || '',
    subject: asString(data.subject) || defaults.subject || '',
    text: typeof data.text === 'string' ? data.text : defaults.text || '',
    html: typeof data.html === 'string' ? data.html : defaults.html || '',
    actionLabel: typeof data.actionLabel === 'string' ? data.actionLabel : defaults.actionLabel || '',
    actionUrlKey: typeof data.actionUrlKey === 'string' ? data.actionUrlKey : defaults.actionUrlKey || '',
    footer: typeof data.footer === 'string' ? data.footer : defaults.footer || '',
    customized: doc.exists,
    updatedAt: toIso(data.updatedAt),
    updatedBy: asString(data.updatedBy),
  };
}

async function getEmailTemplateOverride(templateId) {
  const id = asString(templateId);
  if (!id || !DEFAULT_EMAIL_TEMPLATE_IDS.includes(id)) return null;
  const snap = await db.collection(EMAIL_TEMPLATE_COLLECTION).doc(id).get();
  return snap.exists ? mapEmailTemplateDoc(snap) : null;
}

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function tokenHash(token) {
  return createHash('sha256').update(String(token || '')).digest('hex');
}

function makeInviteToken() {
  return randomBytes(32).toString('hex');
}

function baseUrlFromRequest(req) {
  const configured = asString(process.env.APP_BASE_URL || process.env.QUOTECHEM_APP_BASE_URL).replace(/\/$/, '');
  if (configured) return configured;
  const origin = asString(req.headers?.origin || req.headers?.Origin).replace(/\/$/, '');
  return origin || 'https://quotechem.com';
}

async function adminDisplayName(uid, fallbackEmail = '') {
  const snap = await db.collection('users').doc(uid).get();
  const data = snap.data() || {};
  return `${asString(data.firstName)} ${asString(data.lastName)}`.trim() || asString(data.email) || fallbackEmail || 'A QuoteChem admin';
}

async function findUserByEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  try {
    const authUser = await admin.auth().getUserByEmail(normalized);
    const userSnap = await db.collection('users').doc(authUser.uid).get();
    return {
      uid: authUser.uid,
      email: normalized,
      authUser,
      user: userSnap.exists ? userSnap.data() || {} : {},
    };
  } catch (error) {
    if (error?.code !== 'auth/user-not-found') throw error;
  }

  const snap = await db.collection('users').where('email', '==', normalized).limit(1).get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { uid: doc.id, email: normalized, authUser: null, user: doc.data() || {} };
}

async function applyUserAccess({ uid, email, firstName = '', lastName = '', role = 'user', enabledMiniApps = [], adminUid = '' }) {
  const now = admin.firestore.FieldValue.serverTimestamp();
  const normalizedRole = normalizeRole(role);
  const ref = db.collection('users').doc(uid);
  const snap = await ref.get();
  const existing = snap.data() || {};
  await ref.set(
    {
      uid,
      email: normalizeEmail(email),
      role: normalizedRole,
      enabledMiniApps: normalizeMiniAppIds(enabledMiniApps) || defaultEnabledMiniAppsForRole(normalizedRole),
      firstName: asString(firstName).slice(0, 80) || asString(existing.firstName),
      lastName: asString(lastName).slice(0, 80) || asString(existing.lastName),
      primaryAuthUid: uid,
      ...(snap.exists ? {} : { createdAt: now, createdBy: adminUid }),
      updatedAt: now,
      updatedBy: adminUid,
    },
    { merge: true }
  );
}

function normalizeAdminUserEmailInput(value) {
  const email = normalizeEmail(value);
  if (!isEmail(email)) {
    const err = new Error('Valid email is required');
    err.status = 400;
    throw err;
  }
  return email;
}

function emailBelongsToAnotherUser(existingUser, uid) {
  return Boolean(existingUser?.uid && existingUser.uid !== uid);
}

function inviteStatus(value) {
  return asString(value) || 'pending';
}

function canEditInviteStatus(value) {
  return ['pending', 'expired'].includes(inviteStatus(value));
}

function canResendInviteStatus(value) {
  return ['pending', 'expired'].includes(inviteStatus(value));
}

function inviteIdentity(invite = {}) {
  return {
    firstName: asString(invite.firstName).slice(0, 80),
    lastName: asString(invite.lastName).slice(0, 80),
  };
}

function publicInvite(invite = {}) {
  return {
    inviteId: asString(invite.inviteId),
    email: asString(invite.email),
    status: inviteStatus(invite.status),
    expiresAt: invite.expiresAt?.toMillis?.() || invite.expiresAt?.getTime?.() || null,
    firstName: asString(invite.firstName),
    lastName: asString(invite.lastName),
    role: normalizeRole(invite.role),
    enabledMiniApps: normalizeMiniAppIds(invite.enabledMiniApps) || defaultEnabledMiniAppsForRole(invite.role),
  };
}

async function loadInviteByToken(token) {
  const hash = tokenHash(token);
  if (!hash) {
    const err = new Error('Invite token is required');
    err.status = 400;
    throw err;
  }
  const snap = await db.collection(INVITATION_COLLECTION).where('tokenHash', '==', hash).limit(1).get();
  if (snap.empty) {
    const err = new Error('Invite not found');
    err.status = 404;
    throw err;
  }
  const doc = snap.docs[0];
  const invite = doc.data() || {};
  if (inviteStatus(invite.status) === 'accepted') {
    const err = new Error('Invite already accepted');
    err.status = 409;
    throw err;
  }
  if (inviteStatus(invite.status) === 'cancelled') {
    const err = new Error('Invite cancelled');
    err.status = 410;
    throw err;
  }
  if (inviteStatus(invite.status) === 'expired' || (invite.expiresAt?.toMillis?.() && invite.expiresAt.toMillis() < Date.now())) {
    await doc.ref.set({ status: 'expired', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true }).catch(() => {});
    const err = new Error('Invite expired');
    err.status = 410;
    throw err;
  }
  return { doc, invite };
}

function toIso(value) {
  if (!value) return null;
  if (value?.toDate) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return null;
}

export const adminListUsers = onRequest({ region: REGION }, async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  try {
    await requireAdmin(req);
    const [snap, inviteSnap] = await Promise.all([
      db.collection('users').orderBy('email', 'asc').limit(250).get(),
      db.collection(INVITATION_COLLECTION).orderBy('updatedAt', 'desc').limit(100).get(),
    ]);
    const items = snap.docs.map(mapUserDoc);
    const invites = inviteSnap.docs.map((doc) => ({ ...publicInvite(doc.data() || {}), inviteId: doc.id }));

    setCors(res);
    res.status(200).json({ ok: true, items, invites, miniApps: MINI_APP_IDS });
  } catch (error) {
    const status = Number(error?.status) || 500;
    logger.error('[adminListUsers] failed', { error: error?.message || String(error) });
    return jsonError(res, status, status === 403 ? 'Forbidden' : 'Failed to list users');
  }
});

export const adminUpdateUserAccess = onRequest({ region: REGION }, async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  try {
    const adminUser = await requireAdmin(req);
    const uid = asString(req.body?.uid);
    const role = normalizeRole(req.body?.role);
    const firstName = asString(req.body?.firstName).slice(0, 80);
    const lastName = asString(req.body?.lastName).slice(0, 80);
    const enabledMiniApps = normalizeMiniAppIds(req.body?.enabledMiniApps) || [];
    if (!uid) return jsonError(res, 400, 'uid is required');

    const userRef = db.collection('users').doc(uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) return jsonError(res, 404, 'User not found');
    const existingUserData = userSnap.data() || {};
    const email = normalizeAdminUserEmailInput(req.body?.email || existingUserData.email);
    const currentEmail = normalizeEmail(existingUserData.email);
    const emailChanged = email !== currentEmail;

    if (emailChanged) {
      const existingEmailUser = await findUserByEmail(email);
      if (emailBelongsToAnotherUser(existingEmailUser, uid)) {
        return jsonError(res, 409, 'Email is already assigned to another user');
      }
      await admin.auth().updateUser(uid, { email, emailVerified: false });
    }

    await userRef.set(
      {
        email,
        role,
        firstName,
        lastName,
        enabledMiniApps,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: adminUser.uid,
      },
      { merge: true }
    );

    const updatedSnap = await userRef.get();
    setCors(res);
    res.status(200).json({ ok: true, user: mapUserDoc(updatedSnap) });
  } catch (error) {
    const status = Number(error?.status) || 500;
    logger.error('[adminUpdateUserAccess] failed', { error: error?.message || String(error) });
    return jsonError(res, status, status === 403 ? 'Forbidden' : 'Failed to update user access');
  }
});

export const adminInviteUser = onRequest({ region: REGION, secrets: EMAIL_SECRETS }, async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  try {
    const adminUser = await requireAdmin(req);
    const email = normalizeEmail(req.body?.email);
    const role = normalizeRole(req.body?.role);
    const firstName = asString(req.body?.firstName).slice(0, 80);
    const lastName = asString(req.body?.lastName).slice(0, 80);
    const enabledMiniApps = normalizeMiniAppIds(req.body?.enabledMiniApps) || defaultEnabledMiniAppsForRole(role);
    if (!isEmail(email)) return jsonError(res, 400, 'Valid email is required');

    const inviterName = await adminDisplayName(adminUser.uid, adminUser.email);
    const existing = await findUserByEmail(email);
    const baseUrl = baseUrlFromRequest(req);

    if (existing?.uid) {
      await applyUserAccess({
        uid: existing.uid,
        email,
        firstName: firstName || existing.user?.firstName || '',
        lastName: lastName || existing.user?.lastName || '',
        role,
        enabledMiniApps,
        adminUid: adminUser.uid,
      });
      const emailResult = await sendTemplatedEmail({
        templateId: 'existingUserAccess',
        to: email,
        data: {
          inviterName,
          signInUrl: `${baseUrl}/signin`,
        },
        override: await getEmailTemplateOverride('existingUserAccess'),
      });
      const snap = await db.collection('users').doc(existing.uid).get();
      setCors(res);
      res.status(200).json({ ok: true, mode: 'existing', user: mapUserDoc(snap), emailMessageId: emailResult.messageId });
      return;
    }

    const pendingSnap = await db.collection(INVITATION_COLLECTION).where('email', '==', email).where('status', '==', 'pending').limit(1).get();
    const inviteId = pendingSnap.empty ? randomUUID() : pendingSnap.docs[0].id;
    const token = makeInviteToken();
    const inviteUrl = `${baseUrl}/invite/${token}`;
    const now = admin.firestore.FieldValue.serverTimestamp();
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    const invitePayload = {
      inviteId,
      email,
      firstName,
      lastName,
      role,
      enabledMiniApps,
      status: 'pending',
      tokenHash: tokenHash(token),
      inviteUrl,
      createdBy: pendingSnap.empty ? adminUser.uid : pendingSnap.docs[0].data()?.createdBy || adminUser.uid,
      updatedBy: adminUser.uid,
      updatedAt: now,
      expiresAt,
      ...(pendingSnap.empty ? { createdAt: now } : { resentAt: now, resentBy: adminUser.uid }),
    };
    await db.collection(INVITATION_COLLECTION).doc(inviteId).set(invitePayload, { merge: true });
    const emailResult = await sendTemplatedEmail({
      templateId: 'userInvite',
      to: email,
      data: {
        inviterName,
        inviteUrl,
      },
      override: await getEmailTemplateOverride('userInvite'),
    });

    setCors(res);
    res.status(200).json({ ok: true, mode: 'invited', invite: publicInvite(invitePayload), emailMessageId: emailResult.messageId });
  } catch (error) {
    const status = Number(error?.status) || 500;
    logger.error('[adminInviteUser] failed', { error: error?.message || String(error) });
    return jsonError(res, status, status === 403 ? 'Forbidden' : asString(error?.message || String(error)) || 'Failed to send invite');
  }
});

export const adminResendInvite = onRequest({ region: REGION, secrets: EMAIL_SECRETS }, async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  try {
    const adminUser = await requireAdmin(req);
    const inviteId = normalizeDocId(req.body?.inviteId);
    if (!inviteId) return jsonError(res, 400, 'inviteId is required');
    const ref = db.collection(INVITATION_COLLECTION).doc(inviteId);
    const snap = await ref.get();
    if (!snap.exists) return jsonError(res, 404, 'Invite not found');
    const invite = snap.data() || {};
    if (!canResendInviteStatus(invite.status)) {
      return jsonError(res, 400, 'Only pending or expired invites can be resent');
    }

    const token = makeInviteToken();
    const inviteUrl = `${baseUrlFromRequest(req)}/invite/${token}`;
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    const now = admin.firestore.FieldValue.serverTimestamp();
    await ref.set(
      {
        status: 'pending',
        tokenHash: tokenHash(token),
        inviteUrl,
        expiresAt,
        resentAt: now,
        resentBy: adminUser.uid,
        updatedAt: now,
        updatedBy: adminUser.uid,
      },
      { merge: true }
    );
    const emailResult = await sendTemplatedEmail({
      templateId: 'userInvite',
      to: invite.email,
      data: {
        inviterName: await adminDisplayName(adminUser.uid, adminUser.email),
        inviteUrl,
      },
      override: await getEmailTemplateOverride('userInvite'),
    });

    setCors(res);
    res.status(200).json({ ok: true, emailMessageId: emailResult.messageId });
  } catch (error) {
    const status = Number(error?.status) || 500;
    logger.error('[adminResendInvite] failed', { error: error?.message || String(error) });
    return jsonError(res, status, status === 403 ? 'Forbidden' : asString(error?.message || String(error)) || 'Failed to resend invite');
  }
});

export const adminUpdateInvite = onRequest({ region: REGION }, async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  try {
    const adminUser = await requireAdmin(req);
    const inviteId = normalizeDocId(req.body?.inviteId);
    if (!inviteId) return jsonError(res, 400, 'inviteId is required');

    const ref = db.collection(INVITATION_COLLECTION).doc(inviteId);
    const snap = await ref.get();
    if (!snap.exists) return jsonError(res, 404, 'Invite not found');
    const invite = snap.data() || {};
    if (!canEditInviteStatus(invite.status)) {
      return jsonError(res, 400, 'Only pending or expired invites can be edited');
    }

    const email = normalizeAdminUserEmailInput(req.body?.email || invite.email);
    const existing = await findUserByEmail(email);
    if (existing?.uid) return jsonError(res, 409, 'Email is already assigned to a user');

    const role = normalizeRole(req.body?.role || invite.role);
    const enabledMiniApps = normalizeMiniAppIds(req.body?.enabledMiniApps) || defaultEnabledMiniAppsForRole(role);
    const patch = {
      email,
      firstName: asString(req.body?.firstName).slice(0, 80),
      lastName: asString(req.body?.lastName).slice(0, 80),
      role,
      enabledMiniApps,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: adminUser.uid,
    };
    await ref.set(patch, { merge: true });
    const updatedSnap = await ref.get();
    setCors(res);
    res.status(200).json({ ok: true, invite: { ...publicInvite(updatedSnap.data() || {}), inviteId } });
  } catch (error) {
    const status = Number(error?.status) || 500;
    logger.error('[adminUpdateInvite] failed', { error: error?.message || String(error) });
    return jsonError(res, status, status === 403 ? 'Forbidden' : asString(error?.message || String(error)) || 'Failed to update invite');
  }
});

export const adminCancelInvite = onRequest({ region: REGION }, async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  try {
    const adminUser = await requireAdmin(req);
    const inviteId = normalizeDocId(req.body?.inviteId);
    if (!inviteId) return jsonError(res, 400, 'inviteId is required');
    const ref = db.collection(INVITATION_COLLECTION).doc(inviteId);
    const snap = await ref.get();
    if (!snap.exists) return jsonError(res, 404, 'Invite not found');
    const invite = snap.data() || {};
    if (asString(invite.status) === 'accepted') return jsonError(res, 400, 'Accepted invites cannot be cancelled');

    await ref.set(
      {
        status: 'cancelled',
        cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
        cancelledBy: adminUser.uid,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: adminUser.uid,
      },
      { merge: true }
    );
    setCors(res);
    res.status(200).json({ ok: true });
  } catch (error) {
    const status = Number(error?.status) || 500;
    logger.error('[adminCancelInvite] failed', { error: error?.message || String(error) });
    return jsonError(res, status, status === 403 ? 'Forbidden' : asString(error?.message || String(error)) || 'Failed to cancel invite');
  }
});

export const previewInvite = onRequest({ region: REGION }, async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  try {
    const { invite } = await loadInviteByToken(req.body?.token);
    setCors(res);
    res.status(200).json({ ok: true, invite: publicInvite(invite) });
  } catch (error) {
    const status = Number(error?.status) || 500;
    logger.error('[previewInvite] failed', { error: error?.message || String(error) });
    return jsonError(res, status, asString(error?.message || String(error)) || 'Unable to load invite');
  }
});

export const acceptInvite = onRequest({ region: REGION }, async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  let createdAuthUser = null;
  try {
    const { doc: inviteDoc, invite } = await loadInviteByToken(req.body?.token);
    const { firstName, lastName } = inviteIdentity(invite);
    const password = asString(req.body?.password);
    if (!firstName) return jsonError(res, 400, 'First name is required');
    if (!lastName) return jsonError(res, 400, 'Last name is required');
    if (!isValidTemporaryPassword(password)) return jsonError(res, 400, 'Password must be at least 6 characters');

    const email = normalizeEmail(invite.email);
    const existing = await findUserByEmail(email);
    if (existing?.uid) return jsonError(res, 409, 'This email is already registered. Sign in instead.');

    createdAuthUser = await admin.auth().createUser({
      email,
      password,
      emailVerified: false,
      displayName: `${firstName} ${lastName}`.trim(),
      disabled: false,
    });

    const now = admin.firestore.FieldValue.serverTimestamp();
    await db.collection('users').doc(createdAuthUser.uid).set(
      {
        uid: createdAuthUser.uid,
        email,
        role: normalizeRole(invite.role),
        enabledMiniApps: normalizeMiniAppIds(invite.enabledMiniApps) || defaultEnabledMiniAppsForRole(invite.role),
        firstName,
        lastName,
        primaryAuthUid: createdAuthUser.uid,
        createdAt: now,
        updatedAt: now,
        createdBy: asString(invite.createdBy),
      },
      { merge: true }
    );
    await inviteDoc.ref.set(
      {
        status: 'accepted',
        acceptedAt: now,
        acceptedBy: createdAuthUser.uid,
        updatedAt: now,
      },
      { merge: true }
    );

    let customToken = '';
    try {
      customToken = await admin.auth().createCustomToken(createdAuthUser.uid);
    } catch (error) {
      logger.error('[acceptInvite] custom token failed', { error: error?.message || String(error) });
    }

    setCors(res);
    res.status(200).json({ ok: true, uid: createdAuthUser.uid, email, customToken, requiresSignIn: !customToken });
  } catch (error) {
    if (createdAuthUser?.uid) {
      await admin.auth().deleteUser(createdAuthUser.uid).catch(() => {});
    }
    const status = Number(error?.status) || (error?.code === 'auth/email-already-exists' ? 409 : 500);
    logger.error('[acceptInvite] failed', { error: error?.message || String(error) });
    return jsonError(res, status, asString(error?.message || String(error)) || 'Failed to accept invite');
  }
});

export const createMudProgramDraft = onRequest(
  { region: REGION, timeoutSeconds: 120, memory: '1GiB' },
  async (req, res) => {
    if (preflight(req, res)) return;
    if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

    try {
      const user = await ensureMudProgramAccess(req);
      const fileName = asString(req.body?.fileName).slice(0, 180) || 'drilling-program.pdf';
      const contentType = asString(req.body?.contentType).toLowerCase() || 'application/pdf';
      if (!isPdfContentType(contentType)) return jsonError(res, 400, 'Only PDF files are supported');

      const { buffer } = parsePdfDataUrl(req.body?.fileData);
      const draftId = randomUUID();
      const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '-').slice(-140) || 'drilling-program.pdf';
      const pdfPath = `drillingPrograms/sourcePdfs/${user.uid}/${draftId}/${safeName}`;
      const bucket = storage.bucket();
      const file = bucket.file(pdfPath);
      const downloadToken = randomUUID();
      await file.save(buffer, {
        contentType: 'application/pdf',
        resumable: false,
        metadata: {
          cacheControl: 'private, max-age=0, no-cache',
          metadata: {
            createdBy: user.uid,
            draftId,
            firebaseStorageDownloadTokens: downloadToken,
          },
        },
      });
      const sourcePdfUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(pdfPath)}?alt=media&token=${downloadToken}`;

      const now = admin.firestore.FieldValue.serverTimestamp();
      const ref = db.collection(MUD_PROGRAM_DRAFT_COLLECTION).doc(draftId);
      await ref.set({
        status: 'uploaded',
        sourceFileName: fileName,
        sourcePdfPath: pdfPath,
        sourcePdfUrl,
        overview: emptyMudOverview,
        formationTops: [],
        casingStrings: [],
        volumes: [],
        sections: [],
        pages: [],
        createdBy: user.uid,
        createdByEmail: user.email,
        createdAt: now,
        updatedAt: now,
      });

      const saved = await ref.get();
      setCors(res);
      res.status(200).json({ ok: true, draft: mapMudProgramDraftDoc(saved) });
    } catch (error) {
      const status = Number(error?.status) || 500;
      logger.error('[createMudProgramDraft] failed', { error: error?.message || String(error) });
      return jsonError(res, status, status === 403 ? 'Forbidden' : asString(error?.message || String(error)) || 'Failed to create mud program draft');
    }
  }
);

export const extractMudProgramDraft = onRequest(
  { region: REGION, timeoutSeconds: 180, memory: '1GiB', secrets: [OPENAI_API_KEY] },
  async (req, res) => {
    if (preflight(req, res)) return;
    if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

    let draftRef = null;
    try {
      const user = await ensureMudProgramAccess(req);
      const loaded = await loadOwnedMudDraft(req.body?.draftId, user);
      draftRef = loaded.ref;
      const pdfPath = asString(loaded.data.sourcePdfPath);
      if (!pdfPath) return jsonError(res, 400, 'Draft does not have a source PDF');

      await draftRef.set(
        {
          status: 'extracting',
          extractionError: '',
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      const [pdfBuffer] = await storage.bucket().file(pdfPath).download();
      const extraction = await callOpenAIMudExtraction({
        pdfBuffer,
        fileName: asString(loaded.data.sourceFileName) || 'drilling-program.pdf',
      });
      const pages = buildMudProgramPagesFromExtraction(extraction);
      await draftRef.set(
        {
          status: 'review_ready',
          overview: extraction.overview,
          formationTops: extraction.formationTops,
          casingStrings: extraction.casingStrings,
          volumes: extraction.volumes,
          sections: extraction.sections,
          pages,
          extractionModel: extraction.model,
          extractionError: '',
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      const saved = await draftRef.get();
      setCors(res);
      res.status(200).json({ ok: true, draft: mapMudProgramDraftDoc(saved) });
    } catch (error) {
      const status = Number(error?.status) || 500;
      const message = status === 403 ? 'Forbidden' : asString(error?.message || String(error)) || 'Failed to extract mud program draft';
      if (draftRef) {
        await draftRef.set(
          {
            status: 'extraction_failed',
            extractionError: message,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        ).catch(() => {});
      }
      logger.error('[extractMudProgramDraft] failed', { error: message });
      return jsonError(res, status, message);
    }
  }
);

export const updateMudProgramDraft = onRequest({ region: REGION }, async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  try {
    const user = await ensureMudProgramAccess(req);
    const { ref } = await loadOwnedMudDraft(req.body?.draftId, user);
    const overview = normalizeMudOverview(req.body?.overview || {});
    const formationTops = normalizeFormationTops(req.body?.formationTops || []);
    const casingStrings = normalizeCasingStrings(req.body?.casingStrings || []);
    const volumes = normalizeVolumeRows(req.body?.volumes || []);
    const sections = normalizeMudSections(req.body?.sections || []);
    const pages = normalizeMudPages(req.body?.pages || [], overview, sections, { formationTops, casingStrings, volumes });
    const status = asString(req.body?.status).slice(0, 80) || 'editing';

    await ref.set(
      {
        status,
        overview,
        formationTops,
        casingStrings,
        volumes,
        sections,
        pages,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: user.uid,
      },
      { merge: true }
    );

    const saved = await ref.get();
    setCors(res);
    res.status(200).json({ ok: true, draft: mapMudProgramDraftDoc(saved) });
  } catch (error) {
    const status = Number(error?.status) || 500;
    logger.error('[updateMudProgramDraft] failed', { error: error?.message || String(error) });
    return jsonError(res, status, status === 403 ? 'Forbidden' : asString(error?.message || String(error)) || 'Failed to update mud program draft');
  }
});

export const improveMudProgramPage = onRequest(
  { region: REGION, timeoutSeconds: 120, memory: '1GiB', secrets: [OPENAI_API_KEY] },
  async (req, res) => {
    if (preflight(req, res)) return;
    if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

    try {
      const user = await ensureMudProgramAccess(req);
      const { ref, snap } = await loadOwnedMudDraft(req.body?.draftId, user);
      const draft = mapMudProgramDraftDoc(snap);
      const pageId = normalizeDocId(req.body?.pageId);
      const page = draft.pages.find((item) => item.id === pageId);
      if (!page) return jsonError(res, 404, 'Page not found');

      const improvedPage = await callOpenAIMudPageImprove({
        draft,
        page,
        instruction: asString(req.body?.instruction).slice(0, 2000),
      });
      const pages = draft.pages.map((item) => (item.id === page.id ? { ...improvedPage, id: page.id, type: page.type, sectionId: page.sectionId } : item));
      await ref.set(
        {
          status: 'editing',
          pages,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedBy: user.uid,
        },
        { merge: true }
      );

      setCors(res);
      res.status(200).json({ ok: true, page: pages.find((item) => item.id === page.id), draft: { ...draft, pages } });
    } catch (error) {
      const status = Number(error?.status) || 500;
      logger.error('[improveMudProgramPage] failed', { error: error?.message || String(error) });
      return jsonError(res, status, status === 403 ? 'Forbidden' : asString(error?.message || String(error)) || 'Failed to improve mud program page');
    }
  }
);

export const listUniquemOperations = onRequest({ region: REGION }, async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  try {
    await ensureUniquemAccess(req);
    const data = await loadUniquemOperationsData();
    setCors(res);
    res.status(200).json({ ok: true, ...data, dashboard: buildUniquemDashboard(data) });
  } catch (error) {
    const status = Number(error?.status) || 500;
    logger.error('[listUniquemOperations] failed', { error: error?.message || String(error) });
    return jsonError(res, status, status === 403 ? 'Forbidden' : 'Failed to list Uniquem operations data');
  }
});

export const saveUniquemProduct = onRequest({ region: REGION }, async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  try {
    const user = await ensureUniquemAccess(req);
    const product = normalizeUniquemProduct(req.body || {});
    const productId = normalizeDocId(req.body?.productId) || randomUUID();
    const ref = db.collection(UNIQUEM_PRODUCT_COLLECTION).doc(productId);
    const snap = await ref.get();
    const now = admin.firestore.FieldValue.serverTimestamp();
    await ref.set(
      {
        productId,
        ...product,
        createdAt: snap.exists ? snap.data()?.createdAt || now : now,
        updatedAt: now,
        updatedBy: user.uid,
        updatedByEmail: user.email,
      },
      { merge: false }
    );
    setCors(res);
    res.status(200).json({ ok: true, product: mapUniquemProductDoc(await ref.get()) });
  } catch (error) {
    const status = Number(error?.status) || 500;
    logger.error('[saveUniquemProduct] failed', { error: error?.message || String(error) });
    return jsonError(res, status, status === 403 ? 'Forbidden' : asString(error?.message || String(error)) || 'Failed to save product');
  }
});

export const saveUniquemWarehouse = onRequest({ region: REGION }, async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  try {
    const user = await ensureUniquemAccess(req);
    const warehouse = normalizeUniquemWarehouse(req.body || {});
    const warehouseId = normalizeDocId(req.body?.warehouseId) || randomUUID();
    const ref = db.collection(UNIQUEM_WAREHOUSE_COLLECTION).doc(warehouseId);
    await ref.set(
      {
        warehouseId,
        ...warehouse,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: user.uid,
        updatedByEmail: user.email,
      },
      { merge: true }
    );
    setCors(res);
    res.status(200).json({ ok: true, warehouse: mapUniquemWarehouseDoc(await ref.get()) });
  } catch (error) {
    const status = Number(error?.status) || 500;
    logger.error('[saveUniquemWarehouse] failed', { error: error?.message || String(error) });
    return jsonError(res, status, status === 403 ? 'Forbidden' : asString(error?.message || String(error)) || 'Failed to save warehouse');
  }
});

export const receiveUniquemInventory = onRequest({ region: REGION }, async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  try {
    const user = await ensureUniquemAccess(req);
    const lot = normalizeUniquemLot(req.body || {});
    const warehouseId = normalizeDocId(req.body?.warehouseId);
    const location = asString(req.body?.location).slice(0, 80) || 'Main';
    const quantity = normalizeUniquemQuantity(req.body?.quantity);
    const unit = normalizeUniquemUnit(req.body?.unit);
    if (!warehouseId || !quantity) return jsonError(res, 400, 'Warehouse and quantity are required.');
    const lotId = normalizeDocId(req.body?.lotId) || randomUUID();
    const movementId = randomUUID();
    const now = admin.firestore.FieldValue.serverTimestamp();
    await db.runTransaction(async (tx) => {
      tx.set(
        db.collection(UNIQUEM_LOT_COLLECTION).doc(lotId),
        {
          lotId,
          ...lot,
          createdAt: now,
          updatedAt: now,
          createdBy: user.uid,
          createdByEmail: user.email,
        },
        { merge: true }
      );
      tx.set(db.collection(UNIQUEM_MOVEMENT_COLLECTION).doc(movementId), {
        movementId,
        type: 'receipt',
        productId: lot.productId,
        lotId,
        warehouseId,
        location,
        quantity,
        unit,
        reason: 'Incoming stock receipt',
        referenceType: 'receipt',
        referenceId: movementId,
        notes: asString(req.body?.notes).slice(0, 1200),
        createdAt: now,
        createdBy: user.uid,
        createdByEmail: user.email,
      });
    });
    const data = await loadUniquemOperationsData();
    setCors(res);
    res.status(200).json({ ok: true, lotId, movementId, ...data, dashboard: buildUniquemDashboard(data) });
  } catch (error) {
    const status = Number(error?.status) || 500;
    logger.error('[receiveUniquemInventory] failed', { error: error?.message || String(error) });
    return jsonError(res, status, status === 403 ? 'Forbidden' : asString(error?.message || String(error)) || 'Failed to receive inventory');
  }
});

export const transferUniquemInventory = onRequest({ region: REGION }, async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  try {
    const user = await ensureUniquemAccess(req);
    const productId = normalizeDocId(req.body?.productId);
    const lotId = normalizeDocId(req.body?.lotId);
    const fromWarehouseId = normalizeDocId(req.body?.fromWarehouseId);
    const toWarehouseId = normalizeDocId(req.body?.toWarehouseId);
    const fromLocation = asString(req.body?.fromLocation).slice(0, 80) || 'Main';
    const toLocation = asString(req.body?.toLocation).slice(0, 80) || 'Main';
    const quantity = normalizeUniquemQuantity(req.body?.quantity);
    const unit = normalizeUniquemUnit(req.body?.unit);
    if (!productId || !lotId || !fromWarehouseId || !toWarehouseId || !quantity) return jsonError(res, 400, 'Product, lot, source, destination, and quantity are required.');
    const existing = await loadUniquemOperationsData();
    assertUniquemSufficientStock(existing.balances, { productId, lotId, warehouseId: fromWarehouseId, location: fromLocation }, quantity);
    const transferId = randomUUID();
    const now = admin.firestore.FieldValue.serverTimestamp();
    await db.runTransaction(async (tx) => {
      const outMovementId = randomUUID();
      const inMovementId = randomUUID();
      tx.set(db.collection(UNIQUEM_MOVEMENT_COLLECTION).doc(outMovementId), {
        movementId: outMovementId,
        type: 'transfer-out',
        productId,
        lotId,
        warehouseId: fromWarehouseId,
        location: fromLocation,
        quantity: -quantity,
        unit,
        reason: asString(req.body?.reason).slice(0, 280) || 'Inventory transfer',
        referenceType: 'transfer',
        referenceId: transferId,
        notes: asString(req.body?.notes).slice(0, 1200),
        createdAt: now,
        createdBy: user.uid,
        createdByEmail: user.email,
      });
      tx.set(db.collection(UNIQUEM_MOVEMENT_COLLECTION).doc(inMovementId), {
        movementId: inMovementId,
        type: 'transfer-in',
        productId,
        lotId,
        warehouseId: toWarehouseId,
        location: toLocation,
        quantity,
        unit,
        reason: asString(req.body?.reason).slice(0, 280) || 'Inventory transfer',
        referenceType: 'transfer',
        referenceId: transferId,
        notes: asString(req.body?.notes).slice(0, 1200),
        createdAt: now,
        createdBy: user.uid,
        createdByEmail: user.email,
      });
    });
    const data = await loadUniquemOperationsData();
    setCors(res);
    res.status(200).json({ ok: true, transferId, ...data, dashboard: buildUniquemDashboard(data) });
  } catch (error) {
    const status = Number(error?.status) || 500;
    logger.error('[transferUniquemInventory] failed', { error: error?.message || String(error) });
    return jsonError(res, status, status === 403 ? 'Forbidden' : asString(error?.message || String(error)) || 'Failed to transfer inventory');
  }
});

export const adjustUniquemInventory = onRequest({ region: REGION }, async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  try {
    const user = await ensureUniquemAccess(req);
    const movement = normalizeUniquemMovement({ ...req.body, type: 'adjustment', referenceType: 'adjustment' });
    if (!movement.reason) return jsonError(res, 400, 'Adjustment reason is required.');
    if (movement.quantity < 0) {
      const existing = await loadUniquemOperationsData();
      assertUniquemSufficientStock(existing.balances, movement, Math.abs(movement.quantity));
    }
    const movementId = randomUUID();
    await db.collection(UNIQUEM_MOVEMENT_COLLECTION).doc(movementId).set({
      movementId,
      ...movement,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: user.uid,
      createdByEmail: user.email,
    });
    const data = await loadUniquemOperationsData();
    setCors(res);
    res.status(200).json({ ok: true, movementId, ...data, dashboard: buildUniquemDashboard(data) });
  } catch (error) {
    const status = Number(error?.status) || 500;
    logger.error('[adjustUniquemInventory] failed', { error: error?.message || String(error) });
    return jsonError(res, status, status === 403 ? 'Forbidden' : asString(error?.message || String(error)) || 'Failed to adjust inventory');
  }
});

export const saveUniquemRecipe = onRequest({ region: REGION }, async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  try {
    const user = await ensureUniquemAccess(req);
    const recipe = normalizeUniquemRecipe(req.body || {});
    const recipeId = normalizeDocId(req.body?.recipeId) || randomUUID();
    const ref = db.collection(UNIQUEM_RECIPE_COLLECTION).doc(recipeId);
    await ref.set(
      {
        recipeId,
        ...recipe,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: user.uid,
        updatedByEmail: user.email,
      },
      { merge: true }
    );
    setCors(res);
    res.status(200).json({ ok: true, recipe: mapUniquemRecipeDoc(await ref.get()) });
  } catch (error) {
    const status = Number(error?.status) || 500;
    logger.error('[saveUniquemRecipe] failed', { error: error?.message || String(error) });
    return jsonError(res, status, status === 403 ? 'Forbidden' : asString(error?.message || String(error)) || 'Failed to save recipe');
  }
});

export const createUniquemBlendJob = onRequest({ region: REGION }, async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  try {
    const user = await ensureUniquemAccess(req);
    const job = normalizeUniquemBlendJob(req.body || {});
    const jobId = randomUUID();
    await db.collection(UNIQUEM_BLEND_JOB_COLLECTION).doc(jobId).set({
      jobId,
      ...job,
      status: 'planned',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: user.uid,
      createdByEmail: user.email,
    });
    const data = await loadUniquemOperationsData();
    setCors(res);
    res.status(200).json({ ok: true, jobId, ...data, dashboard: buildUniquemDashboard(data) });
  } catch (error) {
    const status = Number(error?.status) || 500;
    logger.error('[createUniquemBlendJob] failed', { error: error?.message || String(error) });
    return jsonError(res, status, status === 403 ? 'Forbidden' : asString(error?.message || String(error)) || 'Failed to create blend job');
  }
});

export const completeUniquemBlendJob = onRequest({ region: REGION }, async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  try {
    const user = await ensureUniquemAccess(req);
    const jobId = normalizeDocId(req.body?.jobId);
    if (!jobId) return jsonError(res, 400, 'jobId is required');
    const jobRef = db.collection(UNIQUEM_BLEND_JOB_COLLECTION).doc(jobId);
    const jobSnap = await jobRef.get();
    if (!jobSnap.exists) return jsonError(res, 404, 'Blend job not found');
    const job = mapUniquemBlendJobDoc(jobSnap);
    if (job.status !== 'planned') return jsonError(res, 400, 'Only planned blend jobs can be completed.');
    const data = await loadUniquemOperationsData();
    const balances = calculateUniquemBalances(data.movements);
    for (const input of job.inputs) {
      const available = balances
        .filter((item) => item.productId === input.productId && item.lotId === input.lotId && item.warehouseId === input.warehouseId && item.location === input.location)
        .reduce((sum, item) => sum + item.quantity, 0);
      if (available < input.quantity) return jsonError(res, 400, `Not enough inventory for input lot ${input.lotId}.`);
    }
    const outputLotId = randomUUID();
    const now = admin.firestore.FieldValue.serverTimestamp();
    await db.runTransaction(async (tx) => {
      for (const input of job.inputs) {
        const movementId = randomUUID();
        tx.set(db.collection(UNIQUEM_MOVEMENT_COLLECTION).doc(movementId), {
          movementId,
          type: 'blend-consume',
          productId: input.productId,
          lotId: input.lotId,
          warehouseId: input.warehouseId,
          location: input.location,
          quantity: -normalizeUniquemQuantity(input.quantity),
          unit: normalizeUniquemUnit(input.unit),
          reason: `Consumed by ${job.name}`,
          referenceType: 'blendJob',
          referenceId: jobId,
          createdAt: now,
          createdBy: user.uid,
          createdByEmail: user.email,
        });
      }
      tx.set(db.collection(UNIQUEM_LOT_COLLECTION).doc(outputLotId), {
        lotId: outputLotId,
        productId: job.outputProductId,
        lotNumber: job.outputLotNumber,
        supplier: 'Internal blend',
        supplierLot: '',
        receivedAt: new Date().toISOString().slice(0, 10),
        expiryDate: '',
        notes: job.notes,
        status: 'active',
        sourceBlendJobId: jobId,
        sourceInputs: job.inputs,
        createdAt: now,
        updatedAt: now,
        createdBy: user.uid,
        createdByEmail: user.email,
      });
      const movementId = randomUUID();
      tx.set(db.collection(UNIQUEM_MOVEMENT_COLLECTION).doc(movementId), {
        movementId,
        type: 'blend-produce',
        productId: job.outputProductId,
        lotId: outputLotId,
        warehouseId: job.warehouseId,
        location: job.location,
        quantity: job.outputQuantity,
        unit: job.outputUnit,
        reason: `Produced by ${job.name}`,
        referenceType: 'blendJob',
        referenceId: jobId,
        createdAt: now,
        createdBy: user.uid,
        createdByEmail: user.email,
      });
      tx.set(jobRef, { status: 'completed', outputLotId, completedAt: now, completedBy: user.uid, completedByEmail: user.email }, { merge: true });
    });
    const refreshed = await loadUniquemOperationsData();
    setCors(res);
    res.status(200).json({ ok: true, jobId, outputLotId, ...refreshed, dashboard: buildUniquemDashboard(refreshed) });
  } catch (error) {
    const status = Number(error?.status) || 500;
    logger.error('[completeUniquemBlendJob] failed', { error: error?.message || String(error) });
    return jsonError(res, status, status === 403 ? 'Forbidden' : asString(error?.message || String(error)) || 'Failed to complete blend job');
  }
});

export const cancelUniquemBlendJob = onRequest({ region: REGION }, async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  try {
    const user = await ensureUniquemAccess(req);
    const jobId = normalizeDocId(req.body?.jobId);
    if (!jobId) return jsonError(res, 400, 'jobId is required');
    await db.collection(UNIQUEM_BLEND_JOB_COLLECTION).doc(jobId).set(
      {
        status: 'cancelled',
        cancelledReason: asString(req.body?.reason).slice(0, 280),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: user.uid,
        updatedByEmail: user.email,
      },
      { merge: true }
    );
    const data = await loadUniquemOperationsData();
    setCors(res);
    res.status(200).json({ ok: true, jobId, ...data, dashboard: buildUniquemDashboard(data) });
  } catch (error) {
    const status = Number(error?.status) || 500;
    logger.error('[cancelUniquemBlendJob] failed', { error: error?.message || String(error) });
    return jsonError(res, status, status === 403 ? 'Forbidden' : 'Failed to cancel blend job');
  }
});

export const saveUniquemPrice = onRequest({ region: REGION }, async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  try {
    const user = await ensureUniquemAccess(req);
    const price = normalizeUniquemPrice(req.body || {});
    const priceId = normalizeDocId(req.body?.priceId) || randomUUID();
    const ref = db.collection(UNIQUEM_PRICE_COLLECTION).doc(priceId);
    await ref.set(
      {
        priceId,
        ...price,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: user.uid,
        updatedByEmail: user.email,
      },
      { merge: true }
    );
    setCors(res);
    res.status(200).json({ ok: true, price: mapUniquemPriceDoc(await ref.get()) });
  } catch (error) {
    const status = Number(error?.status) || 500;
    logger.error('[saveUniquemPrice] failed', { error: error?.message || String(error) });
    return jsonError(res, status, status === 403 ? 'Forbidden' : asString(error?.message || String(error)) || 'Failed to save price');
  }
});

export const createUniquemAttachmentUpload = onRequest({ region: REGION }, async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  try {
    await ensureUniquemAccess(req);
    const entityType = normalizeUniquemAttachmentEntityType(req.body?.entityType);
    const entityId = normalizeDocId(req.body?.entityId);
    const fileName = sanitizeUniquemFileName(req.body?.fileName);
    const contentType = asString(req.body?.contentType).toLowerCase();
    if (!entityId) return jsonError(res, 400, 'Attachment entity is required.');
    if (!isUniquemAttachmentContentType(contentType)) return jsonError(res, 400, 'Unsupported attachment file type.');
    const attachmentId = randomUUID();
    const path = buildUniquemAttachmentPath({ entityType, entityId, attachmentId, fileName });
    setCors(res);
    res.status(200).json({ ok: true, attachmentId, path, entityType, entityId, fileName, contentType });
  } catch (error) {
    const status = Number(error?.status) || 500;
    logger.error('[createUniquemAttachmentUpload] failed', { error: error?.message || String(error) });
    return jsonError(res, status, status === 403 ? 'Forbidden' : asString(error?.message || String(error)) || 'Failed to prepare attachment upload');
  }
});

export const saveUniquemAttachment = onRequest({ region: REGION }, async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  try {
    const user = await ensureUniquemAccess(req);
    const attachment = normalizeUniquemAttachment(req.body || {});
    const attachmentId = normalizeDocId(req.body?.attachmentId) || randomUUID();
    const expectedPrefix = `uniquem/${attachment.entityType}/${attachment.entityId}/${attachmentId}-`;
    if (!attachment.path.startsWith(expectedPrefix)) return jsonError(res, 400, 'Attachment path is invalid.');
    const ref = db.collection(UNIQUEM_ATTACHMENT_COLLECTION).doc(attachmentId);
    await ref.set(
      {
        attachmentId,
        ...attachment,
        uploadedBy: user.uid,
        uploadedByEmail: user.email,
        uploadedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    const data = await loadUniquemOperationsData();
    setCors(res);
    res.status(200).json({ ok: true, attachment: mapUniquemAttachmentDoc(await ref.get()), ...data, dashboard: buildUniquemDashboard(data) });
  } catch (error) {
    const status = Number(error?.status) || 500;
    logger.error('[saveUniquemAttachment] failed', { error: error?.message || String(error) });
    return jsonError(res, status, status === 403 ? 'Forbidden' : asString(error?.message || String(error)) || 'Failed to save attachment');
  }
});

export const archiveUniquemAttachment = onRequest({ region: REGION }, async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  try {
    const user = await ensureUniquemAccess(req);
    const attachmentId = normalizeDocId(req.body?.attachmentId);
    if (!attachmentId) return jsonError(res, 400, 'attachmentId is required');
    await db.collection(UNIQUEM_ATTACHMENT_COLLECTION).doc(attachmentId).set(
      {
        status: 'archived',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: user.uid,
        updatedByEmail: user.email,
      },
      { merge: true }
    );
    const data = await loadUniquemOperationsData();
    setCors(res);
    res.status(200).json({ ok: true, attachmentId, ...data, dashboard: buildUniquemDashboard(data) });
  } catch (error) {
    const status = Number(error?.status) || 500;
    logger.error('[archiveUniquemAttachment] failed', { error: error?.message || String(error) });
    return jsonError(res, status, status === 403 ? 'Forbidden' : 'Failed to archive attachment');
  }
});

export const listUniquemAttachments = onRequest({ region: REGION }, async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  try {
    await ensureUniquemAccess(req);
    const entityType = req.body?.entityType ? normalizeUniquemAttachmentEntityType(req.body.entityType) : '';
    const entityId = req.body?.entityId ? normalizeDocId(req.body.entityId) : '';
    const snap = await db.collection(UNIQUEM_ATTACHMENT_COLLECTION).orderBy('updatedAt', 'desc').limit(500).get();
    const items = snap.docs
      .map(mapUniquemAttachmentDoc)
      .filter((item) => item.status !== 'archived')
      .filter((item) => (!entityType || item.entityType === entityType) && (!entityId || item.entityId === entityId));
    setCors(res);
    res.status(200).json({ ok: true, items, attachmentsByEntity: groupUniquemAttachments(items) });
  } catch (error) {
    const status = Number(error?.status) || 500;
    logger.error('[listUniquemAttachments] failed', { error: error?.message || String(error) });
    return jsonError(res, status, status === 403 ? 'Forbidden' : 'Failed to list attachments');
  }
});

export const generateUniquem3DScene = onRequest(
  { region: REGION, timeoutSeconds: 120, memory: '1GiB', secrets: [OPENAI_API_KEY] },
  async (req, res) => {
    if (preflight(req, res)) return;
    if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

    try {
      await ensureUniquemAccess(req);
      const prompt = asString(req.body?.prompt).slice(0, UNIQUEM_CREATOR_PROMPT_MAX_CHARS);
      if (!prompt) return jsonError(res, 400, 'Prompt is required.');
      const image = normalizeUniquemCreatorImage(req.body?.image || null);
      const previousScene = req.body?.previousScene && typeof req.body.previousScene === 'object' ? req.body.previousScene : null;

      const generated = await callOpenAIUniquemScene({ prompt, image, previousScene });
      setCors(res);
      res.status(200).json({ ok: true, scene: generated.scene, model: generated.model });
    } catch (error) {
      const status = Number(error?.status) || 500;
      logger.error('[generateUniquem3DScene] failed', { error: error?.message || String(error) });
      return jsonError(res, status, status === 403 ? 'Forbidden' : asString(error?.message || String(error)) || 'Failed to generate 3D scene');
    }
  }
);

export const listUniquem3DModels = onRequest({ region: REGION }, async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  try {
    await ensureUniquemAccess(req);
    const snap = await db.collection(UNIQUEM_3D_MODEL_COLLECTION).orderBy('updatedAt', 'desc').limit(200).get();
    const items = filterActiveUniquem3DModels(snap.docs.map(mapUniquem3DModelDoc), 100);
    setCors(res);
    res.status(200).json({ ok: true, items });
  } catch (error) {
    const status = Number(error?.status) || 500;
    logger.error('[listUniquem3DModels] failed', { error: error?.message || String(error) });
    return jsonError(res, status, status === 403 ? 'Forbidden' : 'Failed to list 3D models');
  }
});

export const getUniquem3DModel = onRequest({ region: REGION }, async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  try {
    await ensureUniquemAccess(req);
    const loaded = await loadActiveUniquem3DModel(req.body?.modelId);
    const versionSnap = await loaded.ref.collection('versions').orderBy('createdAt', 'desc').limit(20).get();
    const versions = versionSnap.docs.map(mapUniquem3DVersionDoc);
    setCors(res);
    res.status(200).json({ ok: true, model: loaded.model, versions });
  } catch (error) {
    const status = Number(error?.status) || 500;
    logger.error('[getUniquem3DModel] failed', { error: error?.message || String(error) });
    return jsonError(res, status, status === 403 ? 'Forbidden' : asString(error?.message || String(error)) || 'Failed to load 3D model');
  }
});

export const createUniquem3DModel = onRequest(
  { region: REGION, timeoutSeconds: 120, memory: '1GiB', secrets: [OPENAI_API_KEY] },
  async (req, res) => {
    if (preflight(req, res)) return;
    if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

    try {
      const user = await ensureUniquemAccess(req);
      const prompt = asString(req.body?.prompt).slice(0, UNIQUEM_CREATOR_PROMPT_MAX_CHARS);
      if (!prompt) return jsonError(res, 400, 'Prompt is required.');
      const image = normalizeUniquemCreatorImage(req.body?.image || null);
      const generated = await callOpenAIUniquemScene({ prompt, image, previousScene: null });
      const scene = normalizeUniquemScene(generated.scene);
      const now = admin.firestore.FieldValue.serverTimestamp();
      const modelId = randomUUID();
      const versionId = randomUUID();
      const ref = db.collection(UNIQUEM_3D_MODEL_COLLECTION).doc(modelId);
      await ref.set({
        modelId,
        title: scene.title,
        summary: scene.summary,
        scene,
        status: 'active',
        createdBy: user.uid,
        createdByEmail: user.email,
        createdAt: now,
        updatedBy: user.uid,
        updatedByEmail: user.email,
        updatedAt: now,
        latestPrompt: prompt,
        versionCount: 1,
      });
      await ref.collection('versions').doc(versionId).set(
        buildUniquemVersionDoc({
          versionId,
          scene,
          prompt,
          model: generated.model,
          source: 'ai-generate',
          user,
        })
      );

      const [saved, versionSnap] = await Promise.all([ref.get(), ref.collection('versions').orderBy('createdAt', 'desc').limit(20).get()]);
      setCors(res);
      res.status(200).json({ ok: true, model: mapUniquem3DModelDoc(saved), versions: versionSnap.docs.map(mapUniquem3DVersionDoc) });
    } catch (error) {
      const status = Number(error?.status) || 500;
      logger.error('[createUniquem3DModel] failed', { error: error?.message || String(error) });
      return jsonError(res, status, status === 403 ? 'Forbidden' : asString(error?.message || String(error)) || 'Failed to create 3D model');
    }
  }
);

export const reviseUniquem3DModel = onRequest(
  { region: REGION, timeoutSeconds: 120, memory: '1GiB', secrets: [OPENAI_API_KEY] },
  async (req, res) => {
    if (preflight(req, res)) return;
    if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

    try {
      const user = await ensureUniquemAccess(req);
      const prompt = asString(req.body?.prompt).slice(0, UNIQUEM_CREATOR_PROMPT_MAX_CHARS);
      if (!prompt) return jsonError(res, 400, 'Prompt is required.');
      const image = normalizeUniquemCreatorImage(req.body?.image || null);
      const loaded = await loadActiveUniquem3DModel(req.body?.modelId);
      const generated = await callOpenAIUniquemScene({ prompt, image, previousScene: loaded.model.scene });
      const scene = normalizeUniquemScene(generated.scene);
      const versionId = randomUUID();
      await loaded.ref.set(
        {
          title: scene.title,
          summary: scene.summary,
          scene,
          updatedBy: user.uid,
          updatedByEmail: user.email,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          latestPrompt: prompt,
          versionCount: admin.firestore.FieldValue.increment(1),
        },
        { merge: true }
      );
      await loaded.ref.collection('versions').doc(versionId).set(
        buildUniquemVersionDoc({
          versionId,
          scene,
          prompt,
          model: generated.model,
          source: 'ai-edit',
          user,
        })
      );

      const [saved, versionSnap] = await Promise.all([loaded.ref.get(), loaded.ref.collection('versions').orderBy('createdAt', 'desc').limit(20).get()]);
      setCors(res);
      res.status(200).json({ ok: true, model: mapUniquem3DModelDoc(saved), versions: versionSnap.docs.map(mapUniquem3DVersionDoc) });
    } catch (error) {
      const status = Number(error?.status) || 500;
      logger.error('[reviseUniquem3DModel] failed', { error: error?.message || String(error) });
      return jsonError(res, status, status === 403 ? 'Forbidden' : asString(error?.message || String(error)) || 'Failed to revise 3D model');
    }
  }
);

export const restoreUniquem3DModelVersion = onRequest({ region: REGION }, async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  try {
    const user = await ensureUniquemAccess(req);
    const loaded = await loadActiveUniquem3DModel(req.body?.modelId);
    const sourceVersionId = normalizeDocId(req.body?.versionId);
    if (!sourceVersionId) return jsonError(res, 400, 'versionId is required');
    const sourceSnap = await loaded.ref.collection('versions').doc(sourceVersionId).get();
    if (!sourceSnap.exists) return jsonError(res, 404, 'Version not found');
    const sourceVersion = mapUniquem3DVersionDoc(sourceSnap);
    const scene = normalizeUniquemScene(sourceVersion.scene);
    const versionId = randomUUID();
    await loaded.ref.set(
      {
        title: scene.title,
        summary: scene.summary,
        scene,
        updatedBy: user.uid,
        updatedByEmail: user.email,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        latestPrompt: `Restored version ${sourceVersionId}`,
        versionCount: admin.firestore.FieldValue.increment(1),
      },
      { merge: true }
    );
    await loaded.ref.collection('versions').doc(versionId).set(
      buildUniquemVersionDoc({
        versionId,
        scene,
        prompt: `Restored version ${sourceVersionId}`,
        model: sourceVersion.model,
        source: 'restore',
        user,
      })
    );

    const [saved, versionSnap] = await Promise.all([loaded.ref.get(), loaded.ref.collection('versions').orderBy('createdAt', 'desc').limit(20).get()]);
    setCors(res);
    res.status(200).json({ ok: true, model: mapUniquem3DModelDoc(saved), versions: versionSnap.docs.map(mapUniquem3DVersionDoc) });
  } catch (error) {
    const status = Number(error?.status) || 500;
    logger.error('[restoreUniquem3DModelVersion] failed', { error: error?.message || String(error) });
    return jsonError(res, status, status === 403 ? 'Forbidden' : asString(error?.message || String(error)) || 'Failed to restore 3D model version');
  }
});

export const archiveUniquem3DModel = onRequest({ region: REGION }, async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  try {
    const user = await ensureUniquemAccess(req);
    const loaded = await loadActiveUniquem3DModel(req.body?.modelId);
    await loaded.ref.set(
      {
        status: 'archived',
        updatedBy: user.uid,
        updatedByEmail: user.email,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    setCors(res);
    res.status(200).json({ ok: true, modelId: loaded.model.modelId });
  } catch (error) {
    const status = Number(error?.status) || 500;
    logger.error('[archiveUniquem3DModel] failed', { error: error?.message || String(error) });
    return jsonError(res, status, status === 403 ? 'Forbidden' : asString(error?.message || String(error)) || 'Failed to archive 3D model');
  }
});

export const listMudProgramDrafts = onRequest({ region: REGION }, async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  try {
    const user = await ensureMudProgramAccess(req);
    const snap = await db.collection(MUD_PROGRAM_DRAFT_COLLECTION).orderBy('updatedAt', 'desc').limit(100).get();
    const items = snap.docs
      .map(mapMudProgramDraftDoc)
      .filter((draft) => user.role === 'admin' || draft.createdBy === user.uid);

    setCors(res);
    res.status(200).json({ ok: true, items });
  } catch (error) {
    const status = Number(error?.status) || 500;
    logger.error('[listMudProgramDrafts] failed', { error: error?.message || String(error) });
    return jsonError(res, status, status === 403 ? 'Forbidden' : 'Failed to list mud program drafts');
  }
});

export const __testables = {
  isValidTemporaryPassword,
  normalizeMiniAppIds,
  normalizeFormationTops,
  normalizeCasingStrings,
  normalizeVolumeRows,
  isPdfContentType,
  normalizeMudOverview,
  normalizeMudSections,
  buildMudProgramPagesFromExtraction,
  firestoreSafeGeneratedProgramContent,
  isOpenAIReferenceAsset,
  normalizeUniquemScene,
  normalizeUniquemSceneObject,
  isUniquemCreatorImageContentType,
  normalizeUniquemCreatorImage,
  normalizeUniquemModelStatus,
  mapUniquem3DModelDoc,
  mapUniquem3DVersionDoc,
  filterActiveUniquem3DModels,
  buildUniquemVersionDoc,
  normalizeUniquemProduct,
  normalizeUniquemWarehouse,
  normalizeUniquemLot,
  normalizeUniquemMovement,
  normalizeUniquemRecipe,
  normalizeUniquemBlendJob,
  normalizeUniquemPrice,
  normalizeUniquemAttachment,
  isUniquemAttachmentContentType,
  buildUniquemAttachmentPath,
  groupUniquemAttachments,
  uniquemAvailableQuantity,
  assertUniquemSufficientStock,
  calculateUniquemBalances,
  buildUniquemDashboard,
  normalizeAdminUserEmailInput,
  emailBelongsToAnotherUser,
  canEditInviteStatus,
  canResendInviteStatus,
  inviteIdentity,
};
