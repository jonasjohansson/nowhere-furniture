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
//
// This module also owns: a procedural wood-grain material system (warm, raw-pine
// flavoured, varied per part deterministically), a soft daylight lighting rig
// with a cheap procedural environment, crisp constructed edges, a grounded
// contact shadow, plus undo/redo history. All randomness is DETERMINISTIC —
// there is no Date.now / Math.random anywhere in this file. Per-part variation
// is derived from a stable hash of the part's id/ref.
// ============================================================================

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { SHEETS, TIMBER, MM } from './stock.js?v=9';
import { disposeWoodCache } from './wood.js?v=9';
import { materialMaterial } from './materials.js?v=9';
import { createWoodMaterial as woodPhotoMaterial, disposeWoodCache as disposePhotoCache } from './wood-photo.js?v=9';

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

// History cap — bounded ring of full snapshots.
const HISTORY_CAP = 50;

// Procedural wood texture resolution. 512 is plenty for the surface detail we
// want and keeps GPU upload cheap even with ~150 cloned-per-part textures.
const WOOD_TEX_SIZE = 512;

// ----------------------------------------------------------------------------
// Deterministic helpers (no Math.random / Date.now anywhere).
// ----------------------------------------------------------------------------

/** 32-bit FNV-1a hash of a string -> unsigned int. Stable across runs. */
function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 — tiny deterministic PRNG seeded from a uint. Returns a function
 *  producing floats in [0,1). Used for per-texture procedural detail so each
 *  generated grain is repeatable for a given seed. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Builder {
  /**
   * @param {HTMLElement} container  element the canvas is appended into
   * @param {Object} [opts]
   */
  constructor(container, opts = {}) {
    this.container = container;
    this.opts = opts;

    // ---- state -----------------------------------------------------------
    /** @type {Map<string,{id:string,spec:Object,mesh:THREE.Mesh,edges:THREE.LineSegments,baseColor:number,seed:number}>} */
    this.items = new Map();
    this.selectedId = null;
    this._snap = false;
    this._mode = 'translate';
    this._space = 'world';
    this._showDims = false;
    this._listeners = Object.create(null);

    // Camera re-frame is deferred until the container reports a real size — on
    // first load the canvas is often still 0×0, so frameAll() would compute a
    // garbage distance and dump the model in a corner. We arm this flag on
    // loadParts() and let the resize handler fire the actual frame once layout
    // has settled (see ADD 1).
    this._pendingFrame = false;
    this._materialId = null; // active material from the library; null = auto per stock

    // ---- undo / redo history --------------------------------------------
    // Bounded ring of { parts: PartSpec[], selectedId }. `_applying` guards the
    // mutation methods from pushing while we rebuild from a snapshot.
    this._history = [];
    this._histIndex = -1; // points at the current state inside _history
    this._applying = false;

    // ---- renderer --------------------------------------------------------
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // ACES filmic tonemapping gives the warm, slightly filmic daylight roll-off
    // that keeps highlights on the wood from blowing out to white.
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.touchAction = 'none';

    // ---- scene -----------------------------------------------------------
    this.scene = new THREE.Scene();
    // Warm desert-haze backdrop: a vertical gradient I control end to end (light
    // warm sand up top -> deeper amber at the horizon). Unlike an HDRI sky this
    // never shows a cool twilight zenith — it's warm everywhere.
    this._bgTex = this._makeBackgroundGradient();
    this.scene.background = this._bgTex;
    // Soft desert haze — fades the far ground into the warm horizon for depth.
    this.scene.fog = new THREE.Fog(0xd2af80, 6, 26);

    // ---- camera ----------------------------------------------------------
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
    this.camera.position.set(1.6, 1.4, 2.2);

    // ---- environment (cheap, procedural) --------------------------------
    // RoomEnvironment baked through PMREM gives the MeshStandard materials
    // something soft and warm to reflect, so the wood reads like it's in a lit
    // room rather than a black void. It's generated once and tinted by the
    // warm background; no HDR file to download.
    this._pmrem = new THREE.PMREMGenerator(this.renderer);
    this._pmrem.compileEquirectangularShader();
    // SYNCHRONOUS baseline IBL. Parts are built during boot, BEFORE the HDRI
    // finishes loading async; without a valid scene.environment NOW they'd bake
    // envMap=null and the scene would visibly pop from dim to lit ~1s in (the
    // "it gets overwritten" the user sees — it's the HDRI arriving, not leaving).
    // Bake a warm RoomEnvironment up front; the HDRI then SWAPS it (warm->warm).
    const _room = new RoomEnvironment();
    this._envRT = this._pmrem.fromScene(_room, 0.04);
    this.scene.environment = this._envRT.texture;
    this.scene.environmentIntensity = 1.0;
    _room.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
    });
    // Desert-sky HDRI for the real image-based lighting. On arrival it replaces
    // the baseline and re-skins the parts so they bake the HDRI as an explicit
    // envMap at full strength (not the muted scene fallback). Background stays
    // sand. On failure the warm baseline + sand remain.
    new RGBELoader().load('assets/hdri/desert.hdr', (hdr) => {
      if (this._disposed) { hdr.dispose(); return; }
      hdr.mapping = THREE.EquirectangularReflectionMapping;
      const rt = this._pmrem.fromEquirectangular(hdr);
      if (this._envRT) this._envRT.dispose();
      this._envRT = rt;
      this.scene.environment = rt.texture;
      this.scene.environmentIntensity = 1.0;
      // Background stays the warm gradient — the HDRI only LIGHTS the wood (its
      // dusk sky has a cool purple zenith we don't want behind the furniture).
      hdr.dispose();
      for (const item of this.items.values()) this._applyMaterial(item);
    }, undefined, () => { /* keep the baseline env + sand background on failure */ });

    // ---- lighting --------------------------------------------------------
    // Hemisphere for soft warm ambient (sky warm-white, ground a muted sand).
    const hemi = new THREE.HemisphereLight(0xfff3e0, 0xbfa988, 0.12);
    this.scene.add(hemi);
    this.hemiLight = hemi;

    // Key directional light — soft PCF shadows, warm daylight colour.
    const dir = new THREE.DirectionalLight(0xfff4e2, 0.75);
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
    dir.shadow.normalBias = 0.02;
    dir.shadow.radius = 3; // soften the PCF penumbra a touch
    this.scene.add(dir);
    this.dirLight = dir;

    // Cool-ish fill from the opposite side to lift the shadow side without
    // killing form.
    const fill = new THREE.DirectionalLight(0xeaf0ff, 0.0);
    fill.position.set(-2.5, 2, -3);
    this.scene.add(fill);
    this.fillLight = fill;

    // Subtle warm rim from low-behind for a little edge glow / separation.
    const rim = new THREE.DirectionalLight(0xffd9a8, 0.2);
    rim.position.set(-1, 1.2, -4);
    this.scene.add(rim);
    this.rimLight = rim;

    // ---- ground + grid ---------------------------------------------------
    // A warm, very lightly shaded ground plane that grounds the furniture. It
    // uses a MeshStandardMaterial (so it picks up the environment) rather than a
    // pure shadow catcher, to read as a real warm surface under the pieces.
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 120),
      // A warm desert-sand floor (subtly mottled) that the furniture sits on and
      // casts shadows onto. The fog fades its far edge into the warm horizon so
      // ground -> haze -> sky read as one continuous desert.
      new THREE.MeshStandardMaterial({
        map: this._makeSandTexture(), roughness: 1.0, metalness: 0.0,
        color: 0xd9bd91,
      })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.ground = ground;

    // A soft radial "contact shadow" decal under the furniture — a cheap
    // procedural blob texture that darkens the ground near the pieces, giving
    // the assembly weight even where the directional shadow is shallow. It's
    // recentred/scaled to the assembly bounds on each (re)frame.
    const contactTex = this._makeContactShadowTexture();
    const contact = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: contactTex, transparent: true, opacity: 0.5,
        depthWrite: false, color: 0x000000,
      })
    );
    contact.rotation.x = -Math.PI / 2;
    contact.position.y = 0.0008; // just above the ground, below the grid
    contact.renderOrder = -1;
    contact.scale.set(2.5, 2.5, 1);
    this.scene.add(contact);
    this.contactShadow = contact;
    this._contactTex = contactTex;

    // No visible CAD grid — snapping still works without it. The furniture reads
    // as a clean object in the desert haze, not on a measured floor.
    this.grid = null;

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
    // drag happened so the subsequent click doesn't re-raycast / deselect, and
    // push ONE history snapshot at the end of a drag (only if it changed).
    this._dragging = false;
    this._dragStartSig = null; // signature of the selected part at drag start
    this.gizmo.addEventListener('dragging-changed', (e) => {
      this.orbit.enabled = !e.value;
      this._dragging = e.value;
      if (e.value) {
        // Drag begins: remember the part's transform so we can tell on release
        // whether anything actually moved (avoid pushing no-op history).
        this._draggedThisGesture = true;
        const sel = this._selectedItem();
        this._dragStartSig = sel ? this._transformSig(sel) : null;
      } else {
        // Drag ends: commit a single history snapshot IF the transform changed.
        const sel = this._selectedItem();
        const endSig = sel ? this._transformSig(sel) : null;
        if (this._dragStartSig !== null && endSig !== this._dragStartSig) {
          this._pushHistory(); // HISTORY PUSH: end-of-drag commit
        }
        this._dragStartSig = null;
      }
    });
    // Live updates while dragging: keep spec + dimension labels in sync and emit
    // a throttled-ish 'change' (one per object-change event). NOTE: deliberately
    // does NOT push history — only the end-of-drag commit above does.
    this.gizmo.addEventListener('objectChange', () => {
      const sel = this._selectedItem();
      if (!sel) return;
      this._syncSpecFromMesh(sel);
      this._syncEdges(sel);
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

    // ---- procedural wood material cache ---------------------------------
    // Base wood textures (map + roughnessMap) generated once per stock key and
    // cloned/offset per part. Keyed by a string derived from the stock + tint
    // so unknown keys still get a cached base. See _woodBaseFor().
    this._woodBaseCache = new Map(); // cacheKey -> {map, rough}

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
    // ADD 1: arm a pending frame rather than framing immediately. If the canvas
    // already has a valid size, frameAll() runs now and clears the flag; if not
    // (first paint, canvas still 0×0), the resize handler fires it once layout
    // settles, so the assembly always ends up correctly centred.
    this._pendingFrame = true;
    this.frameAll();
    // Seed/extend history: loadParts is a reset boundary. After the first load
    // this becomes the initial snapshot; later loads push a new boundary.
    this._seedOrPushHistory();
    this._emit('change', this.getParts());
  }

  /** Add one part, select it, return its id. */
  addPart(spec) {
    const item = this._buildPart(spec);
    this.select(item.id);
    this._pushHistory(); // HISTORY PUSH: after committed add
    this._emit('change', this.getParts());
    return item.id;
  }

  /** Remove a part by id. */
  removePart(id) {
    const item = this.items.get(id);
    if (!item) return;
    if (this.selectedId === id) this.select(null, { silent: true });
    this._disposeItem(item);
    this.items.delete(id);
    this._pushHistory(); // HISTORY PUSH: after committed remove
    this._emit('change', this.getParts());
  }

  /** Remove every part. `opts.silent` suppresses the change/select events. */
  clear(opts = {}) {
    this.select(null, { silent: true });
    for (const item of this.items.values()) this._disposeItem(item);
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
    this._syncEdges(item);
    if (this.selectedId === id) {
      if (this._showDims) this._updateDimSprites(item);
      this._emit('select', this._cloneSpec(item.spec));
    }
    this._pushHistory(); // HISTORY PUSH: after committed update
    this._emit('change', this.getParts());
  }

  /** Select a part by id, or null to deselect. */
  select(id, opts = {}) {
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

  /** Set the active material for the whole piece (a MATERIALS id, or null/'' =
   *  auto per stock). Re-skins every part; geometry/BOM are unaffected. */
  setMaterial(id) {
    this._materialId = id || null;
    for (const item of this.items.values()) this._applyMaterial(item);
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
    this._pushHistory(); // HISTORY PUSH: after committed duplicate
    this._emit('change', this.getParts());
    return item.id;
  }

  /** Delete the selected part. */
  deleteSelected() {
    if (!this.selectedId) return;
    this.removePart(this.selectedId); // removePart pushes history
  }

  /** Fit the camera to all parts (or a default framing if the scene is empty). */
  frameAll() {
    // ADD 1: only treat a frame as "done" (and clear the pending flag) if the
    // container has a real size. With a 0×0 canvas the aspect/distance maths is
    // meaningless, so we leave _pendingFrame armed for the resize handler.
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    const validSize = w > 1 && h > 1;

    const box = new THREE.Box3();
    let any = false;
    for (const item of this.items.values()) {
      box.expandByObject(item.mesh);
      any = true;
    }

    // Keep the contact shadow sitting under the actual assembly footprint.
    this._fitContactShadow(any ? box : null);

    if (!any) {
      // Empty scene: sensible default look at the origin.
      this.camera.position.set(1.6, 1.4, 2.2);
      this.orbit.target.set(0, 0.3, 0);
      this.orbit.update();
      if (validSize) this._pendingFrame = false;
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

    // Only clear the pending-frame flag once we've actually framed at a valid
    // size; otherwise the resize handler will re-run this when layout settles.
    if (validSize) this._pendingFrame = false;
  }

  /** Show/hide live mm dimension labels on the SELECTED part. */
  toggleDimensions(on) {
    this._showDims = !!on;
    const cur = this._selectedItem();
    if (this._showDims && cur) this._updateDimSprites(cur);
    else this._clearDimSprites();
  }

  // ---- undo / redo (ADD 2) -----------------------------------------------

  /** Can we step back in history? */
  canUndo() { return this._histIndex > 0; }

  /** Can we step forward in history? */
  canRedo() { return this._histIndex >= 0 && this._histIndex < this._history.length - 1; }

  /** Step back one snapshot and rebuild to it (no new history entry). */
  undo() {
    if (!this.canUndo()) return;
    this._histIndex -= 1;
    this._applyHistory(this._history[this._histIndex]);
  }

  /** Step forward one snapshot and rebuild to it (no new history entry). */
  redo() {
    if (!this.canRedo()) return;
    this._histIndex += 1;
    this._applyHistory(this._history[this._histIndex]);
  }

  // ---- event emitter ------------------------------------------------------

  /** Subscribe. event: 'select' | 'change' | 'history'. */
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

    // Free cached wood base textures held by the wood module.
    disposeWoodCache();
    disposePhotoCache();

    this.gizmo.detach();
    this.gizmo.dispose();
    this.orbit.dispose();

    if (this.grid) { this.grid.geometry.dispose(); this.grid.material.dispose(); }
    this.ground.geometry.dispose();
    this.ground.material.dispose();
    this.contactShadow.geometry.dispose();
    this.contactShadow.material.dispose();
    if (this._contactTex) this._contactTex.dispose();

    // Environment / PMREM / HDRI.
    if (this._envRT) this._envRT.dispose();
    if (this._hdrTex) this._hdrTex.dispose();
    if (this._pmrem) this._pmrem.dispose();
    if (this._bgTex) this._bgTex.dispose();
    this.scene.environment = null;
    this.scene.background = null;

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

  // --- history (ADD 2) ---------------------------------------------------

  /** A snapshot of the whole editable state. */
  _snapshot() {
    return { parts: this.getParts(), selectedId: this.selectedId };
  }

  /** Push a snapshot after a committed mutation. Truncates any redo branch,
   *  enforces the cap, and emits 'history'. No-ops while applying a snapshot. */
  _pushHistory() {
    if (this._applying) return;
    // Drop any redo tail — a new edit forks history.
    if (this._histIndex < this._history.length - 1) {
      this._history.length = this._histIndex + 1;
    }
    this._history.push(this._snapshot());
    // Enforce the bounded cap by dropping the oldest entries.
    if (this._history.length > HISTORY_CAP) {
      this._history.splice(0, this._history.length - HISTORY_CAP);
    }
    this._histIndex = this._history.length - 1;
    this._emitHistory();
  }

  /** Seed the initial snapshot on the first load; afterwards behave like a
   *  normal push (loadParts is a reset boundary). */
  _seedOrPushHistory() {
    if (this._applying) return;
    if (this._history.length === 0) {
      this._history.push(this._snapshot());
      this._histIndex = 0;
      this._emitHistory();
    } else {
      this._pushHistory();
    }
  }

  /** Rebuild parts to a snapshot and restore selection WITHOUT pushing a new
   *  history entry. Emits 'history' + a normal 'change' so app/BOM refresh. */
  _applyHistory(entry) {
    this._applying = true;
    try {
      this.clear({ silent: true });
      for (const spec of entry.parts) this._buildPart(spec);
      const want = entry.selectedId;
      this.select(want && this.items.has(want) ? want : null, { silent: true });
      // Tell the inspector about the restored selection.
      const cur = this._selectedItem();
      this._emit('select', cur ? this._cloneSpec(cur.spec) : null);
    } finally {
      this._applying = false;
    }
    this._emitHistory();
    this._emit('change', this.getParts());
  }

  _emitHistory() {
    this._emit('history', { canUndo: this.canUndo(), canRedo: this.canRedo() });
  }

  /** Compact string signature of a part's transform — used to detect whether a
   *  gizmo drag actually changed anything before committing history. */
  _transformSig(item) {
    const p = item.mesh.position, r = item.mesh.rotation;
    const q = (n) => Math.round(n * 1e5) / 1e5; // ignore sub-µm float noise
    return `${q(p.x)},${q(p.y)},${q(p.z)}|${q(r.x)},${q(r.y)},${q(r.z)}`;
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

    // Deterministic per-part seed from its ref (preferred, stable across edits)
    // or its id. Drives grain direction, tint/offset jitter — NO Math.random.
    const seed = hashString(`${spec.ref || ''}|${spec.stock || ''}|${id}`);

    // Geometry in METRES (mm * MM). Box centred on its own origin so the mesh
    // position == part centre, matching PartSpec.pos semantics.
    const geo = new THREE.BoxGeometry(
      spec.size.w * MM, spec.size.h * MM, spec.size.d * MM
    );
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.72, metalness: 0.0 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.builderId = id;

    // Crisp constructed edges: a darker line overlay tracing the box edges.
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geo, 1),
      new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18 })
    );
    edges.raycast = () => {}; // never pickable
    mesh.add(edges); // child of the mesh so it follows transforms for free

    const item = { id, spec, mesh, edges, baseColor: 0xffffff, seed };
    this.items.set(id, item);
    this.scene.add(mesh);

    this._applyMaterial(item);
    this._applyTransformFromSpec(item);
    return item;
  }

  /** (Re)build the box geometry from the current spec size (mm -> m). Rebuilds
   *  the edge overlay too. */
  _rebuildGeometry(item) {
    const { size } = item.spec;
    item.mesh.geometry.dispose();
    item.mesh.geometry = new THREE.BoxGeometry(
      size.w * MM, size.h * MM, size.d * MM
    );
    // Rebuild edges to match the new box.
    item.edges.geometry.dispose();
    item.edges.geometry = new THREE.EdgesGeometry(item.mesh.geometry, 1);
  }

  /** Edge overlay is a child of the mesh, so transforms propagate automatically.
   *  This is a placeholder hook kept for symmetry with gizmo sync sites. */
  _syncEdges(/* item */) { /* edges follow mesh as a child — nothing to do */ }

  // --- procedural wood material -----------------------------------------

  /**
   * Generate the base wood textures for a tint colour. Returns { map, rough }:
   *  - map: an albedo canvas texture — a warm pine field with soft growth-ring
   *    banding running along U, a faint directional fibre grain, and fine
   *    speckle noise so no two pixels are flat.
   *  - rough: a subtle roughness variation map (lighter in the grain valleys,
   *    so the rings catch light slightly differently) for material depth.
   *
   * The grain runs along the texture's U axis; callers rotate the texture per
   * part so the grain follows the part's longest axis. Textures are cached per
   * cacheKey and cloned per part, so building 150 parts is a handful of canvas
   * draws, not 150.
   *
   * Procedural detail uses a SEEDED PRNG (mulberry32) keyed off the tint, so the
   * generated grain is deterministic — no Math.random.
   */
  _generateWoodBase(baseColor, seedKey) {
    const size = WOOD_TEX_SIZE;
    const rnd = mulberry32(hashString(seedKey));

    // --- albedo canvas ---
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Warm raw-pine base: take the stock colour and push it warm + a touch more
    // saturated so it reads like Mari-style raw timber, not grey MDF.
    const base = new THREE.Color(baseColor);
    const hsl = { h: 0, s: 0, l: 0 };
    base.getHSL(hsl);
    hsl.h = (hsl.h + 0.005) % 1; // nudge toward amber
    hsl.s = Math.min(1, hsl.s * 1.18 + 0.04); // a little more colourful
    hsl.l = Math.min(0.92, hsl.l * 1.04 + 0.02); // keep it light/warm
    const field = new THREE.Color().setHSL(hsl.h, hsl.s, hsl.l);

    ctx.fillStyle = `rgb(${(field.r * 255) | 0},${(field.g * 255) | 0},${(field.b * 255) | 0})`;
    ctx.fillRect(0, 0, size, size);

    // Growth-ring banding: gentle vertical-ish bands across U (the grain runs
    // along U, so the rings are lines of varying tone perpendicular to fibre).
    // We sum a few sine waves with seeded phase/amplitude for an organic look.
    const ringImg = ctx.getImageData(0, 0, size, size);
    const data = ringImg.data;
    // A handful of seeded ring "centres" give the banding character.
    const waves = [];
    const nWaves = 4 + ((rnd() * 3) | 0);
    for (let i = 0; i < nWaves; i++) {
      waves.push({
        freq: 6 + rnd() * 22,      // bands across the width
        phase: rnd() * Math.PI * 2,
        amp: 0.04 + rnd() * 0.07,  // tonal depth of this band set
        skew: (rnd() - 0.5) * 0.6, // slight diagonal lean of the rings
      });
    }
    // Fine fibre lines run along U; a high-freq, low-amp modulation along V.
    const fibreFreq = 120 + rnd() * 120;
    const fibrePhase = rnd() * Math.PI * 2;

    for (let y = 0; y < size; y++) {
      const v = y / size;
      for (let x = 0; x < size; x++) {
        const u = x / size;
        // Sum the growth-ring waves (function of u, leaning by v*skew).
        let band = 0;
        for (const w of waves) {
          band += Math.sin((u + v * w.skew) * w.freq * Math.PI * 2 + w.phase) * w.amp;
        }
        // Directional fibre: faint streaks along U.
        const fibre = Math.sin(v * fibreFreq + fibrePhase + Math.sin(u * 9.0) * 0.8) * 0.018;
        // Fine speckle so flat areas still have tooth.
        const speck = (rnd() - 0.5) * 0.05;
        const shade = 1 + band + fibre + speck;

        const idx = (y * size + x) * 4;
        data[idx] = Math.max(0, Math.min(255, data[idx] * shade));
        data[idx + 1] = Math.max(0, Math.min(255, data[idx + 1] * shade));
        data[idx + 2] = Math.max(0, Math.min(255, data[idx + 2] * shade));
      }
    }
    ctx.putImageData(ringImg, 0, 0);

    // Occasional darker "knot-ish" smudges, very subtle, seeded — breaks up any
    // residual regularity without looking cartoonish.
    const knots = (rnd() * 2.5) | 0;
    for (let k = 0; k < knots; k++) {
      const kx = rnd() * size, ky = rnd() * size;
      const kr = size * (0.03 + rnd() * 0.05);
      const g = ctx.createRadialGradient(kx, ky, 0, kx, ky, kr);
      g.addColorStop(0, 'rgba(80,52,28,0.16)');
      g.addColorStop(1, 'rgba(80,52,28,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(kx, ky, kr, 0, Math.PI * 2);
      ctx.fill();
    }

    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.anisotropy = this.renderer.capabilities.getMaxAnisotropy();

    // --- roughness variation canvas ---
    // Mid-grey with the same banding embossed slightly: ring valleys read a hair
    // glossier so the grain catches the light. Cheap to derive from the albedo.
    const rcanvas = document.createElement('canvas');
    rcanvas.width = rcanvas.height = size;
    const rctx = rcanvas.getContext('2d');
    rctx.drawImage(canvas, 0, 0);
    const rImg = rctx.getImageData(0, 0, size, size);
    const rData = rImg.data;
    for (let i = 0; i < rData.length; i += 4) {
      // Luminance of the albedo -> roughness around 0.65..0.82.
      const lum = (rData[i] * 0.299 + rData[i + 1] * 0.587 + rData[i + 2] * 0.114) / 255;
      const rough = Math.max(0, Math.min(255, (0.82 - lum * 0.18) * 255));
      rData[i] = rData[i + 1] = rData[i + 2] = rough;
      rData[i + 3] = 255;
    }
    rctx.putImageData(rImg, 0, 0);
    const rough = new THREE.CanvasTexture(rcanvas);
    rough.wrapS = rough.wrapT = THREE.RepeatWrapping;

    return { map, rough };
  }

  /** Fetch (or generate + cache) the base wood textures for a part's tint. */
  _woodBaseFor(baseColor) {
    // Cache key is the quantised tint so close colours share a base — keeps the
    // number of generated textures small while preserving per-stock character.
    const cacheKey = `w${baseColor}`;
    let base = this._woodBaseCache.get(cacheKey);
    if (!base) {
      base = this._generateWoodBase(baseColor, cacheKey);
      this._woodBaseCache.set(cacheKey, base);
    }
    return base;
  }

  /**
   * Apply the procedural wood material to a part. Clones the cached base
   * textures so each part can carry its own grain DIRECTION (along its longest
   * axis), its own repeat (so grain density scales with part size), and a small
   * deterministic offset/tint jitter so cloned parts never look identical.
   */
  _applyMaterial(item) {
    const { color } = this._stockInfo(item.spec);
    item.baseColor = color;
    const { w, h, d } = item.spec.size;
    const longest = Math.max(w, h, d);
    const longAxis = longest === w ? 'x' : (longest === h ? 'y' : 'z');

    // Hand off to the materials library: resolves the active material (or a sane
    // default per stock) and returns authentic per-face grain (long grain on the
    // 4 sides, end grain on the 2 cut faces) as a 6-material array, grain along
    // longAxis, with deterministic per-board variation.
    const opts = {
      stockKey: item.spec.stock, baseColor: color, longAxis,
      sizeMM: { w, h, d }, seed: String(item.seed), environment: this.scene.environment,
    };
    // Default = realistic PHOTOGRAPHIC wood (CC0 PBR textures). When the user
    // picks a specific material the procedural species/finish library takes over.
    const mat = this._materialId
      ? materialMaterial(THREE, this._materialId, opts)
      : woodPhotoMaterial(THREE, opts);

    this._disposeMaterial(item.mesh.material);
    item.mesh.material = mat;

    // Per-part hue accent: when the spec sets an explicit colour (e.g. the
    // interlocking tabs), nudge the material's hue toward it — warmer/deeper —
    // so the part reads distinct against the rest, whatever the active material.
    if (item.spec.color != null) {
      const tint = new THREE.Color(item.spec.color);
      const arr = Array.isArray(mat) ? mat : [mat];
      for (const m of arr) {
        m.color.lerp(tint, 0.5); // blend halfway toward the accent hue
        m.needsUpdate = true;
      }
    }

    // Re-apply selection highlight if this is the selected part.
    this._setHighlight(item, this.selectedId === item.id);
  }

  /** Dispose a material or material-array plus its cloned per-part maps. */
  _disposeMaterial(mat) {
    if (!mat) return;
    const arr = Array.isArray(mat) ? mat : [mat];
    for (const m of arr) {
      if (!m) continue;
      if (m.map) m.map.dispose();
      if (m.normalMap) m.normalMap.dispose();
      if (m.roughnessMap) m.roughnessMap.dispose();
      m.dispose();
    }
  }

  /** Warm emissive lift on the selected part so it reads clearly against the
   *  richer wood materials, plus a brighter, warmer edge line. Works whether the
   *  part carries a single material or a 6-face array. */
  _setHighlight(item, on) {
    const arr = Array.isArray(item.mesh.material) ? item.mesh.material : [item.mesh.material];
    for (const m of arr) {
      if (!m) continue;
      m.emissive = new THREE.Color(on ? 0xc2703d : 0x000000);
      m.emissiveIntensity = on ? 0.22 : 0;
      m.needsUpdate = true;
    }
    if (item.edges) {
      item.edges.material.color.set(on ? 0xc2703d : 0x000000);
      item.edges.material.opacity = on ? 0.7 : 0.18;
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
    // Non-recursive so the edge-line child isn't tested (it's also non-pickable).
    const hits = this.raycaster.intersectObjects(meshes, false);

    if (hits.length) {
      const id = hits[0].object.userData.builderId;
      if (id) this.select(id);
    } else {
      this.select(null); // empty space -> deselect
    }
  }

  // --- contact shadow ----------------------------------------------------

  /** Build a soft radial blob texture used as a fake contact/ambient shadow
   *  under the assembly. Pure procedural gradient — deterministic, no random. */
  /** A warm vertical gradient backdrop — light sand at top, deeper amber at the
   *  horizon. Warm everywhere (no cool sky), full control. */
  _makeBackgroundGradient() {
    const canvas = document.createElement('canvas');
    canvas.width = 4; canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0.0, '#f1e8d6');
    g.addColorStop(0.45, '#e8d6b6');
    g.addColorStop(0.8, '#dcbb8e');
    g.addColorStop(1.0, '#d0a677');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, 256);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /** A subtly mottled warm desert-sand texture for the ground plane. */
  _makeSandTexture() {
    const s = 256;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = s;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#d9bd91';
    ctx.fillRect(0, 0, s, s);
    const rnd = mulberry32(0x5a17d3);
    const img = ctx.getImageData(0, 0, s, s);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (rnd() - 0.5) * 20;
      d[i] += n; d[i + 1] += n * 0.9; d[i + 2] += n * 0.7;
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(48, 48);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  _makeContactShadowTexture() {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const g = ctx.createRadialGradient(
      size / 2, size / 2, 0, size / 2, size / 2, size / 2
    );
    g.addColorStop(0, 'rgba(0,0,0,0.55)');
    g.addColorStop(0.55, 'rgba(0,0,0,0.22)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /** Recentre/scale the contact-shadow decal under the assembly footprint. */
  _fitContactShadow(box) {
    if (!this.contactShadow) return;
    if (!box) {
      this.contactShadow.visible = false;
      return;
    }
    this.contactShadow.visible = true;
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    // Footprint with generous padding so the soft edge falls off past the legs.
    const footprint = Math.max(size.x, size.z, 0.2) * 2.2;
    this.contactShadow.scale.set(footprint, footprint, 1);
    this.contactShadow.position.set(center.x, 0.0008, center.z);
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
      // Warm-dark pill keeps labels legible against the wood + off-white bg.
      ctx.fillStyle = 'rgba(54,42,30,0.92)';
      this._roundRect(ctx, 0, 0, canvas.width, canvas.height, 6);
      ctx.fill();
      ctx.fillStyle = '#fdf6ec';
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

  /** Dispose a part item: mesh geometry/material (+ cloned wood maps) and its
   *  edge overlay. Detaches the gizmo if it was attached to this mesh. */
  _disposeItem(item) {
    const mesh = item.mesh;
    if (this.gizmo.object === mesh) this.gizmo.detach();
    this.scene.remove(mesh);
    // Edge overlay (child of mesh).
    if (item.edges) {
      item.edges.geometry.dispose();
      item.edges.material.dispose();
    }
    mesh.geometry.dispose();
    this._disposeMaterial(mesh.material);
  }

  _resize() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();

    // ADD 1: once the container actually has a real (non-trivial) size AND a
    // frame is pending from loadParts(), do the deferred framing now. This is
    // what fixes "model loads tiny in a corner": the first frameAll() during
    // loadParts ran against a 0×0 canvas and left _pendingFrame armed; here it
    // finally runs with correct dimensions. It only fires while pending, so it
    // never steals the camera after the user has started orbiting.
    if (this._pendingFrame && this.container.clientWidth > 1 && this.container.clientHeight > 1) {
      this.frameAll();
    }
  }

  _tick() {
    if (this._disposed) return;
    this._raf = requestAnimationFrame(this._tick);
    this.orbit.update();
    this.renderer.render(this.scene, this.camera);
  }
}

export default Builder;
