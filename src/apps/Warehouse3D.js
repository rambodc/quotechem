import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FiMaximize2, FiPauseCircle, FiPlayCircle } from 'react-icons/fi';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

function createMat(color, options = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: options.roughness ?? 0.72,
    metalness: options.metalness ?? 0.04,
    transparent: options.transparent || false,
    opacity: options.opacity ?? 1,
  });
}

function addBox(group, { name, position, scale, color, material, castShadow = true, receiveShadow = true }) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material || createMat(color));
  mesh.name = name || '';
  mesh.position.set(position[0], position[1], position[2]);
  mesh.scale.set(scale[0], scale[1], scale[2]);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  group.add(mesh);
  return mesh;
}

function addCylinder(group, { position, radius = 0.35, height = 1, color, segments = 32 }) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, segments), createMat(color, { roughness: 0.58 }));
  mesh.position.set(position[0], position[1], position[2]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function makeLabel(text, width = 256, height = 96, fg = '#0f172a', bg = 'rgba(255,255,255,0.92)') {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, width - 4, height - 4);
  ctx.fillStyle = fg;
  ctx.font = '700 30px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, width / 2, height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width / 70, height / 70),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true })
  );
  mesh.userData.disposeTexture = texture;
  return mesh;
}

function addRack(group, x, z, label, accent) {
  const rack = new THREE.Group();
  rack.position.set(x, 0, z);
  const postMat = createMat('#1f2937', { metalness: 0.25, roughness: 0.48 });
  const beamMat = createMat(accent || '#2563eb', { metalness: 0.12, roughness: 0.42 });
  for (const px of [-2.6, 2.6]) {
    for (const pz of [-0.58, 0.58]) {
      addBox(rack, { position: [px, 2, pz], scale: [0.12, 4, 0.12], material: postMat });
    }
  }
  for (const y of [0.75, 1.85, 2.95]) {
    addBox(rack, { position: [0, y, -0.62], scale: [5.6, 0.12, 0.16], material: beamMat });
    addBox(rack, { position: [0, y, 0.62], scale: [5.6, 0.12, 0.16], material: beamMat });
    addBox(rack, { position: [0, y - 0.05, 0], scale: [5.4, 0.08, 1.2], color: '#dbe4ef' });
  }
  for (let i = 0; i < 6; i += 1) {
    const px = -2.05 + i * 0.82;
    const py = 1.1 + (i % 3) * 0.9;
    addBox(rack, { position: [px, py, 0], scale: [0.62, 0.48, 0.72], color: i % 2 ? '#d97706' : '#a16207' });
  }
  const sign = makeLabel(label, 180, 70, '#ffffff', accent || '#2563eb');
  sign.position.set(0, 4.45, -0.72);
  rack.add(sign);
  group.add(rack);
}

function addForklift(group, x, z, rotation = 0) {
  const lift = new THREE.Group();
  lift.position.set(x, 0, z);
  lift.rotation.y = rotation;
  addBox(lift, { position: [0, 0.35, 0], scale: [1.45, 0.55, 0.9], color: '#f59e0b' });
  addBox(lift, { position: [-0.15, 0.95, 0], scale: [0.7, 0.85, 0.72], color: '#111827' });
  addBox(lift, { position: [0.88, 1.15, -0.34], scale: [0.08, 1.9, 0.06], color: '#111827' });
  addBox(lift, { position: [0.88, 1.15, 0.34], scale: [0.08, 1.9, 0.06], color: '#111827' });
  addBox(lift, { position: [1.34, 0.18, -0.22], scale: [1.05, 0.08, 0.08], color: '#374151' });
  addBox(lift, { position: [1.34, 0.18, 0.22], scale: [1.05, 0.08, 0.08], color: '#374151' });
  for (const wx of [-0.48, 0.48]) {
    for (const wz of [-0.48, 0.48]) {
      const wheel = addCylinder(lift, { position: [wx, 0.18, wz], radius: 0.18, height: 0.16, color: '#020617', segments: 24 });
      wheel.rotation.x = Math.PI / 2;
    }
  }
  group.add(lift);
}

function addTruck(group) {
  const truck = new THREE.Group();
  truck.position.set(-10.8, 0, -9.8);
  addBox(truck, { position: [0, 1.25, 0], scale: [4.8, 2.2, 1.9], color: '#e2e8f0' });
  addBox(truck, { position: [3.15, 0.9, 0], scale: [1.45, 1.55, 1.75], color: '#0b5fc0' });
  addBox(truck, { position: [3.86, 1.36, 0], scale: [0.08, 0.5, 1.25], color: '#93c5fd' });
  for (const wx of [-1.8, 0.6, 2.8]) {
    for (const wz of [-1.02, 1.02]) {
      const wheel = addCylinder(truck, { position: [wx, 0.28, wz], radius: 0.28, height: 0.2, color: '#020617', segments: 28 });
      wheel.rotation.x = Math.PI / 2;
    }
  }
  group.add(truck);
}

