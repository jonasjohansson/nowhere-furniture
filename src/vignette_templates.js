// Hand-authored layout templates for the vignette generator.
//
// A template is the "taste" of the generator: a pure function that places
// family pieces with seating-correct geometry around a focal point, producing a
// readable hangout spot. Everything here is deterministic — layouts draw only
// from the seeded `rng` passed in (no Date, no Math.random).
//
// Data contract (must stay stable; later tasks compose on it):
//   Template    = { id, name, weight, layout(rng, palette) -> PlacedPiece[] }
//   PlacedPiece = { designId, params, transform:{ x, z, ry }, hue }
//     x,z  ground position in mm — the piece CENTRE on the floor (y is ground)
//     ry   yaw in DEGREES about Y
//     params = sampleParams(design, rng) result for that designId
//     hue    number in [0,360) drawn from the palette
//   palette   = { base:<deg>, hues:[<deg>,...] }  (passed in; we don't build it)

import { CNC_SLOT } from './designs/cnc_slot.js?v=22';
import { sampleParams } from './vignette.js?v=22';
import { randInt, pick } from './rng.js?v=22';

const RAD2DEG = 180 / Math.PI;

/** Look up a design by id (throws if a template references something unknown). */
function design(id) {
  const d = CNC_SLOT.find((x) => x.id === id);
  if (!d) throw new Error(`unknown design ${id}`);
  return d;
}

/** Yaw (deg) so a piece at (x,z) turns its front toward (tx,tz). The exact
 *  facing convention is verified visually in a later task; the goal here is a
 *  consistent "seat turned toward the focal point" rotation. */
function faceTarget(x, z, tx, tz) {
  return Math.atan2(tx - x, tz - z) * RAD2DEG;
}

/** Random +1 / -1. One rng draw. Centralises the sign convention so left/right
 *  and toe-direction choices can't drift between call sites. */
function randSign(rng) {
  return rng() < 0.5 ? -1 : 1;
}

/** A toe-in / lean magnitude in degrees: `min + [0,spread)`. Aesthetic, not
 *  clearance — tune freely. One rng draw. */
function toeAngle(rng, min, spread) {
  return min + rng() * spread;
}

/** Lay `n` points evenly around a circle of `radius` (mm) on the ground plane,
 *  with optional jitter, invoking `fn({ x, z, a }, i)` for each (a = final angle
 *  in radians). The per-point callback runs immediately after that point's draws
 *  so any rng the callback consumes (e.g. `place`) stays interleaved with the
 *  position draws — this preserves the historical draw order and therefore
 *  determinism. Returns the array of `fn` results.
 *
 *  rng draw order, per point: (1) angle jitter, then (2) radius jitter, then
 *  (3) whatever `fn` draws. Angle/radius jitter are ONLY drawn when their amount
 *  is non-zero. Callers that vary the radius themselves (e.g. one shared radius
 *  for the whole ring) pass `radiusJitter: 0` so no per-point radius draw is
 *  consumed. This ordering is load-bearing — keep it if you tune the helper.
 *
 *  @param {object} o
 *  @param {number} o.n            point count
 *  @param {number} o.radius       base radius, mm
 *  @param {number} o.angleJitter  +/- this many radians of angular wobble (0 = none)
 *  @param {number} o.radiusJitter +/- this many mm of radial wobble (0 = none)
 *  @param {(pos:{x:number,z:number,a:number}, i:number)=>any} fn  per-point builder */
function ringPlayout(rng, { n, radius, angleJitter, radiusJitter }, fn) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n + (angleJitter ? (rng() - 0.5) * 2 * angleJitter : 0);
    const r = radiusJitter ? radius + (rng() - 0.5) * 2 * radiusJitter : radius;
    out.push(fn({ x: Math.sin(a) * r, z: Math.cos(a) * r, a }, i));
  }
  return out;
}

/** Build one PlacedPiece: sample params + pick a hue, then place + orient it. */
function place(rng, palette, designId, x, z, ry) {
  return {
    designId,
    params: sampleParams(design(designId), rng),
    transform: { x, z, ry },
    hue: pick(rng, palette.hues),
  };
}

// --- Templates --------------------------------------------------------------

// 1. communal-table — a table at origin with stools ringed around it, each
//    turned to face the table centre.
const communalTable = {
  id: 'communal-table',
  name: 'Communal table',
  weight: 2,
  layout(rng, palette) {
    const pieces = [place(rng, palette, 'cnc-slot-table', 0, 0, 0)];
    const n = randInt(rng, 3, 6);
    // CLEARANCE: 950mm from centre clears a table edge + leaves a sitting gap.
    // Jitter: +/-0.125 rad angular, +/-40mm radial — aesthetic looseness.
    ringPlayout(rng, { n, radius: 950, angleJitter: 0.125, radiusJitter: 40 }, ({ x, z }) => {
      pieces.push(place(rng, palette, 'cnc-slot-stool', x, z, faceTarget(x, z, 0, 0)));
    });
    return pieces;
  },
};

