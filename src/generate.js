// ============================================================================
// generate.js — INVENTS new slot-together furniture from a seed.
//
// This file grows over the generator tasks; for now it exposes only varyFin().
// Everything here is PURE: the only randomness is the caller-seeded rng (a
// mulberry32 function) — no Date, no Math.random.
// ============================================================================
import {
  ERGO, fin, profileBBox, beamMaxSpan,
  profilePanel, rect, crossLapSlot, slotJoint,
} from './engineering.js?v=23';
import { mulberry32, pick } from './rng.js?v=23';
import { RELIEF, SHEETS } from './stock.js?v=23';

/** Clamp v into [lo, hi]. */
function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
/** A bounded signed offset: rng()->[0,1) mapped to [-amp, +amp]. */
function signed(rng, amp) {
  return (rng() * 2 - 1) * amp;
}

/**
 * varyFin(spec, rng) — produce a side-fin profile (the side silhouette of a
 * chair / lounger) from ergonomic anchors plus seeded, BOUNDED variation.
 *
 * spec: { seatH, seatD, backAngle (deg, from seat), backH } — same fields the
 * cnc-slot-lounge design uses. Returns a profile { pts:[{x,y}...], arcs:[...] }
 * in LOCAL coords: local-x = front→back depth, local-y = height, foot on the
 * ground at y=0 (the house side-fin convention, mirrored from the lounge).
 *
 * The five ergonomic anchors are computed exactly as the lounge does
 * (front-foot → seat-front → seat-back/pivot → back-top → rear-foot). The rng
 * then PERTURBS that skeleton — control points never float free, every offset
 * is clamped to a fraction of the relevant dimension so profileBBox always
 * stays within sane bounds (height in (seatH, seatH+backH); depth roughly
 * 0.6–1.8 × seatD). Same seed -> identical profile.
 */
