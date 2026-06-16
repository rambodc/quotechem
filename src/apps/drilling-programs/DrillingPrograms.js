import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { FiCheckCircle, FiCpu, FiFileText, FiPrinter, FiRefreshCw, FiUploadCloud } from 'react-icons/fi';
import { UserContext } from '../../App';
import { postJson } from '../../lib/api';
import './DrillingPrograms.css';

const desktopQuery = '(min-width: 980px)';
const SECTION_COLORS = ['#108a24', '#0b63ce', '#b45309', '#7c3aed', '#c026d3', '#0f766e', '#be123c'];

const emptyOverview = {
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

const emptySection = {
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
  wellProfile: '',
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

function normalizeWellProfile(value) {
  const profile = String(value || '').trim().toLowerCase();
  if (['both', 'curve', 'build', 'vertical-horizontal', 'vertical + horizontal', 'vertical and horizontal'].includes(profile)) return 'both';
  if (['horizontal', 'lateral'].includes(profile)) return 'horizontal';
  if (['vertical', 'surface', 'intermediate'].includes(profile)) return 'vertical';
  return '';
}

function inferWellProfile(section = {}, overview = {}) {
  const explicit = normalizeWellProfile(section.wellProfile || section.profileType || section.trajectory);
  if (explicit) return explicit;

  const searchable = [
    section.name,
    section.mudSystem,
    section.riskNotes,
    section.programNotes,
    section.keyProducts,
    overview.lateralLength,
    overview.kickoffPoint,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (/\b(curve|build|kickoff|heel|landing|build section|vertical.*lateral|vertical.*horizontal)\b/.test(searchable)) {
    return 'both';
  }

  if (/\b(horizontal|lateral|toe|k lateral|production hole)\b/.test(searchable)) {
    return 'horizontal';
  }

  return 'vertical';
}

function sectionAccent(index = 0) {
  return SECTION_COLORS[Math.abs(Number(index) || 0) % SECTION_COLORS.length];
}

function splitPlainLines(value) {
  return String(value || '')
    .split(/\n+|\s\*\s+|•\s+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function normalizeProperties(value = [], section = {}) {
  const rows = Array.isArray(value)
    ? value
        .map((item) => ({
          label: String(item?.label || item?.name || '').slice(0, 80),
          value: String(item?.value || '').slice(0, 160),
        }))
        .filter((item) => item.label || item.value)
    : [];
  if (rows.length) return rows;
  return [
    ['Viscosity (s/L)', section.viscosityRange],
    ['Density (kg/m3)', section.densityRange],
    ['pH', section.ph],
    ['Fluid Loss (cc/30min)', section.fluidLoss],
  ]
    .filter(([, value]) => String(value || '').trim())
    .map(([label, value]) => ({ label, value }));
}

function normalizeProcedures(value = [], section = {}) {
  const groups = Array.isArray(value)
    ? value
        .map((item) => ({
          heading: String(item?.heading || item?.title || '').slice(0, 120),
          lines: (Array.isArray(item?.lines) ? item.lines : splitPlainLines(item?.body || item?.text)).map((line) => String(line || '').slice(0, 500)).filter(Boolean),
        }))
        .filter((item) => item.heading || item.lines.length)
    : [];
  if (groups.length) return groups;
  return [
    ['Mud Up / Treatment', section.keyProducts],
    ['Operational Procedure', section.programNotes],
    ['Risks / Contingencies', section.riskNotes],
  ]
    .filter(([, body]) => String(body || '').trim())
    .map(([heading, body]) => ({ heading, lines: splitPlainLines(body) }));
}

function normalizeRows(rows, emptyRow) {
  return (Array.isArray(rows) ? rows : []).map((row) =>
    Object.fromEntries(Object.keys(emptyRow).map((key) => [key, String(row?.[key] || '')]))
  );
}

function formatDate(value) {
  if (!value) return 'Not saved yet';
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  } catch {
    return value;
  }
}

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === 'undefined') return true;
    if (typeof window.matchMedia === 'function') return window.matchMedia(desktopQuery).matches;
    return window.innerWidth >= 980;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    if (typeof window.matchMedia !== 'function') {
      const onResize = () => setIsDesktop(window.innerWidth >= 980);
      window.addEventListener('resize', onResize);
      return () => window.removeEventListener('resize', onResize);
    }
    const media = window.matchMedia(desktopQuery);
    const onChange = () => setIsDesktop(media.matches);
    onChange();
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', onChange);
      return () => media.removeEventListener('change', onChange);
    }
    media.addListener(onChange);
    return () => media.removeListener(onChange);
  }, []);

  return isDesktop;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Unable to read PDF file'));
    reader.readAsDataURL(file);
  });
}

