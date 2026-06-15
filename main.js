import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';

// ---------- units: scene is in metres, parts are authored in mm ----------
const MM = 0.001;

// Part presets (dimensions in mm). w=along X, h=along Y (up), d=along Z.
const PRESETS = {
  sheet:  { name: 'Sheet panel', w: 600,  h: 440, d: 18, color: 0xd9b382 }, // CNC plywood
  reglar: { name: 'Reglar 45×70', w: 1800, h: 70,  d: 45, color: 0xb98a4e }, // beam, lying along X
  slat:   { name: 'Seat slat',    w: 1800, h: 45,  d: 45, color: 0xc9a063 },
  leg:    { name: 'Leg',          w: 45,   h: 440, d: 45, color: 0xa9803f },
};

// ---------- scene setup ----------
const sceneEl = document.getElementById('scene');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf4f1ea);

const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 100);
camera.position.set(1.8, 1.4, 2.4);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
sceneEl.appendChild(renderer.domElement);

// lights
scene.add(new THREE.HemisphereLight(0xffffff, 0xb9ad96, 0.85));
const sun = new THREE.DirectionalLight(0xfff4e0, 1.1);
sun.position.set(3, 5, 2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 0.1;
sun.shadow.camera.far = 20;
const s = 4;
Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s });
scene.add(sun);

// ground + grid
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(20, 20),
  new THREE.MeshStandardMaterial({ color: 0xe8e2d4, roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(10, 40, 0xc9c0ac, 0xddd6c8); // 0.25 m cells
grid.position.y = 0.001;
scene.add(grid);

// controls
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true;
orbit.target.set(0, 0.3, 0);

const gizmo = new TransformControls(camera, renderer.domElement);
gizmo.setSpace('local');
gizmo.addEventListener('dragging-changed', (e) => { orbit.enabled = !e.value; });
gizmo.addEventListener('objectChange', () => { snapToGround(selected); });
scene.add(gizmo);

// ---------- state ----------
const parts = [];          // { id, type, name, w, h, d, color, mesh }
let selected = null;
let snapOn = true;
let nextId = 1;
const TRANSLATE_SNAP = 0.05; // 50 mm
const ROTATE_SNAP = THREE.MathUtils.degToRad(15);
applySnap();

// ---------- part creation ----------
function makeGeometry(p) {
  return new THREE.BoxGeometry(p.w * MM, p.h * MM, p.d * MM);
}

function addPart(type, opts = {}) {
  const preset = PRESETS[type];
  const p = {
    id: nextId++,
    type,
    name: opts.name ?? preset.name,
    w: opts.w ?? preset.w,
    h: opts.h ?? preset.h,
    d: opts.d ?? preset.d,
    color: opts.color ?? preset.color,
  };
  const mesh = new THREE.Mesh(
    makeGeometry(p),
    new THREE.MeshStandardMaterial({ color: p.color, roughness: 0.75 })
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.part = p;
  p.mesh = mesh;

  if (opts.position) {
    mesh.position.fromArray(opts.position);
  } else {
    mesh.position.set(0, 0, 0);
    snapToGround(p);
  }
  if (opts.rotationY) mesh.rotation.y = opts.rotationY;

  scene.add(mesh);
  parts.push(p);
  select(p);
  refreshCutList();
  return p;
}

// keep a part resting on the ground (lowest point at y=0)
function snapToGround(p) {
  if (!p) return;
  p.mesh.updateMatrixWorld();
  const box = new THREE.Box3().setFromObject(p.mesh);
  const dy = box.min.y;
  p.mesh.position.y -= dy;
}

function rebuildGeometry(p) {
  p.mesh.geometry.dispose();
  p.mesh.geometry = makeGeometry(p);
  snapToGround(p);
}

// ---------- selection ----------
function select(p) {
  if (selected) selected.mesh.material.emissive.setHex(0x000000);
  selected = p;
  if (p) {
    p.mesh.material.emissive.setHex(0x5a3a1a);
    p.mesh.material.emissiveIntensity = 0.35;
    gizmo.attach(p.mesh);
  } else {
    gizmo.detach();
  }
  updateInspector();
}

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let downPos = null;

renderer.domElement.addEventListener('pointerdown', (e) => {
  downPos = { x: e.clientX, y: e.clientY };
});
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!downPos) return;
  const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
  downPos = null;
  if (moved > 4 || gizmo.dragging) return; // it was an orbit / gizmo drag
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(parts.map((p) => p.mesh), false);
  if (hits.length) select(hits[0].object.userData.part);
  else select(null);
});