export function varyFin(spec, rng) {
  const seatH = spec.seatH;
  const seatD = spec.seatD;
  const backH = spec.backH;
  const rad = (spec.backAngle * Math.PI) / 180;

  // --- Ergonomic skeleton (mirrors the lounge anchor math) -----------------
  const backDX = -backH * Math.cos(rad);   // backAngle>90 => leans rearward (+x)
  const backDY = backH * Math.sin(rad);    // vertical rise of the back
  const seatFrontX = 0;
  const seatBackX = seatD;                  // pivot where seat meets back
  const backTopX = seatBackX + backDX;
  const backTopY = seatH + backDY;
  const rearFootX = backTopX;               // rear foot under the back-top

  // --- Bounded control offsets (PERTURB the skeleton, clamped) -------------
  // Clamps are deliberately conservative so the resulting bbox always lands
  // inside (seatH, seatH+backH) for height and ~[0.6,1.8]·seatD for depth.

  // Foot flare: push the two feet apart along x (front foot back -x, rear foot
  // forward/back) for a stance — clamped to a fraction of seatD.
  const frontFootFlare = clamp(signed(rng, seatD * 0.10), -seatD * 0.12, seatD * 0.12);
  const rearFootFlare = clamp(signed(rng, seatD * 0.12), -seatD * 0.14, seatD * 0.14);

  // Seat-front taper: lift / nudge the seat-front lip in x (toe room).
  const seatFrontTaper = clamp(signed(rng, seatD * 0.06), -seatD * 0.08, seatD * 0.08);

  // Back lean delta: extra rearward/forward shift of the back-top in x.
  const backLeanX = clamp(signed(rng, backH * 0.08), -backH * 0.10, backH * 0.10);
  // Back rise delta: DOWNWARD-biased, and the UPWARD allowance is capped to a
  // fraction of the actual headroom left under the seatH+backH ceiling. The
  // skeleton's backTopY can already sit a hair under that ceiling (when
  // sin(backAngle)≈1), so a fixed upward clamp would overshoot — gate it on the
  // remaining headroom instead so the bbox height stays strictly below the cap.
  const ceiling = seatH + backH;
  const headroom = Math.max(0, ceiling - backTopY); // skeleton gap to the ceiling
  const upCap = Math.min(backH * 0.04, headroom * 0.5);
  const backRiseRaw = rng() * (backH * 0.16) - backH * 0.12; // [-0.12, +0.04]·backH
  const backRiseY = clamp(backRiseRaw, -backH * 0.14, upCap);

  // Resolve the x extremes and clamp the RIGHTMOST extent against the depth cap.
  // A deeply reclined back already pushes the rear foot far back, so the rear
  // perturbations (backLeanX + rearFootFlare) must not push width past
  // 1.8·seatD. minX is the front foot (always ≤ 0); rightMax is the budget for
  // the rear edge given that left extent.
  const frontFootX = seatFrontX - frontFootFlare;   // ≤ 0
  const seatLipX = seatFrontX + seatFrontTaper;     // may be < 0 too
  const minX = Math.min(frontFootX, seatLipX, 0);   // true left extent of the hull
  const rightCap = minX + seatD * 1.8 - 1;          // -1mm so it stays strictly under
  const rearDesired = rearFootX + backLeanX + rearFootFlare;
  const rearActual = Math.min(rearDesired, rightCap);
  // Keep the back-top from poking past the rear foot's clamped x (so the bbox
  // right edge is exactly rearActual). Hold a little budget back from rearActual
  // so a flat top SHOULDER can sit between the back-top and the rear edge.
  const topGap = Math.max(0, rearActual - (minX + 1)); // x-budget rear of minX
  const backTopXp = Math.min(backTopX + backLeanX, minX + 1 + topGap * 0.7);
  const backTopYp = backTopY + backRiseY;

  // SOFTEN THE FIN TOP. Instead of a single sharp peak at backTop (a spike where
  // the reclined back edge meets the steep rear edge), add a short, gently-
  // sloping flat TOP EDGE from backTop rearward to a shoulder. This makes the
  // silhouette read as a chair-back top, not a point. The shoulder stays at or
  // below backTop.y and at or left of rearActual, so the bbox (height = backTop.y,
  // right = rearActual) is unchanged → varyFin's bounds still hold.
  const shoulderW = clamp(seatD * 0.10, 0, Math.max(0, rearActual - backTopXp));
  const backShoulderX = Math.min(backTopXp + shoulderW, rearActual);
  const backShoulderY = backTopYp - Math.min(shoulderW * 0.5, backTopYp * 0.06);

  // Build the perturbed anchors. NAMED so consumers don't depend on the
  // positional order of the pts array (see the `anchors` key on the return).
  // backTop = the front-top corner (end of the seatPivot→backTop back edge);
  // backShoulder = the rear end of the short flat top, leading into the rear edge.
  const named = {
    frontFoot:    { x: frontFootX, y: 0 },                  // front foot
    seatLip:      { x: seatLipX, y: seatH },                // seat front lip
    seatPivot:    { x: seatBackX, y: seatH },               // seat back / pivot
    backTop:      { x: backTopXp, y: backTopYp },           // back top (top of the back edge)
    backShoulder: { x: backShoulderX, y: backShoulderY },   // rear end of the flat top
    rearFoot:     { x: rearActual, y: 0 },                  // rear foot
  };
  const anchors = [
    named.frontFoot, named.seatLip, named.seatPivot,
    named.backTop, named.backShoulder, named.rearFoot,
  ];

  // Straight-segment fin. We express the silhouette's character through the
  // bounded anchor perturbations above rather than fillet arcs: fin()'s 'curve'
  // mode bows whole segments OUTWARD (its arcs can balloon the bbox well past
  // the anchors), which would break the depth/height bounds. Keeping 'poly'
  // means the bbox is exactly the perturbed-anchor hull, which our clamps keep
  // inside (seatH, seatH+backH) tall and ~[0.6,1.8]·seatD deep.
  //
  // Return the profile PLUS its named anchors so consumers (generateDesign's
  // build) read seat/back crossing geometry by NAME rather than by positional
  // index into pts — decoupling them from this anchor order / fin() mode. The
  // extra `anchors` key is additive: `.pts`/`.arcs` are unchanged, so the G1
  // tests (deepEqual same-seed, profileBBox, varies) still hold.
  return { ...fin(anchors, 'poly'), anchors: named };
}

// ============================================================================
// validateDesign — the VALIDITY GATE. Builds a design and runs four structural
// checks; returns { ok:true } or { ok:false, reason }. Pure: no side effects,
// no randomness — the same design always yields the same verdict. The generator
// calls this after each candidate and re-rolls on { ok:false }.
// ============================================================================

