import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import { FiDownload, FiFileText, FiPlus, FiRefreshCw, FiSave, FiUploadCloud } from 'react-icons/fi';
import { UserContext } from '../App';
import { storage } from '../firebase';
import { postJson } from '../lib/api';
import './DrillingPrograms.css';

const emptyJob = {
  programTitle: '',
  customer: '',
  wellName: '',
  location: '',
  rig: '',
  programDate: '',
  notes: '',
  extraRequirements: '',
};

function emptyTemplateDraft() {
  return {
    id: '',
    name: '',
    description: '',
    published: false,
    sections: [
      {
        id: `section-${Date.now()}`,
        title: 'Program Overview',
        description: '',
        required: true,
        options: [
          {
            id: `option-${Date.now()}`,
            label: 'Standard',
            instructions: '',
            assets: [],
          },
        ],
      },
    ],
  };
}

function fieldValue(object, key) {
  return typeof object?.[key] === 'string' ? object[key] : '';
}

function formatDate(value) {
  if (!value) return 'Not dated';
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  } catch {
    return value;
  }
}

function getRequiredSelections(template, selections) {
  const missing = [];
  for (const section of template?.sections || []) {
    if (section.required !== false && !selections[section.id]) missing.push(section.title || 'Untitled section');
  }
  return missing;
}

