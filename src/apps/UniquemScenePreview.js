import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FiMaximize2 } from 'react-icons/fi';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

const OBJECT_TYPES = new Set(['box', 'cylinder', 'plane', 'platform', 'stairs', 'trussTower', 'speakerStack', 'ledPanel', 'lightBeam', 'label']);
const MATERIAL_KINDS = new Set(['matte', 'metal', 'glow', 'screen']);
const TEXTURE_KINDS = new Set(['plain', 'grid', 'cosmic', 'sunset']);

function clamp(value, min, max, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

function sanitizeColor(value, fallback = '#64748b') {
  const text = typeof value === 'string' ? value.trim() : '';
  return /^#[0-9a-f]{6}$/i.test(text) ? text : fallback;
}

function vector(value, fallback, min, max) {
  const source = Array.isArray(value) ? value : [];
  return [0, 1, 2].map((index) => clamp(source[index], min, max, fallback[index]));
}

export function normalizePreviewScene(scene) {
  const objects = Array.isArray(scene?.objects) ? scene.objects : [];
  return {
    title: typeof scene?.title === 'string' && scene.title.trim() ? scene.title.trim().slice(0, 80) : 'Generated 3D Concept',
    summary: typeof scene?.summary === 'string' && scene.summary.trim() ? scene.summary.trim().slice(0, 220) : 'Preview generated from the 3D Creator prompt.',
    cameraHint: {
      distance: clamp(scene?.cameraHint?.distance, 8, 70, 28),
      target: vector(scene?.cameraHint?.target, [0, 2, 0], -30, 30),
    },
    objects: objects
      .slice(0, 80)
      .map((item, index) => {
        const type = OBJECT_TYPES.has(item?.type) ? item.type : '';
        if (!type) return null;
        const materialKind = MATERIAL_KINDS.has(item?.materialKind) ? item.materialKind : 'matte';
        const textureKind = TEXTURE_KINDS.has(item?.textureKind) ? item.textureKind : 'plain';
        return {
          id: typeof item?.id === 'string' && item.id.trim() ? item.id.trim().slice(0, 48) : `object-${index + 1}`,
          type,
          label: typeof item?.label === 'string' ? item.label.trim().slice(0, 48) : '',
          position: vector(item?.position, [0, 0.5, 0], -35, 35),
          scale: vector(item?.scale, [1, 1, 1], 0.05, 14),
          rotationY: clamp(item?.rotationY, -Math.PI * 2, Math.PI * 2, 0),
          color: sanitizeColor(item?.color),
          materialKind,
          textureKind,
        };
      })
      .filter(Boolean),
  };
}

function disposeObject(object) {
  object.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => {
        if (material.map) material.map.dispose();
        if (material.emissiveMap) material.emissiveMap.dispose();
        material.dispose();
      });
    }
  });
}