// --- 2-D geometry primitives (small, pure) ---------------------------------

/** Orientation sign of the triplet (a,b,c): >0 ccw, <0 cw, 0 collinear. */
function cross3(a, b, c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}
/** Is point q on segment a-b, given the three are collinear? */
function onSeg(a, b, q) {
  return Math.min(a.x, b.x) <= q.x && q.x <= Math.max(a.x, b.x)
    && Math.min(a.y, b.y) <= q.y && q.y <= Math.max(a.y, b.y);
}
/** Do segments p1-p2 and p3-p4 properly cross (shared endpoints don't count)? */
function segmentsCross(p1, p2, p3, p4) {
  const d1 = cross3(p3, p4, p1);
  const d2 = cross3(p3, p4, p2);
  const d3 = cross3(p1, p2, p3);
  const d4 = cross3(p1, p2, p4);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0))
    && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  // collinear overlap cases (a vertex lying inside the other edge)
  if (d1 === 0 && onSeg(p3, p4, p1)) return true;
  if (d2 === 0 && onSeg(p3, p4, p2)) return true;
  if (d3 === 0 && onSeg(p1, p2, p3)) return true;
  if (d4 === 0 && onSeg(p1, p2, p4)) return true;
  return false;
}

/**
 * Does a closed polygon (array of {x,y}) self-intersect? Tests every pair of
 * NON-ADJACENT edges (adjacent edges legitimately share a vertex). The closing
 * edge pts[n-1]->pts[0] is included.
 */
function polygonSelfIntersects(pts) {
  const n = pts.length;
  if (n < 4) return false;
  const edge = (i) => [pts[i], pts[(i + 1) % n]];
  for (let i = 0; i < n; i++) {
    const [a1, a2] = edge(i);
    for (let j = i + 1; j < n; j++) {
      // skip adjacent edges (share a vertex) and the wrap-adjacent pair
      if (j === i) continue;
      if (j === (i + 1) % n || i === (j + 1) % n) continue;
      const [b1, b2] = edge(j);
      if (segmentsCross(a1, a2, b1, b2)) return true;
    }
  }
  return false;
}

/** Axis-aligned bbox {minX,maxX,minY,maxY} of a list of {x,y}. */
function pointsBBox(pts) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  }
  return { minX, maxX, minY, maxY };
}

/** Andrew's monotone-chain convex hull of {x,y} points. Returns hull pts ccw. */
function convexHull(points) {
  const pts = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length <= 2) return pts;
  const half = (src) => {
    const h = [];
    for (const p of src) {
      while (h.length >= 2 && cross3(h[h.length - 2], h[h.length - 1], p) <= 0) h.pop();
      h.push(p);
    }
    h.pop();
    return h;
  };
  const lower = half(pts);
  const upper = half(pts.slice().reverse());
  return lower.concat(upper);
}

/** Is point inside (or on) a convex polygon given ccw? Tolerant by `tol`. */
function pointInConvex(hull, q, tol = 1e-6) {
  if (hull.length === 1) return Math.hypot(hull[0].x - q.x, hull[0].y - q.y) <= tol;
  if (hull.length === 2) {
    // degenerate hull = a segment; inside means on the segment
    return Math.abs(cross3(hull[0], hull[1], q)) <= tol && onSeg(hull[0], hull[1], q);
  }
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length];
    if (cross3(a, b, q) < -tol) return false; // strictly outside an edge
  }
  return true;
}

// --- per-part geometry helpers ---------------------------------------------

/** Sheet thickness (mm) for a part. */
function thicknessOf(part) {
  return SHEETS[part.stock] ? SHEETS[part.stock].thickness : 18;
}

/** World-Y range [lo,hi] of a part (mirrors the test harness partYRange). */
function partYRange(part) {
  if (!part.profile) {
    return [part.pos.y - part.size.h / 2, part.pos.y + part.size.h / 2];
  }
  if (part.profile.plane === 'xz') {
    const t = thicknessOf(part);
    return [part.pos.y - t / 2, part.pos.y + t / 2];
  }
  const bb = profileBBox(part.profile);
  return [part.pos.y - bb.h / 2, part.pos.y + bb.h / 2];
}

