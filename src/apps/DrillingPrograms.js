import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { FiCheckCircle, FiCpu, FiFileText, FiPrinter, FiRefreshCw, FiUploadCloud } from 'react-icons/fi';
import { UserContext } from '../App';
import { postJson } from '../lib/api';
import './DrillingPrograms.css';

const desktopQuery = '(min-width: 980px)';

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
  return (
    <article className="mud-page">
      <PageHeader title={data.name || page.title || 'Well Section'} subtitle={`${overview?.wellName || 'Well'} mud program section`} />
      <section className="section-hero-band">
        <InfoCard label="Interval" value={`${data.topDepth || '-'} to ${data.bottomDepth || '-'}`} />
        <InfoCard label="Hole size" value={data.holeSize} />
        <InfoCard label="Mud system" value={data.mudSystem} />
        <InfoCard label="Well profile" value={wellProfile} />
      </section>
      <section className={`section-page-layout ${wellProfile}`}>
        <WellPathModel section={data} overview={overview} profile={wellProfile} />
        <div className="section-technical-stack">
          <div className="mud-content-block section-summary-card">
            <span className="section-kicker">Section Design</span>
            <h2>{wellProfile === 'horizontal' ? 'Horizontal Well Path' : 'Vertical Well Path'}</h2>
            <p>
              {wellProfile === 'horizontal'
                ? 'Build, land, and maintain the lateral with tight property control across the active interval.'
                : 'Maintain stable vertical hole conditions while drilling through the selected interval.'}
            </p>
          </div>
          <div className="mud-content-block">
            <h2>Recommended Properties</h2>
            <table>
              <tbody>
                <tr>
                  <th>Density</th>
                  <td>{data.densityRange || 'To be confirmed'}</td>
                </tr>
                <tr>
                  <th>Viscosity</th>
                  <td>{data.viscosityRange || 'To be confirmed'}</td>
                </tr>
                <tr>
                  <th>Casing</th>
                  <td>{data.casingSize || 'To be confirmed'}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
      <section className="mud-content-block">
        <h2>Products and Treatment</h2>
        <p>{data.keyProducts || 'Add recommended products, concentrations, and treatment notes for this section.'}</p>
      </section>
      <section className="mud-content-block accent">
        <h2>Operational Notes</h2>
        <p>{data.programNotes || data.riskNotes || 'Add risks, monitoring points, contingency notes, and field checks.'}</p>
      </section>
    </article>
  );
}

function WellPathModel({ section, overview, profile }) {
  const isHorizontal = profile === 'horizontal';
  const title = isHorizontal ? 'Horizontal trajectory model' : 'Vertical trajectory model';
  const path = isHorizontal
    ? 'M150 64 C150 176 152 246 218 300 C276 348 350 350 426 350'
    : 'M154 64 C154 142 154 222 154 350';
  const casingPath = isHorizontal
    ? 'M150 64 C150 176 152 246 218 300 C276 348 350 350 426 350'
    : 'M154 64 C154 142 154 222 154 350';

  return (
    <figure className={`well-model-card ${profile}`} aria-label={title}>
      <svg className="well-model-svg" viewBox="0 0 520 440" role="img" aria-labelledby={`well-model-${profile}-title`}>
        <title id={`well-model-${profile}-title`}>{title}</title>
        <defs>
          <linearGradient id={`wellSteel-${profile}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="55%" stopColor="#e8edf2" />
            <stop offset="100%" stopColor="#b9c4cf" />
          </linearGradient>
          <linearGradient id={`wellBlue-${profile}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#2563eb" />
            <stop offset="100%" stopColor="#0039d8" />
          </linearGradient>
          <filter id={`wellShadow-${profile}`} x="-20%" y="-20%" width="140%" height="150%">
            <feDropShadow dx="0" dy="16" stdDeviation="14" floodColor="#0f172a" floodOpacity="0.16" />
          </filter>
        </defs>

        <g className="model-grid" opacity="0.72">
          <path d="M74 96 L252 18 L448 102 L266 190 Z" />
          <path d="M74 96 L74 286 L266 386 L266 190" />
          <path d="M448 102 L448 280 L266 386" />
          {[0, 1, 2, 3].map((item) => (
            <React.Fragment key={item}>
              <path d={`M${112 + item * 45} ${80 - item * 8} L${304 + item * 45} ${164 - item * 8} L${304 + item * 45} ${354 - item * 2}`} />
              <path d={`M${90 + item * 52} ${126 + item * 42} L${270 + item * 44} ${48 + item * 42} L${448} ${124 + item * 42}`} />
            </React.Fragment>
          ))}
        </g>

        <g className="model-platform" filter={`url(#wellShadow-${profile})`}>
          <path className="model-top-face" fill={`url(#wellSteel-${profile})`} d="M116 128 L260 68 L398 128 L252 196 Z" />
          <path d="M116 128 L116 168 L252 240 L252 196 Z" />
          <path d="M398 128 L398 168 L252 240 L252 196 Z" />
          <path d="M168 158 L250 124 L332 160 L250 198 Z" />
        </g>

        <g className="model-rig">
          <path d="M246 54 L208 170 L282 170 Z" />
          <path d="M246 54 L246 178" />
          <path d="M224 112 L270 112 M216 142 L278 142 M234 82 L260 82" />
          <path d="M215 170 L188 204 M278 170 L308 204" />
        </g>

        <g className="model-blocks">
          <path className="model-top-face" fill={`url(#wellSteel-${profile})`} d="M84 244 L132 222 L178 244 L130 268 Z" />
          <path d="M84 244 L84 296 L130 324 L130 268 Z" />
          <path d="M178 244 L178 294 L130 324 L130 268 Z" />
          <path className="model-top-face" fill={`url(#wellSteel-${profile})`} d="M338 236 L386 214 L432 236 L384 260 Z" />
          <path d="M338 236 L338 288 L384 316 L384 260 Z" />
          <path d="M432 236 L432 286 L384 316 L384 260 Z" />
        </g>

        <path className="model-casing" d={casingPath} />
        <path className="model-well-path" stroke={`url(#wellBlue-${profile})`} d={path} />
        <path className="model-flow-dash" d={isHorizontal ? 'M184 316 L258 348 L426 348' : 'M126 130 L126 350'} />

        <g className="model-bit" transform={isHorizontal ? 'translate(424 350) rotate(90)' : 'translate(154 350)'}>
          <path d="M-14 0 L0 24 L14 0 Z" />
          <circle cx="0" cy="4" r="5" />
        </g>
      </svg>

      <figcaption>
        <span>{profile}</span>
        <strong>{section.topDepth || 'Top'} to {section.bottomDepth || 'Bottom'}</strong>
        <small>{overview?.wellName || 'Well'} / {section.holeSize || 'hole size pending'}</small>
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
