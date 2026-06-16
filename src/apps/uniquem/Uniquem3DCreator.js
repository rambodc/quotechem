import React, { useEffect, useMemo, useState } from 'react';
import { FiArchive, FiImage, FiRefreshCw, FiRotateCcw, FiSend, FiTrash2 } from 'react-icons/fi';
import { postJson } from '../../lib/api';
import UniquemScenePreview from './UniquemScenePreview';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

const INITIAL_SCENE = {
  title: 'Ready To Generate',
  summary: 'Create or select a saved product model, then keep editing it with AI.',
  cameraHint: { distance: 24, target: [0, 2, 0] },
  objects: [
    { id: 'ground-platform', type: 'platform', label: 'Preview Base', position: [0, 0.08, 0], scale: [8, 0.16, 5], rotationY: 0, color: '#334155', materialKind: 'matte', textureKind: 'plain' },
    { id: 'sample-screen', type: 'ledPanel', label: 'AI 3D', position: [0, 2.5, -2.2], scale: [4, 2.5, 1], rotationY: 0, color: '#ec4899', materialKind: 'screen', textureKind: 'cosmic' },
    { id: 'sample-truss-left', type: 'trussTower', label: 'Truss', position: [-3, 0, -2.1], scale: [1, 4.5, 1], rotationY: 0, color: '#94a3b8', materialKind: 'metal', textureKind: 'plain' },
    { id: 'sample-truss-right', type: 'trussTower', label: 'Truss', position: [3, 0, -2.1], scale: [1, 4.5, 1], rotationY: 0, color: '#94a3b8', materialKind: 'metal', textureKind: 'plain' },
  ],
};

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read image file.'));
    reader.readAsDataURL(file);
  });
}

