// ============================================================================
// builder.js — interactive 3D heart of the Nowhere Furniture builder.
//
// A reusable `Builder` class that wraps a Three.js scene. It renders furniture
// parts (PartSpec from stock.js), lets the user select / move / rotate them with
// a transform gizmo, snap to grid, and edit them. It owns ONLY its canvas (inside
// the container it is handed) — no panels, buttons, or other DOM. The app shell
// drives it through a clean API + an event emitter.
//
// Units: PartSpec is authored in MILLIMETRES (pos = centre, y up; rot = degrees).
// Internally the scene works in METRES — every mm value is multiplied by MM
// (0.001) on the way in and divided on the way out. getParts() always returns a
// valid PartSpec array in mm/degrees reflecting live gizmo edits, so BOM/export
// can consume it directly.
// ============================================================================

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { SHEETS, TIMBER, MM } from './stock.js';

// Local id counter — kept independent of stock.uid() so ids stay deterministic
// and pure (no Date.now / Math.random anywhere in this module).
let _bid = 0;
const nextId = () => `b${++_bid}`;

// Fallbacks for an unknown stock key: a neutral wood tone + a sensible thickness.
const FALLBACK_COLOR = 0xb59a6e;
const FALLBACK_THICKNESS = 18; // mm

// Snap increments per the spec.
const SNAP_TRANSLATE = 50 * MM; // 50 mm -> metres
const SNAP_ROTATE = THREE.MathUtils.degToRad(15); // 15°

const DEG = Math.PI / 180;

export class Builder {
  /**
   * @param {HTMLElement} container  element the canvas is appended into
   * @param {Object} [opts]
   */
  constructor(container, opts = {}) {
    this.container = container;
    this.opts = opts;

    // ---- state -----------------------------------------------------------
    /** @type {Map<string,{id:string,spec:Object,mesh:THREE.Mesh,baseColor:number}>} */
    this.items = new Map();
    this.selectedId = null;
    this._snap = false;
    this._mode = 'translate';
    this._space = 'world';
    this._showDims = false;
    this._listeners = Object.create(null);

    // ---- renderer --------------------------------------------------------
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.touchAction = 'none';

    // ---- scene -----------------------------------------------------------
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf4f1ea); // warm off-white

    // ---- camera ----------------------------------------------------------
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
    this.camera.position.set(1.6, 1.4, 2.2);

    // ---- lighting --------------------------------------------------------
    const hemi = new THREE.HemisphereLight(0xffffff, 0xb9b09a, 0.85);
    this.scene.add(hemi);

    const dir = new THREE.DirectionalLight(0xfff6e8, 1.15);
    dir.position.set(3, 5, 2);
    dir.castShadow = true;
    dir.shadow.mapSize.set(2048, 2048);
    dir.shadow.camera.near = 0.5;
    dir.shadow.camera.far = 30;
    // Wide orthographic shadow frustum so the whole assembly stays in shadow.
    const sc = dir.shadow.camera;
    sc.left = -6; sc.right = 6; sc.top = 6; sc.bottom = -6;
    sc.updateProjectionMatrix();
    dir.shadow.bias = -0.0004;
    this.scene.add(dir);
    this.dirLight = dir;

    const fill = new THREE.DirectionalLight(0xffffff, 0.25);
    fill.position.set(-2, 2, -3);
    this.scene.add(fill);

