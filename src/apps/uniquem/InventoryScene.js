import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

const sharedBox = new THREE.BoxGeometry(1, 1, 1);

function material(color, opacity = 1) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.04, transparent: opacity < 1, opacity });
}

function addLoads(group, product) {
  const tote = product.packaging.representation === 'tote';
  const centreOffset = ((product.columns - 1) * 1.35) / 2;
  const loadMesh = new THREE.InstancedMesh(sharedBox, material(product.color), product.loadCount);
  const palletMesh = tote ? null : new THREE.InstancedMesh(sharedBox, material('#8b5a2b'), product.loadCount);
  const cageMesh = tote ? new THREE.InstancedMesh(sharedBox, new THREE.MeshBasicMaterial({ color: '#dbeafe', wireframe: true }), product.loadCount) : null;
  const transform = new THREE.Object3D();
  for (let index = 0; index < product.loadCount; index += 1) {
    const column = tote ? Math.floor(index / 3) : index;
    const level = tote ? index % 3 : 0;
    if (palletMesh) {
      transform.position.set(column * 1.35 - centreOffset, 0.1, 0); transform.scale.set(1.15, 0.2, 1.05); transform.updateMatrix(); palletMesh.setMatrixAt(index, transform.matrix);
    }
    transform.position.set(column * 1.35 - centreOffset, tote ? 0.6 + level * 1.2 : 0.72, 0);
    transform.scale.set(tote ? 1.05 : 1, tote ? 1.08 : 1.12, tote ? 1.05 : 0.9); transform.updateMatrix(); loadMesh.setMatrixAt(index, transform.matrix);
    if (cageMesh) { transform.scale.multiplyScalar(1.01); transform.updateMatrix(); cageMesh.setMatrixAt(index, transform.matrix); }
  }
  loadMesh.castShadow = true; loadMesh.receiveShadow = true; group.add(loadMesh);
  if (palletMesh) { palletMesh.castShadow = true; palletMesh.receiveShadow = true; group.add(palletMesh); }
  if (cageMesh) group.add(cageMesh);
}

function makeLabel(text, color) {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 86;
  const context = canvas.getContext('2d');
  context.fillStyle = 'rgba(255,255,255,.94)'; context.fillRect(0, 0, 512, 86);
  context.strokeStyle = color; context.lineWidth = 5; context.strokeRect(3, 3, 506, 80);
  context.fillStyle = '#172033'; context.font = '700 22px Arial'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(text.slice(0, 52), 256, 43);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
  sprite.scale.set(6, 1, 1); sprite.userData.texture = texture; return sprite;
}

function dispose(root) {
  root.traverse((object) => {
    if (object.material) (Array.isArray(object.material) ? object.material : [object.material]).forEach((entry) => entry.dispose());
    if (object.userData.texture) object.userData.texture.dispose();
    if (object.geometry && object.geometry !== sharedBox) object.geometry.dispose();
  });
}

