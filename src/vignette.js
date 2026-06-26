import { mulberry32, wrapDeg } from './rng.js?v=22';
import { VIGNETTE_TEMPLATES } from './vignette_templates.js?v=22';
import { CNC_SLOT } from './designs/cnc_slot.js?v=22';
import { sampleParams } from './sample_params.js?v=22';

// sampleParams now lives in ./sample_params.js so vignette_templates.js can use
// it without importing vignette.js (breaking the former import cycle). Re-export
// it here for back-compat with existing importers of vignette.js.
export { sampleParams };

// ---------------------------------------------------------------------------
// generateVignette — the top-level deterministic seed -> vignette generator.
// ---------------------------------------------------------------------------
// Given a numeric seed it (1) weighted-picks a layout template, (2) builds a
// cohesive analogous palette, and (3) runs an overlap-guarded layout, returning
//   { seed, templateId, palette, pieces: PlacedPiece[] }
// PURE: every random choice comes from a seeded mulberry32 — no Date, no
// Math.random — so the same seed always yields a deepEqual result.

const GOLDEN_HASH = 0x9e3779b1; // mix constant for deriving per-attempt seeds
const ATTEMPTS = 12;            // max re-roll attempts before accepting the last
const OVERLAP_K = 0.8;          // allow a little visual overlap (furniture isn't a disc)

/** Union X–Z bounding box of a part list. Each part has pos (centre) + size
 *  (w,h,d): the footprint is the X (size.w) by Z (size.d) extent. Returns
 *  { w, d } = the footprint's overall width and depth in mm. */
function bboxOf(parts) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of parts) {
    const hx = p.size.w / 2, hz = p.size.d / 2;
    if (p.pos.x - hx < minX) minX = p.pos.x - hx;
    if (p.pos.x + hx > maxX) maxX = p.pos.x + hx;
    if (p.pos.z - hz < minZ) minZ = p.pos.z - hz;
    if (p.pos.z + hz > maxZ) maxZ = p.pos.z + hz;
  }
  return { w: maxX - minX, d: maxZ - minZ };
}

/** Footprint radius of a placed piece: half-diagonal of its built X–Z bbox.
 *  Rotation-invariant: the half-diagonal of the local XZ bbox is the same under
 *  any yaw, so transform.ry needn't be applied before the circle-vs-circle
 *  overlap test below — the bounding disc is unaffected by rotation. */
function footprintRadius(piece) {
  const design = CNC_SLOT.find((d) => d.id === piece.designId);
  const { parts } = design.build(piece.params);
  const bb = bboxOf(parts);
  return 0.5 * Math.hypot(bb.w, bb.d);
}

/** True if any two pieces' footprint discs interpenetrate beyond the k slack. */
function hasOverlap(pieces) {
  const r = pieces.map(footprintRadius);
  for (let i = 0; i < pieces.length; i++) {
    for (let j = i + 1; j < pieces.length; j++) {
      // transform.x/z is the piece's WORLD placement; r[] is its LOCAL footprint
      // radius (rotation-invariant, see footprintRadius). Disc-vs-disc test.
      const a = pieces[i].transform, b = pieces[j].transform;
      const dist = Math.hypot(a.x - b.x, a.z - b.z);
      if (dist < (r[i] + r[j]) * OVERLAP_K) return true;
    }
  }
  return false;
}

/** Weighted pick of a template using a single rng draw. */
function pickTemplate(rng) {
  const total = VIGNETTE_TEMPLATES.reduce((s, t) => s + t.weight, 0);
  let r = rng() * total;
  for (const t of VIGNETTE_TEMPLATES) {
    r -= t.weight;
    if (r < 0) return t;
  }
  return VIGNETTE_TEMPLATES[VIGNETTE_TEMPLATES.length - 1];
}

/** Build a cohesive analogous palette from the rng: a base hue plus a symmetric
 *  fan of related hues, all wrapped into [0,360). */
function buildPalette(rng) {
  const base = rng() * 360;
  // Symmetric analogous fan in 12-degree steps: -24,-12,0,+12,+24 around base.
  const spreads = [-2, -1, 0, 1, 2].map((i) => i * 12);
  const hues = spreads.map((d) => wrapDeg(base + d));
  return { base, hues };
}

