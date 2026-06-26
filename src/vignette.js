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
