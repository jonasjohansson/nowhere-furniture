// ============================================================================
// wood-photo.js — PHOTOREAL wood material (drop-in replacement for the
// procedural wood system in builder.js).
//
// Same public surface as the procedural module:
//
//     createWoodMaterial(THREE, opts) -> THREE.MeshStandardMaterial
//     disposeWoodCache()
//
// Instead of generating canvas grain, this loads real CC0 (public-domain) PBR
// wood texture sets (Color / Normal / Roughness) from assets/wood/* via
// THREE.TextureLoader. The loaded base maps are cached and shared; each part
// gets CLONES so it can carry its own repeat / offset / rotation without
// disturbing other parts that share the same base set.
//
// Design goals, mirroring the procedural module's conventions:
//   - Grain runs ALONG opts.longAxis in world space.
//   - Repeat is derived from sizeMM so real-world texture scale stays roughly
//     constant (~600 mm of timber per texture tile) regardless of part size.
//   - Per-part offset/rotation jitter is DETERMINISTIC (seeded hash of opts.seed),
//     never Math.random / Date.now.
//   - Robust: a missing asset falls back to a plain warm MeshStandardMaterial;
//     it never throws.
//
// THREE is passed in (r160) so this file imports nothing and `node --check`s
// cleanly without a bundler.
// ============================================================================

// Physical size of one texture tile, in metres. A planed board's grain reads
// best when one Color tile covers ~0.6 m of real timber; bigger and the grain
// looks coarse, smaller and it repeats visibly.
const TILE_METRES = 0.6;
const MM = 0.001; // mm -> metres (matches stock.js)

// Warm fallback used when a texture set can't be loaded.
const FALLBACK_COLOR = 0xc9a063;

// ----------------------------------------------------------------------------
// Texture-set registry. Paths are relative to THIS module (src/wood-photo.js),
// resolved against import.meta.url so it works regardless of where the app is
// served from. Each set is the CC0 ambientCG asset noted in assets/wood/README.md.
// ----------------------------------------------------------------------------
const ASSET_BASE = '../assets/wood/';

/** @type {Record<string,{dir:string, tile?:number}>} */
const SETS = {
  // Warm planed oak — the default furniture timber look (ambientCG Wood062).
  'oak-planed': { dir: 'oak-planed' },
  // Lighter planed pine — softer, good for sheet goods / plywood faces (Wood066).
  'pine-planed': { dir: 'pine-planed' },
  // Distinct plank/floorboard look with seams — for chunky reglar (Planks011).
  'plank-floor': { dir: 'plank-floor', tile: 0.7 },
};

// ----------------------------------------------------------------------------
// stockKey -> texture set mapping.
//
// Sheet goods (plywood, "ply*") read smoother and lighter -> pine-planed.
// Timber ("reglar*") reads warmer and grainier; the chunkier sections get the
// plank look, the rest get planed oak. Unknown keys fall back to oak-planed.
// ----------------------------------------------------------------------------
function setKeyForStock(stockKey) {
  const key = typeof stockKey === 'string' ? stockKey.toLowerCase() : '';
  if (key.startsWith('ply') || key.startsWith('sheet')) return 'pine-planed';
  if (key.startsWith('reglar')) {
    // The deeper sections (95/120) read like real planks; give them the seamed look.
    if (/(95|120)/.test(key)) return 'plank-floor';
    return 'oak-planed';
  }
  return 'oak-planed';
}

// ----------------------------------------------------------------------------
// Deterministic helpers — NO Math.random / Date.now. Mirrors builder.js so the
// jitter character matches the procedural module.
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

/** mulberry32 — tiny deterministic PRNG seeded from a uint, floats in [0,1). */
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

/** Coerce any seed (number/string/undefined) into a deterministic uint. */
function seedToUint(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) return seed >>> 0;
  return hashString(String(seed == null ? 'wood' : seed));
}

/** Resolve an asset path relative to this module, robust to bundler-free use. */
function resolveAsset(rel) {
  try {
    return new URL(ASSET_BASE + rel, import.meta.url).href;
  } catch {
    // Fallback for environments without import.meta (shouldn't happen in r160 ESM).
    return ASSET_BASE + rel;
  }
}

// ----------------------------------------------------------------------------
// Texture cache. Keyed by set name. Each entry is a Promise-free record of the
// three base maps plus a `failed` flag. Base maps are SHARED; callers clone.
// ----------------------------------------------------------------------------