function buildWarehouseScene(scene) {
  const root = new THREE.Group();
  scene.add(root);

  const floorMat = createMat('#eef4fb', { roughness: 0.88 });
  addBox(root, { position: [0, -0.04, 0], scale: [28, 0.08, 20], material: floorMat, castShadow: false });
  addBox(root, { position: [0, 3, 10], scale: [28, 6, 0.22], color: '#d7e3ee', castShadow: false });
  addBox(root, { position: [0, 3, -10], scale: [28, 6, 0.22], color: '#d7e3ee', castShadow: false });
  addBox(root, { position: [-14, 3, 0], scale: [0.22, 6, 20], color: '#d7e3ee', castShadow: false });
  addBox(root, { position: [14, 3, 0], scale: [0.22, 6, 20], color: '#d7e3ee', castShadow: false });

  addBox(root, { position: [0, 6.15, 0], scale: [28.8, 0.22, 20.8], color: '#cbd8e6', castShadow: false });
  for (let x = -12; x <= 12; x += 4) {
    addBox(root, { position: [x, 5.85, 0], scale: [0.16, 0.16, 20.4], color: '#64748b' });
  }
  for (let z = -8; z <= 8; z += 4) {
    addBox(root, { position: [0, 5.72, z], scale: [28.4, 0.12, 0.16], color: '#94a3b8' });
  }

  for (const z of [-5.8, 0, 5.8]) {
    addBox(root, { position: [-13.86, 1.35, z], scale: [0.16, 2.7, 2.8], color: '#334155' });
    addBox(root, { position: [-14.7, 0.18, z], scale: [2.2, 0.35, 3.3], color: '#94a3b8' });
  }

  for (const x of [-5, 0, 5]) {
    addRack(root, x, -5.4, `Rack ${Math.abs(x) + 1}`, '#2563eb');
    addRack(root, x, -2.5, `Rack ${Math.abs(x) + 2}`, '#0f766e');
    addRack(root, x, 2.5, `Rack ${Math.abs(x) + 3}`, '#c026d3');
    addRack(root, x, 5.4, `Rack ${Math.abs(x) + 4}`, '#d97706');
  }

  for (let i = 0; i < 28; i += 1) {
    const x = -11.4 + (i % 7) * 1.45;
    const z = -8.2 + Math.floor(i / 7) * 5.35;
    addBox(root, { position: [x, 0.18, z], scale: [1, 0.22, 0.82], color: '#92400e' });
    addBox(root, { position: [x, 0.64, z], scale: [0.82, 0.68, 0.68], color: i % 3 === 0 ? '#60a5fa' : '#fbbf24' });
  }

  for (let i = 0; i < 24; i += 1) {
    const row = Math.floor(i / 6);
    const x = 7.4 + (i % 6) * 0.72;
    const z = -7.4 + row * 1.1;
    addCylinder(root, { position: [x, 0.58, z], radius: 0.28, height: 1.08, color: i % 2 ? '#2563eb' : '#16a34a' });
  }

  addBox(root, { position: [9.8, 1.4, 6.8], scale: [5, 2.8, 3.6], color: '#f8fafc' });
  addBox(root, { position: [9.8, 1.7, 4.96], scale: [4.4, 1.65, 0.08], color: '#bfdbfe', material: createMat('#bfdbfe', { transparent: true, opacity: 0.55 }) });
  const officeLabel = makeLabel('Operations Office', 260, 80, '#0f172a', 'rgba(255,255,255,0.95)');
  officeLabel.position.set(9.8, 3.1, 4.9);
  root.add(officeLabel);

  for (let x = -12; x <= 12; x += 2) {
    addBox(root, { position: [x, 0.012, -0.05], scale: [1.1, 0.025, 0.08], color: '#facc15', castShadow: false });
  }
  for (const x of [-8.5, 8.5]) {
    addBox(root, { position: [x, 0.014, 0], scale: [0.08, 0.025, 18], color: '#f97316', castShadow: false });
  }

  for (const x of [-9, -3, 3, 9]) {
    const light = new THREE.PointLight(0xffffff, 1.4, 12);
    light.position.set(x, 5.4, 0);
    light.castShadow = false;
    root.add(light);
    addBox(root, { position: [x, 5.35, 0], scale: [1.15, 0.08, 0.42], color: '#f8fafc', castShadow: false });
  }

  addForklift(root, -8.7, 1.2, -0.15);
  addForklift(root, 7.2, -1.1, Math.PI * 0.65);
  addTruck(root);

  const title = makeLabel('Uniquem Warehouse', 360, 96, '#ffffff', '#0f2a56');
  title.position.set(0, 4.2, -9.82);
  root.add(title);

  const scale = makeLabel('Main Aisle 28m x 20m', 280, 72, '#0f172a', 'rgba(250, 204, 21, 0.95)');
  scale.position.set(0, 0.05, 8.7);
  scale.rotation.x = -Math.PI / 2;
  root.add(scale);

  return root;
}