export default function InventoryScene({ products, floor, editing, selectedId, onSelect, onMove, resetSignal }) {
  const hostRef = useRef(null);
  const [unsupported, setUnsupported] = useState(false);
  const callbacks = useRef({ onSelect, onMove });
  callbacks.current = { onSelect, onMove };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    if (process.env.NODE_ENV === 'test') { setUnsupported(true); return undefined; }
    let gl;
    try { const probe = document.createElement('canvas'); gl = probe.getContext('webgl2') || probe.getContext('webgl'); } catch { gl = null; }
    if (!gl) { setUnsupported(true); return undefined; }

    const scene = new THREE.Scene(); scene.background = new THREE.Color('#e8f0f7'); scene.fog = new THREE.Fog('#e8f0f7', 50, 220);
    const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 400);
    const distance = Math.max(24, Math.min(110, floor.depth * 0.62)); camera.position.set(distance * 0.75, distance * 0.7, distance);
    const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); renderer.shadowMap.enabled = true; renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%'; renderer.domElement.style.display = 'block'; host.appendChild(renderer.domElement);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x64748b, 1.8));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(20, 35, 18); sun.castShadow = true; scene.add(sun);
    const grid = new THREE.GridHelper(Math.max(floor.width, floor.depth), Math.max(floor.width, floor.depth), '#8aa0b6', '#cbd5e1'); scene.add(grid);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(floor.width, floor.depth), material('#eef4f8'));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; ground.receiveShadow = true; scene.add(ground);
    const root = new THREE.Group(); root.position.z = -floor.depth / 2 + 3; scene.add(root);
    const selectable = [];
    products.forEach((product) => {
      const group = new THREE.Group(); group.userData.productId = product.productId; group.position.set(product.position.x, 0, product.position.z); group.rotation.y = -THREE.MathUtils.degToRad(product.rotation);
      addLoads(group, product);
      const hit = new THREE.Mesh(sharedBox, material(selectedId === product.productId ? '#facc15' : '#fff', selectedId === product.productId ? 0.18 : 0.001));
      hit.scale.set(product.footprint.width, 3.7, product.footprint.depth); hit.position.set(0, 1.6, 0); hit.userData.productId = product.productId; group.add(hit); selectable.push(hit);
      if (selectedId === product.productId) { const partial = product.partial ? ` · partial ${product.finalLoadQuantity} ${product.packaging.packageLabel}` : ''; const label = makeLabel(`${product.item} · ${product.loadCount} loads${partial}`, product.color); label.position.set(0, 4.2, 0); group.add(label); }
      root.add(group);
    });

    const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.dampingFactor = 0.08; controls.maxPolarAngle = Math.PI * 0.48; controls.target.set(0, 1, Math.min(floor.depth / 3, 24)); controls.update();
    const raycaster = new THREE.Raycaster(); const pointer = new THREE.Vector2(); const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); let dragging = null; const point = new THREE.Vector3();
    const pointerAt = (event) => { const rect = renderer.domElement.getBoundingClientRect(); pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1); raycaster.setFromCamera(pointer, camera); };
    const down = (event) => { pointerAt(event); const hit = raycaster.intersectObjects(selectable, false)[0]; if (!hit) return; const id = hit.object.userData.productId; callbacks.current.onSelect(id); if (editing) { dragging = root.children.find((entry) => entry.userData.productId === id); controls.enabled = false; renderer.domElement.setPointerCapture?.(event.pointerId); } };
    const move = (event) => { if (!dragging) return; pointerAt(event); if (raycaster.ray.intersectPlane(plane, point)) { dragging.position.x = Math.round(point.x); dragging.position.z = Math.round(point.z - root.position.z); } };
    const up = () => { if (!dragging) return; callbacks.current.onMove(dragging.userData.productId, { x: dragging.position.x, z: dragging.position.z }); dragging = null; controls.enabled = true; };
    renderer.domElement.addEventListener('pointerdown', down); renderer.domElement.addEventListener('pointermove', move); renderer.domElement.addEventListener('pointerup', up);
    const resize = () => { const rect = host.getBoundingClientRect(); renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height), false); camera.aspect = Math.max(1, rect.width) / Math.max(1, rect.height); camera.updateProjectionMatrix(); };
    resize(); const observer = window.ResizeObserver ? new ResizeObserver(resize) : null; observer?.observe(host); if (!observer) window.addEventListener('resize', resize);
    let frame; const animate = () => { controls.update(); renderer.render(scene, camera); frame = requestAnimationFrame(animate); }; animate();
    return () => { cancelAnimationFrame(frame); observer?.disconnect(); window.removeEventListener('resize', resize); renderer.domElement.removeEventListener('pointerdown', down); renderer.domElement.removeEventListener('pointermove', move); renderer.domElement.removeEventListener('pointerup', up); controls.dispose(); dispose(root); grid.geometry.dispose(); grid.material.dispose(); ground.geometry.dispose(); ground.material.dispose(); renderer.dispose(); if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement); };
  }, [products, floor, editing, selectedId, resetSignal]);

  return <div ref={hostRef} className="inventory-canvas" data-testid="uniquem-inventory-canvas">
    {unsupported ? <div className="inventory-webgl-fallback"><strong>3D view unavailable</strong><span>Use the accessible product list below.</span><div>{products.map((product) => <button className="secondary" type="button" key={product.productId} onClick={() => onSelect(product.productId)}>{product.item} · {product.loadCount} loads</button>)}</div></div> : null}
  </div>;
}
