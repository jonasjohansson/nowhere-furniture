import { test } from 'node:test';
import assert from 'node:assert/strict';
import { profileBBox, SHEETS } from '../src/engineering.js?v=22';
import { CNC_SLOT } from '../src/designs/cnc_slot.js?v=22';

const approx = (a, b) => Math.abs(a - b) < 1e-6;

const byId = (id) => CNC_SLOT.find(d => d.id === id);

// Shared invariants every CNC-slot design must satisfy. EXPORTED so later
// design tasks can import and reuse it.
export function assertDesignInvariants(d) {
  assert.ok(d, 'design exists');
  const params = Object.fromEntries(d.params.map(x => [x.key, x.default]));
  const a = d.build(params), b = d.build(params);
  assert.deepEqual(a, b, 'build() must be deterministic (pure)');
  assert.ok(a.parts.length > 0, 'has parts');
  assert.ok(Array.isArray(a.joints), 'has joints array');
  assert.ok(Array.isArray(a.steps) && a.steps.length > 0, 'has steps');
  for (const part of a.parts) {
    assert.ok(['sheet','timber'].includes(part.material), 'valid material');
    assert.ok(part.size && part.pos && part.rot, 'has size/pos/rot');
    if (part.profile) {
      // Plane-aware bbox check mirroring profilePanel's size mapping: the two
      // in-plane bbox dims AND the thickness axis must each land on the right
      // axis (a square-ish part must not pass against the wrong axes, and the
      // thickness axis is validated too).
      const bb = profileBBox(part.profile);
      const thk = SHEETS[part.stock] ? SHEETS[part.stock].thickness : 18;
      const { w, h, d } = part.size;
      const plane = part.profile.plane;
      let expect;
      if (plane === 'xz')      expect = { w: bb.w, h: thk,  d: bb.h };
      else if (plane === 'zy') expect = { w: thk,  h: bb.h, d: bb.w };
      else                     expect = { w: bb.w, h: bb.h, d: thk }; // 'xy'/default
      assert.ok(approx(w, expect.w) && approx(h, expect.h) && approx(d, expect.d),
        `${part.ref}: size ${JSON.stringify(part.size)} must match plane '${plane}' ` +
        `mapping of bbox(${bb.w}×${bb.h}) @ thk ${thk} = ${JSON.stringify(expect)}`);
    }
  }
}

// --- Reusable WORLD-SPACE transforms (replicate the builder's conventions) ---
// The builder centres a profile's BOUNDING BOX on the part's `pos`, then maps the
// local 2-D plane onto world axes. For 'xy'/'zy' the profile's local-y is the
// world VERTICAL; for 'xz' the profile lies flat and the only vertical extent is
// the sheet thickness centred on pos.y. These helpers let every design assert,
// in WORLD coordinates, that parts are grounded and actually connect.

const sheetThk = (part) => (SHEETS[part.stock] ? SHEETS[part.stock].thickness : 18);

// World-Y bbox bounds of a part [low, high], ground plane at world y=0.
export function partYRange(part) {
  if (!part.profile) {
    // Box parts: size.h is the vertical extent, centred on pos.y.
    return [part.pos.y - part.size.h / 2, part.pos.y + part.size.h / 2];
  }
  const plane = part.profile.plane;
  if (plane === 'xz') {
    // Lies flat: vertical extent is just the sheet thickness centred on pos.y.
    const t = sheetThk(part);
    return [part.pos.y - t / 2, part.pos.y + t / 2];
  }
  // 'xy'/'zy': local-y maps to world-y; bbox is centred on pos.y.
  const bb = profileBBox(part.profile);
  return [part.pos.y - bb.h / 2, part.pos.y + bb.h / 2];
}