function normalizeDraft(draft = {}) {
  const overview = { ...emptyOverview, ...(draft.overview || {}) };
  const sections = Array.isArray(draft.sections) && draft.sections.length
    ? draft.sections.map((section, index) => ({
        ...emptySection,
        ...section,
        id: section.id || `section-${index + 1}`,
        name: section.name || `Section ${index + 1}`,
        properties: normalizeProperties(section.properties, section),
        procedures: normalizeProcedures(section.procedures, section),
      }))
    : [];
  const formationTops = normalizeRows(draft.formationTops, emptyFormationTop);
  const casingStrings = normalizeRows(draft.casingStrings, emptyCasingString);
  const volumes = normalizeRows(draft.volumes, emptyVolumeRow);
  const pages = Array.isArray(draft.pages) && draft.pages.length
    ? draft.pages.map((page, index) => {
        if (page?.type !== 'section') {
          const type = page?.type === 'wellInfo' ? 'wellInfo' : 'cover';
          return {
            ...page,
            id: type === 'cover' && page?.id === 'overview' ? 'cover' : page?.id || type,
            type,
            title: page?.title || (type === 'wellInfo' ? 'Well Information' : 'Drilling Fluid Program'),
            data: type === 'wellInfo'
              ? {
                  overview,
                  formationTops,
                  casingStrings,
                  volumes,
                  ...(page?.data || {}),
                }
              : { ...overview, ...(page?.data || {}) },
          };
        }
        const sectionIndex = sections.findIndex((section) => section.id && section.id === page.sectionId);
        const colorIndex = sectionIndex >= 0 ? sectionIndex : Math.max(index - 1, 0);
        const pageData = { ...emptySection, ...(page.data || {}) };
        return {
          ...page,
          data: {
            ...pageData,
            wellProfile: inferWellProfile(pageData, overview),
            sectionNumber: pageData.sectionNumber || colorIndex + 1,
            sectionAccent: pageData.sectionAccent || sectionAccent(colorIndex),
          },
        };
      })
    : pagesFromExtraction(overview, sections, { formationTops, casingStrings, volumes });
  if (!pages.some((page) => page.type === 'wellInfo')) {
    pages.splice(1, 0, {
      id: 'well-info',
      type: 'wellInfo',
      title: 'Well Information',
      data: { overview, formationTops, casingStrings, volumes },
    });
  }
  return {
    draftId: draft.draftId || draft.id || '',
    status: draft.status || 'local',
    sourceFileName: draft.sourceFileName || draft.fileName || '',
    overview,
    formationTops,
    casingStrings,
    volumes,
    sections,
    pages,
    extractionError: draft.extractionError || draft.error || '',
    updatedAt: draft.updatedAt || '',
    createdAt: draft.createdAt || '',
  };
}

function pagesFromExtraction(overview, sections, wellInfo = {}) {
  const pageList = [
    {
      id: 'cover',
      type: 'cover',
      title: overview.programTitle || 'Drilling Fluid Program',
      data: {
        ...overview,
        executiveSummary:
          overview.sourceSummary ||
          'Review the extracted drilling program details, confirm the planned intervals, and refine the mud program before export.',
      },
    },
    {
      id: 'well-info',
      type: 'wellInfo',
      title: 'Well Information',
      data: {
        overview,
        formationTops: wellInfo.formationTops || [],
        casingStrings: wellInfo.casingStrings || [],
        volumes: wellInfo.volumes || [],
      },
    },
  ];

  sections.forEach((section, index) => {
    const sectionData = {
      ...emptySection,
      ...section,
      wellProfile: inferWellProfile(section, overview),
      sectionNumber: index + 1,
      sectionAccent: section.sectionAccent || sectionAccent(index),
    };
    pageList.push({
      id: section.id || `section-${index + 1}`,
      type: 'section',
      title: section.name || `Section ${index + 1}`,
      sectionId: section.id || `section-${index + 1}`,
      data: sectionData,
    });
  });

  return pageList;
}

function safePages(draft) {
  if (!draft) return [];
  return Array.isArray(draft.pages) && draft.pages.length
    ? draft.pages
    : pagesFromExtraction(draft.overview || emptyOverview, draft.sections || [], {
        formationTops: draft.formationTops || [],
        casingStrings: draft.casingStrings || [],
        volumes: draft.volumes || [],
      });
}

function pageLabel(page, index) {
  if (page.type === 'cover') return 'Cover';
  if (page.type === 'wellInfo') return 'Well Info';
  return `Section ${Math.max(1, index - 1)}`;
}