function modelUpdatedLabel(model) {
  if (!model?.updatedAt) return 'Not saved yet';
  const date = new Date(model.updatedAt);
  if (Number.isNaN(date.getTime())) return model.updatedAt;
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function upsertModel(models, model) {
  if (!model?.modelId) return models;
  return [model, ...models.filter((item) => item.modelId !== model.modelId)];
}

export default function Uniquem3DCreator() {
  const [prompt, setPrompt] = useState('');
  const [image, setImage] = useState(null);
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState(null);
  const [versions, setVersions] = useState([]);
  const [scene, setScene] = useState(INITIAL_SCENE);
  const [loadingModels, setLoadingModels] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const imageLabel = useMemo(() => {
    if (!image) return 'PNG, JPG, or WebP up to 8 MB';
    return `${image.name} (${Math.round(image.size / 1024)} KB)`;
  }, [image]);

  const refreshModels = async (selectModelId = selectedModel?.modelId) => {
    try {
      const data = await postJson('listUniquem3DModels', {}, { authed: true });
      const items = Array.isArray(data.items) ? data.items : [];
      setModels(items);
      if (selectModelId) {
        const next = items.find((item) => item.modelId === selectModelId);
        if (next) setSelectedModel(next);
      }
      return items;
    } catch (err) {
      setError(err?.message || 'Could not load saved products.');
      return null;
    }
  };

  useEffect(() => {
    let active = true;
    setLoadingModels(true);
    postJson('listUniquem3DModels', {}, { authed: true })
      .then((data) => {
        if (!active) return;
        const items = Array.isArray(data.items) ? data.items : [];
        setModels(items);
      })
      .catch((err) => {
        if (active) setError(err?.message || 'Could not load saved products.');
      })
      .finally(() => {
        if (active) setLoadingModels(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const chooseImage = (event) => {
    const file = event.target.files?.[0] || null;
    setError('');
    if (!file) {
      setImage(null);
      return;
    }
    if (!SUPPORTED_IMAGE_TYPES.has(file.type)) {
      setImage(null);
      setError('Use a PNG, JPG, or WebP image.');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setImage(null);
      setError('Image must be 8 MB or smaller.');
      return;
    }
    setImage(file);
  };

  const selectModel = async (modelId) => {
    setLoading(true);
    setError('');
    try {
      const data = await postJson('getUniquem3DModel', { modelId }, { authed: true });
      setSelectedModel(data.model || null);
      setVersions(Array.isArray(data.versions) ? data.versions : []);
      setScene(data.model?.scene || INITIAL_SCENE);
      setPrompt('');
      setImage(null);
    } catch (err) {
      setError(err?.message || 'Failed to load 3D model.');
    } finally {
      setLoading(false);
    }
  };

  const saveGeneratedModel = async (event) => {
    event.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed) {
      setError(selectedModel ? 'Describe how AI should edit this saved product.' : 'Describe the product model you want to create.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const imagePayload = image
        ? {
            name: image.name,
            contentType: image.type,
            dataUrl: await readFileAsDataUrl(image),
          }
        : null;
      const endpoint = selectedModel ? 'reviseUniquem3DModel' : 'createUniquem3DModel';
      const payload = selectedModel
        ? { modelId: selectedModel.modelId, prompt: trimmed, image: imagePayload }
        : { prompt: trimmed, image: imagePayload };
      const data = await postJson(endpoint, payload, { authed: true });
      const savedModel = data.model || null;
      setSelectedModel(savedModel);
      setVersions(Array.isArray(data.versions) ? data.versions : []);
      setScene(savedModel?.scene || INITIAL_SCENE);
      if (savedModel) setModels((items) => upsertModel(items, savedModel));
      setPrompt('');
      setImage(null);
      const refreshed = await refreshModels(savedModel?.modelId);
      if (savedModel && (!refreshed || !refreshed.some((item) => item.modelId === savedModel.modelId))) {
        setModels((items) => upsertModel(items, savedModel));
      }
    } catch (err) {
      setError(err?.message || 'Failed to save 3D model.');
    } finally {
      setLoading(false);
    }
  };

  const restoreVersion = async (versionId) => {
    if (!selectedModel) return;
    setLoading(true);
    setError('');
    try {
      const data = await postJson('restoreUniquem3DModelVersion', { modelId: selectedModel.modelId, versionId }, { authed: true });
      const restoredModel = data.model || null;
      setSelectedModel(restoredModel);
      setVersions(Array.isArray(data.versions) ? data.versions : []);
      setScene(restoredModel?.scene || INITIAL_SCENE);
      if (restoredModel) setModels((items) => upsertModel(items, restoredModel));
      const refreshed = await refreshModels(restoredModel?.modelId);
      if (restoredModel && (!refreshed || !refreshed.some((item) => item.modelId === restoredModel.modelId))) {
        setModels((items) => upsertModel(items, restoredModel));
      }
    } catch (err) {
      setError(err?.message || 'Failed to restore version.');
    } finally {
      setLoading(false);
    }
  };

  const archiveModel = async () => {
    if (!selectedModel) return;
    setLoading(true);
    setError('');
    try {
      await postJson('archiveUniquem3DModel', { modelId: selectedModel.modelId }, { authed: true });
      const archivedId = selectedModel.modelId;
      const remaining = models.filter((item) => item.modelId !== archivedId);
      setModels(remaining);
      setSelectedModel(null);
      setVersions([]);
      setScene(INITIAL_SCENE);
      const items = await refreshModels('');
      const next = items?.[0] || remaining[0] || null;
      if (next) await selectModel(next.modelId);
    } catch (err) {
      setError(err?.message || 'Failed to archive model.');
    } finally {
      setLoading(false);
    }
  };

  const startNewModel = () => {
    setSelectedModel(null);
    setVersions([]);
    setScene(INITIAL_SCENE);
    setPrompt('');
    setImage(null);
    setError('');
  };

  return (
    <section className="uniquem-creator-page" aria-labelledby="uniquem-creator-title">
      <div className="warehouse-toolbar">
        <div>
          <p>Uniquem</p>
          <h1 id="uniquem-creator-title">3D Creator</h1>
        </div>
        <div className="warehouse-actions">
          <button type="button" onClick={() => refreshModels()} disabled={loading || loadingModels}>
            <FiRefreshCw size={16} />
            Refresh
          </button>
        </div>
      </div>

      <div className="creator-library-layout">
        <aside className="creator-library" aria-label="Saved 3D models">
          <div className="creator-library-head">
            <span>Saved products</span>
            <button type="button" onClick={startNewModel} disabled={loading}>
              New
            </button>
          </div>
          {loadingModels ? <p>Loading saved models...</p> : null}
          {!loadingModels && !models.length ? <p>No saved models yet.</p> : null}
          {models.map((model) => (
            <button
              key={model.modelId}
              type="button"
              className={selectedModel?.modelId === model.modelId ? 'active' : ''}
              onClick={() => selectModel(model.modelId)}
              disabled={loading}
            >
              <strong>{model.title || 'Untitled model'}</strong>
              <span>{model.versionCount || 0} versions</span>
              <small>{modelUpdatedLabel(model)}</small>
            </button>
          ))}
        </aside>

        <div className="creator-layout">
          <form className="creator-panel" onSubmit={saveGeneratedModel}>
            <div className="creator-model-meta">
              <span>{selectedModel ? 'Editing saved model' : 'New saved model'}</span>
              <strong>{selectedModel?.title || 'Create a product model'}</strong>
              <small>{selectedModel ? `${selectedModel.versionCount || 0} saved versions` : 'The first generation will be saved automatically.'}</small>
            </div>

            <label htmlFor="uniquem-creator-prompt">Prompt</label>
            <textarea
              id="uniquem-creator-prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder={selectedModel ? 'Edit this full product: add stairs, make the LED wall wider, move speakers to both sides...' : 'Create a stage entrance with two LED pillars, truss towers, speakers, and a runway...'}
              rows={7}
              maxLength={2200}
            />

            <label className="creator-file" htmlFor="uniquem-creator-image">
              <input id="uniquem-creator-image" type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseImage} />
              <span>
                <FiImage size={18} />
                Image reference
              </span>
              <strong>{imageLabel}</strong>
            </label>

            <div className="creator-actions">
              <button type="submit" disabled={loading}>
                <FiSend size={16} />
                {loading ? 'Saving...' : selectedModel ? 'Edit And Save' : 'Create Saved Model'}
              </button>
              <button type="button" onClick={() => setImage(null)} disabled={!image || loading}>
                <FiTrash2 size={16} />
                Clear Image
              </button>
            </div>

            {selectedModel ? (
              <button type="button" className="creator-archive-btn" onClick={archiveModel} disabled={loading}>
                <FiArchive size={16} />
                Archive Model
              </button>
            ) : null}

            {error ? <div className="creator-error" role="alert">{error}</div> : null}

            <div className="creator-history" aria-label="Restore points">
              <span>Restore points</span>
              {versions.length ? (
                versions.map((version) => (
                  <article key={version.versionId}>
                    <strong>{version.source === 'restore' ? 'Restored version' : version.source === 'ai-generate' ? 'Initial generation' : 'AI edit'}</strong>
                    <p>{version.prompt}</p>
                    <small>{modelUpdatedLabel({ updatedAt: version.createdAt })}</small>
                    <button type="button" onClick={() => restoreVersion(version.versionId)} disabled={loading}>
                      <FiRotateCcw size={14} />
                      Restore
                    </button>
                  </article>
                ))
              ) : (
                <p>{selectedModel ? 'No restore points returned yet.' : 'Create or select a saved model to see restore points.'}</p>
              )}
            </div>
          </form>

          <UniquemScenePreview scene={scene} />
        </div>
      </div>
    </section>
  );
}
