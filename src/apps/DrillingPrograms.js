import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { FiCheckCircle, FiCpu, FiFileText, FiPrinter, FiRefreshCw, FiUploadCloud } from 'react-icons/fi';
import { UserContext } from '../App';
import { postJson } from '../lib/api';
import './DrillingPrograms.css';

const desktopQuery = '(min-width: 980px)';
const SECTION_COLORS = ['#108a24', '#0b63ce', '#b45309', '#7c3aed', '#c026d3', '#0f766e', '#be123c'];

const emptyOverview = {
  programTitle: '',
  operator: '',
  mudCompany: 'QuoteChem',
  wellName: '',
  uwi: '',
  rig: '',
  location: '',
  programDate: '',
  totalMd: '',
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
  keyProducts: '',
  riskNotes: '',
  programNotes: '',
  wellProfile: '',
};

function normalizeWellProfile(value) {
  const profile = String(value || '').trim().toLowerCase();
  if (['horizontal', 'lateral', 'curve'].includes(profile)) return 'horizontal';
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

  if (/\b(horizontal|lateral|curve|build|heel|toe|kickoff|k lateral|production hole)\b/.test(searchable)) {
    return 'horizontal';
  }

  return 'vertical';
}

function sectionAccent(index = 0) {
  return SECTION_COLORS[Math.abs(Number(index) || 0) % SECTION_COLORS.length];
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
      }))
    : [];
  const pages = Array.isArray(draft.pages) && draft.pages.length ? draft.pages : pagesFromExtraction(overview, sections);
  return {
    draftId: draft.draftId || draft.id || '',
    status: draft.status || 'local',
    sourceFileName: draft.sourceFileName || draft.fileName || '',
    overview,
    sections,
    pages,
    extractionError: draft.extractionError || draft.error || '',
    updatedAt: draft.updatedAt || '',
    createdAt: draft.createdAt || '',
  };
}