export default function DrillingPrograms() {
  const user = useContext(UserContext);
  const isDesktop = useIsDesktop();
  const [stage, setStage] = useState('upload');
  const [drafts, setDrafts] = useState([]);
  const [draft, setDraft] = useState(null);
  const [selectedPageId, setSelectedPageId] = useState('cover');
  const [selectedFile, setSelectedFile] = useState(null);
  const [assistantPrompt, setAssistantPrompt] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [improving, setImproving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const saveTimerRef = useRef(null);
  const lastSavedRef = useRef('');

  const pages = useMemo(() => safePages(draft), [draft]);
  const selectedPage = pages.find((page) => page.id === selectedPageId) || pages[0] || null;

  const loadDrafts = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await postJson('listMudProgramDrafts', {}, { authed: true });
      setDrafts(Array.isArray(data.items) ? data.items.map(normalizeDraft) : []);
    } catch (err) {
      setError(err?.message || 'Unable to load mud program drafts.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDrafts();
  }, [loadDrafts]);

  useEffect(() => {
    if (!draft?.draftId || stage === 'upload') return undefined;
    const serializable = JSON.stringify({
      overview: draft.overview,
      formationTops: draft.formationTops,
      casingStrings: draft.casingStrings,
      volumes: draft.volumes,
      sections: draft.sections,
      pages: draft.pages,
      status: draft.status,
    });
    if (!lastSavedRef.current) {
      lastSavedRef.current = serializable;
      return undefined;
    }
    if (serializable === lastSavedRef.current) return undefined;

    window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(async () => {
      setSaving(true);
      try {
        await postJson(
          'updateMudProgramDraft',
          {
            draftId: draft.draftId,
            overview: draft.overview,
            formationTops: draft.formationTops,
            casingStrings: draft.casingStrings,
            volumes: draft.volumes,
            sections: draft.sections,
            pages: draft.pages,
            status: draft.status,
          },
          { authed: true }
        );
        lastSavedRef.current = serializable;
      } catch (err) {
        setError(err?.message || 'Unable to autosave draft.');
      } finally {
        setSaving(false);
      }
    }, 700);

    return () => window.clearTimeout(saveTimerRef.current);
  }, [draft, stage]);

  const openDraft = (nextDraft) => {
    const normalized = normalizeDraft(nextDraft);
    setDraft(normalized);
    setSelectedPageId(normalized.pages[0]?.id || 'cover');
    setStage(normalized.pages.length ? 'editor' : 'review');
    lastSavedRef.current = JSON.stringify({
      overview: normalized.overview,
      formationTops: normalized.formationTops,
      casingStrings: normalized.casingStrings,
      volumes: normalized.volumes,
      sections: normalized.sections,
      pages: normalized.pages,
      status: normalized.status,
    });
    setMessage('');
    setError('');
  };

  const uploadAndExtract = async (event) => {
    event.preventDefault();
    if (!selectedFile) {
      setError('Choose a drilling program PDF first.');
      return;
    }
    if (selectedFile.type && selectedFile.type !== 'application/pdf') {
      setError('Only PDF files are supported in this version.');
      return;
    }

    setUploading(true);
    setMessage('');
    setError('');
    try {
      const fileData = await fileToDataUrl(selectedFile);
      const created = await postJson(
        'createMudProgramDraft',
        {
          fileName: selectedFile.name,
          contentType: selectedFile.type || 'application/pdf',
          fileData,
        },
        { authed: true }
      );
      const extracted = await postJson('extractMudProgramDraft', { draftId: created.draft?.draftId }, { authed: true });
      const normalized = normalizeDraft(extracted.draft || created.draft);
      setDraft(normalized);
      setStage('review');
      setSelectedPageId('cover');
      setMessage('Extraction complete. Review the well data before creating pages.');
      lastSavedRef.current = '';
      await loadDrafts();
    } catch (err) {
      setError(err?.message || 'Unable to extract this drilling program.');
    } finally {
      setUploading(false);
    }
  };

  const updateOverview = (key, value) => {
    setDraft((prev) => ({ ...prev, overview: { ...prev.overview, [key]: value } }));
  };

  const updateSection = (sectionId, key, value) => {
    setDraft((prev) => ({
      ...prev,
      sections: prev.sections.map((section) => (section.id === sectionId ? { ...section, [key]: value } : section)),
    }));
  };

  const updateTableRow = (tableKey, rowIndex, key, value) => {
    setDraft((prev) => ({
      ...prev,
      [tableKey]: (prev[tableKey] || []).map((row, index) => (index === rowIndex ? { ...row, [key]: value } : row)),
    }));
  };

  const addTableRow = (tableKey, emptyRow) => {
    setDraft((prev) => ({
      ...prev,
      [tableKey]: [...(prev[tableKey] || []), { ...emptyRow }],
    }));
  };

  const addSection = () => {
    setDraft((prev) => {
      const id = `section-${Date.now()}`;
      return {
        ...prev,
        sections: [...prev.sections, { ...emptySection, id, name: `Section ${prev.sections.length + 1}` }],
      };
    });
  };

  const createPages = () => {
    setDraft((prev) => {
      const pages = pagesFromExtraction(prev.overview, prev.sections, {
        formationTops: prev.formationTops,
        casingStrings: prev.casingStrings,
        volumes: prev.volumes,
      });
      setSelectedPageId(pages[0]?.id || 'cover');
      return { ...prev, status: 'editing', pages };
    });
    setStage('editor');
    setMessage('Editable mud program pages created.');
  };

  const updatePageData = (key, value) => {
    if (!selectedPage) return;
    setDraft((prev) => ({
      ...prev,
      pages: prev.pages.map((page) =>
        page.id === selectedPage.id ? { ...page, data: { ...page.data, [key]: value }, title: key === 'name' ? value : page.title } : page
      ),
    }));
  };

  const improveSelectedPage = async () => {
    if (!draft?.draftId || !selectedPage) return;
    setImproving(true);
    setMessage('');
    setError('');
    try {
      const data = await postJson(
        'improveMudProgramPage',
        {
          draftId: draft.draftId,
          pageId: selectedPage.id,
          instruction: assistantPrompt || 'Improve this mud program page using the uploaded drilling program source.',
        },
        { authed: true }
      );
      const improvedPage = data.page;
      setDraft((prev) => ({
        ...prev,
        pages: prev.pages.map((page) => (page.id === improvedPage.id ? improvedPage : page)),
      }));
      setAssistantPrompt('');
      setMessage('Selected page improved.');
    } catch (err) {
      setError(err?.message || 'Unable to improve selected page.');
    } finally {
      setImproving(false);
    }
  };

  if (!isDesktop) {
    return (
      <div className="drilling-programs-page desktop-required">
        <FiFileText aria-hidden="true" />
        <h1>Drilling Programs is desktop-only</h1>
        <p>
          This mud program editor needs a wide screen for the page preview, field editor, and print layout. Open this
          mini app on a desktop or laptop to upload a drilling program PDF and build the final mud program.
        </p>
      </div>
    );
  }

  return (
    <div className="drilling-programs-page">
      <header className="programs-hero">
        <div>
          <p>Drilling Programs</p>
          <h1>Build portrait mud programs from an uploaded drilling program PDF.</h1>
          <span>
            Upload the oil-company drilling program, review the extracted well sections, edit each printable page, then
            export through browser print or Save as PDF.
          </span>
        </div>
        <div className="program-status">
          <strong>{user?.email || 'Signed in'}</strong>
          <span>{saving ? 'Autosaving...' : 'Autosave ready'}</span>
        </div>
      </header>

      {message ? <div className="program-alert success">{message}</div> : null}
      {error ? <div className="program-alert error">{error}</div> : null}

      {stage === 'upload' ? (
        <UploadStage
          selectedFile={selectedFile}
          setSelectedFile={setSelectedFile}
          uploading={uploading}
          onSubmit={uploadAndExtract}
          loading={loading}
          drafts={drafts}
          onOpenDraft={openDraft}
        />
      ) : null}

      {stage === 'review' && draft ? (
        <ReviewStage
          draft={draft}
          updateOverview={updateOverview}
          updateSection={updateSection}
          updateTableRow={updateTableRow}
          addTableRow={addTableRow}
          addSection={addSection}
          onBack={() => setStage('upload')}
          onCreatePages={createPages}
        />
      ) : null}

      {stage === 'editor' && draft ? (
        <EditorStage
          draft={draft}
          pages={pages}
          selectedPage={selectedPage}
          selectedPageId={selectedPageId}
          setSelectedPageId={setSelectedPageId}
          updatePageData={updatePageData}
          assistantPrompt={assistantPrompt}
          setAssistantPrompt={setAssistantPrompt}
          improveSelectedPage={improveSelectedPage}
          improving={improving}
          onReview={() => setStage('review')}
        />
      ) : null}
    </div>
  );
}