// World point of a slot centre on a part, generalising the oval-rocker helper:
// the builder centres the profile bbox on pos, so a slot's local (x,y) is an
// offset from the bbox centre, mapped onto the plane's world axes.
export function slotWorld(part, s) {
  const bb = profileBBox(part.profile);
  const xs = part.profile.pts.map(p => p.x), ys = part.profile.pts.map(p => p.y);
  const cx = Math.min(...xs) + bb.w / 2;   // matches profileBBox-derived centre for pts-bounded outlines
  const cy = Math.min(...ys) + bb.h / 2;
  const dx = s.x - cx, dy = s.y - cy;      // offset from bbox centre, in local axes
  const plane = part.profile.plane;
  if (plane === 'zy') return { x: part.pos.x, y: part.pos.y + dy, z: part.pos.z + dx };
  if (plane === 'xz') return { x: part.pos.x + dx, y: part.pos.y, z: part.pos.z + dy };
  return { x: part.pos.x + dx, y: part.pos.y + dy, z: part.pos.z }; // 'xy'
}

// Whether two world-Y intervals overlap (or touch within tol).
const yOverlap = ([aLo, aHi], [bLo, bHi], tol = 1e-6) =>
  aLo <= bHi + tol && bLo <= aHi + tol;

// Grounded + connection checks shared by all four designs.
function assertGroundedAndConnected(d, { groundTol = 2, floorTol = 60 } = {}) {
  const params = Object.fromEntries(d.params.map(x => [x.key, x.default]));
  const out = d.build(params);
  const ranges = out.parts.map(p => ({ part: p, y: partYRange(p) }));

  // 1) GROUNDED: the lowest foot of the whole design sits ~y=0 — nothing sunk
  //    below the ground plane, nothing floating far above it.
  const lowest = Math.min(...ranges.map(r => r.y[0]));
  assert.ok(lowest >= -groundTol,
    `${d.id}: lowest part foot ${lowest.toFixed(1)}mm is sunk below the ground (y=0)`);
  assert.ok(lowest <= floorTol,
    `${d.id}: lowest part foot ${lowest.toFixed(1)}mm floats above the ground (y=0)`);

  // 2) CONNECTION: the seat/top part must be carried by vertical legs/fins —
  //    each ground-standing vertical part's world-Y range must reach the seat's.
  const seat = out.parts.find(p => p.profile && p.profile.plane === 'xz'
    && /seat|top/i.test(p.ref));
  assert.ok(seat, `${d.id}: has a lie-flat seat/top part`);
  const seatY = partYRange(seat);
  const verticals = ranges.filter(r => r.part.profile
    && (r.part.profile.plane === 'xy' || r.part.profile.plane === 'zy')
    && r.y[0] <= groundTol);                 // ground-standing (foot ~0)
  assert.ok(verticals.length > 0, `${d.id}: has ground-standing vertical parts`);
  for (const v of verticals) {
    assert.ok(yOverlap(v.y, seatY),
      `${d.id}: vertical part ${v.part.ref} world-Y [${v.y[0].toFixed(1)},${v.y[1].toFixed(1)}] ` +
      `does not reach the seat [${seatY[0].toFixed(1)},${seatY[1].toFixed(1)}] (floating gap)`);
  }
}

test('grounded + connected: stool/bench/lounge feet on y=0, seat meets legs', () => {
  assertGroundedAndConnected(byId('cnc-slot-stool'));
  assertGroundedAndConnected(byId('cnc-slot-bench'));
  assertGroundedAndConnected(byId('cnc-slot-lounge'));
});

test('grounded: oval rocker rests its rocker arc ~on y=0', () => {
  // The rocker is curved — the FLOOR CONTACT is the two standing SIDE ovals,
  // whose lower arc is the rocker rail. (The lying brace oval is a cross-member,
  // not floor contact, so it is excluded.) Allow a slightly wider tolerance for
  // the curve dipping just below/above the floor line.
  const d = byId('cnc-slot-oval-rocker');
  const params = Object.fromEntries(d.params.map(x => [x.key, x.default]));
  const out = d.build(params);
  const sides = out.parts.filter(p => p.group === 'Sides');
  assert.ok(sides.length === 2, 'two standing side ovals');
  const lowest = Math.min(...sides.map(p => partYRange(p)[0]));
  assert.ok(Math.abs(lowest) <= 60,
    `oval rocker side-arc contact ${lowest.toFixed(1)}mm should sit ≈ y=0 (rocker curve)`);
});

