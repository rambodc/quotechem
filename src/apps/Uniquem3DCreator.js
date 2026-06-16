import React, { useMemo, useState } from 'react';
import { FiImage, FiSend, FiTrash2 } from 'react-icons/fi';
import { postJson } from '../lib/api';
import UniquemScenePreview from './UniquemScenePreview';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

const INITIAL_SCENE = {
  title: 'Ready To Generate',
  summary: 'Describe an object group, upload an optional image reference, and generate a procedural 3D preview.',
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

export default function Uniquem3DCreator() {
  const [prompt, setPrompt] = useState('');
  const [image, setImage] = useState(null);
  const [scene, setScene] = useState(INITIAL_SCENE);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const imageLabel = useMemo(() => {
    if (!image) return 'PNG, JPG, or WebP up to 8 MB';
    return `${image.name} (${Math.round(image.size / 1024)} KB)`;
  }, [image]);

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

  const generateScene = async (event) => {
    event.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed) {
      setError('Describe what you want the 3D Creator to build.');
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
      const data = await postJson(
        'generateUniquem3DScene',
        {
          prompt: trimmed,
          image: imagePayload,
          previousScene: scene,
        },
        { authed: true }
      );
      setScene(data.scene || INITIAL_SCENE);
      setHistory((items) => [
        {
          id: `${Date.now()}`,
          prompt: trimmed,
          title: data.scene?.title || 'Generated scene',
          objectCount: Array.isArray(data.scene?.objects) ? data.scene.objects.length : 0,
        },
        ...items,
      ]);
      setPrompt('');
    } catch (err) {
      setError(err?.message || 'Failed to generate 3D scene.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="uniquem-creator-page" aria-labelledby="uniquem-creator-title">
      <div className="warehouse-toolbar">
        <div>
          <p>Uniquem</p>
          <h1 id="uniquem-creator-title">3D Creator</h1>
        </div>
      </div>

      <div className="creator-layout">
        <form className="creator-panel" onSubmit={generateScene}>
          <label htmlFor="uniquem-creator-prompt">Prompt</label>
          <textarea
            id="uniquem-creator-prompt"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Create a stage entrance with two LED pillars, truss towers, speakers, and a runway..."
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
              {loading ? 'Generating...' : scene === INITIAL_SCENE ? 'Generate' : 'Regenerate'}
            </button>
            <button type="button" onClick={() => setImage(null)} disabled={!image || loading}>
              <FiTrash2 size={16} />
              Clear Image
            </button>
          </div>

          {error ? <div className="creator-error" role="alert">{error}</div> : null}

          <div className="creator-history" aria-label="Generation history">
            <span>Session history</span>
            {history.length ? (
              history.map((item) => (
                <article key={item.id}>
                  <strong>{item.title}</strong>
                  <p>{item.prompt}</p>
                  <small>{item.objectCount} objects</small>
                </article>
              ))
            ) : (
              <p>No generated scenes yet.</p>
            )}
          </div>
        </form>

        <UniquemScenePreview scene={scene} />
      </div>
    </section>
  );
}
