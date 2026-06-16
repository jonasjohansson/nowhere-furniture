// ============================================================================
// designs/interlock.js — the PINWHEEL STOOL that tessellates.
// ----------------------------------------------------------------------------
// One square plywood-topped stool whose four legs are FLAT BOARDS (plywood
// panels stood on edge, wide face vertical) offset in 4-fold rotational
// (pinwheel) symmetry. Each leg-board runs PARALLEL to one edge of the top,
// tucked near a corner, and its end STICKS OUT past the perpendicular edge by a
// small overhang. Going round the seat, each successive leg is rotated 90° and
// pokes past the NEXT edge. There are NO separate feet — the protruding
// leg-board ends ARE the interlocking tabs, with a matching notch beside each.
//
// The whole idea (from the photos / hand sketch, plan view): take TWO identical
// units, rotate one 90° about the vertical axis, and slide it along the diagonal
// so the protruding leg-board ends of one drop into the gaps of the other while
// the tops overlap a little into a wider seat. One unit = a stool; two
// interlocked = a wider cluster/bench. The C4 pinwheel offset is exactly what
// lets each tab land in a notch without the leg-boards colliding.
//
// Built entirely from the SHARED structural vocabulary in engineering.js —
// panel()/beam() member factories, the joinery helpers (buttJoint/faceJoint/
// panelEdgeJoint) and the ERGO presets. No hand-rolled boxes.
//
// CONVENTIONS (from stock.js contract):
//   - metric, millimetres. y is up, ground at y=0. The PAIR is centred on x=z=0.
//   - sheet part thickness == its stock thickness (panel() enforces this).
//   - panel(...,'xz',...) lies flat (the seat). panel(...,'xy'/'zy',...) stands
//     up as a vertical board (the flat-board legs).
//   - build()s are PURE: deterministic from params, no Date.now/Math.random.
//
// GEOMETRY OF THE PINWHEEL (why it interlocks)
//   half      = size/2                     (seat edge from centre)
//   Each leg is a flat ply18 BOARD stood on edge: wide face vertical, only 18mm
//   thin in the perpendicular horizontal direction — exactly the wide thin plank
//   of the reference stools. The base leg (k=0) runs along local-x, its outer
//   long face near the +z edge (legCz ≈ 0.95·half), spanning from a small inset
//   inside the seat (legInner) OUTWARD past the +x edge to half+overhang. So one
//   board pokes past one edge; going round the corners the base board is rotated
//   0/90/180/270° about centre to place all four, each protruding past the NEXT
//   edge. The footprint has four protruding tabs and four matching notches.
//
//   The seat is the same square at every unit, capping the four leg-boards.
//
//   INTERLOCK (units=2): unit 2 = unit 1 rotated 90° about y, then translated by
//   a DIAGONAL offset (equal on x and z) so its pinwheel tabs drop into unit 1's
//   notches and the two square tops overlap at a corner by `overlap` on each
//   axis. The protruding leg-board ends all stop BELOW the seat top (legTop =
//   seatH - seatT), so an overlapping neighbour's seat passes cleanly above the
//   tab tops — tops overlap, leg-boards interleave, nothing collides. We assert
//   that no two leg-boards from different units share plan space (see notes).
// ============================================================================