test('slot-in stool: registered + invariants + has slots', () => {
  const d = byId('cnc-slot-stool');
  assertDesignInvariants(d);
  const out = d.build(Object.fromEntries(d.params.map(x => [x.key, x.default])));
  assert.ok(out.parts.some(p => p.profile && p.slots && p.slots.length > 0),
    'at least one profile part carries cross-lap slots');
  assert.ok(out.joints.some(j => j.type === 'slot-crosslap'), 'has a slot joint');
});

test('wedge lounge chair: invariants + two mirrored side fins + recline', () => {
  const d = byId('cnc-slot-lounge');
  assertDesignInvariants(d);
  const p = Object.fromEntries(d.params.map(x => [x.key, x.default]));
  const out = d.build(p);
  // two side fins, same outline (mirrored): same bbox
  const fins = out.parts.filter(x => /fin|side/i.test(x.ref) || x.group === 'Sides');
  assert.ok(fins.length === 2, 'exactly two side fins');
  const bb = (x) => JSON.stringify(profileBBox(x.profile));
  assert.equal(bb(fins[0]), bb(fins[1]), 'side fins share an outline');
  // seat + back panels cross-lap through the fins (slot joints, screwless)
  assert.ok(out.joints.some(j => j.type === 'slot-crosslap'), 'has slot joints');
  assert.ok(out.parts.some(x => x.profile && x.slots && x.slots.length), 'slotted parts');
  // recline + ergonomics: seat sits near seatH, back rises above the seat.
  const fin = fins[0];
  const topY = Math.max(...fin.profile.pts.map(pt => pt.y));
  assert.ok(topY > p.seatH, 'back rises above the seat height');
  assert.ok(fin.profile.pts.some(pt => Math.abs(pt.y - p.seatH) < 60),
    'a seat-front anchor sits near seatH');
});

test('slab trestle bench: invariants + two slab ends + wedge tenon + span note', () => {
  const d = byId('cnc-slot-bench');
  assertDesignInvariants(d);
  const p = Object.fromEntries(d.params.map(x => [x.key, x.default]));
  const out = d.build(p);
  // two angled slab END panels (same outline)
  const ends = out.parts.filter(x => x.group === 'Ends' || /end|leg|slab/i.test(x.ref));
  assert.ok(ends.length === 2, 'two slab ends');
  // a stretcher locked by a wedge tenon (screwless, demountable)
  assert.ok(out.joints.some(j => j.type === 'wedge-tenon'), 'has a wedge-tenon joint');
  assert.ok(out.parts.some(x => /wedge/i.test(x.ref) || /wedge/i.test(x.name || '')),
    'wedge is a cut part');
  // long spans must warn about a spine/mid-bearer in the notes
  const lenMax = d.params.find(x => x.key === 'len').max;
  const longSpan = d.build({ ...p, len: lenMax, spine: 0 });
  assert.ok(longSpan.notes.some(n => /spine|bearer|support|span/i.test(n)),
    'long bench notes mention a spine/bearer for the unsupported span');
  // spine on: the seat must carry a THIRD mortise to back the 3rd engagement.
  const withSpine = d.build({ ...p, spine: 1 });
  const seatPart = withSpine.parts.find(x => /seat/i.test(x.ref));
  assert.equal(seatPart.slots.length, 3, 'spine on → seat has 3 mortises');
  assert.ok(withSpine.joints.some(j => j.type === 'slot-crosslap' && j.count === 3),
    'spine on → seat slot joint declares 3 engagements');
});

test('slot-together table: invariants + grounded + top at table height', () => {
  const d = byId('cnc-slot-table');
  assertDesignInvariants(d);
  const p = Object.fromEntries(d.params.map(x => [x.key, x.default]));
  const out = d.build(p);
  const ends = out.parts.filter(x => x.group === 'Ends' || /end|leg|slab/i.test(x.ref));
  assert.ok(ends.length === 2, 'two slab ends');
  const lo = Math.min(...out.parts.map(x => partYRange(x).lo ?? partYRange(x)[0]));
  assert.ok(Math.abs(lo) < 1, `feet on the ground (lo=${lo})`);
  const top = out.parts.find(x => /top/i.test(x.ref));
  assert.ok(top, 'has a top');
  const topHi = partYRange(top).hi ?? partYRange(top)[1];
  assert.ok(topHi > 600 && topHi < 820, 'top near table height');
  assert.ok(out.joints.some(j => j.type === 'slot-crosslap'), 'screwless slot joints');
});