// ---------- inspector ----------
const $ = (id) => document.getElementById(id);
const body = $('inspector-body');
const empty = $('empty');

function updateInspector() {
  if (!selected) {
    body.style.display = 'none';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  body.style.display = 'block';
  $('i-name').value = selected.name;
  $('i-w').value = Math.round(selected.w);
  $('i-h').value = Math.round(selected.h);
  $('i-d').value = Math.round(selected.d);
}

['i-w', 'i-h', 'i-d'].forEach((id) => {
  $(id).addEventListener('input', () => {
    if (!selected) return;
    selected.w = Math.max(1, +$('i-w').value || 1);
    selected.h = Math.max(1, +$('i-h').value || 1);
    selected.d = Math.max(1, +$('i-d').value || 1);
    rebuildGeometry(selected);
    refreshCutList();
  });
});
$('i-name').addEventListener('input', () => {
  if (selected) { selected.name = $('i-name').value; refreshCutList(); }
});

$('rot-y').onclick = () => {
  if (!selected) return;
  selected.mesh.rotation.y += Math.PI / 2;
  snapToGround(selected);
};
$('lay-flat').onclick = () => {
  if (!selected) return;
  selected.mesh.rotation.x += Math.PI / 2;
  snapToGround(selected);
};
$('duplicate').onclick = duplicateSelected;
$('delete').onclick = deleteSelected;

function duplicateSelected() {
  if (!selected) return;
  const p = selected;
  addPart(p.type, {
    name: p.name, w: p.w, h: p.h, d: p.d, color: p.color,
    position: [p.mesh.position.x + 0.1, p.mesh.position.y, p.mesh.position.z + 0.1],
    rotationY: p.mesh.rotation.y,
  });
}

function deleteSelected() {
  if (!selected) return;
  const p = selected;
  scene.remove(p.mesh);
  p.mesh.geometry.dispose();
  p.mesh.material.dispose();
  parts.splice(parts.indexOf(p), 1);
  select(null);
  refreshCutList();
}

// ---------- add buttons ----------
$('add-sheet').onclick = () => addPart('sheet');
$('add-reglar').onclick = () => addPart('reglar');
$('add-slat').onclick = () => addPart('slat');
$('add-leg').onclick = () => addPart('leg');

// ---------- cut list ----------
function refreshCutList() {
  const groups = new Map();
  let plyArea = 0, reglarLen = 0;
  for (const p of parts) {
    const key = `${p.name}|${Math.round(p.w)}×${Math.round(p.h)}×${Math.round(p.d)}`;
    groups.set(key, (groups.get(key) || 0) + 1);
    if (p.type === 'sheet') plyArea += (p.w * MM) * (p.h * MM);
    else reglarLen += Math.max(p.w, p.h, p.d) * MM; // longest edge = length
  }
  const tbody = $('cutlist-table').querySelector('tbody');
  tbody.innerHTML = '';
  if (groups.size === 0) {
    tbody.innerHTML = '<tr><td id="empty-cl" style="color:#7a7466;font-style:italic">No parts yet.</td></tr>';
  } else {
    for (const [key, n] of groups) {
      const [name, dims] = key.split('|');
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${name} <span style="color:#7a7466">${dims}</span></td><td>×${n}</td>`;
      tbody.appendChild(tr);
    }
  }
  $('cutlist-totals').innerHTML =
    `${parts.length} parts · ply ≈ ${plyArea.toFixed(2)} m² · reglar ≈ ${reglarLen.toFixed(2)} m`;
}

// ---------- save / load ----------
const STORAGE_KEY = 'nowhere-furniture-v1';

function serialize() {
  return {
    version: 1,
    parts: parts.map((p) => ({
      type: p.type, name: p.name, w: p.w, h: p.h, d: p.d, color: p.color,
      position: p.mesh.position.toArray(),
      rotation: [p.mesh.rotation.x, p.mesh.rotation.y, p.mesh.rotation.z],
    })),
  };
}

function load(data) {
  clearAll();
  for (const d of data.parts || []) {
    const p = addPart(d.type, { name: d.name, w: d.w, h: d.h, d: d.d, color: d.color, position: d.position });
    if (d.rotation) p.mesh.rotation.fromArray(d.rotation);
    snapToGround(p);
  }
  select(null);
}

function clearAll() {
  [...parts].forEach((p) => { scene.remove(p.mesh); p.mesh.geometry.dispose(); p.mesh.material.dispose(); });
  parts.length = 0;
  select(null);
  refreshCutList();
}

$('save').onclick = () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(serialize()));
  toast('Saved to browser');
};
$('clear').onclick = () => { if (confirm('Remove all parts?')) clearAll(); };
$('export').onclick = () => {
  const blob = new Blob([JSON.stringify(serialize(), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'nowhere-furniture.json';
  a.click();
  URL.revokeObjectURL(a.href);
};
$('import').onclick = () => $('file-input').click();
$('file-input').onchange = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => { try { load(JSON.parse(reader.result)); toast('Imported'); } catch { toast('Bad file'); } };
  reader.readAsText(file);
  e.target.value = '';
};

// ---------- keyboard ----------
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  switch (e.key.toLowerCase()) {
    case 'w': gizmo.setMode('translate'); break;
    case 'e': gizmo.setMode('rotate'); break;
    case 's': snapOn = !snapOn; applySnap(); toast('Snap ' + (snapOn ? 'on (50 mm / 15°)' : 'off')); break;
    case 'd': if (selected) { e.preventDefault(); duplicateSelected(); } break;
    case 'delete': case 'backspace': deleteSelected(); break;
    case 'escape': select(null); break;
  }
});

function applySnap() {
  gizmo.setTranslationSnap(snapOn ? TRANSLATE_SNAP : null);
  gizmo.setRotationSnap(snapOn ? ROTATE_SNAP : null);
}

// ---------- toast ----------
let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1600);
}

// ---------- render loop & resize ----------
function resize() {
  const w = sceneEl.clientWidth, h = sceneEl.clientHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

function animate() {
  requestAnimationFrame(animate);
  orbit.update();
  renderer.render(scene, camera);
}
animate();

// ---------- boot: restore or seed a starter bench ----------
const saved = localStorage.getItem(STORAGE_KEY);
if (saved) {
  try { load(JSON.parse(saved)); } catch { seedBench(); }
} else {
  seedBench();
}
refreshCutList();
select(null);

function seedBench() {
  // two end panels + two reglar rails + three slats — a rough knock-down bench
  addPart('sheet', { name: 'Bench end', position: [-0.75, 0, 0] });
  addPart('sheet', { name: 'Bench end', position: [0.75, 0, 0] });
  addPart('reglar', { name: 'Rail 45×70', w: 1500, position: [0, 0.30, 0.20] });
  addPart('reglar', { name: 'Rail 45×70', w: 1500, position: [0, 0.30, -0.20] });
  for (let i = -1; i <= 1; i++) {
    addPart('slat', { name: 'Seat slat', w: 1500, position: [0, 0.44, i * 0.16] });
  }
  select(null);
}
