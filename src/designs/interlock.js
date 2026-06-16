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
      { key: 'len',   label: 'Top width (legs = ¼)', min: 400, max: 800, step: 20, default: 600, unit: 'mm' },
      { key: 'depth', label: 'Top depth',   min: 220, max: 400, step: 10, default: 300, unit: 'mm' },
      { key: 'units', label: 'Units (side-by-side, rotated)', min: 1, max: 5, step: 1, default: 1, unit: '' },
    ],

    build(p) {
      const topStock = 'ply18', legStock = 'ply18', aprStock = 'ply18';
      const topThk = PLY(topStock), legThk = PLY(legStock), aprThk = PLY(aprStock);

      const seatTop = p.seatH;
      const topY    = seatTop - topThk / 2;
      const hz      = p.depth / 2;
      const legZ    = hz + legThk / 2;          // leg flanks the long edge, inner face at hz
      const legH    = seatTop;                  // leg top flush with the surface
      const legY    = legH / 2;

      // Legs are 1/4 of the top length, laid out TAB-GAP-TAB-GAP from the front:
      // a leg fills segment 1 (flush with the front end) and segment 3, leaving
      // gaps at 2 and 4. A copy rotated 180° drops its tabs into those gaps, so a
      // row of units interlocks into a bench (the `units` param repeats it).
      const legW  = p.len / 4;
      const legXs = [-3 * p.len / 8, p.len / 8]; // centres of segments 1 and 3

      const aprH    = 80;
      const aprY    = (seatTop - topThk) - aprH / 2;
      const railLen = p.depth;

      // One unit, built in a LOCAL frame centred on the origin.
      function baseUnit() {
        const ps = [];
        ps.push(panel('TOP', 'Top board', topStock, p.len, p.depth, 'xz',
          { x: 0, y: topY, z: 0 }, 'Top'));
        for (const sz of [-1, 1]) legXs.forEach((lx, i) => {
          ps.push(panel(`LEG-${sz < 0 ? 'B' : 'F'}${i + 1}`, 'Board leg', legStock,
            legW, legH, 'xy', { x: lx, y: legY, z: sz * legZ }, 'Legs'));
        });
        legXs.forEach((lx, i) => {
          ps.push(panel(`RAIL-${i + 1}`, 'Cross rail', aprStock, railLen, aprH, 'zy',
            { x: lx, y: aprY, z: 0 }, 'Cross rails'));
        });
        return ps;
      }

      // Repeat into a bench: stack copies SIDE BY SIDE along the depth (z), each
      // ROTATED 180° about the vertical. Because the tab-gap legs sit on the long
      // edges, two units placed edge-to-edge in depth interleave their legs — the
      // tabs of one drop into the gaps of its neighbour. The block is centred on
      // the origin.
      const units = Math.max(1, Math.round(p.units || 1));
      const base  = baseUnit();
      const z0    = -((units - 1) * p.depth) / 2;
      const parts = [];
      for (let k = 0; k < units; k++) {
        const flip = (k % 2) === 1;          // alternate 180° rotation
        const oz   = z0 + k * p.depth;
        for (const part of base) {
          parts.push({
            ...part,
            ref: `U${k + 1}-${part.ref}`,
            size: { ...part.size },
            pos: { x: flip ? -part.pos.x : part.pos.x, y: part.pos.y,
                   z: (flip ? -part.pos.z : part.pos.z) + oz },
            rot: { x: 0, y: flip ? 180 : 0, z: 0 },
          });
        }
      }

      const joints = [];
      for (let k = 0; k < units; k++) {
        joints.push(faceJoint(legThk, 3 * 4, 'four board-legs screwed to the top edges + cross-rails'));
        joints.push(faceJoint(aprThk, 4 * 2, 'two cross-rails screwed into the legs, 2 per end'));
        joints.push(panelEdgeJoint(topStock, 2 * p.depth, 200, 'top screwed down to both cross-rails'));
      }

      const seg = Math.round(legW);
      const steps = [
        `Cut from ply18: ${units} top board(s) ${p.len}×${p.depth}, ${4 * units} board-legs ${seg}×${legH}, ${2 * units} cross-rails ${railLen}×${aprH}.`,
        `Lay the legs along each long edge TAB-GAP-TAB-GAP from the front end: ${seg}mm leg, ${seg}mm gap, ${seg}mm leg, ${seg}mm gap. Both long edges match.`,
        'Per unit: make two end frames (front+back leg tied by a cross-rail between them under the top), stand them, drop the top on so it rests on both rails. Screw from outside.',
        units > 1
          ? 'The row alternates a 180° rotation each unit and butts them together so the tabs of one meet the gaps of the next — one continuous bench.'
          : 'To grow a bench: duplicate the stool, rotate the copy 180°, and butt it on so its tabs drop into this one’s gaps.',
        'Check it sits flat, ease the edges, oil for outdoor use.',
      ];
      const notes = [
        'Legs are a quarter of the top length in a tab-gap-tab-gap rhythm, so a 180°-rotated copy interlocks: one unit is a stool, a row is a bench, all from one part.',
        'All ply18: tops, legs and cross-rails nest from sheets with little waste.',
        'A butted row is heavy and stable; a lone stool can still walk in a gust — weight or peg it.',
      ];

      return { parts, joints, steps, notes };
    },
  },
];

export default INTERLOCK;