function pagesFromExtraction(overview, sections) {
  const pageList = [
    {
      id: 'overview',
      type: 'overview',
      title: overview.programTitle || `${overview.wellName || 'Well'} Mud Program Overview`,
      data: {
        ...overview,
        executiveSummary:
          overview.sourceSummary ||
          'Review the extracted drilling program details, confirm the planned intervals, and refine the mud program before export.',
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
    : pagesFromExtraction(draft.overview || emptyOverview, draft.sections || []);
}

function pageLabel(page, index) {
  return page.type === 'overview' ? 'Overview' : `Section ${index}`;
}

export default function DrillingPrograms() {
  const user = useContext(UserContext);
  const isDesktop = useIsDesktop();
  const [stage, setStage] = useState('upload');
  const [drafts, setDrafts] = useState([]);
  const [draft, setDraft] = useState(null);
  const [selectedPageId, setSelectedPageId] = useState('overview');
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
    setSelectedPageId(normalized.pages[0]?.id || 'overview');
    setStage(normalized.pages.length ? 'editor' : 'review');
    lastSavedRef.current = JSON.stringify({
      overview: normalized.overview,
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
      setSelectedPageId('overview');
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
      const pages = pagesFromExtraction(prev.overview, prev.sections);
      setSelectedPageId(pages[0]?.id || 'overview');
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

function ReviewStage({ draft, updateOverview, updateSection, addSection, onBack, onCreatePages }) {
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
          ['mudCompany', 'Mud company'],
          ['wellName', 'Well name'],
          ['uwi', 'UWI / API'],
          ['rig', 'Rig'],
          ['location', 'Location'],
          ['programDate', 'Date'],
          ['totalMd', 'Total MD'],
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
            </select>
            <input aria-label={`${section.name || 'Section'} top depth`} value={section.topDepth} onChange={(event) => updateSection(section.id, 'topDepth', event.target.value)} />
            <input aria-label={`${section.name || 'Section'} bottom depth`} value={section.bottomDepth} onChange={(event) => updateSection(section.id, 'bottomDepth', event.target.value)} />
            <input aria-label={`${section.name || 'Section'} hole size`} value={section.holeSize} onChange={(event) => updateSection(section.id, 'holeSize', event.target.value)} />
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
          {selectedPage?.type === 'overview' ? (
            <OverviewEditor page={selectedPage} updatePageData={updatePageData} />
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
          <MudProgramPage page={selectedPage} overview={draft.overview} />
        </div>
      </main>
    </div>
  );
}

function OverviewEditor({ page, updatePageData }) {
  const fields = [
    ['programTitle', 'Program title'],
    ['operator', 'Operator'],
    ['mudCompany', 'Mud company'],
    ['wellName', 'Well name'],
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
  if (page.type === 'overview') {
    const data = page.data || {};
    return (
      <article className="mud-page">
        <PageHeader title={data.programTitle || 'Mud Program'} subtitle={`${data.wellName || 'Well'} overview`} />
        <section className="mud-cover-band">
          <div>
            <span>Prepared by</span>
            <strong>{data.mudCompany || 'QuoteChem'}</strong>
          </div>
          <div>
            <span>Operator</span>
            <strong>{data.operator || 'Not provided'}</strong>
          </div>
          <div>
            <span>Rig</span>
            <strong>{data.rig || 'Not provided'}</strong>
          </div>
        </section>
        <section className="mud-page-grid">
          <InfoCard label="Well" value={data.wellName} />
          <InfoCard label="Location" value={data.location} />
          <InfoCard label="Total MD" value={data.totalMd} />
          <InfoCard label="Lateral" value={data.lateralLength} />
        </section>
        <section className="mud-content-block">
          <h2>Program Objective</h2>
          <p>{data.objective || data.executiveSummary || 'Confirm the drilling objective and mud program basis before export.'}</p>
        </section>
        <section className="mud-diagram">
          <div className="diagram-wellbore">
            <span />
            <span />
            <span />
          </div>
          <div>
            <h2>Well Plan Snapshot</h2>
            <p>{data.executiveSummary || 'The extracted drilling program data will be turned into section pages for review.'}</p>
          </div>
        </section>
      </article>
    );
  }

  const data = page.data || {};
  const wellProfile = inferWellProfile(data, overview);
  const accent = data.sectionAccent || sectionAccent((Number(data.sectionNumber) || 1) - 1);
  const sectionTitle = data.name || page.title || 'Well Section';
  const subtitleParts = [data.mudSystem, data.holeSize ? `${data.holeSize} OH` : '', data.casingSize ? `${data.casingSize} Casing` : ''].filter(Boolean);
  return (
    <article className="mud-page mud-section-page" style={{ '--section-accent': accent }}>
      <header className="section-print-header">
        <h1>{overview?.programTitle || `Drilling Fluid Program - ${overview?.wellName || 'Well'}`}</h1>
        <p>{sectionTitle}{subtitleParts.length ? ` - ${subtitleParts.join(' & ')}` : ''}</p>
      </header>

      <section className="section-print-table" aria-label={`${sectionTitle} program`}>
        <div className="section-table-title properties">Properties</div>
        <div className="section-table-title hole">Hole Section</div>
        <div className="section-table-title procedures">Procedures</div>

        <aside className="section-properties-column">
          <PropertyStack
            items={[
              ['Profile', wellProfile],
              ['Top', data.topDepth || '-'],
              ['Bottom', data.bottomDepth || '-'],
              ['Hole Size', data.holeSize || 'TBC'],
              ['Casing', data.casingSize || 'TBC'],
              ['Density', data.densityRange || 'TBC'],
              ['Viscosity', data.viscosityRange || 'TBC'],
              ['Mud System', data.mudSystem || 'TBC'],
            ]}
          />
        </aside>

        <HoleSectionDiagram section={data} profile={wellProfile} overview={overview} />

        <ProcedureColumn section={data} />
      </section>
    </article>
  );
}

function PropertyStack({ items }) {
  return (
    <dl className="section-property-stack">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value || 'TBC'}</dd>
        </div>
      ))}
    </dl>
  );
}

function splitTextLines(value) {
  return String(value || '')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function ProcedureColumn({ section }) {
  const groups = [
    ['Mud Up / Treatment', section.keyProducts],
    ['Operational Procedure', section.programNotes],
    ['Risks / Contingencies', section.riskNotes],
  ].filter(([, value]) => String(value || '').trim());

  const fallback = [
    ['Mud Up / Treatment', 'Add recommended products, concentrations, and treatment notes for this section.'],
    ['Operational Procedure', 'Add drilling, monitoring, maintenance, and trip notes for the selected interval.'],
    ['Risks / Contingencies', 'Add hole stability, losses, coal seams, casing, and field checks as required.'],
  ];

  return (
    <main className="section-procedure-column">
      {(groups.length ? groups : fallback).map(([heading, body]) => (
        <section key={heading} className="procedure-group">
          <h2>{heading}</h2>
          {splitTextLines(body).map((line, index) => (
            <p key={`${heading}-${index}`}>{line}</p>
          ))}
        </section>
      ))}
    </main>
  );
}

function HoleSectionDiagram({ section, overview, profile }) {
  const isHorizontal = profile === 'horizontal';
  const title = isHorizontal ? 'Horizontal drilled hole section' : 'Vertical drilled hole section';

  return (
    <figure className={`hole-section-card ${profile}`} aria-label={title}>
      <svg viewBox="0 0 150 440" role="img" aria-labelledby={`hole-section-${profile}-title`}>
        <title id={`hole-section-${profile}-title`}>{title}</title>
        <defs>
          <linearGradient id={`pipeShade-${profile}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#8c99a8" />
            <stop offset="15%" stopColor="#f8fafc" />
            <stop offset="47%" stopColor="#dbe3eb" />
            <stop offset="75%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#7b8794" />
          </linearGradient>
        </defs>
        <line className="depth-line" x1="22" y1="42" x2="22" y2="398" />
        <text x="12" y="56" textAnchor="middle" transform="rotate(-90 12 56)">TOP</text>
        <text x="12" y="398" textAnchor="middle" transform="rotate(-90 12 398)">BOTTOM</text>
        {isHorizontal ? (
          <>
            <rect className="pipe-fill" x="64" y="46" width="24" height="168" />
            <path className="open-hole-fill" d="M76 214 C76 286 88 318 126 318" />
            <path className="open-hole-highlight" d="M80 214 C80 280 91 308 126 309" />
            <line className="open-hole-end" x1="126" y1="306" x2="126" y2="330" />
          </>
        ) : (
          <>
            <rect className="pipe-fill" x="64" y="46" width="24" height="130" />
            <rect className="open-hole-rect" x="64" y="176" width="24" height="196" />
            <rect className="open-hole-rect-highlight" x="76" y="176" width="5" height="196" />
          </>
        )}
        <line className="marker-line" x1="38" y1="46" x2="112" y2="46" />
        <line className="marker-line" x1="38" y1="372" x2="112" y2="372" />
      </svg>
      <figcaption>
        <strong>{section.topDepth || 'Top'} to {section.bottomDepth || 'Bottom'}</strong>
        <span>{profile} drilled hole</span>
        <small>{overview?.wellName || 'Well'}</small>
      </figcaption>
    </figure>
  );
}

function PageHeader({ title, subtitle }) {
  return (
    <header className="mud-page-header">
      <div>
        <span>QuoteChem Mud Program</span>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <strong>QC</strong>
    </header>
  );
}

function InfoCard({ label, value }) {
  return (
    <div className="mud-info-card">
      <span>{label}</span>
      <strong>{value || 'Not provided'}</strong>
    </div>
  );
}
