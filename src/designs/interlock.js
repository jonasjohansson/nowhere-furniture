// ============================================================================
// designs/interlock.js — the BOARD STOOL.
// ----------------------------------------------------------------------------
// A simple, beautiful plywood stool (from the reference photos): a flat TOP
// BOARD with FOUR VERTICAL BOARD-LEGS flanking it — two on each long side, their
// inner faces against the top's long edges, rising flush to the top surface —
// tied UNDERNEATH by two horizontal apron boards (one per side) that connect the
// two legs and carry the top. Top, legs and aprons are all the same plywood, so
// it's one sheet, a handful of straight cuts, and Torx screws from outside.
//
// Built from the shared engineering.js vocabulary (panel() member factory + the
// joinery helpers + ERGO presets). No hand-rolled boxes. Metric, mm; y up,
// ground at y=0; the stool is centred on x=z=0. panel(...,'xz',...) lies flat
// (the top); panel(...,'xy',...) stands as a vertical board (legs + aprons).
// build() is PURE (deterministic from params, no Date.now/Math.random).
// ============================================================================

import {
  ERGO, panel,
  faceJoint, panelEdgeJoint,
  SHEETS,
} from '../engineering.js';

const PLY = (key) => SHEETS[key].thickness;   // sheet thickness in mm

export const INTERLOCK = [

  // --------------------------------------------------------------------------
  // BOARD STOOL — Nowhere Build Crew, 2026.
  // Top board + four vertical board-legs (two per long side) + two underside
  // aprons. Honest, flat-pack-friendly, a few cuts from one ply sheet.
  // --------------------------------------------------------------------------
  {
    id: 'board-stool',
    name: 'Board Stool',
    designer: 'Nowhere Build Crew',
    year: 2026,
    blurb: 'A clean plywood stool: a flat top board with four vertical board-legs ' +
      'flanking its long edges — two each side, rising flush with the top — tied ' +
      'underneath by a horizontal apron board on each side. One sheet, straight ' +
      'cuts, Torx from outside. Honest and quick to build.',
    difficulty: 'Easy',
    buildTime: '45–60 min',
    params: [
      { key: 'seatH', label: 'Seat height', min: 420, max: 460, step: 5,  default: ERGO.stool.seatH, unit: 'mm' },
      { key: 'len',   label: 'Top length',  min: 440, max: 700, step: 10, default: 520, unit: 'mm' },
      { key: 'depth', label: 'Top depth',   min: 220, max: 360, step: 10, default: 280, unit: 'mm' },
      { key: 'legW',  label: 'Leg width',   min: 70,  max: 200, step: 5,  default: 130, unit: 'mm' },
    ],

    build(p) {
      const topStock = 'ply18';   // top board
      const legStock = 'ply18';   // vertical board-legs
      const aprStock = 'ply18';   // underside aprons

      const topThk = PLY(topStock);   // 18
      const legThk = PLY(legStock);   // 18 (thin dim of each vertical board)
      const aprThk = PLY(aprStock);   // 18

      const seatTop = p.seatH;                 // top SURFACE height
      const topY    = seatTop - topThk / 2;    // top board centre

      const hx = p.len / 2;                    // top half-length (x)
      const hz = p.depth / 2;                  // top half-depth (z)

      // Legs flank the two long (±z) edges: inner face flush with the edge, so the
      // board sits just OUTBOARD of the top, rising the full height to the surface.
      const legZ   = hz + legThk / 2;          // leg centre z (inner face at hz)
      const endIn  = Math.max(20, Math.round(p.len * 0.06)); // top overhang past the end legs
      // Clamp leg width so the two legs per side leave a real apron between them.
      const legW   = Math.min(p.legW, hx - endIn - 40);
      const legX   = hx - legW / 2 - endIn;    // leg centre x (two per side, near the ends)
      const legH   = seatTop;                  // full height: leg top flush with the surface
      const legY   = legH / 2;

      // Cross-rails sit BETWEEN the legs, UNDERNEATH the top: each spans the depth
      // between the front+back leg at one end, tying the two sides together. The
      // top rests on the two rails.
      const aprH    = 80;                                  // rail board height
      const aprTopY = seatTop - topThk;                    // rail top under the board
      const aprY    = aprTopY - aprH / 2;

      const parts = [];
      const joints = [];

      // TOP — flat board.
      parts.push(panel('TOP', 'Top board', topStock, p.len, p.depth, 'xz',
        { x: 0, y: topY, z: 0 }, 'Top'));

      // FOUR VERTICAL BOARD-LEGS — flanking the long edges, near each end.
      for (const sz of [-1, 1]) {
        for (const sx of [-1, 1]) {
          const tag = `LEG-${sz < 0 ? 'B' : 'F'}${sx < 0 ? 'L' : 'R'}`;
          parts.push(panel(tag, 'Board leg', legStock, legW, legH, 'xy',
            { x: sx * legX, y: legY, z: sz * legZ }, 'Legs'));
          joints.push(faceJoint(legThk, 3, 'leg screwed to the top edge + the end cross-rail'));
        }
      }

      // TWO END CROSS-RAILS — between the front+back legs at each end, underneath.
      const railLen = p.depth;                             // between the long-edge leg inner faces
      for (const sx of [-1, 1]) {
        const tag = `RAIL-${sx < 0 ? 'L' : 'R'}`;
        parts.push(panel(tag, 'Cross rail', aprStock, railLen, aprH, 'zy',
          { x: sx * legX, y: aprY, z: 0 }, 'Cross rails'));
        joints.push(faceJoint(aprThk, 4, 'cross-rail screwed into the front + back legs, 2 per end'));
      }
      // Top screwed down onto the two cross-rails.
      joints.push(panelEdgeJoint(topStock, 2 * p.depth, 200, 'top board screwed down to both cross-rails'));

      const steps = [
        `Cut from one ply18 sheet: 1 top board (${p.len}×${p.depth}), 4 board-legs (${legW}×${legH}), 2 cross-rails (${railLen}×${aprH}).`,
        'Make the two END frames: stand the front + back leg of one end and screw a cross-rail BETWEEN them just under where the top will sit. Two identical end frames.',
        'Stand the two end frames the top length apart and drop the top board on so it rests on both cross-rails, its long edges flush with the leg outer faces.',
        'Screw through each leg into the top edge (3 per leg) and down through the top into both cross-rails — all screws from outside, Mari-style.',
        'Check it sits flat and rock-test; ease the sharp top edges. Oil for outdoor use.',
      ];
      const notes = [
        'Two end frames (each = two legs + a cross-rail between them) tied by the top board make a rigid box — the cross-rails stop the legs splaying.',
        'All one ply18 sheet: top + 4 legs + 2 cross-rails nest from a single sheet with little waste.',
        'Light enough to move but a gust can still walk it — weight it or peg a foot in open desert wind.',
      ];

      return { parts, joints, steps, notes };
    },
  },
];

export default INTERLOCK;