/** @type {Map<string, {color:any, normal:any, roughness:any, failed:boolean}>} */
const _cache = new Map();
/** Single shared loader, lazily created from the THREE handed in. */
let _loader = null;

function getLoader(THREE) {
  if (!_loader) _loader = new THREE.TextureLoader();
  return _loader;
}

/**
 * Load (or fetch from cache) the base texture set for `setName`. Returns the
 * cache record immediately; textures load asynchronously and flip to visible
 * once decoded (standard three.js TextureLoader behaviour). On load error the
 * `failed` flag is set so callers can fall back, but we never throw.
 */
function loadSet(THREE, setName) {
  let rec = _cache.get(setName);
  if (rec) return rec;

  const def = SETS[setName] || SETS['oak-planed'];
  rec = { color: null, normal: null, roughness: null, failed: false };
  _cache.set(setName, rec);

  const loader = getLoader(THREE);
  const onErr = () => { rec.failed = true; };

  // Color / albedo — sRGB.
  rec.color = loader.load(resolveAsset(def.dir + '/color.jpg'), undefined, undefined, onErr);
  rec.color.colorSpace = THREE.SRGBColorSpace;
  rec.color.wrapS = rec.color.wrapT = THREE.RepeatWrapping;

  // Normal — linear data, NOT sRGB.
  rec.normal = loader.load(resolveAsset(def.dir + '/normal.jpg'), undefined, undefined, onErr);
  rec.normal.colorSpace = THREE.LinearSRGBColorSpace || THREE.NoColorSpace;
  rec.normal.wrapS = rec.normal.wrapT = THREE.RepeatWrapping;

  // Roughness — linear data.
  rec.roughness = loader.load(resolveAsset(def.dir + '/roughness.jpg'), undefined, undefined, onErr);
  rec.roughness.colorSpace = THREE.LinearSRGBColorSpace || THREE.NoColorSpace;
  rec.roughness.wrapS = rec.roughness.wrapT = THREE.RepeatWrapping;

  return rec;
}

/**
 * Clone a base map and apply a per-part transform. Cloning shares the GPU image
 * but gives this part its own repeat/offset/rotation/center. We copy the
 * colorSpace + wrap settings from the source and force an update.
 */
function cloneMap(THREE, src, { repU, repV, offU, offV, rot, aniso }) {
  if (!src) return null;
  const t = src.clone();
  t.colorSpace = src.colorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.center.set(0.5, 0.5);
  t.rotation = rot;
  t.repeat.set(repU, repV);
  t.offset.set(offU, offV);
  if (aniso) t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}

// ----------------------------------------------------------------------------
// Public API
// ----------------------------------------------------------------------------

/**
 * Build a photoreal wood MeshStandardMaterial.
 *
 * @param {any} THREE  the three.js namespace (r160).
 * @param {Object} opts
 * @param {string} [opts.stockKey]   stock id, e.g. 'reglar45x70' / 'ply18'.
 * @param {number} [opts.baseColor]  hex tint to bias the material colour toward.
 * @param {'x'|'y'|'z'} [opts.longAxis]  world axis the grain should run along.
 * @param {{w:number,h:number,d:number}} [opts.sizeMM]  part size in millimetres.
 * @param {number|string} [opts.seed]  deterministic per-part jitter seed.
 * @param {any} [opts.environment]   THREE.Texture used as envMap (PMREM RT tex).
 * @returns {any} THREE.MeshStandardMaterial
 */