test('oval rocker: 4 identical oval outlines, slots differ, screwless', () => {
  const d = byId('cnc-slot-oval-rocker');
  assertDesignInvariants(d);
  const p = Object.fromEntries(d.params.map(x => [x.key, x.default]));
  const out = d.build(p);
  const ovals = out.parts.filter(x => x.profile && x.profile.arcs && x.profile.arcs.length);
  assert.ok(ovals.length === 4, 'four oval profile parts');
  // identical OUTLINES: same pts (ignoring slots), same bbox
  const sig = (x) => JSON.stringify({ pts: x.profile.pts, arcs: x.profile.arcs });
  const sigs = new Set(ovals.map(sig));
  assert.equal(sigs.size, 1, 'all four ovals share one identical outline');
  // but the SLOT maps differ across copies (not all identical)
  const slotSigs = new Set(ovals.map(x => JSON.stringify(x.slots)));
  assert.ok(slotSigs.size > 1, 'slot maps differ between the ovals');
  // screwless: only slot-crosslap joints, no screws
  assert.ok(out.joints.length > 0 && out.joints.every(j => j.type === 'slot-crosslap'),
    'all joints are slot cross-laps, none screwed');
  // every part is a ply18 sheet
  assert.ok(out.parts.every(x => x.material === 'sheet' && x.stock === 'ply18'),
    'all parts are ply18 sheet');
  // a lying (seat) oval sits near the seat height
  assert.ok(out.parts.some(x => Math.abs(x.pos.y - p.seatH) < 120),
    'a lying oval sits near the seat height');

  // STRUCTURAL MESH: every declared cross-lap's two mating notches must coincide
  // in WORLD space, and each notch must cut deep enough to reach the crossing
  // (depth ≫ thk — a real panel half-lap, not a face lap). The oval bbox is
  // centred on the origin so the builder's bbox-centring maps a slot's local
  // (x,y) to a simple offset from pos in the part's plane axes.
  const thk = SHEETS.ply18.thickness;
  const part = (ref) => out.parts.find(x => x.ref === ref);
  const slotWorld = (pt, s) => {            // local slot -> world point per the placement convention
    if (pt.profile.plane === 'zy') return { x: pt.pos.x, y: pt.pos.y + s.y, z: pt.pos.z + s.x };
    return { x: pt.pos.x + s.x, y: pt.pos.y + s.y, z: pt.pos.z }; // 'xy'
  };
  const near = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 1e-6;
  // The four declared laps: side-L↔seat, side-R↔seat, side-L↔brace, side-R↔brace.
  // sideSlots[0]=seat crossing, [1]=brace crossing; seat/brace slots[0]=left side, [1]=right side.
  const sideL = part('SIDE-L'), sideR = part('SIDE-R'), seat = part('SEAT'), brace = part('BRACE');
  const laps = [
    [sideL, sideL.slots[0], seat,  seat.slots[0]],
    [sideR, sideR.slots[0], seat,  seat.slots[1]],
    [sideL, sideL.slots[1], brace, brace.slots[0]],
    [sideR, sideR.slots[1], brace, brace.slots[1]],
  ];
  for (const [pa, sa, pb, sb] of laps) {
    assert.ok(near(slotWorld(pa, sa), slotWorld(pb, sb)),
      `${pa.ref}↔${pb.ref}: mating notches must coincide in world space ` +
      `(${JSON.stringify(slotWorld(pa, sa))} vs ${JSON.stringify(slotWorld(pb, sb))})`);
    // both notches mesh to the same crossing depth, and it is a real panel lap (≫ thk)
    assert.ok(Math.abs(sa.depth - sb.depth) < 1e-6, `${pa.ref}↔${pb.ref}: half-lap depths must match`);
    assert.ok(sa.depth > thk * 3, `${pa.ref}↔${pb.ref}: notch depth ${sa.depth} must reach the crossing (≫ thk)`);
  }
});