/** Deterministic seed -> vignette. See module note above for the contract. */
export function generateVignette(seed) {
  const rng = mulberry32(seed);
  const template = pickTemplate(rng);
  const palette = buildPalette(rng);

  let pieces = null;
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    // Each attempt derives a fresh, deterministic rng from the seed + attempt
    // index, so re-rolls stay pure (no Date/Math.random) and same-seed-same-
    // result holds. The first overlap-free layout wins; else we keep the last.
    const attemptRng = mulberry32((seed ^ Math.imul(attempt + 1, GOLDEN_HASH)) >>> 0);
    pieces = template.layout(attemptRng, palette);
    if (!hasOverlap(pieces)) break;
  }

  return { seed, templateId: template.id, palette, pieces };
}

// ---------------------------------------------------------------------------
// hueToColor — a cohesive warm-wood-ish tint per piece, derived from its hue.
// ---------------------------------------------------------------------------
// HSL -> packed 0xRRGGBB int. Saturation/lightness are fixed at a muted,
// furniture-ish level so each piece reads as one coherent stained object.
// Pure: same hue always yields the same int.
const TINT_S = 0.45; // saturation
const TINT_L = 0.55; // lightness

export function hueToColor(hue, s = TINT_S, l = TINT_L) {
  const h = ((hue % 360) + 360) % 360; // wrap into [0,360)
  const c = (1 - Math.abs(2 * l - 1)) * s; // chroma
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (hp < 1)      { r = c; g = x; b = 0; }
  else if (hp < 2) { r = x; g = c; b = 0; }
  else if (hp < 3) { r = 0; g = c; b = x; }
  else if (hp < 4) { r = 0; g = x; b = c; }
  else if (hp < 5) { r = x; g = 0; b = c; }
  else             { r = c; g = 0; b = x; }
  const m = l - c / 2;
  const R = Math.round((r + m) * 255);
  const G = Math.round((g + m) * 255);
  const B = Math.round((b + m) * 255);
  return (R << 16) | (G << 8) | B;
}

// ---------------------------------------------------------------------------
// composeVignette — flatten a vignette into ONE world-space parts + joints list
// ---------------------------------------------------------------------------
// Each piece's design is built locally, then every part is rigidly placed into
// world space by the piece's transform {x, z, ry}: the part's local (x,z) is
// rotated about world Y by ry and translated by (x,z), and ry is added to the
// part's own yaw so the piece stays a coherent rigid object. y is untouched
// (pieces are grounded). Refs are prefixed P{i}- so they stay unique across
// pieces. With tint=true (default) each part is recoloured by hueToColor(hue).
//
// NOTE on rotation SIGN: this uses wx = x*cos + z*sin, wz = -x*sin + z*cos
// (and yaw += ry). The exact visual sign is confirmed in the next task; the
// convention here is applied consistently to both position and yaw.
//
// PURE/deterministic: no Date/Math.random; deep-copies size/pos/rot so callers
// can't mutate the source designs.
export function composeVignette(vignette, { tint = true } = {}) {
  const parts = [];
  const joints = [];
  vignette.pieces.forEach((piece, i) => {
    const design = CNC_SLOT.find((d) => d.id === piece.designId);
    const built = design.build(piece.params);
    const RY = piece.transform.ry * Math.PI / 180;
    const c = Math.cos(RY), s = Math.sin(RY);
    const color = tint ? hueToColor(piece.hue) : undefined;
    for (const part of built.parts) {
      const wx = part.pos.x * c + part.pos.z * s + piece.transform.x;
      const wz = -part.pos.x * s + part.pos.z * c + piece.transform.z;
      const placed = {
        ...part,
        ref: 'P' + i + '-' + part.ref,
        size: { ...part.size },
        pos: { x: wx, y: part.pos.y, z: wz },
        rot: { ...part.rot, y: (part.rot.y || 0) + piece.transform.ry },
      };
      // profile/slots pass through unchanged (CNC outline/cut data); spread
      // above already carries them. Apply tint colour, or keep the design's own.
      placed.color = tint ? color : part.color;
      parts.push(placed);
    }
    if (Array.isArray(built.joints)) joints.push(...built.joints);
  });
  return { parts, joints };
}
