// ============================================================================
// engineering.js — the SHARED structural vocabulary every design builds from.
// Encodes real rules of thumb (ergonomics, spans, joinery, screw schedules) and
// a set of member factories so designs are sound + consistent, not raw boxes.
// All metric, millimetres. Members return PartSpec (see stock.js contract).
// ============================================================================
import { SHEETS, TIMBER, SCREWS, SCREW_KEYS } from './stock.js?v=21';

// ----------------------------------------------------------------------------
// 1. ERGONOMICS — seating geometry presets (mm / degrees). Honest, comfortable.
// ----------------------------------------------------------------------------
export const ERGO = {
  dining:  { seatH: 450, seatD: 420, backAngle: 100, backH: 360 }, // eating upright
  bench:   { seatH: 440, seatD: 400, backAngle: 100, backH: 340 }, // communal bench
  chair:   { seatH: 450, seatD: 420, backAngle: 102, backH: 380 },
  stool:   { seatH: 440, seatD: 340, backAngle: 90,  backH: 0   }, // no back
  lounge:  { seatH: 330, seatD: 520, backAngle: 112, backH: 520 }, // reclined chill
  daybed:  { seatH: 320, seatD: 760, backAngle: 90,  backH: 0   },
  table:   { topH: 730, kneeClear: 620 },                          // dining table top
  lowtable:{ topH: 380, kneeClear: 300 },
};

// ----------------------------------------------------------------------------
// 2. STRUCTURE — span / deflection / support rules of thumb for seating loads.
// Conservative for outdoor softwood + plywood holding adult weight. Returns mm.
// ----------------------------------------------------------------------------
// Max advisable UNSUPPORTED span for a reglar used on-edge as a seat bearer.
export function beamMaxSpan(stockKey) {
  const t = TIMBER[stockKey];
  if (!t) return 1000;
  const depth = Math.max(t.section.w, t.section.h); // on-edge depth carries load
  // ~ depth * 18 is a safe seat-bearer span (e.g. 70mm -> ~1260, 95 -> ~1700).
  return Math.round(depth * 18);
}
// A plywood seat/top of given thickness wants a support at least this often.
export function panelSupportSpacing(thicknessMm) {
  // 12mm -> ~300, 15 -> ~380, 18 -> ~450, 21 -> ~520. (~25x thickness.)
  return Math.round(thicknessMm * 25);
}
// Number of intermediate bearers needed to support a seat of given length.
export function bearersFor(lengthMm, stockKey) {
  const span = beamMaxSpan(stockKey);
  return Math.max(2, Math.ceil(lengthMm / span) + 1); // +1 for the two ends
}
// Anti-tip: base footprint should be at least this fraction of seat height wide.
export const STABILITY = { minBaseFactor: 0.42, splayForTall: 8 /*deg*/ };

// ----------------------------------------------------------------------------
// 3. JOINERY — pick a Torx screw + count for a joint, return Joint objects.
// Rule: screw should penetrate the far member by >= the near member's thickness,
// so length ~ nearThickness + 0.9*nearThickness, clamped to stocked sizes.
// ----------------------------------------------------------------------------
export function screwForThickness(nearMm) {
  const want = nearMm + Math.max(28, nearMm * 0.9);
  let best = SCREW_KEYS[0];
  for (const k of SCREW_KEYS) {
    if (SCREWS[k].length >= want) { best = k; break; }
    best = k; // fall through to longest if nothing reaches `want`
  }
  return best;
}
// timber-to-timber butt joint through the near member's face.
export function buttJoint(nearStockKey, perEnd = 2, note) {
  const t = TIMBER[nearStockKey];
  const near = t ? Math.min(t.section.w, t.section.h) : 45;
  return { type: 'torx-butt', screw: screwForThickness(near), count: perEnd, note };
}
// plywood panel screwed down/into a timber frame: a screw every ~spacing mm.
export function panelEdgeJoint(panelStockKey, edgeLenMm, spacing = 220, note) {
  const th = SHEETS[panelStockKey] ? SHEETS[panelStockKey].thickness : 18;
  const count = Math.max(2, Math.round(edgeLenMm / spacing) + 1);
  return { type: 'torx-face', screw: screwForThickness(th), count, note };
}
// lap / face joint between two panels or panel+thick member.
export function faceJoint(nearMm, count = 4, note) {
  return { type: 'torx-face', screw: screwForThickness(nearMm), count, note };
}