function createTexture(kind, label) {
  if (kind === 'plain') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 512, 512);
  if (kind === 'sunset') {
    gradient.addColorStop(0, '#2e1065');
    gradient.addColorStop(0.45, '#ec4899');
    gradient.addColorStop(0.78, '#f97316');
    gradient.addColorStop(1, '#020617');
  } else {
    gradient.addColorStop(0, '#0f172a');
    gradient.addColorStop(0.35, '#7c3aed');
    gradient.addColorStop(0.68, '#db2777');
    gradient.addColorStop(1, '#111827');
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 512, 512);
  if (kind === 'grid') {
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 512; i += 42) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 512);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(512, i);
      ctx.stroke();
    }
  } else {
    for (let i = 0; i < 90; i += 1) {
      ctx.fillStyle = `rgba(255,255,255,${0.12 + Math.random() * 0.65})`;
      ctx.beginPath();
      ctx.arc(Math.random() * 512, Math.random() * 512, 1 + Math.random() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.font = '800 42px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(label || '3D', 256, 274);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createMaterial(object) {
  const texture = createTexture(object.textureKind, object.label);
  const common = {
    color: sanitizeColor(object.color),
    roughness: object.materialKind === 'metal' ? 0.32 : 0.72,
    metalness: object.materialKind === 'metal' ? 0.62 : 0.04,
  };
  if (object.materialKind === 'glow' || object.materialKind === 'screen') {
    return new THREE.MeshStandardMaterial({
      ...common,
      map: texture || undefined,
      emissive: new THREE.Color(sanitizeColor(object.color, '#ec4899')),
      emissiveMap: texture || undefined,
      emissiveIntensity: object.materialKind === 'screen' ? 0.9 : 0.55,
    });
  }
  return new THREE.MeshStandardMaterial({ ...common, map: texture || undefined });
}

function addMesh(group, geometry, object, yOffset = 0) {
  const mesh = new THREE.Mesh(geometry, createMaterial(object));
  mesh.position.set(object.position[0], object.position[1] + yOffset, object.position[2]);
  mesh.scale.set(object.scale[0], object.scale[1], object.scale[2]);
  mesh.rotation.y = object.rotationY;
  mesh.castShadow = object.type !== 'lightBeam';
  mesh.receiveShadow = object.type !== 'lightBeam';
  group.add(mesh);
  return mesh;
}

function addBox(group, position, scale, color, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material || new THREE.MeshStandardMaterial({ color }));
  mesh.position.set(position[0], position[1], position[2]);
  mesh.scale.set(scale[0], scale[1], scale[2]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function addGeneratedStairs(group, object) {
  const stairs = new THREE.Group();
  stairs.position.set(object.position[0], object.position[1], object.position[2]);
  stairs.rotation.y = object.rotationY;
  const steps = 5;
  for (let i = 0; i < steps; i += 1) {
    addBox(stairs, [0, i * 0.12, -i * 0.22], [object.scale[0], 0.12, object.scale[2] / steps], object.color);
  }
  group.add(stairs);
}

function addTrussTower(group, object) {
  const tower = new THREE.Group();
  tower.position.set(object.position[0], object.position[1], object.position[2]);
  tower.rotation.y = object.rotationY;
  const height = object.scale[1];
  const mat = new THREE.MeshStandardMaterial({ color: object.color, metalness: 0.7, roughness: 0.28 });
  for (const x of [-0.35, 0.35]) {
    for (const z of [-0.35, 0.35]) addBox(tower, [x, height / 2, z], [0.06, height, 0.06], object.color, mat);
  }
  for (let y = 0.35; y < height; y += 0.7) {
    addBox(tower, [0, y, -0.35], [0.76, 0.04, 0.04], object.color, mat);
    addBox(tower, [0, y, 0.35], [0.76, 0.04, 0.04], object.color, mat);
  }
  group.add(tower);
}

function addSpeakerStack(group, object) {
  const stack = new THREE.Group();
  stack.position.set(object.position[0], object.position[1], object.position[2]);
  stack.rotation.y = object.rotationY;
  const count = Math.max(2, Math.min(8, Math.round(object.scale[1])));
  for (let i = 0; i < count; i += 1) {
    addBox(stack, [0, 0.42 + i * 0.7, 0], [object.scale[0], 0.58, object.scale[2]], object.color);
    addBox(stack, [0, 0.42 + i * 0.7, -object.scale[2] * 0.52], [object.scale[0] * 0.72, 0.36, 0.04], '#1f2937');
  }
  group.add(stack);
}

function addLabel(group, object) {
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.fillRect(0, 0, 384, 128);
  ctx.strokeStyle = object.color;
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, 376, 120);
  ctx.fillStyle = '#0f172a';
  ctx.font = '800 34px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(object.label || object.id, 192, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.2), new THREE.MeshBasicMaterial({ map: texture, transparent: true }));
  mesh.position.set(object.position[0], object.position[1], object.position[2]);
  mesh.scale.set(object.scale[0], object.scale[1], object.scale[2]);
  mesh.rotation.y = object.rotationY;
  group.add(mesh);
}

function addObject(group, object) {
  if (object.type === 'box' || object.type === 'platform') addMesh(group, new THREE.BoxGeometry(1, 1, 1), object);
  if (object.type === 'cylinder') addMesh(group, new THREE.CylinderGeometry(0.5, 0.5, 1, 32), object);
  if (object.type === 'plane' || object.type === 'ledPanel') addMesh(group, new THREE.PlaneGeometry(1, 1), object);
  if (object.type === 'stairs') addGeneratedStairs(group, object);
  if (object.type === 'trussTower') addTrussTower(group, object);
  if (object.type === 'speakerStack') addSpeakerStack(group, object);
  if (object.type === 'lightBeam') {
    const mesh = addMesh(group, new THREE.ConeGeometry(0.35, 1, 24, 1, true), object);
    mesh.material.transparent = true;
    mesh.material.opacity = 0.24;
    mesh.material.depthWrite = false;
    mesh.rotation.x = Math.PI;
  }
  if (object.type === 'label') addLabel(group, object);
}

export default function UniquemScenePreview({ scene }) {
  const containerRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const resetRef = useRef(null);
  const frameRef = useRef(0);
  const [unsupported, setUnsupported] = useState(false);
  const normalized = useMemo(() => normalizePreviewScene(scene), [scene]);

  const resetView = useCallback(() => {
    if (!cameraRef.current || !controlsRef.current || !resetRef.current) return;
    cameraRef.current.position.copy(resetRef.current.position);
    controlsRef.current.target.copy(resetRef.current.target);
    controlsRef.current.update();
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    container.innerHTML = '';

    if (process.env.NODE_ENV === 'test') {
      setUnsupported(true);
      return undefined;
    }

    const probe = document.createElement('canvas');
    let gl = null;
    try {
      gl = probe.getContext('webgl') || probe.getContext('experimental-webgl');
    } catch {
      gl = null;
    }
    if (!gl) {
      setUnsupported(true);
      return undefined;
    }
    setUnsupported(false);

    const threeScene = new THREE.Scene();
    threeScene.background = new THREE.Color('#e8eef5');
    threeScene.fog = new THREE.Fog('#e8eef5', 34, 95);
    threeScene.add(new THREE.HemisphereLight(0xffffff, 0x94a3b8, 1.2));
    const sun = new THREE.DirectionalLight(0xffffff, 2.1);
    sun.position.set(10, 16, 9);
    sun.castShadow = true;
    threeScene.add(sun);

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(86, 86), new THREE.MeshStandardMaterial({ color: '#d9e2ec', roughness: 0.86 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    threeScene.add(floor);

    const root = new THREE.Group();
    normalized.objects.forEach((object) => addObject(root, object));
    threeScene.add(root);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    container.appendChild(renderer.domElement);

    const target = new THREE.Vector3(...normalized.cameraHint.target);
    const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 140);
    camera.position.set(target.x + normalized.cameraHint.distance, target.y + normalized.cameraHint.distance * 0.52, target.z + normalized.cameraHint.distance);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 4;
    controls.maxDistance = 90;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.target.copy(target);
    controls.update();

    resetRef.current = { position: camera.position.clone(), target: controls.target.clone() };
    cameraRef.current = camera;
    controlsRef.current = controls;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const width = Math.max(1, Math.floor(rect.width));
      const height = Math.max(1, Math.floor(rect.height));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    resize();
    const animate = () => {
      controls.update();
      renderer.render(threeScene, camera);
      frameRef.current = window.requestAnimationFrame(animate);
    };
    animate();

    let resizeObserver;
    if (window.ResizeObserver) {
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(container);
    } else {
      window.addEventListener('resize', resize);
    }

    return () => {
      window.cancelAnimationFrame(frameRef.current);
      if (resizeObserver) resizeObserver.disconnect();
      window.removeEventListener('resize', resize);
      controls.dispose();
      disposeObject(threeScene);
      renderer.dispose();
      if (renderer.domElement.parentNode === container) container.removeChild(renderer.domElement);
      cameraRef.current = null;
      controlsRef.current = null;
    };
  }, [normalized]);

  return (
    <div className="creator-preview">
      <div className="creator-preview-head">
        <div>
          <span>Preview</span>
          <strong>{normalized.title}</strong>
        </div>
        <button type="button" onClick={resetView}>
          <FiMaximize2 size={16} />
          Reset
        </button>
      </div>
      <div className="creator-canvas-wrap">
        <div ref={containerRef} className="creator-canvas" data-testid="uniquem-creator-canvas">
          {unsupported ? (
            <div className="warehouse-fallback">
              <strong>3D creator preview</strong>
              <span>WebGL is not available in this browser environment.</span>
            </div>
          ) : null}
        </div>
        <div className="creator-preview-status">
          <span>{normalized.objects.length} objects</span>
          <strong>{normalized.summary}</strong>
        </div>
      </div>
    </div>
  );
}