function UploadStage({ selectedFile, setSelectedFile, uploading, onSubmit, loading, drafts, onOpenDraft }) {
  return (
    <div className="program-upload-grid">
      <form className="program-panel upload-panel" onSubmit={onSubmit}>
        <div className="panel-title">
          <FiUploadCloud aria-hidden="true" />
          <div>
            <h2>Upload drilling program PDF</h2>
            <p>Use the oil-company drilling program or stick diagram PDF as the source.</p>
          </div>
        </div>
        <label className="drop-zone">
          <input
            type="file"
            accept="application/pdf,.pdf"
            onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
          />
          <FiFileText aria-hidden="true" />
          <strong>{selectedFile ? selectedFile.name : 'Choose PDF file'}</strong>
          <span>AI extraction starts after upload. You will review everything before pages are created.</span>
        </label>
        <button className="primary-action" type="submit" disabled={uploading}>
          {uploading ? <FiRefreshCw aria-hidden="true" /> : <FiCpu aria-hidden="true" />}
          {uploading ? 'Extracting source PDF...' : 'Upload and extract'}
        </button>
      </form>

      <aside className="program-panel draft-list-panel">
        <div className="program-panel-head">
          <h2>Recent drafts</h2>
          <span>{loading ? 'Loading' : `${drafts.length} drafts`}</span>
        </div>
        <div className="draft-list">
          {drafts.length ? (
            drafts.map((item) => (
              <button key={item.draftId} className="draft-card" type="button" onClick={() => onOpenDraft(item)}>
                <strong>{item.overview.programTitle || item.overview.wellName || item.sourceFileName || 'Untitled mud program'}</strong>
                <span>{item.sourceFileName || 'Uploaded source PDF'}</span>
                <small>{formatDate(item.updatedAt || item.createdAt)}</small>
              </button>
            ))
          ) : (
            <p className="muted">No mud program drafts yet.</p>
          )}
        </div>
      </aside>
    </div>
  );
}