/** World X–Z footprint rectangle corners of a part (4 {x,y} pts, y=world-z). */
function footprintCorners(part) {
  const hw = part.size.w / 2, hd = part.size.d / 2;
  const cx = part.pos.x, cz = part.pos.z;
  return [
    { x: cx - hw, y: cz - hd }, { x: cx + hw, y: cz - hd },
    { x: cx + hw, y: cz + hd }, { x: cx - hw, y: cz + hd },
  ];
}

// --- the gate ---------------------------------------------------------------

const DEFAULT_PARAMS = {};

/**
 * validateDesign(design, p, opts) -> { ok, reason? }
 *
 * Builds the design (design.build(p)) and runs the structural checks below; the
 * first failure short-circuits with a specific reason string. Pure.
 *
 * opts:
 *   - seatSpan, seatStock : declare an unsupported seat-bearer span to vet.
 *   - groundTol           : foot-on-floor tolerance for the CoM hull (default 2).
 */
export function validateDesign(design, p = DEFAULT_PARAMS, opts = {}) {
  const built = design.build(p);
  const parts = built.parts || [];

  // 1. SELF-INTERSECTION — each profile's outline must be a simple polygon.
  for (const part of parts) {
    if (part.profile && Array.isArray(part.profile.pts)) {
      if (polygonSelfIntersects(part.profile.pts)) {
        return { ok: false, reason: `self-intersecting profile (${part.ref})` };
      }
    }
  }

  // 2. MIN FEATURE — every slot's web to the nearest panel edge (and to the
  //    nearest other slot) must be >= bitDia + thickness, or the tab shears out.
  for (const part of parts) {
    const slots = (part.profile && part.profile.slots) || part.slots;
    if (!part.profile || !Array.isArray(slots) || slots.length === 0) continue;
    const bb = pointsBBox(part.profile.pts);
    const thk = thicknessOf(part);
    const minWeb = RELIEF.bitDia + thk;
    // slot rect in local coords: width `w` on x, `depth` on y, centred on (x,y).
    const rect = (s) => ({
      minX: s.x - s.w / 2, maxX: s.x + s.w / 2,
      minY: s.y - s.depth / 2, maxY: s.y + s.depth / 2,
    });
    const rects = slots.map(rect);
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      // web to each panel edge
      const webEdge = Math.min(
        r.minX - bb.minX, bb.maxX - r.maxX,
        r.minY - bb.minY, bb.maxY - r.maxY,
      );
      if (webEdge < minWeb) {
        return { ok: false, reason: `slot web below min feature (${part.ref})` };
      }
      // web to other slots (gap between non-overlapping rects)
      for (let j = i + 1; j < rects.length; j++) {
        const o = rects[j];
        const gapX = Math.max(r.minX - o.maxX, o.minX - r.maxX);
        const gapY = Math.max(r.minY - o.maxY, o.minY - r.maxY);
        const gap = Math.max(gapX, gapY); // separated along at least one axis
        if (gap < minWeb) {
          return { ok: false, reason: `slot web below min feature (${part.ref})` };
        }
      }
    }
  }

  // 3. CoM IN FOOTPRINT — the volume-weighted centroid, projected to X–Z, must
  //    fall inside the convex hull of the footprints of the ground-touching
  //    parts, or the piece tips over.
  if (parts.length > 0) {
    const groundTol = opts.groundTol != null ? opts.groundTol : 2;
    let mass = 0, cx = 0, cz = 0;
    for (const part of parts) {
      const v = Math.max(part.size.w * part.size.h * part.size.d, 1e-6);
      mass += v; cx += v * part.pos.x; cz += v * part.pos.z;
    }
    cx /= mass; cz /= mass;
    const grounded = parts.filter((part) => partYRange(part)[0] <= groundTol);
    if (grounded.length > 0) {
      const support = [];
      for (const part of grounded) support.push(...footprintCorners(part));
      const hull = convexHull(support);
      if (!pointInConvex(hull, { x: cx, y: cz })) {
        return { ok: false, reason: 'centre of mass outside support footprint (tips over)' };
      }
    }
  }

  // 4. SPAN — a declared unsupported seat-bearer span must not exceed the
  //    advisable max for its stock.
  if (opts.seatSpan && opts.seatStock) {
    const maxSpan = beamMaxSpan(opts.seatStock);
    if (opts.seatSpan > maxSpan) {
      return { ok: false, reason: `seat span exceeds advisable ${maxSpan}mm for ${opts.seatStock}` };
    }
  }

  return { ok: true };
}