function disposeObject(object) {
  object.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => {
        if (material.map) material.map.dispose();
        material.dispose();
      });
    }
    if (child.userData?.disposeTexture) child.userData.disposeTexture.dispose();
  });
}

export default function Warehouse3D() {
  const stageRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const frameRef = useRef(0);
  const resetRef = useRef(null);
  const [autoRotate, setAutoRotate] = useState(false);
  const [unsupported, setUnsupported] = useState(false);

  const resetView = useCallback(() => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls || !resetRef.current) return;
    camera.position.copy(resetRef.current.position);
    controls.target.copy(resetRef.current.target);
    controls.update();
  }, []);

  useEffect(() => {
    const controls = controlsRef.current;
    if (controls) controls.autoRotate = autoRotate;
  }, [autoRotate]);

  useEffect(() => {
    const container = stageRef.current;
    if (!container) return undefined;

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

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#e6eef7');
    scene.fog = new THREE.Fog('#e6eef7', 22, 48);

    const camera = new THREE.PerspectiveCamera(54, 1, 0.1, 120);
    camera.position.set(16, 10, 16);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    container.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x93a4b8, 1.15));
    const sun = new THREE.DirectionalLight(0xffffff, 2.4);
    sun.position.set(10, 18, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -18;
    sun.shadow.camera.right = 18;
    sun.shadow.camera.top = 18;
    sun.shadow.camera.bottom = -18;
    scene.add(sun);

    const warehouse = buildWarehouseScene(scene);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.autoRotate = false;
    controls.autoRotateSpeed = 0.65;
    controls.minDistance = 6;
    controls.maxDistance = 42;
    controls.maxPolarAngle = Math.PI * 0.48;
    controls.target.set(0, 1.6, 0);
    controls.update();

    resetRef.current = {
      position: camera.position.clone(),
      target: controls.target.clone(),
    };

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
      renderer.render(scene, camera);
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

    rendererRef.current = renderer;
    cameraRef.current = camera;
    controlsRef.current = controls;

    return () => {
      window.cancelAnimationFrame(frameRef.current);
      if (resizeObserver) resizeObserver.disconnect();
      window.removeEventListener('resize', resize);
      controls.dispose();
      disposeObject(warehouse);
      renderer.dispose();
      if (renderer.domElement.parentNode === container) container.removeChild(renderer.domElement);
      rendererRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
    };
  }, []);

  return (
    <section className="uniquem-warehouse-page" aria-labelledby="uniquem-warehouse-title">
      <div className="warehouse-toolbar">
        <div>
          <p>Uniquem</p>
          <h1 id="uniquem-warehouse-title">3D Warehouse</h1>
        </div>
        <div className="warehouse-actions">
          <button type="button" onClick={() => setAutoRotate((value) => !value)} aria-pressed={autoRotate}>
            {autoRotate ? <FiPauseCircle size={16} /> : <FiPlayCircle size={16} />}
            {autoRotate ? 'Pause' : 'Auto'}
          </button>
          <button type="button" onClick={resetView}>
            <FiMaximize2 size={16} />
            Reset
          </button>
        </div>
      </div>

      <div className="warehouse-stage-wrap">
        <div ref={stageRef} className="warehouse-stage" data-testid="uniquem-warehouse-canvas">
          {unsupported ? (
            <div className="warehouse-fallback">
              <strong>3D warehouse viewer</strong>
              <span>WebGL is not available in this browser environment.</span>
            </div>
          ) : null}
        </div>
        <div className="warehouse-status">
          <span>Concept model</span>
          <strong>Racks, pallets, docks, office, forklifts, and yard staging</strong>
        </div>
      </div>
    </section>
  );
}
