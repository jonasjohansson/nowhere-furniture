import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../src/rng.js?v=23';
import { varyFin, validateDesign } from '../src/generate.js?v=23';
import { profileBBox } from '../src/engineering.js?v=23';

test('varyFin: deterministic, in-bounds outline from ergonomic anchors', () => {
  const spec = { seatH: 330, seatD: 520, backAngle: 112, backH: 520 };
  const a = varyFin(spec, mulberry32(5));
  const b = varyFin(spec, mulberry32(5));
  assert.deepEqual(a, b, 'deterministic for same seed');
  assert.ok(a.pts.length >= 4, 'has an outline');
  const bb = profileBBox(a);
  assert.ok(bb.h > spec.seatH && bb.h < spec.backH + spec.seatH, `height bounded (got ${bb.h})`);
  assert.ok(bb.w >= spec.seatD * 0.6 && bb.w <= spec.seatD * 1.8, `depth bounded (got ${bb.w})`);
});
test('varyFin varies with seed', () => {
  const spec = { seatH: 330, seatD: 520, backAngle: 112, backH: 520 };
  const set = new Set([1,2,3,4,5].map(s => JSON.stringify(varyFin(spec, mulberry32(s)))));
  assert.ok(set.size > 1, 'different seeds -> different silhouettes');
});

// ----------------------------------------------------------------------------
// validateDesign — the validity gate. Wrap hand-crafted parts as a design-like
// object whose build() returns them. Each check below has BOTH a pass and a fail
// fixture so the gate is exercised in both directions.
// ----------------------------------------------------------------------------
const D = (parts, joints = []) => ({ id: 't', params: [], build: () => ({ parts, joints, steps: [], notes: [] }) });

// A grounded plywood box, footprint w(x)×d(z), thickness h(y), centred at origin
// in X–Z and resting its foot on y=0. (box part: partYRange = pos.y ± h/2.)
const groundBox = (ref, w, d, h, pos) => ({
  ref, name: ref, material: 'sheet', stock: 'ply18',
  size: { w, h, d }, pos, rot: { x: 0, y: 0, z: 0 },
});

// A standing fin: simple grounded right-handed rectangle outline (no self-cross),
// plane 'zy' (faces ±x). Profile bbox is centred on pos by the builder, so to put
// its foot on y=0 we set pos.y = h/2.
const finPart = (ref, w, h, pos, slots = []) => ({
  ref, name: ref, material: 'sheet', stock: 'ply18',
  size: { w: 18, h, d: w }, pos, rot: { x: 0, y: 0, z: 0 },
  profile: {
    plane: 'zy',
    pts: [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }],
    arcs: [],
    slots,
  },
  slots,
});

// VALID: two grounded standing fins under a flat seat, footprint hull comfortably
// contains the centre of mass; rectangular outlines (no self-intersection); a slot
// well away from every edge; no over-long span declared.
const VALID_FIXTURE = D([
  // two side fins, 400 wide (z), 450 tall, at x=±200, feet on the ground.
  finPart('SIDE-L', 400, 450, { x: -200, y: 225, z: 0 }, [
    // slot centred in the panel, far from all four edges (web ≈ 175mm)
    { x: 200, y: 225, w: 22, depth: 40, angle: 0 },
  ]),
  finPart('SIDE-R', 400, 450, { x: 200, y: 225, z: 0 }),
  // flat seat lying across the two fins (profile 'xz'), thickness up.
  {
    ref: 'SEAT', name: 'Seat', material: 'sheet', stock: 'ply18',
    size: { w: 440, h: 18, d: 400 }, pos: { x: 0, y: 450, z: 0 }, rot: { x: 0, y: 0, z: 0 },
    profile: {
      plane: 'xz',
      pts: [{ x: 0, y: 0 }, { x: 440, y: 0 }, { x: 440, y: 400 }, { x: 0, y: 400 }],
      arcs: [], slots: [],
    },
    slots: [],
  },
]);

test('validateDesign: accepts a sane design', () => {
  const ok = validateDesign(VALID_FIXTURE);
  assert.equal(ok.ok, true, ok.reason);
});

// --- Self-intersection ------------------------------------------------------
// A bow-tie: edges (p0->p1) and (p2->p3) cross. Grounded standing panel.
const selfIntersectingProfilePart = {
  ref: 'BOWTIE', name: 'Bowtie', material: 'sheet', stock: 'ply18',
  size: { w: 18, h: 200, d: 200 }, pos: { x: 0, y: 100, z: 0 }, rot: { x: 0, y: 0, z: 0 },
  profile: {
    plane: 'zy',
    pts: [{ x: 0, y: 0 }, { x: 200, y: 200 }, { x: 200, y: 0 }, { x: 0, y: 200 }],
    arcs: [], slots: [],
  },
  slots: [],
};

test('rejects a self-intersecting profile', () => {
  const r = validateDesign(D([ selfIntersectingProfilePart ]));
  assert.equal(r.ok, false);
  assert.match(r.reason, /self-?intersect/i);
});

// --- Min feature ------------------------------------------------------------
// Same outline as a valid fin, but the slot sits 2mm from the panel edge — web
// far below RELIEF.bitDia + thickness.
const partWithSlotTooCloseToEdge = finPart('EDGE', 400, 450, { x: 0, y: 225, z: 0 }, [
  // slot rect [x±w/2]×[y±depth/2] = [389..411]×[205..245]; right edge at x=400,
  // so web to the right edge is 400-411 < 0 → way under min feature.
  { x: 400, y: 225, w: 22, depth: 40, angle: 0 },
]);

test('rejects a slot whose web to the panel edge is below min feature', () => {
  const r = validateDesign(D([ partWithSlotTooCloseToEdge ]));
  assert.equal(r.ok, false);
  assert.match(r.reason, /feature|web|edge/i);
});

// --- CoM in footprint -------------------------------------------------------
// A narrow grounded base with a big mass cantilevered far out in +x: the volume-
// weighted centroid lands outside the base's X–Z footprint hull → tips over.
test('rejects a design whose centre of mass falls outside its ground footprint', () => {
  const r = validateDesign(D([
    groundBox('BASE', 100, 100, 200, { x: 0, y: 100, z: 0 }),
    groundBox('SLAB', 600, 600, 600, { x: 1000, y: 800, z: 0 }),
  ]));
  assert.equal(r.ok, false);
  assert.match(r.reason, /mass|tip|footprint|stab/i);
});

// --- Span -------------------------------------------------------------------
const longUnsupportedSeatPart = groundBox('SEAT', 1600, 400, 18, { x: 0, y: 450, z: 0 });

test('rejects an over-long unsupported seat span', () => {
  const r = validateDesign(D([ longUnsupportedSeatPart ]), {}, { seatSpan: 1600, seatStock: 'reglar45x45' });
  assert.equal(r.ok, false);
  assert.match(r.reason, /span/i);
});

test('accepts a seat span within the advisable limit', () => {
  // beamMaxSpan('reglar45x45') = 45*18 = 810mm; 700 is fine.
  const r = validateDesign(VALID_FIXTURE, {}, { seatSpan: 700, seatStock: 'reglar45x45' });
  assert.equal(r.ok, true, r.reason);
});