function ReviewStage({ draft, updateOverview, updateSection, updateTableRow, addTableRow, addSection, onBack, onCreatePages }) {
  return (
    <div className="program-panel review-panel">
      <div className="program-panel-head">
        <div>
          <h2>Review extraction</h2>
          <span>Correct the AI-filled well data and section intervals before creating pages.</span>
        </div>
        <button className="secondary-action" type="button" onClick={onBack}>
          Upload another PDF
        </button>
      </div>
      {draft.extractionError ? <div className="program-alert error">{draft.extractionError}</div> : null}
      <div className="review-grid">
        {[
          ['programTitle', 'Program title'],
          ['operator', 'Operator'],
          ['consultant', 'Consultant'],
          ['mudCompany', 'Mud company'],
          ['wellName', 'Well name'],
          ['uwi', 'UWI / API'],
          ['license', 'License'],
          ['afe', 'AFE'],
          ['rig', 'Rig'],
          ['location', 'Location'],
          ['fieldZone', 'Field / zone'],
          ['programDate', 'Date'],
          ['programVersion', 'Version'],
          ['warehouse', 'Warehouse'],
          ['attention', 'Attention'],
          ['salesRep', 'Sales rep'],
          ['salesRepPhone', 'Sales rep phone'],
          ['groundElevation', 'Ground elevation'],
          ['rfElevation', 'RF elevation'],
          ['rfGround', 'RF-ground'],
          ['totalMd', 'Total MD'],
          ['totalMetersDrilled', 'Total drilled'],
          ['lateralLength', 'Lateral length'],
          ['kickoffPoint', 'Kickoff point'],
        ].map(([key, label]) => (
          <label key={key}>
            {label}
            <input value={draft.overview[key] || ''} onChange={(event) => updateOverview(key, event.target.value)} />
          </label>
        ))}
        <label className="span-2">
          Objective / source summary
          <textarea
            rows={4}
            value={draft.overview.objective || draft.overview.sourceSummary || ''}
            onChange={(event) => updateOverview('objective', event.target.value)}
          />
        </label>
      </div>

      <ReviewTable
        title="Formation Tops"
        tableKey="formationTops"
        rows={draft.formationTops}
        columns={[
          ['formation', 'Formation'],
          ['md', 'MD'],
          ['tvd', 'TVD'],
          ['lithology', 'Lithology'],
          ['gradient', 'Gradient'],
          ['emd', 'EMD'],
          ['pressure', 'Pressure'],
          ['h2s', 'H2S'],
          ['comment', 'Comment'],
        ]}
        emptyRow={emptyFormationTop}
        updateTableRow={updateTableRow}
        addTableRow={addTableRow}
      />

      <ReviewTable
        title="Casing Strings"
        tableKey="casingStrings"
        rows={draft.casingStrings}
        columns={[
          ['name', 'Name'],
          ['od', 'OD'],
          ['linearMass', 'Linear mass'],
          ['grade', 'Grade'],
          ['capacity', 'Capacity'],
          ['endPoint', 'End point'],
        ]}
        emptyRow={emptyCasingString}
        updateTableRow={updateTableRow}
        addTableRow={addTableRow}
      />

      <ReviewTable
        title="Volumes"
        tableKey="volumes"
        rows={draft.volumes}
        columns={[
          ['holeSection', 'Hole section'],
          ['bitSize', 'Bit size'],
          ['start', 'Start'],
          ['end', 'End'],
          ['length', 'Length'],
          ['tanks', 'Tanks'],
          ['casing', 'Casing'],
          ['sectionVolume', 'Section vol.'],
          ['totalOpenHole', 'Open hole'],
          ['losses', 'Losses'],
          ['finalCirculating', 'Final circ.'],
          ['totalVolume', 'Total vol.'],
        ]}
        emptyRow={emptyVolumeRow}
        updateTableRow={updateTableRow}
        addTableRow={addTableRow}
      />

      <div className="section-review-head">
        <h3>Well sections</h3>
        <button className="secondary-action" type="button" onClick={addSection}>
          Add section
        </button>
      </div>
      <div className="section-table" role="table" aria-label="Extracted well sections">
        <div className="section-row header" role="row">
          <span>Name</span>
          <span>Profile</span>
          <span>Top</span>
          <span>Bottom</span>
          <span>Hole</span>
          <span>pH</span>
          <span>Fluid loss</span>
          <span>Mud system</span>
          <span>Notes</span>
        </div>
        {draft.sections.map((section) => (
          <div className="section-row" role="row" key={section.id}>
            <input aria-label={`${section.name || 'Section'} name`} value={section.name} onChange={(event) => updateSection(section.id, 'name', event.target.value)} />
            <select
              aria-label={`${section.name || 'Section'} well profile`}
              value={normalizeWellProfile(section.wellProfile) || inferWellProfile(section, draft.overview)}
              onChange={(event) => updateSection(section.id, 'wellProfile', event.target.value)}
            >
              <option value="vertical">Vertical</option>
              <option value="horizontal">Horizontal</option>
              <option value="both">Both / curve</option>
            </select>
            <input aria-label={`${section.name || 'Section'} top depth`} value={section.topDepth} onChange={(event) => updateSection(section.id, 'topDepth', event.target.value)} />
            <input aria-label={`${section.name || 'Section'} bottom depth`} value={section.bottomDepth} onChange={(event) => updateSection(section.id, 'bottomDepth', event.target.value)} />
            <input aria-label={`${section.name || 'Section'} hole size`} value={section.holeSize} onChange={(event) => updateSection(section.id, 'holeSize', event.target.value)} />
            <input aria-label={`${section.name || 'Section'} pH`} value={section.ph || ''} onChange={(event) => updateSection(section.id, 'ph', event.target.value)} />
            <input aria-label={`${section.name || 'Section'} fluid loss`} value={section.fluidLoss || ''} onChange={(event) => updateSection(section.id, 'fluidLoss', event.target.value)} />
            <input aria-label={`${section.name || 'Section'} mud system`} value={section.mudSystem} onChange={(event) => updateSection(section.id, 'mudSystem', event.target.value)} />
            <input aria-label={`${section.name || 'Section'} notes`} value={section.programNotes || section.riskNotes || ''} onChange={(event) => updateSection(section.id, 'programNotes', event.target.value)} />
          </div>
        ))}
      </div>
      <button className="primary-action" type="button" onClick={onCreatePages}>
        <FiCheckCircle aria-hidden="true" />
        Create editable pages
      </button>
    </div>
  );
}