// ----------------------------------------------------------------------------
// 4. SLATS — lay an even field of slats across a span with a target gap.
// Returns { count, gap, positions[] } (positions = centre coord of each slat).
// ----------------------------------------------------------------------------
export function slatField(spanMm, slatW, targetGap = 12, axisStart = null) {
  // n slats + (n-1) gaps span the width as tightly as possible to targetGap.
  let n = Math.max(2, Math.floor((spanMm + targetGap) / (slatW + targetGap)));
  const gap = n > 1 ? (spanMm - n * slatW) / (n - 1) : 0;
  const start = axisStart != null ? axisStart : -spanMm / 2 + slatW / 2;
  const positions = [];
  for (let i = 0; i < n; i++) positions.push(start + i * (slatW + gap));
  return { count: n, gap: Math.round(gap), positions };
}

// ----------------------------------------------------------------------------
// 5. MEMBER FACTORIES — return PartSpec. Use these instead of raw boxes so
// every design speaks the same constructional language. axis: which world axis
// the member's LENGTH runs along ('x'|'y'|'z'). pos = centre (mm).
// ----------------------------------------------------------------------------
function sizeAlong(axis, length, secA, secB) {
  // place `length` on `axis`; section dims on the other two axes.
  if (axis === 'x') return { w: length, h: secA, d: secB };
  if (axis === 'y') return { w: secA, h: length, d: secB };
  return { w: secA, h: secB, d: length }; // z
}

/** A timber member of given stock, length along `axis`, centred at pos. */
export function beam(ref, name, stockKey, length, axis, pos, group) {
  const t = TIMBER[stockKey] || { section: { w: 45, h: 45 } };
  const { w: sw, h: sh } = t.section;
  return {
    ref, name, material: 'timber', stock: stockKey,
    size: sizeAlong(axis, length, sw, sh),
    pos: { ...pos }, rot: { x: 0, y: 0, z: 0 }, group,
  };
}

/**
 * A timber member laid FLAT (wide face up) instead of on-edge — for a visible
 * TABLE TOP where boards should lie flat, not stand as narrow fins.
 *
 * beam()/sizeAlong() always put the LARGER section dim on the vertical axis of a
 * horizontal member (on-edge: stiff, correct for hidden joists/bearers). plank()
 * does the opposite for the visible top surface: it orients the member so the
 * WIDE section dim runs horizontally (across the top) and the NARROW section dim
 * is vertical (the board's thickness). We achieve this by feeding the section
 * dims to sizeAlong() in swapped order (wide first, narrow second) so the narrow
 * dim lands on the member's vertical axis.
 *
 * Use for table tops only; keep beam() (on-edge) for joists, bearers, aprons.
 */
export function plank(ref, name, stockKey, length, axis, pos, group) {
  const t = TIMBER[stockKey] || { section: { w: 45, h: 45 } };
  const { w: sw, h: sh } = t.section;
  const wide = Math.max(sw, sh);   // across the top (horizontal)
  const narrow = Math.min(sw, sh); // the board's thickness (vertical, y)
  // Build the cut size directly so the NARROW dim is always on the vertical (y)
  // axis (flat) and the WIDE dim runs across the top, whatever horizontal axis
  // the plank's length follows. (beam() would put `wide` on y => on-edge.)
  let size;
  if (axis === 'x') size = { w: length, h: narrow, d: wide };       // length x, flat
  else if (axis === 'z') size = { w: wide, h: narrow, d: length };  // length z, flat
  else size = { w: wide, h: length, d: narrow };                    // vertical plank (rare)
  return {
    ref, name, material: 'timber', stock: stockKey,
    size, pos: { ...pos }, rot: { x: 0, y: 0, z: 0 }, group,
  };
}

/** A vertical leg (length along y). */
export function leg(ref, stockKey, height, pos, group) {
  return beam(ref, 'Leg', stockKey, height, 'y', pos, group);
}

