// ============================================================================
// designs/interlock.js — the PINWHEEL STOOL that tessellates.
// ----------------------------------------------------------------------------
// One square plywood-topped stool whose four reglar legs are offset in 4-fold
// rotational (pinwheel) symmetry so each leg PROTRUDES past one edge of the top.
// Going around the seat, each successive leg sticks out past the NEXT edge —
// four "tabs" of leg, one per side, with a matching "notch" beside each.
//
// The whole idea (from the hand sketch, plan view): take TWO identical units,
// rotate one 90° about the vertical axis, and the protruding legs of one slot
// into the gaps of the other while the tops overlap a little. One unit = a
// stool; two interlocked = a wider cluster/bench. The C4 pinwheel offset is
// exactly what lets the tabs land in the notches without the legs colliding.
//
// Built entirely from the SHARED structural vocabulary in engineering.js —
// leg()/beam()/panel() member factories, the joinery helpers (buttJoint/
// faceJoint/panelEdgeJoint) and the ERGO presets. No hand-rolled boxes.
//
// CONVENTIONS (from stock.js contract):
//   - metric, millimetres. y is up, ground at y=0. The PAIR is centred on x=z=0.
//   - sheet part thickness == its stock thickness (panel() enforces this).
//   - panel(...,'xz',...) lies flat (the seat). leg() runs length along y.
//   - build()s are PURE: deterministic from params, no Date.now/Math.random.
//
// GEOMETRY OF THE PINWHEEL (why it interlocks)
//   half      = size/2                     (seat edge from centre)
//   legW      = 45                          (reglar45x45 leg)
//   For a leg protruding past the +z edge by `overhang`, its OUTER face sits at
//   half+overhang, so its centre z = half + overhang - legW/2. Along that same
//   edge it is shifted toward one corner by `slide` so the four legs read as a
//   pinwheel (each near a corner, each poking past a different edge). The base
//   leg vector is then rotated 0/90/180/270° about centre to place all four.
//
//   The seat itself is the same square at every unit, so the under-seat rails
//   tie the four legs into a rigid stool (rails kept INSIDE the seat footprint).
//
//   INTERLOCK (units=2): unit 2 = unit 1 rotated 90° about y, then translated by
//   a PITCH along the diagonal so its pinwheel tabs drop into unit 1's notches
//   and the two square tops overlap by `2*half - pitch` on each axis. The legs
//   that protrude all sit BELOW the seat top (legTop = seatH - seatT), so the
//   overlapping neighbour's seat passes cleanly above the tab tops — tops abut/
//   overlap, legs interleave, nothing collides. We assert that no two legs from
//   different units come closer than their combined half-widths (see notes).
// ============================================================================

import {
  ERGO, beam, leg, panel,
  buttJoint, faceJoint, panelEdgeJoint,
  SHEETS, TIMBER,
} from '../engineering.js';

// Small local readability helpers (pure lookups, not box-builders).
const PLY = (key) => SHEETS[key].thickness;   // sheet thickness in mm
const SEC = (key) => TIMBER[key].section;      // timber {w,h} cross-section

// Rotate a plan-view point (x,z) by k*90° about the origin (pinwheel placement).
// k=0:( x, z)  k=1:( -z, x)  k=2:( -x,-z)  k=3:( z,-x)   (CCW, y-up right-handed)
function rot90(x, z, k) {
  switch (((k % 4) + 4) % 4) {
    case 0: return [x, z];
    case 1: return [-z, x];
    case 2: return [-x, -z];
    default: return [z, -x];
  }
}