function ReviewTable({ title, tableKey, rows, columns, emptyRow, updateTableRow, addTableRow }) {
  return (
    <section className="review-table-block">
      <div className="section-review-head">
        <h3>{title}</h3>
        <button className="secondary-action" type="button" onClick={() => addTableRow(tableKey, emptyRow)}>
          Add row
        </button>
      </div>
      <div className="review-data-table" style={{ '--review-cols': columns.length }}>
        <div className="review-data-row header">
          {columns.map(([, label]) => (
            <span key={label}>{label}</span>
          ))}
        </div>
        {rows?.length ? rows.map((row, rowIndex) => (
          <div className="review-data-row" key={`${tableKey}-${rowIndex}`}>
            {columns.map(([key, label]) => (
              <input
                key={key}
                aria-label={`${title} ${rowIndex + 1} ${label}`}
                value={row[key] || ''}
                onChange={(event) => updateTableRow(tableKey, rowIndex, key, event.target.value)}
              />
            ))}
          </div>
        )) : <p className="muted review-empty-row">No rows extracted yet.</p>}
      </div>
    </section>
  );
}

function EditorStage({
  draft,
  pages,
  selectedPage,
  selectedPageId,
  setSelectedPageId,
  updatePageData,
  assistantPrompt,
  setAssistantPrompt,
  improveSelectedPage,
  improving,
  onReview,
}) {
  return (
    <div className="mud-editor">
      <aside className="mud-editor-sidebar">
        <div className="sidebar-section">
          <h2>Pages</h2>
          <div className="page-tabs">
            {pages.map((page, index) => (
              <button
                key={page.id}
                type="button"
                className={page.id === selectedPageId ? 'active' : ''}
                onClick={() => setSelectedPageId(page.id)}
              >
                <span>{pageLabel(page, index)}</span>
                <strong>{page.title || page.data?.name || 'Untitled'}</strong>
              </button>
            ))}
          </div>
        </div>

        <div className="sidebar-section">
          <h2>Properties</h2>
          {selectedPage?.type === 'cover' ? (
            <CoverEditor page={selectedPage} updatePageData={updatePageData} />
          ) : selectedPage?.type === 'wellInfo' ? (
            <WellInfoEditor />
          ) : (
            <SectionEditor page={selectedPage} updatePageData={updatePageData} />
          )}
        </div>

        <div className="sidebar-section assistant-box">
          <h2>AI assistant</h2>
          <label>
            Instruction for this page
            <textarea
              rows={4}
              value={assistantPrompt}
              onChange={(event) => setAssistantPrompt(event.target.value)}
              placeholder="Example: make the recommendations more detailed and field-ready."
            />
          </label>
          <button className="secondary-action" type="button" onClick={improveSelectedPage} disabled={improving}>
            {improving ? <FiRefreshCw aria-hidden="true" /> : <FiCpu aria-hidden="true" />}
            {improving ? 'Improving...' : 'Improve selected page'}
          </button>
        </div>
      </aside>

      <main className="mud-preview-workspace">
        <div className="mud-editor-toolbar">
          <div>
            <strong>{draft.overview.programTitle || 'Mud Program Draft'}</strong>
            <span>{draft.sourceFileName || 'Source PDF'}</span>
          </div>
          <button className="secondary-action" type="button" onClick={onReview}>
            Review extraction
          </button>
          <button className="primary-action" type="button" onClick={() => window.print()}>
            <FiPrinter aria-hidden="true" />
            Print / Save PDF
          </button>
        </div>
        <div className="print-pages">
          {pages.map((page) => (
            <MudProgramPage key={page.id} page={page} overview={draft.overview} />
          ))}
        </div>
      </main>
    </div>
  );
}