    // ---- ground + grid ---------------------------------------------------
    // Ground plane at y = 0; receives shadows but does not cast.
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40),
      new THREE.ShadowMaterial({ opacity: 0.18 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.ground = ground;

    // Metric grid: 0.1 m minor cells, 4 m extent, coarser major lines.
    const grid = new THREE.GridHelper(8, 80, 0xc9bfa6, 0xe2dac7);
    grid.position.y = 0.001; // avoid z-fighting with the shadow plane
    grid.material.transparent = true;
    grid.material.opacity = 0.7;
    this.grid = grid;
    this.scene.add(grid);

    // ---- orbit controls --------------------------------------------------
    this.orbit = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbit.enableDamping = true;
    this.orbit.dampingFactor = 0.08;
    this.orbit.target.set(0, 0.3, 0);
    this.orbit.maxPolarAngle = Math.PI * 0.495; // don't dip below the ground

    // ---- transform gizmo -------------------------------------------------
    this.gizmo = new TransformControls(this.camera, this.renderer.domElement);
    this.gizmo.setMode('translate');
    this.gizmo.setSpace('world');
    this.gizmo.setTranslationSnap(null);
    this.gizmo.setRotationSnap(null);
    this.scene.add(this.gizmo);

    // Gizmo <-> orbit handoff: while the user drags a gizmo handle, freeze the
    // orbit camera so the drag doesn't fight the camera. Also remember that a
    // drag happened so the subsequent click doesn't re-raycast / deselect.
    this._dragging = false;
    this.gizmo.addEventListener('dragging-changed', (e) => {
      this.orbit.enabled = !e.value;
      this._dragging = e.value;
      if (e.value) this._draggedThisGesture = true;
    });
    // Live updates while dragging: keep spec + dimension labels in sync and emit
    // a throttled-ish 'change' (one per object-change event is fine for ~100).
    this.gizmo.addEventListener('objectChange', () => {
      const sel = this._selectedItem();
      if (!sel) return;
      this._syncSpecFromMesh(sel);
      if (this._showDims) this._updateDimSprites(sel);
      this._emit('change', this.getParts());
    });

    // ---- raycasting / pointer state -------------------------------------
    this.raycaster = new THREE.Raycaster();
    this._pointer = new THREE.Vector2();
    this._downPos = new THREE.Vector2();
    this._draggedThisGesture = false;

    this._onPointerDown = (ev) => {
      this._downPos.set(ev.clientX, ev.clientY);
      this._draggedThisGesture = false;
    };
    this._onPointerUp = (ev) => {
      // A click that moved more than a few px, or that interacted with the
      // gizmo, is a drag/orbit — not a selection click. Ignore it.
      const dx = ev.clientX - this._downPos.x;
      const dy = ev.clientY - this._downPos.y;
      const moved = Math.hypot(dx, dy) > 5;
      if (moved || this._dragging || this._draggedThisGesture) return;
      this._handleClick(ev);
    };
    const dom = this.renderer.domElement;
    dom.addEventListener('pointerdown', this._onPointerDown);
    dom.addEventListener('pointerup', this._onPointerUp);

    // ---- dimension sprites (lazy) ---------------------------------------
    this._dimSprites = []; // active THREE.Sprite labels on the selected part
    this._dimTexCache = new Map(); // text -> CanvasTexture (reuse across frames)

    // ---- resize ----------------------------------------------------------
    this._resize();
    this._ro = new ResizeObserver(() => this._resize());
    this._ro.observe(container);

    // ---- RAF loop --------------------------------------------------------
    this._raf = 0;
    this._disposed = false;
    this._tick = this._tick.bind(this);
    this._raf = requestAnimationFrame(this._tick);
  }

  // =========================================================================
  // Public API
  // =========================================================================

  /** Replace the whole assembly with `specs` and frame the camera to fit it. */
  loadParts(specs = []) {
    this.clear({ silent: true });
    for (const spec of specs) this._buildPart(spec);
    this.select(null, { silent: true });
    this.frameAll();
    this._emit('change', this.getParts());
  }

  /** Add one part, select it, return its id. */
  addPart(spec) {
    const item = this._buildPart(spec);
    this.select(item.id);
    this._emit('change', this.getParts());
    return item.id;
  }

  /** Remove a part by id. */
  removePart(id) {
    const item = this.items.get(id);
    if (!item) return;
    if (this.selectedId === id) this.select(null, { silent: true });
    this._disposeMesh(item.mesh);
    this.items.delete(id);
    this._emit('change', this.getParts());
  }

  /** Remove every part. `opts.silent` suppresses the change/select events. */
  clear(opts = {}) {
    this.select(null, { silent: true });
    for (const item of this.items.values()) this._disposeMesh(item.mesh);
    this.items.clear();
    if (!opts.silent) this._emit('change', this.getParts());
  }

  /**
   * Current live state as PartSpec[] (mm + degrees), reflecting gizmo edits.
   * This is the source of truth BOM/export consume.
   * @returns {Object[]}
   */
  getParts() {
    const out = [];
    for (const item of this.items.values()) {
      // Re-sync from the mesh defensively so a value read mid-drag is current.
      this._syncSpecFromMesh(item);
      out.push(this._cloneSpec(item.spec));
    }
    return out;
  }

  /**
   * Patch a part. size/stock changes rebuild geometry; pos/rot/name patch in
   * place. After a size change the part is re-rested on the ground (its lowest
   * point pulled to y>=0) unless the patch itself moved it.
   */
  updatePart(id, patch = {}) {
    const item = this.items.get(id);
    if (!item) return;
    const spec = item.spec;
    const sizeChanged = patch.size && (
      patch.size.w !== spec.size.w ||
      patch.size.h !== spec.size.h ||
      patch.size.d !== spec.size.d
    );
    const stockChanged = patch.stock && patch.stock !== spec.stock;

    if (patch.name != null) spec.name = patch.name;
    if (patch.ref != null) spec.ref = patch.ref;
    if (patch.group != null) spec.group = patch.group;
    if (patch.color != null) spec.color = patch.color;
    if (patch.material != null) spec.material = patch.material;
    if (patch.stock != null) spec.stock = patch.stock;
    if (patch.size) spec.size = { ...spec.size, ...patch.size };
    if (patch.pos) spec.pos = { ...spec.pos, ...patch.pos };
    if (patch.rot) spec.rot = { ...spec.rot, ...patch.rot };

    if (sizeChanged || stockChanged) {
      this._rebuildGeometry(item);
      this._applyMaterial(item);
    }
    // Apply transform from spec -> mesh.
    this._applyTransformFromSpec(item);

    // Re-rest on ground after a size change, unless the caller moved it this
    // patch (an explicit pos.y means the user positioned it deliberately).
    if (sizeChanged && !(patch.pos && patch.pos.y != null)) {
      this._restOnGround(item);
    }

    this._syncSpecFromMesh(item);
    if (this.selectedId === id) {
      if (this._showDims) this._updateDimSprites(item);
      this._emit('select', this._cloneSpec(item.spec));
    }
    this._emit('change', this.getParts());
  }

  /** Select a part by id, or null to deselect. */
  select(id, opts = {}) {
    if (id === this.selectedId) {
      // still refresh highlight/gizmo target in case of rebuild
    }
    // Clear previous highlight.
    const prev = this._selectedItem();
    if (prev) this._setHighlight(prev, false);

    this.selectedId = id && this.items.has(id) ? id : null;
    const cur = this._selectedItem();

    if (cur) {
      this._setHighlight(cur, true);
      this.gizmo.attach(cur.mesh);
      if (this._showDims) this._updateDimSprites(cur);
    } else {
      this.gizmo.detach();
      this._clearDimSprites();
    }

    if (!opts.silent) {
      this._emit('select', cur ? this._cloneSpec(cur.spec) : null);
    }
  }

  /** @returns {Object|null} the selected PartSpec (cloned) or null. */
  getSelected() {
    const cur = this._selectedItem();
    return cur ? this._cloneSpec(cur.spec) : null;
  }

  /** Gizmo mode: 'translate' | 'rotate'. */
  setMode(mode) {
    if (mode !== 'translate' && mode !== 'rotate') return;
    this._mode = mode;
    this.gizmo.setMode(mode);
    this._applySnap();
  }

  /** Toggle snapping (50 mm translate / 15° rotate). */
  setSnap(on) {
    this._snap = !!on;
    this._applySnap();
  }

  /** Gizmo space: 'local' | 'world'. */
  setSpace(space) {
    if (space !== 'local' && space !== 'world') return;
    this._space = space;
    this.gizmo.setSpace(space);
  }

  /** Duplicate the selected part (offset 100 mm in x+z), select the copy. */
  duplicateSelected() {
    const cur = this._selectedItem();
    if (!cur) return null;
    const spec = this._cloneSpec(cur.spec);
    spec.ref = spec.ref ? `${spec.ref}'` : undefined;
    spec.pos = { x: spec.pos.x + 100, y: spec.pos.y, z: spec.pos.z + 100 };
    const item = this._buildPart(spec);
    this.select(item.id);
    this._emit('change', this.getParts());
    return item.id;
  }

  /** Delete the selected part. */
  deleteSelected() {
    if (!this.selectedId) return;
    this.removePart(this.selectedId);
  }

  /** Fit the camera to all parts (or a default framing if the scene is empty). */
  frameAll() {
    const box = new THREE.Box3();
    let any = false;
    for (const item of this.items.values()) {
      box.expandByObject(item.mesh);
      any = true;
    }
    if (!any) {
      // Empty scene: sensible default look at the origin.
      this.camera.position.set(1.6, 1.4, 2.2);
      this.orbit.target.set(0, 0.3, 0);
      this.orbit.update();
      return;
    }
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 0.2);
    const fov = this.camera.fov * DEG;
    let dist = (maxDim / 2) / Math.tan(fov / 2);
    dist *= 1.8; // padding so the assembly isn't edge-to-edge

    // Keep the existing viewing direction, just back off to the right distance.
    const dirVec = new THREE.Vector3()
      .subVectors(this.camera.position, this.orbit.target)
      .normalize();
    if (dirVec.lengthSq() < 1e-6) dirVec.set(1, 0.8, 1).normalize();

    this.orbit.target.copy(center);
    this.camera.position.copy(center).addScaledVector(dirVec, dist);
    this.camera.near = Math.max(0.01, dist / 200);
    this.camera.far = dist * 50;
    this.camera.updateProjectionMatrix();
    this.orbit.update();
  }

  /** Show/hide live mm dimension labels on the SELECTED part. */
  toggleDimensions(on) {
    this._showDims = !!on;
    const cur = this._selectedItem();
    if (this._showDims && cur) this._updateDimSprites(cur);
    else this._clearDimSprites();
  }

  // ---- event emitter ------------------------------------------------------

  /** Subscribe. event: 'select' | 'change'. */
  on(event, cb) {
    (this._listeners[event] || (this._listeners[event] = [])).push(cb);
    return this;
  }

  /** Unsubscribe. Omit cb to drop all handlers for the event. */
  off(event, cb) {
    if (!this._listeners[event]) return this;
    if (!cb) { this._listeners[event] = []; return this; }
    this._listeners[event] = this._listeners[event].filter((f) => f !== cb);
    return this;
  }

  /** Tear everything down: RAF, observers, listeners, GPU resources. */
  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    cancelAnimationFrame(this._raf);
    if (this._ro) this._ro.disconnect();

    const dom = this.renderer.domElement;
    dom.removeEventListener('pointerdown', this._onPointerDown);
    dom.removeEventListener('pointerup', this._onPointerUp);

    this.clear({ silent: true });
    this._clearDimSprites();
    for (const tex of this._dimTexCache.values()) tex.dispose();
    this._dimTexCache.clear();

    this.gizmo.detach();
    this.gizmo.dispose();
    this.orbit.dispose();

    this.grid.geometry.dispose();
    this.grid.material.dispose();
    this.ground.geometry.dispose();
    this.ground.material.dispose();

    this.renderer.dispose();
    if (dom.parentNode) dom.parentNode.removeChild(dom);
    this._listeners = Object.create(null);
  }

  // =========================================================================
  // Internals
  // =========================================================================

  _emit(event, payload) {
    const ls = this._listeners[event];
    if (!ls) return;
    // Copy so a handler that un/subscribes mid-emit can't corrupt iteration.
    for (const cb of ls.slice()) {
      try { cb(payload); } catch (err) { /* never let a listener break the loop */ console.error(err); }
    }
  }

  _selectedItem() {
    return this.selectedId ? this.items.get(this.selectedId) || null : null;
  }

  // --- stock + spec helpers ---------------------------------------------

  /** Resolve colour + thickness for a stock key, with neutral fallbacks. */
  _stockInfo(spec) {
    const key = spec.stock;
    const sheet = SHEETS[key];
    const timber = TIMBER[key];
    let color = (spec.color != null) ? spec.color : FALLBACK_COLOR;
    if (sheet && spec.color == null) color = sheet.color;
    if (timber && spec.color == null) color = timber.color;
    const isSheet = (spec.material === 'sheet') || (!!sheet && !timber);
    return { color, isSheet, sheet, timber };
  }

  /** Normalise an incoming spec into a complete, safe PartSpec (mm/degrees). */
  _normalizeSpec(spec) {
    const s = spec || {};
    const size = s.size || {};
    // Unknown stock -> keep authored size but ensure a sensible thickness for
    // sheet-like parts so a zero/undefined dim doesn't yield a degenerate box.
    const w = Number.isFinite(size.w) ? size.w : 100;
    const h = Number.isFinite(size.h) ? size.h : 100;
    let d = Number.isFinite(size.d) ? size.d : FALLBACK_THICKNESS;
    if (d <= 0) d = FALLBACK_THICKNESS;
    const pos = s.pos || {};
    const rot = s.rot || {};
    return {
      ref: s.ref,
      name: s.name != null ? s.name : 'Part',
      material: s.material === 'timber' ? 'timber' : (s.material === 'sheet' ? 'sheet' : (TIMBER[s.stock] ? 'timber' : 'sheet')),
      stock: s.stock,
      size: { w: Math.max(1, w), h: Math.max(1, h), d: Math.max(1, d) },
      pos: { x: pos.x || 0, y: (pos.y != null ? pos.y : (Math.max(1, h)) / 2), z: pos.z || 0 },
      rot: { x: rot.x || 0, y: rot.y || 0, z: rot.z || 0 },
      group: s.group,
      color: s.color,
    };
  }

  _cloneSpec(spec) {
    return {
      ref: spec.ref,
      name: spec.name,
      material: spec.material,
      stock: spec.stock,
      size: { w: spec.size.w, h: spec.size.h, d: spec.size.d },
      pos: { x: spec.pos.x, y: spec.pos.y, z: spec.pos.z },
      rot: { x: spec.rot.x, y: spec.rot.y, z: spec.rot.z },
      ...(spec.group != null ? { group: spec.group } : {}),
      ...(spec.color != null ? { color: spec.color } : {}),
    };
  }

  // --- mesh construction -------------------------------------------------

  /** Build a mesh + bookkeeping record from a spec; register and return it. */
  _buildPart(rawSpec) {
    const spec = this._normalizeSpec(rawSpec);
    const id = nextId();

    // Geometry in METRES (mm * MM). Box centred on its own origin so the mesh
    // position == part centre, matching PartSpec.pos semantics.
    const geo = new THREE.BoxGeometry(
      spec.size.w * MM, spec.size.h * MM, spec.size.d * MM
    );
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0.0 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.builderId = id;

    const item = { id, spec, mesh, baseColor: 0xffffff };
    this.items.set(id, item);
    this.scene.add(mesh);

    this._applyMaterial(item);
    this._applyTransformFromSpec(item);
    return item;
  }

  /** (Re)build the box geometry from the current spec size (mm -> m). */
  _rebuildGeometry(item) {
    const { size } = item.spec;
    item.mesh.geometry.dispose();
    item.mesh.geometry = new THREE.BoxGeometry(
      size.w * MM, size.h * MM, size.d * MM
    );
  }

  /** Apply stock colour + tone (sheet vs timber differ slightly) to material. */
  _applyMaterial(item) {
    const { color, isSheet } = this._stockInfo(item.spec);
    item.baseColor = color;
    const c = new THREE.Color(color);
    // Sheet plywood reads a touch lighter/cooler; timber a touch warmer/darker.
    if (isSheet) c.offsetHSL(0, -0.02, 0.03);
    else c.offsetHSL(0.005, 0.02, -0.03);
    item.mesh.material.color.copy(c);
    item.mesh.material.roughness = isSheet ? 0.7 : 0.78;
    // Re-apply selection highlight if this is the selected part.
    this._setHighlight(item, this.selectedId === item.id);
  }

  /** Subtle emissive highlight on the selected part. */
  _setHighlight(item, on) {
    const m = item.mesh.material;
    if (on) {
      m.emissive = new THREE.Color(0xc2703d); // accent
      m.emissiveIntensity = 0.18;
    } else {
      m.emissive = new THREE.Color(0x000000);
      m.emissiveIntensity = 0;
    }
  }

  // --- transforms: spec <-> mesh ----------------------------------------

  /** Push spec pos/rot (mm/deg) onto the mesh (m/rad). */
  _applyTransformFromSpec(item) {
    const { pos, rot } = item.spec;
    item.mesh.position.set(pos.x * MM, pos.y * MM, pos.z * MM);
    item.mesh.rotation.set(rot.x * DEG, rot.y * DEG, rot.z * DEG);
    item.mesh.updateMatrixWorld(true);
  }

  /** Read the mesh transform (m/rad) back into the spec (mm/deg). Called after
   *  every gizmo edit so getParts() stays accurate for BOM/export. */
  _syncSpecFromMesh(item) {
    const p = item.mesh.position;
    item.spec.pos = {
      x: p.x / MM,
      y: p.y / MM,
      z: p.z / MM,
    };
    const e = item.mesh.rotation; // Euler in radians (XYZ order)
    item.spec.rot = {
      x: e.x / DEG,
      y: e.y / DEG,
      z: e.z / DEG,
    };
  }

  /** Pull the part's lowest point up to y>=0 (rest on the ground). Uses the
   *  rotated world-space bounding box so tilted parts still rest correctly. */
  _restOnGround(item) {
    item.mesh.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(item.mesh);
    if (box.min.y < 0) {
      item.mesh.position.y -= box.min.y; // lift by the amount it dips below 0
      item.mesh.updateMatrixWorld(true);
    }
    this._syncSpecFromMesh(item);
  }

  _applySnap() {
    if (this._snap) {
      this.gizmo.setTranslationSnap(SNAP_TRANSLATE);
      this.gizmo.setRotationSnap(SNAP_ROTATE);
    } else {
      this.gizmo.setTranslationSnap(null);
      this.gizmo.setRotationSnap(null);
    }
  }

  // --- picking -----------------------------------------------------------

  _handleClick(ev) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this._pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    this._pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this._pointer, this.camera);

    const meshes = [];
    for (const item of this.items.values()) meshes.push(item.mesh);
    const hits = this.raycaster.intersectObjects(meshes, false);

    if (hits.length) {
      const id = hits[0].object.userData.builderId;
      if (id) this.select(id);
    } else {
      this.select(null); // empty space -> deselect
    }
  }

  // --- dimension sprites -------------------------------------------------

  /** Build (or fetch cached) a canvas-texture sprite showing `text` mm. */
  _makeDimSprite(text) {
    let tex = this._dimTexCache.get(text);
    if (!tex) {
      const pad = 8;
      const fontPx = 36;
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      ctx.font = `600 ${fontPx}px ${'-apple-system, system-ui, sans-serif'}`;
      const tw = Math.ceil(ctx.measureText(text).width);
      canvas.width = tw + pad * 2;
      canvas.height = fontPx + pad * 2;
      // Re-acquire context dims after resize, redraw.
      ctx.font = `600 ${fontPx}px ${'-apple-system, system-ui, sans-serif'}`;
      ctx.fillStyle = 'rgba(43,43,43,0.92)';
      this._roundRect(ctx, 0, 0, canvas.width, canvas.height, 6);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 1);
      tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.minFilter = THREE.LinearFilter;
      tex.userData = { aspect: canvas.width / canvas.height };
      this._dimTexCache.set(text, tex);
    }
    const mat = new THREE.SpriteMaterial({
      map: tex, depthTest: false, depthWrite: false, transparent: true,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.renderOrder = 999;
    const aspect = tex.userData.aspect || 3;
    const h = 0.05; // label height in metres (constant world size, readable)
    sprite.scale.set(h * aspect, h, 1);
    return sprite;
  }

  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /** Rebuild the three w/h/d labels on the selected part at its bbox edges. */
  _updateDimSprites(item) {
    this._clearDimSprites();
    const { size } = item.spec;
    item.mesh.updateMatrixWorld(true);
    // Axis-aligned world box gives stable, readable label placement.
    const box = new THREE.Box3().setFromObject(item.mesh);
    const min = box.min, max = box.max;
    const cx = (min.x + max.x) / 2;
    const cy = (min.y + max.y) / 2;
    const cz = (min.z + max.z) / 2;
    const off = 0.04; // metres clearance off the surface

    const labels = [
      { text: `${Math.round(size.w)}`, pos: [cx, min.y - off, max.z + off] }, // width-ish
      { text: `${Math.round(size.h)}`, pos: [max.x + off, cy, max.z + off] }, // height
      { text: `${Math.round(size.d)}`, pos: [max.x + off, min.y - off, cz] }, // depth-ish
    ];
    for (const l of labels) {
      const sp = this._makeDimSprite(l.text);
      sp.position.set(l.pos[0], l.pos[1], l.pos[2]);
      this.scene.add(sp);
      this._dimSprites.push(sp);
    }
  }

  _clearDimSprites() {
    for (const sp of this._dimSprites) {
      this.scene.remove(sp);
      sp.material.dispose(); // texture is cached/shared, do NOT dispose it here
    }
    this._dimSprites.length = 0;
  }

  // --- lifecycle ---------------------------------------------------------

  _disposeMesh(mesh) {
    if (this.gizmo.object === mesh) this.gizmo.detach();
    this.scene.remove(mesh);
    mesh.geometry.dispose();
    if (mesh.material) mesh.material.dispose();
  }

  _resize() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _tick() {
    if (this._disposed) return;
    this._raf = requestAnimationFrame(this._tick);
    this.orbit.update();
    this.renderer.render(this.scene, this.camera);
  }
}

export default Builder;