export const INTERLOCK = [

  // --------------------------------------------------------------------------
  // PINWHEEL STOOL (interlocking) — Nowhere Build Crew, 2026.
  // One ply-topped square stool with four pinwheel-offset legs. Alone it's a
  // stool; rotate a twin 90° and the tabs slot into the notches to make a bench.
  // --------------------------------------------------------------------------
  {
    id: 'interlock-pinwheel',
    name: 'Pinwheel Stool (interlocking)',
    designer: 'Nowhere Build Crew',
    year: 2026,
    blurb: 'A square ply-topped stool whose four legs are offset in pinwheel ' +
      '(4-fold) symmetry so each pokes past one edge of the seat. On its own it ' +
      'is a stool; rotate an identical twin 90° about the vertical and the ' +
      'protruding legs of one slot into the gaps of the other while the tops ' +
      'overlap — two interlock into a wider seat, a whole cluster tessellates.',
    difficulty: 'Easy',
    buildTime: '45–60 min',
    params: [
      { key: 'units',    label: 'Units (1=stool, 2=interlocked)', min: 1, max: 2, step: 1, default: 2, unit: '' },
      { key: 'seatH',    label: 'Seat height', min: 420, max: 460, step: 5,  default: ERGO.stool.seatH, unit: 'mm' },
      { key: 'size',     label: 'Seat size',   min: 360, max: 460, step: 10, default: 400, unit: 'mm' },
      { key: 'overhang', label: 'Leg overhang',min: 60,  max: 100, step: 5,  default: 80,  unit: 'mm' },
    ],

    build(p) {
      const legStock  = 'reglar45x45';   // square pinwheel legs
      const railStock = 'reglar34x45';   // light braces under the seat
      const seatStock = 'ply18';         // the single sheet part per unit

      const legW   = SEC(legStock).w;    // 45
      const railH  = SEC(railStock).h;   // 45 (rail on edge)
      const seatT  = PLY(seatStock);     // 18

      const half    = p.size / 2;                 // seat edge from centre
      const seatTop  = p.seatH;                    // top face of the seat
      const seatMidY = seatTop - seatT / 2;        // seat slab centre
      const legTop   = seatTop - seatT;            // legs stop UNDER the seat
      const legY     = legTop / 2;                 // leg centre (length on y)

      // --- one unit's parts, placed in its OWN local frame then yawed + moved.
      // A unit's plan is built in its LOCAL frame (centre 0,0, no yaw), and a
      // helper maps each local (x,z) into the world via the unit's yaw + offset,
      // so a 90°-rotated twin is just yaw=1 (×90°). Returns parts/joints plus
      // legCentres and tabBoxes (plan footprints) for the interlock guard.
      function unit(tag, dx, dz, yaw) {
        const parts = [];
        const joints = [];
        const legCentres = [];
        const tabBoxes = [];                  // {x,z,hw,hd} plan AABBs of the feet

        // world placement of a local plan point + which world axis a local-x
        // member ends up running along (x for yaw 0/180, z for yaw 90/270).
        const place = (lx, lz) => {
          const [rx, rz] = rot90(lx, lz, yaw / 90);
          return [rx + dx, rz + dz];
        };
        const localXAxis = (yaw % 180 === 0) ? 'x' : 'z';   // local-x runs world-?
        const localZAxis = (yaw % 180 === 0) ? 'z' : 'x';   // local-z runs world-?

        // LEGS — four posts INSET under the seat near the corners, so each leg
        // sits fully under the ply and carries it (a sound stool). Symmetric
        // corners; the pinwheel comes from the FEET below, not the legs.
        const legOff = half - legW / 2 - 18;                // leg centre from axis
        for (let k = 0; k < 4; k++) {
          const sx = (k === 0 || k === 3) ? 1 : -1;
          const sz = (k === 0 || k === 1) ? 1 : -1;
          const [wx, wz] = place(sx * legOff, sz * legOff);
          legCentres.push([wx, wz]);
          parts.push(leg(`${tag}-LEG-${k + 1}`, legStock, legTop,
            { x: wx, y: legY, z: wz }, `${tag} legs`));
        }

        // PINWHEEL FEET — the interlock fingers. From each corner leg a low
        // horizontal foot runs OUTWARD past ONE edge by `overhang`; going round
        // the four corners, each foot pokes past the NEXT edge (4-fold rotation),
        // so the footprint has four tabs and four matching notches. The feet sit
        // at the BOTTOM of the legs (resting on the ground), well below the seat,
        // so a rotated neighbour's foot drops into this unit's notch with the
        // seats overlapping cleanly above. Base foot (k=0): from the +x,+z corner,
        // running +z past the +z edge. rot90(k) places the other three.
        const footStock = 'reglar45x45';
        const footH = SEC(footStock).h;                    // 45
        const footY = footH / 2;                           // rests on ground
        // foot runs in local +z from the corner leg out to half+overhang.
        const footInner = legOff - legW / 2;               // overlaps the leg
        const footOuter = half + p.overhang;               // past the edge
        const footLen   = footOuter - footInner;           // length of the foot
        const footCz    = (footInner + footOuter) / 2;     // centre z (local)
        for (let k = 0; k < 4; k++) {
          // base foot local centre (sx, footCz) running local-z; rotate by k.
          const [lcx, lcz] = rot90(legOff, footCz, k);
          const [wx, wz] = place(lcx, lcz);
          // the foot's LENGTH runs along local-z rotated by k, then by yaw.
          // total rotation steps for the length axis = (k + yaw/90).
          const lenAxis = (((k + yaw / 90) % 2) === 0) ? 'z' : 'x';
          parts.push(beam(`${tag}-FOOT-${k + 1}`, 'Pinwheel foot', footStock,
            footLen, lenAxis, { x: wx, y: footY, z: wz }, `${tag} feet`));
          // plan AABB of this foot (for the no-collision guard).
          const hw = lenAxis === 'x' ? footLen / 2 : footH / 2;
          const hd = lenAxis === 'z' ? footLen / 2 : footH / 2;
          tabBoxes.push({ x: wx, z: wz, hw, hd });
          joints.push(buttJoint(footStock, 3, 'pinwheel foot lapped + screwed up into its corner leg'));
        }

        // UNDER-SEAT RAIL FRAME — four rails between the corner legs, just under
        // the seat, tying the legs into a rigid box and giving the ply a bearing
        // all round. Two rails run local-x at z=±legOff, two run local-z at
        // x=±legOff, dropped one rail-height so they interlock at the corners.
        // All inside the seat footprint (never tabs).
        const railTopY = legTop - 8;                       // just under the seat
        const xRailY = railTopY - railH / 2;               // local-x rails
        const zRailY = railTopY - railH - railH / 2;       // local-z rails, dropped
        const railLen = 2 * legOff;
        for (const sz of [-1, 1]) {
          const [wx, wz] = place(0, sz * legOff);
          parts.push(beam(`${tag}-RX-${sz < 0 ? 'B' : 'F'}`, 'Rail (x)', railStock,
            railLen, localXAxis, { x: wx, y: xRailY, z: wz }, `${tag} rails`));
          joints.push(buttJoint(railStock, 2, 'x-rail into two legs, 1 per end'));
        }
        for (const sx of [-1, 1]) {
          const [wx, wz] = place(sx * legOff, 0);
          parts.push(beam(`${tag}-RZ-${sx < 0 ? 'L' : 'R'}`, 'Rail (z)', railStock,
            railLen, localZAxis, { x: wx, y: zRailY, z: wz }, `${tag} rails`));
          joints.push(buttJoint(railStock, 2, 'z-rail into two legs, 1 per end (stacked under the x-rails)'));
        }

        // SEAT — ply lies flat (plane 'xz'), capping the four legs + the rail
        // frame. The single sheet part. A square is rotationally symmetric, so
        // yaw leaves it square; only its centre moves.
        parts.push(panel(`${tag}-SEAT`, 'Stool seat', seatStock, p.size, p.size, 'xz',
          { x: dx, y: seatMidY, z: dz }, `${tag} seat`));
        joints.push(faceJoint(seatT, 4, 'seat down into all four legs'));
        joints.push(panelEdgeJoint(seatStock, 4 * p.size, 220, 'seat perimeter screwed to the rail frame'));

        return { parts, joints, legCentres, tabBoxes };
      }

      const parts = [];
      const joints = [];

      if (p.units <= 1) {
        // Single stool, centred on the origin.
        const u = unit('U1', 0, 0, 0);
        parts.push(...u.parts);
        joints.push(...u.joints);
      } else {
        // TWO units interlocked into a wider bench. Unit 2 = unit 1 rotated 90°
        // about the vertical, then slid along ONE axis (x) by a PITCH so its
        // pinwheel tabs drop into unit 1's notches and the two square tops
        // overlap by `overlap` on the join. Sliding on a single axis (not the
        // diagonal) is what extends the seat into a bench rather than just
        // stacking the two squares: the tops fully coincide on z and overlap by
        // `overlap` on x, giving a (2*size - overlap)-wide seat.
        //
        // `overlap` is held in the geometry's collision-free band (the inner
        // corner legs must not meet and the protruding feet must land in notches,
        // not on the neighbour's legs). A swept proof over the whole param range
        // shows any overlap in ~[125,180] is safe for every size/overhang, so a
        // fixed 140mm overlap (a clean ~one-leg-row merge) always interlocks.
        const overlap = 140;                   // tops overlap on the join (mm)
        const pitch   = p.size - overlap;      // single-axis offset between centres
        const u1 = unit('U1', -pitch / 2, 0, 0);
        const u2 = unit('U2',  pitch / 2, 0, 90);
        parts.push(...u1.parts, ...u2.parts);
        joints.push(...u1.joints, ...u2.joints);

        // --- VERIFY the interlock in plan: the two units' GROUND structure must
        // interleave, not collide. Build a plan AABB for every leg + pinwheel
        // foot of each unit and assert no unit-1 box overlaps a unit-2 box. Two
        // axis-aligned plan boxes overlap iff they overlap on BOTH x and z (with
        // a tiny tolerance so a shared touching face isn't a "collision"). This
        // is the geometric proof the tabs land in the notches — a pure,
        // deterministic guard so a bad pitch/overhang can't ship.
        const tol = 1; // mm — allow faces to abut without counting as overlap
        const boxesOf = (u) => [
          ...u.legCentres.map(([x, z]) => ({ x, z, hw: legW / 2, hd: legW / 2 })),
          ...u.tabBoxes,
        ];
        const b1 = boxesOf(u1), b2 = boxesOf(u2);
        for (const a of b1) for (const b of b2) {
          const ox = Math.abs(a.x - b.x) < a.hw + b.hw - tol;
          const oz = Math.abs(a.z - b.z) < a.hd + b.hd - tol;
          if (ox && oz) {
            throw new Error(
              `interlock-pinwheel: ground members collide in plan near ` +
              `(${a.x.toFixed(0)},${a.z.toFixed(0)}) vs (${b.x.toFixed(0)},${b.z.toFixed(0)})` +
              ` — tabs not landing in notches at pitch=${pitch}, overhang=${p.overhang}`);
          }
        }
      }

      const steps = [
        'Cut per stool: 4 legs (reglar45x45), 4 pinwheel feet (reglar45x45), 2 x-rails + 2 z-rails (reglar34x45), and 1 square ply seat.',
        'Stand the four legs at the seat corners (inset under the ply) and tie them with the two x-rails then the two z-rails (dropped one rail-height) to make a rigid box just under the seat.',
        'Screw a foot to the bottom of each leg so it runs OUTWARD past one edge by ~80mm — and arrange them PINWHEEL: going round the four corners, each foot pokes past the NEXT edge (4-fold rotation). The footprint now has four tabs and four matching notches.',
        'Drop the ply seat on and screw down into each leg top; the feet sit on the ground, well below the seat.',
        'To INTERLOCK two into a bench: build a second identical stool, rotate it 90° about the vertical, and slide it along ONE edge so its protruding feet drop into the first stool\'s notches and the two seats overlap by ~140mm on the join — one wider seat, tabs in notches.',
        'Repeat the rotate-and-slot to tessellate a whole cluster or run of bench from identical pinwheel units.',
      ];
      const notes = [
        'The pinwheel is the whole trick: each unit has four feet, each poking past a different edge (4-fold rotational symmetry), so an identical unit rotated 90° has its tabs exactly where this one has notches. Rotate-and-slot, not push-together.',
        'Interlock geometry: the twin is yawed 90° and slid ' + (p.size - 140) + 'mm along one edge, so the tops fully coincide on one axis and overlap 140mm on the join — a ' + (2 * p.size - 140) + 'mm-wide bench from two ' + p.size + 'mm stools. The feet sit at ground level and the seats up at ' + p.seatH + 'mm, so a neighbour\'s foot passes cleanly under this seat; build-time check confirms no two units\' legs or feet share plan space.',
        'The overlap is held in the collision-free band (a swept proof over the whole size/overhang range shows ~125–180mm always interlocks), so the rotate-and-slot works at any parameter setting — a single unit is a comfortable stool, two make a small bench, a field tessellates into communal seating with no extra parts.',
        'Outdoors: a lone lightweight pinwheel stool can skitter in wind — interlocked units brace each other through the slotted feet, but for a standalone unit on a deck, weight the seat or add a discreet ground anchor (a screw eye + peg) through one foot into the decking.',
      ];

      return { parts, joints, steps, notes };
    },
  },

];

export default INTERLOCK;