function CoverEditor({ page, updatePageData }) {
  const fields = [
    ['programTitle', 'Program title'],
    ['operator', 'Operator'],
    ['consultant', 'Consultant'],
    ['mudCompany', 'Mud company'],
    ['wellName', 'Well name'],
    ['uwi', 'UWI / API'],
    ['fieldZone', 'Field / zone'],
    ['attention', 'Attention'],
    ['salesRep', 'Sales rep'],
    ['salesRepPhone', 'Sales rep phone'],
    ['programDate', 'Program date'],
    ['programVersion', 'Version'],
    ['warehouse', 'Warehouse'],
    ['rig', 'Rig'],
    ['location', 'Location'],
    ['totalMd', 'Total MD'],
    ['executiveSummary', 'Executive summary', 'textarea'],
  ];
  return fields.map(([key, label, type]) => (
    <label key={key}>
      {label}
      {type === 'textarea' ? (
        <textarea rows={4} value={page.data?.[key] || ''} onChange={(event) => updatePageData(key, event.target.value)} />
      ) : (
        <input value={page.data?.[key] || ''} onChange={(event) => updatePageData(key, event.target.value)} />
      )}
    </label>
  ));
}

function WellInfoEditor() {
  return <p className="muted">Edit well information tables from Review extraction.</p>;
}

function SectionEditor({ page, updatePageData }) {
  const fields = [
    ['name', 'Section name'],
    ['wellProfile', 'Well profile', 'select'],
    ['topDepth', 'Top depth'],
    ['bottomDepth', 'Bottom depth'],
    ['holeSize', 'Hole size'],
    ['casingSize', 'Casing size'],
    ['mudSystem', 'Mud system'],
    ['densityRange', 'Density range'],
    ['viscosityRange', 'Viscosity range'],
    ['ph', 'pH'],
    ['fluidLoss', 'Fluid loss'],
    ['keyProducts', 'Key products', 'textarea'],
    ['programNotes', 'Program notes', 'textarea'],
    ['riskNotes', 'Risk notes', 'textarea'],
  ];
  return fields.map(([key, label, type]) => (
    <label key={key}>
      {label}
      {type === 'select' ? (
        <select value={normalizeWellProfile(page.data?.[key]) || 'vertical'} onChange={(event) => updatePageData(key, event.target.value)}>
          <option value="vertical">Vertical</option>
          <option value="horizontal">Horizontal</option>
          <option value="both">Both / curve</option>
        </select>
      ) : type === 'textarea' ? (
        <textarea rows={4} value={page.data?.[key] || ''} onChange={(event) => updatePageData(key, event.target.value)} />
      ) : (
        <input value={page.data?.[key] || ''} onChange={(event) => updatePageData(key, event.target.value)} />
      )}
    </label>
  ));
}

