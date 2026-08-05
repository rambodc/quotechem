import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

const sharedBox = new THREE.BoxGeometry(1, 1, 1);
const TAP_DISTANCE = 8;

function material(color, options = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: options.roughness ?? 0.68, metalness: options.metalness ?? 0.04, transparent: options.opacity < 1, opacity: options.opacity ?? 1 });
}

export function isTapGesture(start, end) {
  if (!start || !end) return false;
  return Math.hypot(end.x - start.x, end.y - start.y) <= TAP_DISTANCE && end.time - start.time < 700;
}

function addLoads(group, product) {
  const tote = product.packaging.representation === 'tote';
  const loadMaterial = material(product.color);
  const loads = new THREE.InstancedMesh(sharedBox, loadMaterial, product.loadCount);
  const pallets = tote ? null : new THREE.InstancedMesh(sharedBox, material('#8b5a2b'), product.loadCount);
  const cages = tote ? new THREE.InstancedMesh(sharedBox, new THREE.MeshBasicMaterial({ color: '#dbeafe', wireframe: true }), product.loadCount) : null;
  const transform = new THREE.Object3D();
  const xOffset = ((product.columns - 1) * 1.35) / 2;
  const zOffset = ((product.rows - 1) * 1.35) / 2;
  for (let index = 0; index < product.loadCount; index += 1) {
    const stack = Math.floor(index / 3); const level = index % 3;
    const column = stack % product.columns; const row = Math.floor(stack / product.columns);
    const x = column * 1.35 - xOffset; const z = row * 1.35 - zOffset;
    if (pallets) { transform.position.set(x, 0.1 + level * 1.25, z); transform.scale.set(1.15, 0.18, 1.05); transform.updateMatrix(); pallets.setMatrixAt(index, transform.matrix); }
    transform.position.set(x, (tote ? 0.58 : 0.7) + level * 1.25, z); transform.scale.set(tote ? 1.05 : 1, tote ? 1.05 : 1.08, tote ? 1.05 : 0.9); transform.updateMatrix(); loads.setMatrixAt(index, transform.matrix);
    if (cages) { transform.scale.multiplyScalar(1.012); transform.updateMatrix(); cages.setMatrixAt(index, transform.matrix); }
  }
  loads.castShadow = true; loads.receiveShadow = true; group.add(loads);
  if (pallets) { pallets.castShadow = true; pallets.receiveShadow = true; group.add(pallets); }
  if (cages) group.add(cages);
}

function makeLabel(text, color, detailed = false) {
  const canvas = document.createElement('canvas'); canvas.width = detailed ? 768 : 512; canvas.height = detailed ? 126 : 92;
  const context = canvas.getContext('2d');
  context.fillStyle = 'rgba(255,255,255,.96)'; context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = color; context.lineWidth = detailed ? 8 : 5; context.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);
  context.fillStyle = '#102033'; context.font = detailed ? '800 30px Arial' : '800 25px Arial'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(text.slice(0, detailed ? 76 : 40), canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.renderOrder = detailed ? 20 : 10; sprite.userData.texture = texture; sprite.userData.detailed = detailed; return sprite;
}

function addSelectionVisual(engine, product, group) {
  const partial = product.partial ? ` · partial ${product.finalLoadQuantity} ${product.packaging.packageLabel}` : '';
  const label = makeLabel(`${product.item} · ${product.quantityOnHand} ${product.unitOfMeasure || ''} · ${product.loadCount} loads${partial}`, product.color, true);
  label.position.set(0, 5.35, 0); group.add(label); engine.selectedLabel = label;
  const height = Math.min(3, product.loadCount) * 1.25 + .15;
  const boundsGeometry = new THREE.BoxGeometry(product.footprint.width + .22, height + .22, product.footprint.depth + .22);
  const outlineGeometry = new THREE.EdgesGeometry(boundsGeometry); boundsGeometry.dispose();
  const outline = new THREE.LineSegments(outlineGeometry, new THREE.LineBasicMaterial({ color: '#06b6d4', transparent: true, opacity: .95, depthTest: false }));
  outline.position.y = height / 2; outline.userData.baseY = height / 2; outline.renderOrder = 30; group.add(outline); engine.selectionOutline = outline; engine.selectedVisual = group.userData.visual;
}