// ============================================================================
// generateDesign(seed) — INVENTS a slot-together plywood chair/lounger as a
// FIRST-CLASS Design (same contract as a catalog design: { id, name, designer,
// year, blurb, difficulty, buildTime, params, build }), so it works everywhere
// the catalog designs do (sliders, vignette, BOM, export) with no new plumbing.
//
// The design's SIGNATURE is a seed-frozen varied side-fin silhouette (varyFin).
// build(p) assembles the SAME structure as cnc-slot-lounge — two mirrored side
// fins (the frozen silhouette) standing in plane 'xy', grounded (feet at y=0),
// with a flat SEAT and a reclined BACK that pass THROUGH housings cut in both
// fins. Screwless (slot/cross-lap joinery only). build() is PURE.
//
// VALIDITY GATE + RE-ROLL: the silhouette is generated under a re-roll loop —
// each candidate's design is run through validateDesign with default params; the
// first that passes is kept (else the last). The re-roll rng is derived
// DETERMINISTICALLY from the seed, so generateDesign(seed) is reproducible.
// ============================================================================

// Extra mortise margin (mm) on top of the min-feature web, so the inset clears
// the gate's bitDia+thk rule with a little slack even under fit/scale variation.
const MORTISE_MARGIN = 2;

// Build the Design object for a given frozen fin silhouette + archetype label.
// Pulled out so the gate can build/validate a candidate before committing to it.
function designFromFin(seed, archetype, finProfile) {
  const id = 'gen-' + (seed >>> 0).toString(36);
  const name = 'Generated ' + archetype.charAt(0).toUpperCase() + archetype.slice(1);

  return {
    id,
    name,
    designer: 'Generative',
    year: 2026,
    blurb: 'An invented screwless CNC ' + archetype + ': two seed-grown side fins ' +
      'carry a flat seat and a reclined back, each panel passing through housings ' +
      'cut in the fins. Generated from seed, flat-pack, press-fit.',
    difficulty: 'Medium',
    buildTime: '45–60 min',
    params: [
      { key: 'width', label: 'Seat width (between fins)',        min: 420, max: 640, step: 10, default: 540, unit: 'mm' },
      { key: 'scale', label: 'Overall scale (%)',                min: 90,  max: 115, step: 1,  default: 100, unit: '%'  },
      { key: 'fit',   label: 'Fit class (0 snug,1 std,2 outdoor)', min: 0, max: 2, step: 1, default: 1, unit: '' },
    ],

    build(p) {
      const FIT = ['snug', 'standard', 'outdoor'][p.fit] ?? 'standard';
      const stock = 'ply18';
      const thk = SHEETS[stock].thickness;          // 18mm — the mating thickness
      const s = (p.scale ?? 100) / 100;             // uniform scale on the silhouette

      // The frozen silhouette, scaled. local-x = front→back depth, local-y =
      // height, foot on the ground at y=0 (the house side-fin convention).
      const pts = finProfile.pts.map((q) => ({ x: q.x * s, y: q.y * s }));
      const outline = { pts, arcs: [] };

      // Read the ergonomic crossing geometry from varyFin's NAMED anchors (not by
      // positional index into pts) so this stays correct if the anchor order or
      // fin() mode ever changes. Backstop: fail loudly if the contract is missing.
      const A = finProfile.anchors;
      if (!A || !A.seatLip || !A.seatPivot || !A.backTop) {
        throw new Error('generateDesign: varyFin profile is missing named anchors');
      }
      const sc = (q) => ({ x: q.x * s, y: q.y * s }); // anchors in the same scaled frame as pts
      const seatLip = sc(A.seatLip);                 // seat front lip (≈ seat height)
      const seatPivot = sc(A.seatPivot);             // seat back / back pivot
      const backTop = sc(A.backTop);                 // back top
      const seatH = (seatLip.y + seatPivot.y) / 2;   // seat plane height
      const seatFrontX = seatLip.x;
      const seatBackX = seatPivot.x;

      // --- Through-housing slots in the fins ------------------------------
      // Seat crosses mid-seat at the seat height; notch runs vertically (0°) down
      // into the fin from the seat top edge. Back crosses mid-back along the
      // reclined segment; notch rotated 90° to sit square to the lean.
      const seatMidX = (seatFrontX + seatBackX) / 2;
      const seatSlot = crossLapSlot(seatMidX, seatH, thk, thk, FIT, 0);
      // Back housing: sit it on the seatPivot→backTop line, at the segment MIDPOINT,
      // so the (reclined) back panel and its fin housing meet at the same world
      // point. The fin-top is softened (see varyFin) so the housing keeps a healthy
      // web to the fin edge even at the midpoint.
      const backMidX = (seatPivot.x + backTop.x) / 2;
      const backMidY = (seatPivot.y + backTop.y) / 2;
      const backSlot = crossLapSlot(backMidX, backMidY, thk, thk, FIT, 90);
      const finSlots = [seatSlot, backSlot];

      // Recline of the back segment, measured from the +x (horizontal) axis toward
      // +y (up). For an 'xz' panel the profile length runs along world-x, so a
      // rotation about world-Z by this angle lays the panel ALONG the seatPivot→
      // backTop line — leaning rear-and-up exactly like the fins' back edge.
      const backReclineDeg = Math.atan2(backTop.y - seatPivot.y, backTop.x - seatPivot.x) * 180 / Math.PI;

      // --- Seat & back panels --------------------------------------------
      // Each spans `width` in z between the fins. The fins are at z = ±width/2 so
      // the panel mortises align with the fin housings.
      const seatLen = Math.max(seatBackX - seatFrontX, thk * 4);
      const backLen = Math.max(Math.hypot(backTop.x - seatPivot.x, backTop.y - seatPivot.y), thk * 4);
      const seatProfile = rect(seatLen, p.width);
      const backProfile = rect(backLen, p.width);
      // Inset the end mortises far enough that the web from the slot rect to the
      // panel edge clears the gate's min-feature rule (bitDia + thk), plus half the
      // slot depth (the rect's own half-extent) and a small margin. Generated panels
      // must satisfy this gate explicitly, where the hand-tuned lounge can sidestep
      // it with mortiseInset = thk; keeps the panel-end tabs from shearing.
      const mortiseInset = RELIEF.bitDia + thk + thk / 2 + MORTISE_MARGIN;
      const seatPanelSlots = [
        crossLapSlot(seatLen / 2, mortiseInset, thk, thk, FIT, 0),
        crossLapSlot(seatLen / 2, p.width - mortiseInset, thk, thk, FIT, 0),
      ];
      const backPanelSlots = [
        crossLapSlot(backLen / 2, mortiseInset, thk, thk, FIT, 0),
        crossLapSlot(backLen / 2, p.width - mortiseInset, thk, thk, FIT, 0),
      ];

      const halfW = p.width / 2;
      const parts = [];

      // GROUNDING: the builder centres the profile's BBOX on pos, so placing the
      // fin at pos.y = bbox.h/2 lands the feet on the floor (world y=0) and makes
      // local-y == world-y — the seat/back housings land at their authored heights.
      const finBBox = profileBBox(outline);
      const finCentreY = finBBox.h / 2;
      // The fins stand at world x=0, but the builder centres their (foot-anchored)
      // profile bbox on that pos — shifting every local x by -finCx in world space.
      // So a fin housing authored at local x lands at world x = (local x − finCx).
      // The seat/back panels must sit on those housing world-x's to actually cross-
      // lap the fins, so offset their pos.x by −finCx (mirrors the local→world map).
      const finXs = outline.pts.map((q) => q.x);
      const finCx = Math.min(...finXs) + finBBox.w / 2;
      const finL = profilePanel('FIN-L', 'Side fin', stock,
        { plane: 'xy', ...outline, slots: finSlots },
        { x: 0, y: finCentreY, z: -halfW }, 'Sides');
      const finR = profilePanel('FIN-R', 'Side fin', stock,
        { plane: 'xy', ...outline, slots: finSlots },
        { x: 0, y: finCentreY, z: halfW }, 'Sides');

      // Seat panel: flat board (plane 'xz'), thickness up, at the seat height,
      // centred on the seat housing's world point so it meshes with both fins.
      const seat = profilePanel('SEAT', 'Seat', stock,
        { plane: 'xz', ...seatProfile, slots: seatPanelSlots },
        { x: seatMidX - finCx, y: seatH - thk / 2, z: 0 }, 'Seat');

      // Back panel: an upright board STANDING along the fins' reclined back edge.
      // Centred on the back housing's world point (the seatPivot→backTop midpoint,
      // mapped to world x) and tilted via rot.z so it lays along that segment
      // (rear-and-up). size stays the untilted bbox (the strict harness validates
      // that); rot tilts the rendered mesh separately.
      const back = {
        ...profilePanel('BACK', 'Back', stock,
          { plane: 'xz', ...backProfile, slots: backPanelSlots },
          { x: backMidX - finCx, y: backMidY, z: 0 }, 'Back'),
        rot: { x: 0, y: 0, z: backReclineDeg },
      };

      parts.push(finL, finR, seat, back);

      const joints = [
        slotJoint(2, 'seat board passes through a housing in each side fin (2 engagements)'),
        slotJoint(2, 'back board passes through a housing in each side fin (2 engagements)'),
      ];

      const steps = [
        `CNC-cut from one ${stock} sheet: 2 identical seed-grown side fins (` +
          `${Math.round(profileBBox(outline).w)}mm deep, ${Math.round(profileBBox(outline).h)}mm tall) ` +
          `+ 1 seat ${Math.round(seatLen)}×${p.width}mm + 1 back ${Math.round(backLen)}×${p.width}mm.`,
        `All slots are cut for a ${FIT} fit (${seatSlot.w.toFixed(2)}mm wide for ${thk}mm ply). Clear any dogbone reliefs before assembly.`,
        'Stand the two side fins upright, slot side up, facing each other the seat width apart.',
        `Drop the seat board into the seat housings (seat top at ${Math.round(seatH)}mm) so it meshes flush with both fins.`,
        `Lower the back board into the reclined back housings (${Math.round(backReclineDeg)}° from horizontal) so it stands along the fins' back edge and locks them together.`,
        'Check it sits flat and rocks on no foot; ease all edges. For outdoor use pick the outdoor fit and oil the ply.',
      ];
      const notes = [
        'Generated: the side-fin silhouette is grown from the design seed, then gated for structural validity before it is offered.',
        'Screwless: the four housings lock the seat, back and both fins into one rigid frame. Fit class sets every slot clearance.',
        'All four parts nest from a single 18mm ply sheet with the two fins identical, so it cuts and stores flat.',
      ];

      return { parts, joints, steps, notes };
    },
  };
}