function MudProgramPage({ page, overview }) {
  if (!page) return null;
  if (page.type === 'cover') {
    const data = page.data || {};
    return (
      <article className="mud-page report-cover-page">
        <div className="cover-center">
          <h1>Drilling Fluid Program</h1>
          <h2>{data.wellName || data.programTitle || 'Untitled well'}</h2>
          <div className="cover-client">
            <strong>{data.operator || 'Operator not provided'}</strong>
            <span>{data.consultant || data.location || ''}</span>
            <span>{data.uwi || ''}</span>
            <span>{data.fieldZone || ''}</span>
          </div>
          <img src={`${process.env.PUBLIC_URL}/assets/unique-energy-logo.png`} alt="Unique Energy Solutions" className="cover-logo" />
          <dl className="cover-meta">
            <div><dt>Attention:</dt><dd>{data.attention || '-'}</dd></div>
            <div><dt>Sales Rep.(s)</dt><dd>{[data.salesRep, data.salesRepPhone].filter(Boolean).join('   ') || '-'}</dd></div>
            <div><dt>Programmed Date:</dt><dd>{data.programDate || '-'}</dd></div>
            <div><dt>Program Version:</dt><dd>{data.programVersion || '-'}</dd></div>
            <div><dt>Warehouse:</dt><dd>{data.warehouse || '-'}</dd></div>
          </dl>
        </div>
      </article>
    );
  }

  if (page.type === 'wellInfo') {
    const data = page.data || {};
    const info = data.overview || overview || {};
    return (
      <article className="mud-page well-info-page">
        <ReportTitle overview={info} />
        <section className="well-info-layout">
          <SimpleWellbore totalMd={info.totalMd || info.totalMetersDrilled} lateralLength={info.lateralLength} />
          <div className="well-info-tables">
            <h2>Well Information</h2>
            <ReportTable
              className="well-summary-table"
              columns={[
                ['uwi', 'UWI'],
                ['license', 'License'],
                ['afe', 'AFE'],
                ['rig', 'Drilling Rig'],
                ['groundElevation', 'Ground Elevation'],
                ['rfElevation', 'RF Elevation'],
                ['rfGround', 'RF-Ground'],
              ]}
              rows={[info]}
            />
            <h2>Formation Tops</h2>
            <ReportTable
              columns={[
                ['formation', 'Formation'],
                ['md', 'MD (m)'],
                ['tvd', 'TVD (m)'],
                ['lithology', 'Lithology'],
                ['gradient', 'Gradient (kPa/m)'],
                ['emd', 'EMD (kg/m3)'],
                ['pressure', 'Pressure (kPa)'],
                ['h2s', 'H2S (%)'],
                ['comment', 'Comment'],
              ]}
              rows={data.formationTops || []}
            />
            <h2>Casing Strings</h2>
            <ReportTable
              columns={[
                ['name', 'Name'],
                ['od', 'OD (mm)'],
                ['linearMass', 'Linear Mass (kg/m)'],
                ['grade', 'Grade'],
                ['capacity', 'Capacity (m3/m)'],
                ['endPoint', 'End Point (mMD)'],
              ]}
              rows={data.casingStrings || []}
            />
            <h2>Volumes</h2>
            <ReportTable
              columns={[
                ['holeSection', 'Hole Section'],
                ['bitSize', 'Bit Size (mm)'],
                ['start', 'Start (mMD)'],
                ['end', 'End (mMD)'],
                ['length', 'Length (m)'],
                ['tanks', 'Tanks (m3)'],
                ['casing', 'Casing (m3)'],
                ['sectionVolume', 'Section Volume (m3)'],
                ['totalOpenHole', 'Total Open Hole (m3)'],
                ['losses', 'Losses (m3)'],
                ['finalCirculating', 'Final Circulating (m3)'],
                ['totalVolume', 'Total Volume (m3)'],
              ]}
              rows={data.volumes || []}
            />
            <p className="volume-summary">
              Total Target/Lateral Meters: {info.lateralLength || '-'}, Total Meters Drilled: {info.totalMetersDrilled || info.totalMd || '-'}
            </p>
          </div>
        </section>
      </article>
    );
  }

  const data = page.data || {};
  const sectionTitle = data.name || page.title || 'Well Section';
  const subtitleParts = [data.mudSystem, data.holeSize ? `${data.holeSize} OH` : '', data.casingSize ? `${data.casingSize} Casing` : ''].filter(Boolean);
  return (
    <article className="mud-page mud-section-page">
      <ReportTitle overview={overview} />
      <h2 className="fluid-section-title">{sectionTitle}{subtitleParts.length ? ` - ${subtitleParts.join(' & ')}` : ''}</h2>
      <section className="fluid-program-table" aria-label={`${sectionTitle} fluid program`}>
        <div className="fluid-table-head properties">Properties</div>
        <div className="fluid-table-head procedures">Procedures</div>
        <aside className="fluid-properties">
          {normalizeProperties(data.properties, data).length ? normalizeProperties(data.properties, data).map((item, index) => (
            <div key={`${item.label}-${index}`} className="fluid-property">
              <strong>{item.label}</strong>
              <span>{item.value || '-'}</span>
            </div>
          )) : <div className="fluid-property"><strong>Properties</strong><span>TBC</span></div>}
        </aside>
        <main className="fluid-procedures">
          {normalizeProcedures(data.procedures, data).length ? normalizeProcedures(data.procedures, data).map((group, index) => (
            <section key={`${group.heading}-${index}`} className="fluid-procedure-group">
              {group.heading ? <h3>{group.heading}</h3> : null}
              {group.lines.map((line, lineIndex) => (
                <p key={`${group.heading}-${lineIndex}`}>* {line}</p>
              ))}
            </section>
          )) : <p>* Add procedures for this hole section.</p>}
        </main>
      </section>
    </article>
  );
}

function ReportTitle({ overview = {} }) {
  return (
    <h1 className="report-title">{overview.programTitle || `Drilling Fluid Program - ${overview.wellName || 'Untitled well'}`}</h1>
  );
}

function ReportTable({ columns, rows, className = '' }) {
  const safeRows = rows?.length ? rows : [Object.fromEntries(columns.map(([key]) => [key, '-']))];
  return (
    <table className={`report-table ${className}`}>
      <thead>
        <tr>
          {columns.map(([, label]) => (
            <th key={label}>{label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {safeRows.map((row, rowIndex) => (
          <tr key={rowIndex}>
            {columns.map(([key]) => (
              <td key={key}>{row?.[key] || '-'}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SimpleWellbore({ totalMd, lateralLength }) {
  return (
    <figure className="simple-wellbore" aria-label="Wellbore diagram">
      <svg viewBox="0 0 160 820" role="img">
        <path className="rig-line" d="M72 34 L100 118 L45 118 Z M72 34 L72 205" />
        <path className="well-outer" d="M74 132 L74 724 Q74 790 140 790" />
        <path className="well-inner" d="M90 132 L90 704 Q90 770 148 770" />
        <path className="well-dash" d="M55 135 L55 720 Q55 806 146 806" />
        <path className="well-dash" d="M104 135 L104 704 Q104 754 148 754" />
      </svg>
      <figcaption>
        Total Target/Lateral Meters: {lateralLength || '-'}, Total Meters Drilled: {totalMd || '-'}
      </figcaption>
    </figure>
  );
}