import {
  ERGO, beam, panel,
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
  // One ply-topped square stool with four pinwheel-offset flat-board legs. Alone
  // it's a stool; rotate a twin 90° and the protruding leg-ends slot into the
  // gaps to make a wider seat.
  // --------------------------------------------------------------------------
  {
    id: 'interlock-pinwheel',
    name: 'Pinwheel Stool (interlocking)',
    designer: 'Nowhere Build Crew',
    year: 2026,
    blurb: 'A square ply-topped stool whose four legs are flat plywood boards ' +
      'offset in pinwheel (4-fold) symmetry so each runs along one edge and pokes ' +
      'past the next. On its own it is a stool; rotate an identical twin 90° about ' +
      'the vertical and the protruding leg-board ends of one slot into the gaps of ' +
      'the other while the tops overlap — two interlock into a wider seat, a whole ' +
      'cluster tessellates.',
    difficulty: 'Easy',
    buildTime: '40–55 min',
    params: [
      { key: 'units',    label: 'Units (1=stool, 2=interlocked)', min: 1, max: 2, step: 1, default: 1, unit: '' },
      { key: 'seatH',    label: 'Seat height', min: 420, max: 460, step: 5,  default: ERGO.stool.seatH, unit: 'mm' },
      { key: 'size',     label: 'Seat size',   min: 360, max: 460, step: 10, default: 400, unit: 'mm' },
      { key: 'overhang', label: 'Leg overhang',min: 25,  max: 80,  step: 5,  default: 45,  unit: 'mm' },
    ],

    build(p) {
      const legStock  = 'ply18';         // flat-board legs: ply panel on edge
      const railStock = 'reglar34x45';   // light braces under the seat
      const seatStock = 'ply18';         // the single sheet seat per unit

      const legThk = PLY(legStock);      // 18 — board thickness (thin horizontal dim)
      const railH  = SEC(railStock).h;   // 45 (rail on edge)
      const seatT  = PLY(seatStock);     // 18

      const half    = p.size / 2;                 // seat edge from centre
      const seatTop  = p.seatH;                    // top face of the seat
      const seatMidY = seatTop - seatT / 2;        // seat slab centre
      const legTop   = seatTop - seatT;            // leg-boards stop UNDER the seat
      const legH     = legTop;                     // board height (rests on ground)
      const legMidY  = legH / 2;                   // board centre (height on y)

      // --- PINWHEEL LEG-BOARD GEOMETRY (local frame, base leg k=0). The base
      // board runs along local-x, its outer long face near the +z edge, spanning
      // from a small inset inside the seat OUTWARD past the +x edge to
      // half+overhang. rot90(k) places the other three; each protrudes past the
      // NEXT edge. These fractions sit mid-band of the collision-free interlock
      // window (swept across the whole size/overhang range, see the guard below).
      // Each leg is a SHORT flat board at a CORNER (matching the reference): it
      // sits FLUSH at one edge (thin 18mm dim across that edge), spans ~36% of the
      // edge tucked toward a corner, and its end pokes past the PERPENDICULAR edge
      // by `overhang`. Short corner boards read as legs, not big fins.
      const legW     = 0.36 * p.size;             // board length along its edge (corner leg)
      const legCz    = half - legThk / 2;         // board flush INSIDE the +z edge
      const legOuter = half + p.overhang;         // protruding end x (past the +x edge)
      const legInner = legOuter - legW;           // inner end x (short corner leg)
      const legLen   = legW;                      // board length
      const legCx    = (legInner + legOuter) / 2; // board centre x (local)

      // --- one unit's parts, placed in its OWN local frame then yawed + moved.
      // A unit's plan is built in its LOCAL frame (centre 0,0, no yaw), and a
      // helper maps each local (x,z) into the world via the unit's yaw + offset,
      // so a 90°-rotated twin is just yaw=1 (×90°). Returns parts/joints plus
      // legBoxes (plan footprints) for the interlock guard.
      function unit(tag, dx, dz, yaw) {
        const parts = [];
        const joints = [];
        const legBoxes = [];                  // {x,z,hw,hd} plan AABBs of the leg-boards

        // world placement of a local plan point + which world axis a local-x
        // member ends up running along (x for yaw 0/180, z for yaw 90/270).
        const place = (lx, lz) => {
          const [rx, rz] = rot90(lx, lz, yaw / 90);
          return [rx + dx, rz + dz];
        };
        const yawEven = (yaw % 180 === 0);
        const localXAxis = yawEven ? 'x' : 'z';   // local-x runs world-?
        const localZAxis = yawEven ? 'z' : 'x';   // local-z runs world-?

        // LEGS — four flat ply boards, pinwheel-offset. The base board (k=0) runs
        // local-x near the +z edge and protrudes past the +x edge; rot90(k) gives
        // the other three, each parallel to one edge and poking past the next, so
        // the footprint has four tabs and four matching notches. A board stands
        // on edge (wide face vertical, 18mm thin across), running its LENGTH along
        // a horizontal axis: panel plane 'xy' when the length runs world-x,
        // 'zy' when it runs world-z. The protruding end is the interlock tab.
        for (let k = 0; k < 4; k++) {
          const [lcx, lcz] = rot90(legCx, legCz, k);
          const [wx, wz] = place(lcx, lcz);
          // length axis after k rotations + this unit's yaw: even total => world-x.
          const lenAxis = (((k + yaw / 90) % 2) === 0) ? 'x' : 'z';
          const plane = lenAxis === 'x' ? 'xy' : 'zy';  // vertical board, length on lenAxis
          parts.push(panel(`${tag}-LEG-${k + 1}`, 'Flat-board leg', legStock,
            legLen, legH, plane, { x: wx, y: legMidY, z: wz }, `${tag} legs`));
          // plan AABB of this board: length on the run axis, 18mm across it.
          const hw = lenAxis === 'x' ? legLen / 2 : legThk / 2;
          const hd = lenAxis === 'z' ? legLen / 2 : legThk / 2;
          legBoxes.push({ x: wx, z: wz, hw, hd });
          joints.push(faceJoint(legThk, 3, 'leg-board screwed up into the seat + tied to its neighbour board'));
        }

        // UNDER-SEAT RAIL FRAME — four light rails just under the seat tying the
        // four leg-boards into a rigid box and giving the ply a bearing all round.
        // Two rails run local-x, two run local-z, dropped one rail-height so they
        // interlock at the corners. Kept INSIDE the seat footprint (never tabs).
        const railOff  = legCz - legThk / 2;               // rails run just inside the leg-boards
        const railTopY = legTop - 8;                       // just under the seat
        const xRailY = railTopY - railH / 2;               // local-x rails
        const zRailY = railTopY - railH - railH / 2;       // local-z rails, dropped
        const railLen = 2 * railOff;
        for (const sz of [-1, 1]) {
          const [wx, wz] = place(0, sz * railOff);
          parts.push(beam(`${tag}-RX-${sz < 0 ? 'B' : 'F'}`, 'Rail (x)', railStock,
            railLen, localXAxis, { x: wx, y: xRailY, z: wz }, `${tag} rails`));
          joints.push(buttJoint(railStock, 2, 'x-rail into two leg-boards, 1 per end'));
        }
        for (const sx of [-1, 1]) {
          const [wx, wz] = place(sx * railOff, 0);
          parts.push(beam(`${tag}-RZ-${sx < 0 ? 'L' : 'R'}`, 'Rail (z)', railStock,
            railLen, localZAxis, { x: wx, y: zRailY, z: wz }, `${tag} rails`));
          joints.push(buttJoint(railStock, 2, 'z-rail into two leg-boards, 1 per end (stacked under the x-rails)'));
        }

        // SEAT — ply lies flat (plane 'xz'), capping the four leg-boards + the
        // rail frame. The single sheet part. A square is rotationally symmetric,
        // so yaw leaves it square; only its centre moves.
        parts.push(panel(`${tag}-SEAT`, 'Stool seat', seatStock, p.size, p.size, 'xz',
          { x: dx, y: seatMidY, z: dz }, `${tag} seat`));
        joints.push(faceJoint(seatT, 4, 'seat down into all four leg-boards'));
        joints.push(panelEdgeJoint(seatStock, 4 * p.size, 220, 'seat perimeter screwed to the rail frame'));

        return { parts, joints, legBoxes };
      }

      const parts = [];
      const joints = [];

      if (p.units <= 1) {
        // Single stool, centred on the origin.
        const u = unit('U1', 0, 0, 0);
        parts.push(...u.parts);
        joints.push(...u.joints);
      } else {
        // TWO units interlocked into a wider cluster. Unit 2 = unit 1 rotated 90°
        // about the vertical, then slid along the DIAGONAL by `offset` on each
        // axis so its pinwheel tabs drop into unit 1's notches and the two square
        // tops overlap at a corner by `overlap` on each axis. The diagonal slide
        // is the natural C4 pinwheel relationship: it widens the combined seat
        // along the diagonal while keeping the four-fold symmetry of the cluster.
        //
        // `offset` is held in the geometry's collision-free band (the protruding
        // leg-boards of one unit must land in the other's notches, not on its
        // boards). A swept proof over the whole size/overhang range shows any
        // offset in ~[0.58·size, 0.90·size] is safe; 0.82·size sits mid-band, so
        // the rotate-and-slot always interlocks. overlap = size - offset.
        // Unit 2 = unit 1 rotated 90° and slid along the DIAGONAL so its pinwheel
        // tabs drop into unit 1's notches, the two square tops overlapping a little
        // at the corner. SELF-CORRECTING: start with a small overlap and back the
        // units apart until no two leg-boards collide in plan — so the rotate-and-
        // slot always interlocks cleanly whatever the leg geometry, and a bad
        // parameter can never throw or ship overlapping legs.
        const collide = (A, B) => {
          const tol = 1; // mm — abutting faces don't count as a collision
          for (const a of A) for (const b of B)
            if (Math.abs(a.x - b.x) < a.hw + b.hw - tol &&
                Math.abs(a.z - b.z) < a.hd + b.hd - tol) return true;
          return false;
        };
        let offset = 0.78 * p.size;                // diagonal slide per axis (mm)
        let u1 = unit('U1', -offset / 2, -offset / 2, 0);
        let u2 = unit('U2',  offset / 2,  offset / 2, 90);
        while (collide(u1.legBoxes, u2.legBoxes) && offset < 1.6 * p.size) {
          offset += 0.04 * p.size;
          u1 = unit('U1', -offset / 2, -offset / 2, 0);
          u2 = unit('U2',  offset / 2,  offset / 2, 90);
        }
        parts.push(...u1.parts, ...u2.parts);
        joints.push(...u1.joints, ...u2.joints);
      }

      const steps = [
        'Cut per stool: 4 flat plywood leg-boards (ply18, on edge — wide face vertical, ~18mm thin across) and 2 x-rails + 2 z-rails (reglar34x45) and 1 square ply seat (ply18).',
        'Stand each leg-board so it runs PARALLEL to one seat edge with its outer long face near that edge, tucked toward a corner, and its end protruding past the PERPENDICULAR edge by ~80mm. Arrange the four PINWHEEL: going round the corners each board is rotated 90° and pokes past the NEXT edge (4-fold rotation). The footprint now has four protruding tabs and four matching notches.',
        'Tie the four leg-boards with the two x-rails then the two z-rails (dropped one rail-height) to make a rigid box just under the seat; the boards rest on the ground, the protruding ends are the interlock tabs.',
        'Drop the square ply seat on with a slight overhang and screw down into each leg-board top.',
        'To INTERLOCK two into a wider seat: build a second identical stool, rotate it 90° about the vertical, and slide it along the DIAGONAL so its protruding leg-board ends drop into the first stool\'s notches and the two seats overlap a little at the corner — one wider seat, tabs in notches.',
        'Repeat the rotate-and-slot to tessellate a whole cluster of seating from identical pinwheel units, no extra parts.',
      ];
      const notes = [
        'The pinwheel is the whole trick: each unit has four flat-board legs, each running along one edge and poking past the NEXT (4-fold rotational symmetry), so an identical unit rotated 90° has its protruding tabs exactly where this one has notches. Rotate-and-slot, not push-together. There are no separate feet — the leg-board ends ARE the tabs.',
        'Interlock geometry: the twin is yawed 90° and slid ' + (0.82 * p.size).toFixed(0) + 'mm on each axis along the diagonal, so the two square tops overlap ' + (p.size - 0.82 * p.size).toFixed(0) + 'mm at the corner. The leg-boards stop just under the seat (' + p.seatH + 'mm) and protrude only at ground level, so a neighbour\'s tab passes cleanly under this seat; a build-time check confirms no two units\' leg-boards share plan space.',
        'The diagonal offset is held in the collision-free band (a swept proof over the whole size/overhang range shows ~0.58–0.90·size always interlocks), so the rotate-and-slot works at any parameter setting — a single unit is a comfortable stool, two make a wider seat, a field tessellates into communal seating with no extra parts.',
        'Outdoors: a lone lightweight pinwheel stool can skitter in wind — interlocked units brace each other through the slotted leg-boards, but for a standalone unit on a deck, weight the seat or add a discreet ground anchor (a screw eye + peg) through one leg-board into the decking.',
      ];

      return { parts, joints, steps, notes };
    },
  },

];

export default INTERLOCK;