/**
 * A plywood panel. plane sets which way it faces:
 *  'xz' = lies flat (thickness up, a seat/top), 'xy' = upright facing Z (a back),
 *  'zy' = upright facing X (a side/end). a,b = the two in-plane dims (mm).
 */
export function panel(ref, name, stockKey, a, b, plane, pos, group) {
  const th = SHEETS[stockKey] ? SHEETS[stockKey].thickness : 18;
  let size;
  if (plane === 'xz') size = { w: a, h: th, d: b };       // flat
  else if (plane === 'xy') size = { w: a, h: b, d: th };  // faces +/-z
  else size = { w: th, h: b, d: a };                      // 'zy', faces +/-x
  return {
    ref, name, material: 'sheet', stock: stockKey,
    size, pos: { ...pos }, rot: { x: 0, y: 0, z: 0 }, group,
  };
}

/** A small square corner block / cleat for screwing two members together. */
export function cleat(ref, stockKey, length, axis, pos, group) {
  return beam(ref, 'Cleat', stockKey, length, axis, pos, group || 'Cleats');
}

// ----------------------------------------------------------------------------
// 6. SUB-ASSEMBLIES — common, well-braced structures in one call.
// ----------------------------------------------------------------------------
/**
 * A four-leg + apron base (table/bench/stool). Returns { parts, joints }.
 * opts: { legStock, apronStock, w, d, h, inset } — w x d footprint, h to apron top.
 * Legs at the corners, aprons connecting them just under the top for rigidity.
 */
export function frameBase(opts) {
  const { legStock = 'reglar45x45', apronStock = 'reglar34x45',
    w, d, h, inset = 0, group = 'Base' } = opts;
  const lt = TIMBER[legStock].section;
  const at = TIMBER[apronStock].section;
  const hw = w / 2 - lt.w / 2 - inset;
  const hd = d / 2 - lt.w / 2 - inset;
  const parts = [];
  const joints = [];
  const legPts = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
  legPts.forEach(([x, z], i) => {
    parts.push(leg(`L${i + 1}`, legStock, h, { x, y: h / 2, z }, group));
  });
  const apronTop = h - 10;        // apron sits just below the top
  const apronY = apronTop - at.h / 2;
  // long aprons (run along x, front & back), short aprons (along z, sides)
  const lx = w - 2 * lt.w - 2 * inset;
  const lz = d - 2 * lt.w - 2 * inset;
  parts.push(beam('AF', 'Apron front', apronStock, lx, 'x', { x: 0, y: apronY, z: hd }, group));
  parts.push(beam('AB', 'Apron back', apronStock, lx, 'x', { x: 0, y: apronY, z: -hd }, group));
  parts.push(beam('ASL', 'Apron side L', apronStock, lz, 'z', { x: -hw, y: apronY, z: 0 }, group));
  parts.push(beam('ASR', 'Apron side R', apronStock, lz, 'z', { x: hw, y: apronY, z: 0 }, group));
  // each apron screwed into two legs, 2 screws per end.
  joints.push(buttJoint(apronStock, 16, 'aprons into legs, 2 per end (8 joints)'));
  return { parts, joints };
}

// ----------------------------------------------------------------------------
// 7. ASSEMBLY + REVIEW helpers — designs may attach human-readable build info.
// ----------------------------------------------------------------------------
/** Quick sanity review of a built design; returns warning strings. */
export function reviewBuild({ parts = [], seatH, seatSpan, seatStock }) {
  const notes = [];
  if (seatSpan && seatStock && seatSpan > beamMaxSpan(seatStock)) {
    notes.push(`Seat bearer span ${seatSpan}mm exceeds ~${beamMaxSpan(seatStock)}mm advisable for ${seatStock} — add a mid bearer.`);
  }
  if (seatH && (seatH < 300 || seatH > 480)) {
    notes.push(`Seat height ${seatH}mm is outside the comfortable 300-480mm range.`);
  }
  return notes;
}

/** Difficulty score from part + cut count, for the catalog UI. */
export function difficultyOf(parts) {
  const n = parts.length;
  if (n <= 6) return 'Easy';
  if (n <= 14) return 'Moderate';
  return 'Involved';
}

export { SHEETS, TIMBER, SCREWS } from './stock.js?v=21';