// 2. lounge-circle — lounges + a rocker on a wide circle, all toed slightly
//    toward the centre, with a low stool as a central side table.
const loungeCircle = {
  id: 'lounge-circle',
  name: 'Lounge circle',
  weight: 1,
  layout(rng, palette) {
    const pieces = [place(rng, palette, 'cnc-slot-stool', 0, 0, 0)]; // central low side table
    const nLounge = randInt(rng, 2, 3);
    const seats = Array(nLounge).fill('cnc-slot-lounge').concat('cnc-slot-oval-rocker');
    // CLEARANCE: 1500–1800mm circle so lounges face each other across a room-
    // scale gap. One shared radius for the whole ring (drawn once here), so the
    // ring helper takes radiusJitter:0 and consumes no per-seat radius draw.
    const radius = 1500 + rng() * 300;
    ringPlayout(rng, { n: seats.length, radius, angleJitter: 0.1, radiusJitter: 0 }, ({ x, z }, i) => {
      // AESTHETIC: toe each seat 15–25deg off the centre-facing angle, random side.
      const toe = toeAngle(rng, 15, 10) * randSign(rng);
      pieces.push(place(rng, palette, seats[i], x, z, faceTarget(x, z, 0, 0) + toe));
    });
    return pieces;
  },
};

// 3. bench-nook — a bench with a stool side table beside it and a rocker
//    angled toward the bench.
const benchNook = {
  id: 'bench-nook',
  name: 'Bench nook',
  weight: 1,
  layout(rng, palette) {
    const pieces = [];
    // Bench centred on X, set back to benchZ so the nook opens toward +Z; faces
    // +Z (ry 0) toward the gathering point in front of it.
    const benchX = 0;
    const benchZ = -600; // mm: pushes the bench to the back of the nook
    pieces.push(place(rng, palette, 'cnc-slot-bench', benchX, benchZ, 0));
    // Stool side table beside one end of the bench. side = which end.
    // CLEARANCE: 700mm base clears the bench half-length; +450–550mm sets the
    // table just off the end. benchZ+100 nudges it slightly forward of the seat.
    const endClearance = 700;              // mm, half the bench footprint
    const tableOffset = 450 + rng() * 100; // mm gap past the bench end
    const side = randSign(rng);            // which end of the bench the table sits at
    pieces.push(place(rng, palette, 'cnc-slot-stool', benchX + side * (endClearance + tableOffset), benchZ + 100, 0));
    // Rocker in front of the bench, on the opposite side, angled toward it.
    const rx = 250 * -side; // mm: offset to the far side of the nook
    const rz = 550;         // mm: in front of the bench, within conversation range
    // AESTHETIC: 20–30deg lean toward the bench, random sign.
    const angle = toeAngle(rng, 20, 10) * randSign(rng);
    pieces.push(place(rng, palette, 'cnc-slot-oval-rocker', rx, rz, faceTarget(rx, rz, benchX, benchZ) + angle));
    return pieces;
  },
};

// 4. rocker-pair — two rockers flanking a central stool side table, each toed
//    slightly toward the other.
const rockerPair = {
  id: 'rocker-pair',
  name: 'Rocker pair',
  weight: 1,
  layout(rng, palette) {
    const pieces = [place(rng, palette, 'cnc-slot-stool', 0, 0, 0)]; // central low side table
    // CLEARANCE: gap is the half-distance from centre to each rocker; 800–950mm
    // keeps a comfortable shared-table reach without the rockers touching.
    const gap = 800 + rng() * 150;
    // AESTHETIC: toe both rockers 10–20deg inward so they angle toward each other.
    const toe = toeAngle(rng, 10, 10);
    pieces.push(place(rng, palette, 'cnc-slot-oval-rocker', -gap, 0, faceTarget(-gap, 0, 0, 0) + toe));
    pieces.push(place(rng, palette, 'cnc-slot-oval-rocker', gap, 0, faceTarget(gap, 0, 0, 0) - toe));
    return pieces;
  },
};

// 5. stool-cluster — a loose huddle of stools with jittered positions and
//    varied params (each gets its own sampled params, so heights vary).
const stoolCluster = {
  id: 'stool-cluster',
  name: 'Stool cluster',
  weight: 1,
  layout(rng, palette) {
    const pieces = [];
    const n = randInt(rng, 3, 5);
    // CLEARANCE: 550mm base radius is a tight huddle. Jitter: +/-0.3 rad angular
    // and +/-150mm radial breaks the perfect ring into a casual scatter.
    ringPlayout(rng, { n, radius: 550, angleJitter: 0.3, radiusJitter: 150 }, ({ x, z }) => {
      // stools are radially symmetric-ish; give a loose yaw toward centre.
      pieces.push(place(rng, palette, 'cnc-slot-stool', x, z, faceTarget(x, z, 0, 0)));
    });
    return pieces;
  },
};

export const VIGNETTE_TEMPLATES = [
  communalTable,
  loungeCircle,
  benchNook,
  rockerPair,
  stoolCluster,
];