export default function DrillingPrograms() {
  const user = useContext(UserContext);
  const isAdmin = user?.role === 'admin';
  const [templates, setTemplates] = useState([]);
  const [runs, setRuns] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [job, setJob] = useState(emptyJob);
  const [selections, setSelections] = useState({});
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [adminSaving, setAdminSaving] = useState(false);
  const [uploadingAsset, setUploadingAsset] = useState('');
  const [templateDraft, setTemplateDraft] = useState(emptyTemplateDraft);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) || null,
    [templates, selectedTemplateId]
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [templateData, runData] = await Promise.all([
        postJson('listDrillingProgramTemplates', {}, { authed: true }),
        postJson('listDrillingProgramRuns', {}, { authed: true }),
      ]);
      const nextTemplates = Array.isArray(templateData.items) ? templateData.items : [];
      setTemplates(nextTemplates);
      setRuns(Array.isArray(runData.items) ? runData.items : []);
      setSelectedTemplateId((current) => current || nextTemplates[0]?.id || '');
      setTemplateDraft((current) => {
        if (!isAdmin || current.id || current.name || !nextTemplates[0]) return current;
        return JSON.parse(JSON.stringify(nextTemplates[0]));
      });
    } catch (err) {
      setError(err?.message || 'Unable to load drilling programs.');
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!selectedTemplate) return;
    const defaults = {};
    for (const section of selectedTemplate.sections || []) {
      const firstOption = section.options?.[0];
      if (firstOption) defaults[section.id] = firstOption.id;
    }
    setSelections(defaults);
  }, [selectedTemplate]);

  const updateJob = (key, value) => {
    setJob((prev) => ({ ...prev, [key]: value }));
  };

  const generatePdf = async (event) => {
    event.preventDefault();
    if (!selectedTemplate) {
      setError('Choose a template first.');
      return;
    }

    const missing = getRequiredSelections(selectedTemplate, selections);
    if (missing.length) {
      setError(`Choose an option for: ${missing.join(', ')}`);
      return;
    }

    setGenerating(true);
    setError('');
    setMessage('');
    try {
      const data = await postJson(
        'generateDrillingProgramPdf',
        {
          templateId: selectedTemplate.id,
          job,
          selections,
        },
        { authed: true }
      );
      setMessage('Drilling program PDF generated.');
      setRuns((prev) => [data.run, ...prev.filter((run) => run.runId !== data.run?.runId)]);
    } catch (err) {
      setError(err?.message || 'Unable to generate PDF.');
      await loadData();
    } finally {
      setGenerating(false);
    }
  };

  const editTemplate = (template) => {
    setTemplateDraft(JSON.parse(JSON.stringify(template || emptyTemplateDraft())));
    setMessage('');
    setError('');
  };

  const updateDraft = (patch) => {
    setTemplateDraft((prev) => ({ ...prev, ...patch }));
  };

  const updateSection = (sectionId, patch) => {
    setTemplateDraft((prev) => ({
      ...prev,
      sections: prev.sections.map((section) => (section.id === sectionId ? { ...section, ...patch } : section)),
    }));
  };

  const updateOption = (sectionId, optionId, patch) => {
    setTemplateDraft((prev) => ({
      ...prev,
      sections: prev.sections.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              options: section.options.map((option) => (option.id === optionId ? { ...option, ...patch } : option)),
            }
          : section
      ),
    }));
  };

  const addSection = () => {
    setTemplateDraft((prev) => ({
      ...prev,
      sections: [
        ...prev.sections,
        {
          id: `section-${Date.now()}`,
          title: '',
          description: '',
          required: true,
          options: [{ id: `option-${Date.now()}`, label: 'Standard', instructions: '', assets: [] }],
        },
      ],
    }));
  };

  const addOption = (sectionId) => {
    setTemplateDraft((prev) => ({
      ...prev,
      sections: prev.sections.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              options: [...section.options, { id: `option-${Date.now()}`, label: '', instructions: '', assets: [] }],
            }
          : section
      ),
    }));
  };

  const uploadAsset = async (sectionId, optionId, file) => {
    if (!file) return;
    const key = `${sectionId}:${optionId}`;
    setUploadingAsset(key);
    setError('');
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(-120);
      const path = `drillingPrograms/templates/${templateDraft.id || 'new-template'}/${Date.now()}-${safeName}`;
      const fileRef = storageRef(storage, path);
      await uploadBytes(fileRef, file, { contentType: file.type || 'application/octet-stream' });
      const url = await getDownloadURL(fileRef);
      const asset = {
        id: `asset-${Date.now()}`,
        name: file.name,
        path,
        url,
        contentType: file.type || 'application/octet-stream',
      };
      updateOption(sectionId, optionId, {
        assets: [...((templateDraft.sections.find((section) => section.id === sectionId)?.options || []).find((option) => option.id === optionId)?.assets || []), asset],
      });
    } catch (err) {
      setError(err?.message || 'Unable to upload asset.');
    } finally {
      setUploadingAsset('');
    }
  };

  const saveTemplate = async (event) => {
    event.preventDefault();
    setAdminSaving(true);
    setError('');
    setMessage('');
    try {
      const data = await postJson('adminSaveDrillingProgramTemplate', templateDraft, { authed: true });
      setMessage('Template saved.');
      setTemplateDraft(JSON.parse(JSON.stringify(data.template)));
      await loadData();
    } catch (err) {
      setError(err?.message || 'Unable to save template.');
    } finally {
      setAdminSaving(false);
    }
  };

  return (
    <section className="drilling-programs-page">
      <header className="programs-hero">
        <div>
          <p>Drilling Programs</p>
          <h1>Generate field-ready PDF programs from managed instructions.</h1>
          <span>Choose a template, fill in job details, and let QuoteChem assemble a saved PDF.</span>
        </div>
        <button type="button" className="secondary-action" onClick={loadData} disabled={loading}>
          <FiRefreshCw size={16} />
          Refresh
        </button>
      </header>

      {error ? <p className="program-message error">{error}</p> : null}
      {message ? <p className="program-message success">{message}</p> : null}

      <div className="programs-grid">
        <form className="program-panel generator-panel" onSubmit={generatePdf}>
          <div className="program-panel-head">
            <h2>Create PDF</h2>
            <span>{templates.length} template{templates.length === 1 ? '' : 's'}</span>
          </div>

          <label>
            <span>Template</span>
            <select value={selectedTemplateId} onChange={(event) => setSelectedTemplateId(event.target.value)} required>
              <option value="">Choose a template</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </label>

          <div className="job-grid">
            {[
              ['programTitle', 'Program title'],
              ['customer', 'Customer / company'],
              ['wellName', 'Well name'],
              ['location', 'Location'],
              ['rig', 'Rig'],
              ['programDate', 'Date'],
            ].map(([key, label]) => (
              <label key={key}>
                <span>{label}</span>
                <input type={key === 'programDate' ? 'date' : 'text'} value={fieldValue(job, key)} onChange={(event) => updateJob(key, event.target.value)} required={key === 'programTitle' || key === 'wellName'} />
              </label>
            ))}
          </div>

          <label>
            <span>Program notes</span>
            <textarea rows={3} value={job.notes} onChange={(event) => updateJob('notes', event.target.value)} />
          </label>

          <label>
            <span>Extra requirements</span>
            <textarea rows={3} value={job.extraRequirements} onChange={(event) => updateJob('extraRequirements', event.target.value)} />
          </label>

          {selectedTemplate ? (
            <div className="section-choice-list">
              {(selectedTemplate.sections || []).map((section) => (
                <fieldset key={section.id} className="section-choice">
                  <legend>{section.title}</legend>
                  {section.description ? <p>{section.description}</p> : null}
                  <div className="choice-options">
                    {(section.options || []).map((option) => (
                      <label key={option.id} className={selections[section.id] === option.id ? 'selected' : ''}>
                        <input
                          type="radio"
                          name={section.id}
                          value={option.id}
                          checked={selections[section.id] === option.id}
                          onChange={() => setSelections((prev) => ({ ...prev, [section.id]: option.id }))}
                        />
                        <span>{option.label}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
            </div>
          ) : null}

          <button type="submit" className="primary-action" disabled={generating || !selectedTemplate}>
            <FiFileText size={16} />
            {generating ? 'Generating...' : 'Generate PDF'}
          </button>
        </form>

        <section className="program-panel">
          <div className="program-panel-head">
            <h2>History</h2>
            <span>{runs.length} run{runs.length === 1 ? '' : 's'}</span>
          </div>
          <div className="run-list">
            {runs.map((run) => (
              <article key={run.runId} className={`run-card ${run.status}`}>
                <div>
                  <strong>{run.programTitle || run.templateName || 'Drilling Program'}</strong>
                  <span>{formatDate(run.createdAt)}</span>
                  {run.error ? <p>{run.error}</p> : null}
                </div>
                {run.pdfUrl ? (
                  <a className="download-link" href={run.pdfUrl} target="_blank" rel="noreferrer">
                    <FiDownload size={15} />
                    PDF
                  </a>
                ) : (
                  <span className="run-status">{run.status || 'pending'}</span>
                )}
              </article>
            ))}
            {!loading && runs.length === 0 ? <p className="muted">No PDFs generated yet.</p> : null}
            {loading ? <p className="muted">Loading...</p> : null}
          </div>
        </section>
      </div>

      {isAdmin ? (
        <section className="program-panel admin-template-panel">
          <div className="program-panel-head">
            <div>
              <h2>Admin Instruction Library</h2>
              <span>Write specific instructions for each section. The AI will not invent technical values that are not provided here or in the job form.</span>
            </div>
            <button type="button" className="secondary-action" onClick={() => editTemplate(emptyTemplateDraft())}>
              <FiPlus size={16} />
              New template
            </button>
          </div>

          <div className="template-admin-grid">
            <div className="template-list">
              {templates.map((template) => (
                <button key={template.id} type="button" onClick={() => editTemplate(template)} className={templateDraft.id === template.id ? 'active' : ''}>
                  <strong>{template.name}</strong>
                  <span>{template.published ? 'Published' : 'Draft'}</span>
                </button>
              ))}
            </div>

            <form className="template-editor" onSubmit={saveTemplate}>
              <div className="job-grid">
                <label>
                  <span>Template name</span>
                  <input required value={templateDraft.name} onChange={(event) => updateDraft({ name: event.target.value })} />
                </label>
                <label className="publish-toggle">
                  <input type="checkbox" checked={Boolean(templateDraft.published)} onChange={(event) => updateDraft({ published: event.target.checked })} />
                  <span>Published</span>
                </label>
              </div>
              <label>
                <span>Description</span>
                <textarea rows={2} value={templateDraft.description} onChange={(event) => updateDraft({ description: event.target.value })} />
              </label>

              <div className="template-sections">
                {templateDraft.sections.map((section) => (
                  <article key={section.id} className="template-section-card">
                    <label>
                      <span>Section title</span>
                      <input required value={section.title} onChange={(event) => updateSection(section.id, { title: event.target.value })} />
                    </label>
                    <label>
                      <span>Section description</span>
                      <textarea rows={2} value={section.description || ''} onChange={(event) => updateSection(section.id, { description: event.target.value })} />
                    </label>
                    <div className="option-list">
                      {(section.options || []).map((option) => {
                        const uploadKey = `${section.id}:${option.id}`;
                        return (
                          <div key={option.id} className="option-card">
                            <label>
                              <span>Option label</span>
                              <input required value={option.label} onChange={(event) => updateOption(section.id, option.id, { label: event.target.value })} />
                            </label>
                            <label>
                              <span>Instructions</span>
                              <textarea
                                rows={6}
                                placeholder="Describe exactly what this PDF section should include. Add required headings, tables, wording style, field values to use, and what should be left as Not specified."
                                value={option.instructions}
                                onChange={(event) => updateOption(section.id, option.id, { instructions: event.target.value })}
                              />
                            </label>
                            <label className="asset-upload">
                              <FiUploadCloud size={16} />
                              <span>{uploadingAsset === uploadKey ? 'Uploading...' : 'Upload reference file'}</span>
                              <input type="file" disabled={uploadingAsset === uploadKey} onChange={(event) => uploadAsset(section.id, option.id, event.target.files?.[0])} />
                            </label>
                            {option.assets?.length ? (
                              <div className="asset-list">
                                {option.assets.map((asset) => (
                                  <a key={asset.id || asset.path} href={asset.url} target="_blank" rel="noreferrer">
                                    {asset.name || 'Reference file'}
                                  </a>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                    <button type="button" className="secondary-action" onClick={() => addOption(section.id)}>
                      <FiPlus size={15} />
                      Add option
                    </button>
                  </article>
                ))}
              </div>

              <div className="template-actions">
                <button type="button" className="secondary-action" onClick={addSection}>
                  <FiPlus size={16} />
                  Add section
                </button>
                <button type="submit" className="primary-action" disabled={adminSaving}>
                  <FiSave size={16} />
                  {adminSaving ? 'Saving...' : 'Save template'}
                </button>
              </div>
            </form>
          </div>
        </section>
      ) : null}
    </section>
  );
}