function dispose(root) {
  const disposedMaps = new Set();
  root.traverse((object) => {
    if (object.material) (Array.isArray(object.material) ? object.material : [object.material]).forEach((entry) => { if (entry.map && !disposedMaps.has(entry.map)) { disposedMaps.add(entry.map); entry.map.dispose(); } entry.dispose(); });
    if (object.userData.texture) object.userData.texture.dispose();
    if (object.geometry && object.geometry !== sharedBox) object.geometry.dispose();
  });
}

export default function InventoryScene({ products, floor, selectedId, onSelect, focusSignal, resetSignal, onOrbitChange }) {
  const hostRef = useRef(null); const engineRef = useRef(null); const callbacksRef = useRef({ onSelect, onOrbitChange });
  const firstLayoutRef = useRef(true); const productsRef = useRef(products); const floorRef = useRef(floor); const [unsupported, setUnsupported] = useState(false);
  callbacksRef.current = { onSelect, onOrbitChange };
  productsRef.current = products; floorRef.current = floor;

  const animateToProduct = useCallback((productId, startOrbit = true) => {
    const engine = engineRef.current; const group = engine?.groups.get(productId); if (!engine || !group) return;
    const bounds = new THREE.Box3().setFromObject(group); const centre = bounds.getCenter(new THREE.Vector3()); const size = bounds.getSize(new THREE.Vector3());
    const direction = engine.camera.position.clone().sub(engine.controls.target).normalize();
    if (!Number.isFinite(direction.x) || direction.lengthSq() < 0.5) direction.set(1, .65, 1).normalize();
    const fitHeight = Math.max(size.y * 1.8, size.z * 1.25, 3.5); const fitWidth = Math.max(size.x * 1.2, 3.5);
    const verticalDistance = fitHeight / (2 * Math.tan(THREE.MathUtils.degToRad(engine.camera.fov / 2)));
    const horizontalDistance = fitWidth / (2 * Math.tan(THREE.MathUtils.degToRad(engine.camera.fov / 2)) * Math.max(engine.camera.aspect, .45));
    const distance = Math.max(4, verticalDistance, horizontalDistance);
    engine.controls.autoRotate = false; engine.focus = { startedAt: performance.now(), duration: 700, fromPosition: engine.camera.position.clone(), toPosition: centre.clone().add(direction.multiplyScalar(distance)), fromTarget: engine.controls.target.clone(), toTarget: centre, startOrbit };
    callbacksRef.current.onOrbitChange?.(false);
  }, []);

  useEffect(() => {
    const host = hostRef.current; if (!host) return undefined;
    if (process.env.NODE_ENV === 'test') { setUnsupported(true); return undefined; }
    let gl; try { const probe = document.createElement('canvas'); gl = probe.getContext('webgl2') || probe.getContext('webgl'); } catch { gl = null; }
    if (!gl) { setUnsupported(true); return undefined; }
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#f4f8fb');
    const camera = new THREE.PerspectiveCamera(50, 1, 0.08, 500); camera.position.set(24, 20, 28);
    const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); renderer.shadowMap.enabled = true; renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.domElement.style.cssText = 'width:100%;height:100%;display:block;touch-action:none'; host.appendChild(renderer.domElement);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x9fb0c2, 2)); const sun = new THREE.DirectionalLight(0xffffff, 2.35); sun.position.set(24, 38, 20); sun.castShadow = true; scene.add(sun);
    const root = new THREE.Group(); scene.add(root);
    const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.dampingFactor = .08; controls.minDistance = 2; controls.maxDistance = 320; controls.maxPolarAngle = Math.PI * .49; controls.autoRotateSpeed = .65; controls.target.set(0, 1.5, 0); controls.update();
    const selectionLight = new THREE.PointLight(0xb9f4ff, 0, 12); scene.add(selectionLight);
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches || false;
    const engine = { scene, camera, renderer, controls, root, groups: new Map(), labels: new Map(), hitboxes: [], selectedLabel: null, selectedVisual: null, selectionOutline: null, selectionLight, reducedMotion, focus: null, ground: null, grid: null, frame: 0 };
    engineRef.current = engine;
    controls.addEventListener('start', () => { engine.focus = null; if (controls.autoRotate) { controls.autoRotate = false; callbacksRef.current.onOrbitChange?.(false); } });
    const raycaster = new THREE.Raycaster(); const pointer = new THREE.Vector2(); let pointerStart = null;
    const raycast = (event) => { const rect = renderer.domElement.getBoundingClientRect(); pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1); raycaster.setFromCamera(pointer, camera); return raycaster.intersectObjects(engine.hitboxes, false)[0]; };
    const down = (event) => { pointerStart = { x: event.clientX, y: event.clientY, time: performance.now() }; };
    const up = (event) => { const end = { x: event.clientX, y: event.clientY, time: performance.now() }; if (!isTapGesture(pointerStart, end)) return; const hit = raycast(event); if (hit) callbacksRef.current.onSelect(hit.object.userData.productId); };
    renderer.domElement.addEventListener('pointerdown', down); renderer.domElement.addEventListener('pointerup', up);
    const resize = () => { const rect = host.getBoundingClientRect(); renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height), false); camera.aspect = Math.max(1, rect.width) / Math.max(1, rect.height); camera.updateProjectionMatrix(); };
    resize(); const observer = window.ResizeObserver ? new ResizeObserver(resize) : null; observer?.observe(host); if (!observer) window.addEventListener('resize', resize);
    const labelBoxes = [];
    const updateLabels = () => {
      labelBoxes.length = 0;
      const entries = [...engine.labels.entries()].map(([id, label]) => ({ id, label, distance: camera.position.distanceTo(label.getWorldPosition(new THREE.Vector3())) })).sort((a, b) => (a.id === engine.selectedId ? -1 : b.id === engine.selectedId ? 1 : a.distance - b.distance));
      for (const entry of entries) {
        const selected = entry.id === engine.selectedId; const point = entry.label.getWorldPosition(new THREE.Vector3()).project(camera);
        if (selected && engine.selectedLabel) { entry.label.visible = false; continue; }
        const visible = selected || (entry.distance < 72 && point.z > -1 && point.z < 1);
        const width = selected ? .34 : Math.min(.22, .1 + 18 / Math.max(entry.distance, 18)); const box = { left: point.x - width / 2, right: point.x + width / 2, top: point.y + .035, bottom: point.y - .035 };
        const collision = !selected && labelBoxes.some((other) => box.left < other.right && box.right > other.left && box.bottom < other.top && box.top > other.bottom);
        entry.label.visible = visible && !collision; if (entry.label.visible) labelBoxes.push(box);
        const scale = Math.max(2.9, Math.min(7, entry.distance * .065)); entry.label.scale.set(scale, scale * .18, 1);
      }
      if (engine.selectedLabel) { const distance = camera.position.distanceTo(engine.selectedLabel.getWorldPosition(new THREE.Vector3())); const scale = Math.max(5.5, Math.min(10, distance * .09)); engine.selectedLabel.scale.set(scale, scale * .165, 1); }
    };
    const render = (time) => {
      if (engine.focus) { const elapsed = Math.min(1, (time - engine.focus.startedAt) / engine.focus.duration); const eased = 1 - ((1 - elapsed) ** 3); camera.position.lerpVectors(engine.focus.fromPosition, engine.focus.toPosition, eased); controls.target.lerpVectors(engine.focus.fromTarget, engine.focus.toTarget, eased); if (elapsed === 1) { controls.autoRotate = engine.focus.startOrbit; callbacksRef.current.onOrbitChange?.(controls.autoRotate); engine.focus = null; } }
      if (engine.selectedVisual) {
        const motion = engine.reducedMotion ? 0 : Math.sin(time * .0016) * .055;
        engine.selectedVisual.position.y = motion; if (engine.selectionOutline) engine.selectionOutline.position.y = engine.selectionOutline.userData.baseY + motion;
        const world = engine.selectedVisual.getWorldPosition(new THREE.Vector3()); engine.selectionLight.position.set(world.x + 1.8, 5.5 + motion, world.z + 2);
        engine.selectionLight.intensity = engine.reducedMotion ? 1.25 : 1.15 + Math.sin(time * .0013) * .28;
      } else engine.selectionLight.intensity = 0;
      controls.update(); updateLabels(); renderer.render(scene, camera); engine.frame = requestAnimationFrame(render);
    }; engine.frame = requestAnimationFrame(render);
    return () => { cancelAnimationFrame(engine.frame); observer?.disconnect(); window.removeEventListener('resize', resize); renderer.domElement.removeEventListener('pointerdown', down); renderer.domElement.removeEventListener('pointerup', up); controls.dispose(); dispose(root); engine.ground?.geometry.dispose(); engine.ground?.material.dispose(); engine.grid?.geometry.dispose(); engine.grid?.material.dispose(); renderer.dispose(); if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement); engineRef.current = null; };
  }, []);

  useEffect(() => {
    const engine = engineRef.current; if (!engine) return;
    dispose(engine.root); engine.root.clear(); engine.groups.clear(); engine.labels.clear(); engine.hitboxes = []; engine.selectedLabel = null; engine.selectedVisual = null; engine.selectionOutline = null;
    products.forEach((product) => {
      const group = new THREE.Group(); const visual = new THREE.Group(); group.userData.productId = product.productId; group.userData.visual = visual; group.position.set(product.position.x, 0, product.position.z); group.add(visual); addLoads(visual, product);
      const hit = new THREE.Mesh(sharedBox, new THREE.MeshBasicMaterial({ color: '#facc15', transparent: true, opacity: .001, depthWrite: false })); hit.position.y = 1.9; hit.scale.set(product.footprint.width, 4, product.footprint.depth); hit.userData.productId = product.productId; group.add(hit); engine.hitboxes.push(hit);
      const label = makeLabel(product.item, product.color); label.position.set(0, 4.65, 0); group.add(label); engine.labels.set(product.productId, label); engine.groups.set(product.productId, group); engine.root.add(group);
    });
    const selectedProduct = products.find((product) => product.productId === engine.selectedId); const selectedGroup = engine.groups.get(engine.selectedId);
    if (selectedProduct && selectedGroup) addSelectionVisual(engine, selectedProduct, selectedGroup);
    if (engine.ground) { engine.scene.remove(engine.ground); engine.ground.geometry.dispose(); engine.ground.material.dispose(); }
    if (engine.grid) { engine.scene.remove(engine.grid); engine.grid.geometry.dispose(); engine.grid.material.dispose(); }
    engine.ground = new THREE.Mesh(new THREE.PlaneGeometry(floor.width, floor.depth), material('#f7fafc')); engine.ground.rotation.x = -Math.PI / 2; engine.ground.position.y = -.03; engine.ground.receiveShadow = true; engine.scene.add(engine.ground);
    const gridSize = Math.max(floor.width, floor.depth); engine.grid = new THREE.GridHelper(gridSize, Math.min(80, Math.ceil(gridSize / 2)), '#c5d1dc', '#e2e8f0'); engine.grid.position.y = -.015; engine.scene.add(engine.grid);
    if (firstLayoutRef.current) { const distance = Math.max(22, Math.min(150, Math.max(floor.width, floor.depth) * .8)); engine.camera.position.set(distance * .65, distance * .62, distance); engine.controls.target.set(0, 1.5, 0); engine.controls.update(); firstLayoutRef.current = false; }
  }, [products, floor]);

  useEffect(() => {
    const engine = engineRef.current; if (!engine) return; engine.selectedId = selectedId;
    if (engine.selectedLabel) { engine.selectedLabel.parent?.remove(engine.selectedLabel); engine.selectedLabel.material.dispose(); engine.selectedLabel.userData.texture?.dispose(); engine.selectedLabel = null; }
    if (engine.selectionOutline) { engine.selectionOutline.parent?.remove(engine.selectionOutline); engine.selectionOutline.geometry.dispose(); engine.selectionOutline.material.dispose(); engine.selectionOutline = null; }
    if (engine.selectedVisual) engine.selectedVisual.position.y = 0;
    engine.selectedVisual = null;
    if (!selectedId) return;
    const product = productsRef.current.find((item) => item.productId === selectedId); const group = engine.groups.get(selectedId); if (!product || !group) return;
    addSelectionVisual(engine, product, group);
    animateToProduct(selectedId, true);
  }, [selectedId, focusSignal, animateToProduct]);

  useEffect(() => { const engine = engineRef.current; if (!engine || !resetSignal) return; const currentFloor = floorRef.current; const distance = Math.max(22, Math.min(150, Math.max(currentFloor.width, currentFloor.depth) * .8)); engine.controls.autoRotate = false; engine.focus = { startedAt: performance.now(), duration: 700, fromPosition: engine.camera.position.clone(), toPosition: new THREE.Vector3(distance * .65, distance * .62, distance), fromTarget: engine.controls.target.clone(), toTarget: new THREE.Vector3(0, 1.5, 0), startOrbit: false }; callbacksRef.current.onOrbitChange?.(false); }, [resetSignal]);

  return <div ref={hostRef} className="inventory-canvas" data-testid="uniquem-inventory-canvas">
    {unsupported ? <div className="inventory-webgl-fallback"><strong>3D view unavailable</strong><span>Use the accessible product list.</span><div>{products.map((product) => <button className="secondary" type="button" key={product.productId} onClick={() => onSelect(product.productId)}>{product.item} · {product.loadCount} loads</button>)}</div></div> : null}
  </div>;
}