/**
 * generateDesign(seed) -> a first-class Design (deterministic + practically
 * always valid). Picks an ERGO archetype, grows a frozen varied fin, and wraps
 * it as a Design — re-rolling the silhouette (deterministically) until the
 * design passes the validity gate.
 */
export function generateDesign(seed) {
  const baseRng = mulberry32(seed >>> 0);
  // Archetype pick fixes the ergonomic spec the fin is grown from.
  const archetypes = [
    { label: 'chair',  spec: ERGO.chair },
    { label: 'lounge', spec: ERGO.lounge },
  ];
  const choice = pick(baseRng, archetypes);
  const archetype = choice.label;
  const spec = choice.spec;

  const K = 12;                                   // re-roll attempts
  let last = null;
  for (let attempt = 0; attempt < K; attempt++) {
    // Attempt 0 continues the base rng (so a normally-valid first roll stays
    // cheap & stable); later attempts derive a fresh, seed-deterministic rng.
    const rng = attempt === 0
      ? baseRng
      : mulberry32((seed ^ Math.imul(attempt + 1, 0x9e3779b1)) >>> 0);
    const finProfile = varyFin(spec, rng);
    const design = designFromFin(seed, archetype, finProfile);
    const defaults = Object.fromEntries(design.params.map((x) => [x.key, x.default]));
    const verdict = validateDesign(design, defaults);
    // Provenance tag so BOM/export/Lab (and the G5 vignette feed) can tell a
    // gated-valid design from a re-roll-exhausted fallback. attempts is 1-based.
    design._gen = { method: 'spine', archetype, attempts: attempt + 1, valid: verdict.ok };
    last = design;
    if (verdict.ok) return design;
  }
  return last;   // deterministic fallback: the last attempt (tagged valid:false)
}