export function createWoodMaterial(THREE, opts = {}) {
  const {
    stockKey,
    baseColor,
    longAxis = 'x',
    sizeMM = { w: 100, h: 100, d: 18 },
    seed,
    environment,
  } = opts;

  const w = Number.isFinite(sizeMM.w) ? sizeMM.w : 100;
  const h = Number.isFinite(sizeMM.h) ? sizeMM.h : 100;
  const d = Number.isFinite(sizeMM.d) ? sizeMM.d : 18;

  const setName = setKeyForStock(stockKey);
  const def = SETS[setName] || SETS['oak-planed'];
  const tileM = def.tile || TILE_METRES;

  const isSheet = setName === 'pine-planed';

  // Material starts warm; we tint toward baseColor below.
  const mat = new THREE.MeshStandardMaterial({
    roughness: isSheet ? 0.62 : 0.74,
    metalness: 0.0,
  });

  // Slightly tint the material colour toward baseColor so each stock keeps its
  // character while the texture supplies the detail. We never go full-saturated:
  // multiply a near-white by a soft pull toward the tint so the albedo map shows.
  const tint = new THREE.Color(0xffffff);
  if (baseColor != null) {
    const target = new THREE.Color(baseColor);
    // lerp white -> baseColor by 0.55: visible warmth, texture still reads.
    tint.lerp(target, 0.55);
  } else {
    tint.lerp(new THREE.Color(FALLBACK_COLOR), 0.45);
  }
  mat.color.copy(tint);

  if (environment) {
    mat.envMap = environment;
    mat.envMapIntensity = 0.7;
  }

  // ---- attempt to load + attach the photoreal maps -------------------------
  let rec;
  try {
    rec = loadSet(THREE, setName);
  } catch {
    rec = null;
  }

  // If the set is known to have failed, leave the plain warm material as the
  // graceful fallback (no maps, but envMap + tint still give a believable wood).
  if (!rec || rec.failed || !rec.color) {
    mat.needsUpdate = true;
    return mat;
  }

  // ---- per-part transform --------------------------------------------------
  const rnd = mulberry32(seedToUint(seed));
  const anisoMax = (THREE && THREE.MathUtils) ? 8 : 8; // anisotropy is set on clone via material below

  // Grain runs along texture-U. BoxGeometry maps the same UV layout to each
  // face; rotating the texture 90° swaps which world axis U follows. We choose
  // rotation so U aligns with the requested longAxis on the broad faces.
  //   longAxis 'x' -> grain along width  -> no rotation
  //   longAxis 'y' -> grain along height -> rotate 90°
  //   longAxis 'z' -> grain along depth  -> rotate 90°
  // (x is the board's default long run; y/z need the quarter turn, matching the
  // procedural module's "longest === h/d -> PI/2" rule.)
  const rot = (longAxis === 'x') ? 0 : Math.PI / 2;

  // Real-world scale: number of tiles across each direction = physical length
  // (m) / tile size (m). Grain direction (U) follows longAxis; the cross
  // direction (V) follows the next dimension. Pick the two in-plane dims based
  // on longAxis so repeat reflects the faces you actually see.
  let alongMM, acrossMM;
  if (longAxis === 'x') { alongMM = w; acrossMM = Math.max(h, d); }
  else if (longAxis === 'y') { alongMM = h; acrossMM = Math.max(w, d); }
  else { alongMM = d; acrossMM = Math.max(w, h); }

  // After a 90° rotation, U and V swap relative to the texture's own axes, so we
  // assign repeats to the texture's U/V accordingly to keep ~constant scale.
  const tilesAlong = Math.max(1, (alongMM * MM) / tileM);
  const tilesAcross = Math.max(1, (acrossMM * MM) / tileM);
  let repU, repV;
  if (rot === 0) { repU = tilesAlong; repV = tilesAcross; }
  else { repU = tilesAcross; repV = tilesAlong; }

  // Deterministic offset jitter so cloned parts show a different slice of grain.
  const offU = rnd();
  const offV = rnd();

  const tf = { repU, repV, offU, offV, rot, aniso: anisoMax };

  mat.map = cloneMap(THREE, rec.color, tf);
  mat.normalMap = cloneMap(THREE, rec.normal, tf);
  mat.roughnessMap = cloneMap(THREE, rec.roughness, tf);

  // With a roughnessMap present, the scalar roughness multiplies it; keep it
  // near 1 so the map drives the response, nudged by sheet/timber character.
  mat.roughness = isSheet ? 0.9 : 1.0;
  if (mat.normalMap) {
    mat.normalScale = new THREE.Vector2(isSheet ? 0.5 : 0.8, isSheet ? 0.5 : 0.8);
  }

  mat.needsUpdate = true;
  return mat;
}

/**
 * Free the loaded BASE textures and clear the cache. Per-part cloned maps are
 * owned by their materials and should be disposed alongside those materials by
 * the caller (the builder already disposes mesh.material.map etc).
 */
export function disposeWoodCache() {
  for (const rec of _cache.values()) {
    if (rec.color && rec.color.dispose) rec.color.dispose();
    if (rec.normal && rec.normal.dispose) rec.normal.dispose();
    if (rec.roughness && rec.roughness.dispose) rec.roughness.dispose();
  }
  _cache.clear();
  _loader = null;
}
