// ============================================================================
// designs/modular.js — MODULAR BOX STOOL that bolts into a BENCH.
// ----------------------------------------------------------------------------
// ONE unit on its own is a STOOL; a row of units bolted side-by-side becomes a
// BENCH (longer row = longer bench). Same unit either way — the count is the
// whole design. Backless, plywood + reglar, Torx, knock-down, outdoor festival
// use. A clean Donald-Judd-ish box.
//
// Built entirely from the SHARED structural vocabulary in engineering.js — the
// member factories (panel/beam), the joinery helpers (buttJoint/panelEdgeJoint/
// faceJoint) and the structural rule of thumb (panelSupportSpacing). No
// hand-rolled boxes.
//
// CONVENTIONS (from stock.js contract):
//   - metric, millimetres. Whole arrangement centred at x=0, z=0. y is up,
//     ground at y=0.
//   - sheet part thickness == its stock thickness (panel() enforces this).
//   - panel(...,plane,...): 'xz' lies flat (the seat top), 'zy' upright facing
//     +/-x (the left/right side panels that span depth z × height y).
//   - build() is PURE: deterministic from params, no Date.now/Math.random.
// ============================================================================

import {
  ERGO, beam, panel, cleat,
  buttJoint, panelEdgeJoint, faceJoint, panelSupportSpacing,
  SHEETS, TIMBER,
} from '../engineering.js?v=24';

// Small local readability helpers (pure lookups, not box-builders).
const PLY = (key) => SHEETS[key].thickness;   // sheet thickness in mm
const SEC = (key) => TIMBER[key].section;      // timber {w,h} cross-section

export const MODULAR = [

  // --------------------------------------------------------------------------
  // MODULAR BOX (STOOL <-> BENCH) — Nowhere Build Crew, 2026.
  // A clean plywood box stool: two ply SIDE panels (left/right) carry a ply SEAT
  // top, tied under the seat by a front + back reglar RAIL into the sides. Two
  // reglar FEET/skids under each side keep the raw ply edges out of the playa
  // dust. Seat height = ERGO.stool (~440), footprint roughly square so a single
  // unit reads as a proper stool.
  //
  // THE POINT — the connection: units sit FLUSH side-by-side along x (touching
  // side panels). Each neighbouring PAIR is drawn together by Torx bolts through
  // the two touching side panels AND bridged by a short connector CLEAT screwed
  // up into both seats. A solo unit is a standalone stool — no dangling
  // connectors are emitted; connector parts only appear BETWEEN two real units.
  // So 1 unit = stool, N units in a bolted row = one rigid bench.
  // --------------------------------------------------------------------------
  {
    id: 'modular-box',
    name: 'Modular Box (Stool ↔ Bench)',
    designer: 'Nowhere Build Crew',
    year: 2026,
    blurb: 'One clean plywood box: on its own it is a stool, bolted side-by-side ' +
      'in a row it becomes a bench — the more units you connect, the longer the ' +
      'bench. Two ply sides carry a ply seat tied by reglar rails, on reglar ' +
      'skids so the raw edges stay out of the dust. Torx, knock-down, festival-ready.',
    difficulty: 'Moderate',
    buildTime: '1–1.5 h per unit',
    params: [
      // units default 3 -> the thumbnail shows the BENCH; slide to 1 for a single stool.
      { key: 'units', label: 'Units (stool→bench)', min: 1, max: 5, step: 1, default: 3, unit: '' },
      { key: 'seatH', label: 'Seat height', min: 420, max: 460, step: 5, default: ERGO.stool.seatH, unit: 'mm' },
      { key: 'unitW', label: 'Unit width',  min: 360, max: 480, step: 10, default: 420, unit: 'mm' },
      { key: 'depth', label: 'Depth',       min: 360, max: 440, step: 10, default: 400, unit: 'mm' },
    ],
    build(p) {
      const sideStock = 'ply18';        // the structural side panels
      const seatStock = 'ply18';        // seat top, same sheet
      const railStock = 'reglar34x45';  // front/back rails tying the sides under the seat
      const footStock = 'reglar45x45';  // skids under each side, keep ply edges off the ground
      const connStock = 'reglar34x45';  // connector cleat bridging two seats

      const sideT = PLY(sideStock);     // 18
      const seatT = PLY(seatStock);     // 18
      const footSec = SEC(footStock);   // {w:45,h:45}
      const footH = footSec.h;          // 45 — skid height off the ground
      const railSec = SEC(railStock);   // {w:34,h:45}

      const units = Math.max(1, Math.round(p.units));
      const W = p.unitW;                // one unit's width along x
      const D = p.depth;                // depth along z
      const seatTop = p.seatH;          // top face of the seat

      const parts = [];
      const joints = [];

      // Lay the row centred on x=0: unit i centre at x = (i - (units-1)/2) * W.
      // Units touch (pitch == width), so the whole arrangement is W*units wide.
      const unitCx = (i) => (i - (units - 1) / 2) * W;

      // Geometry shared by every unit ------------------------------------------------
      // Sides are upright 'zy' panels spanning depth(z) × height(y), one at each
      // side of the unit. They stand on the feet, so their bottom sits at footH
      // and their top reaches the underside of the seat (seatTop - seatT).
      const sideBottomY = footH;                 // sides rest on the skids
      const sideTopY = seatTop - seatT;          // sides stop under the seat
      const sideH = sideTopY - sideBottomY;      // panel height
      const sideCy = sideBottomY + sideH / 2;    // panel centre y
      // side-panel x within a unit: centred so its outer face is the unit edge.
      const sideOff = W / 2 - sideT / 2;

      // Rails: reglar laid along z is wrong (they tie front-to-back? no) — the
      // rails run along z between the two sides? The sides face +/-x and are
      // separated along x, so a rail tying them runs along X. Put one rail at the
      // front (+z) and one at the back (-z), each running x between the two sides,
      // just under the seat. They stop the box from racking and carry the seat's
      // long edges.
      const railTopY = sideTopY;                 // flush under the seat
      const railY = railTopY - railSec.h / 2;
      const railLen = W - 2 * sideT;             // clear span between the two sides
      const railZ = D / 2 - railSec.w / 2;       // front/back, inset by rail half-width

      // Does the ply seat need an under-rib? The seat's unsupported span is the
      // clear distance between the front and back rails (the depth direction).
      const supportEvery = panelSupportSpacing(seatT);  // ~450 for 18mm
      const seatClearDepth = D - 2 * railSec.w;         // between the two rails
      const needRib = seatClearDepth > supportEvery;

      // Per-unit parts ---------------------------------------------------------------
      for (let i = 0; i < units; i++) {
        const cx = unitCx(i);
        const u = i + 1;                          // 1-based unit number for refs
        const grp = `Unit ${u}`;

        // Two side panels (left/right), upright 'zy', facing +/-x.
        for (const s of [-1, 1]) {
          parts.push(panel(`U${u}-SIDE-${s < 0 ? 'L' : 'R'}`, 'Side panel', sideStock,
            D, sideH, 'zy',
            { x: cx + s * sideOff, y: sideCy, z: 0 }, grp));
        }
        // Sides catch the seat above + the rails into their faces.
        joints.push(buttJoint(railStock, 4, `U${u}: rails butt into the two side panels`));

        // Two feet/skids under each side, running along z (front-to-back) so the
        // panel's bottom edge sits on solid timber, not in the dust. One skid per
        // side, full depth.
        for (const s of [-1, 1]) {
          parts.push(beam(`U${u}-FOOT-${s < 0 ? 'L' : 'R'}`, 'Foot skid', footStock,
            D, 'z', { x: cx + s * sideOff, y: footH / 2, z: 0 }, grp));
        }
        joints.push(faceJoint(footSec.h, 4, `U${u}: each side panel down onto its skid (2 screws/side)`));

        // Front + back rails along x, just under the seat, tying the two sides.
        for (const f of [-1, 1]) {
          parts.push(beam(`U${u}-RAIL-${f < 0 ? 'B' : 'F'}`, 'Rail', railStock,
            railLen, 'x', { x: cx, y: railY, z: f * railZ }, grp));
        }

        // Optional under-rib if the seat span needs it: an upright 'zy' web at the
        // unit centre, propping the seat mid-depth between the rails. It spans the
        // clear depth and sits just under the seat (same height band as the rails).
        if (needRib) {
          parts.push(panel(`U${u}-RIB`, 'Seat rib', seatStock,
            seatClearDepth, railSec.h, 'zy',
            { x: cx, y: railY, z: 0 }, grp));
          joints.push(faceJoint(seatT, 4, `U${u}: under-rib up into seat + into both rails`));
        }

        // Seat top: flat 'xz', spanning the full unit width, resting on the sides
        // and rails. Screwed down into both sides and both rails (and the rib).
        parts.push(panel(`U${u}-SEAT`, 'Seat top', seatStock,
          W, D, 'xz',
          { x: cx, y: seatTop - seatT / 2, z: 0 }, grp));
        joints.push(panelEdgeJoint(seatStock, 2 * (W + D), 200,
          `U${u}: seat down into both sides + both rails` + (needRib ? ' + rib' : '')));
      }

      // Connectors BETWEEN neighbours only -------------------------------------------
      // For a solo unit this loop runs zero times — a clean standalone stool, no
      // dangling hardware. For each adjacent pair (i, i+1) whose side panels touch
      // along x, emit:
      //   1) a connector CLEAT under the two seats, bridging the joint, screwed up
      //      into BOTH seats — makes the pair share a continuous seat plane.
      //   2) a bolt JOINT drawing the two touching side panels together (Torx
      //      through the panel pair), so the row is physically one rigid bench.
      // The cleat sits centred on the shared edge between unit i and i+1, i.e. at
      // x = boundary between the two unit centres.
      for (let i = 0; i < units - 1; i++) {
        const n = i + 1;                          // connector number (1-based)
        const boundaryX = (unitCx(i) + unitCx(i + 1)) / 2;  // shared side-panel plane
        // Connector cleat: short reglar along x, hung just under the two seats,
        // bridging the boundary so it screws into both seats. Length spans a bit
        // either side of the joint to reach solid seat on both units.
        const connLen = Math.min(W, 240);         // bridge ~either side of the joint
        const connSec = SEC(connStock);
        const connY = (seatTop - seatT) - connSec.h / 2;   // just under the seats
        parts.push(cleat(`CONN-${n}`, connStock, connLen, 'x',
          { x: boundaryX, y: connY, z: 0 }, 'Connectors'));
        joints.push(faceJoint(seatT, 4,
          `Connector ${n}: cleat up into both U${i + 1} & U${i + 2} seats (bridges the joint)`));
        // Bolt the two touching side panels together through their faces.
        joints.push(faceJoint(2 * sideT, 3,
          `Connector ${n}: Torx bolts drawing U${i + 1} & U${i + 2} side panels together`));
      }

      // Steps + notes ----------------------------------------------------------------
      const ribLine = needRib
        ? `An under-rib is included per unit: the ${Math.round(seatClearDepth)}mm clear seat ` +
          `depth exceeds the ~${supportEvery}mm support spacing for ${seatT}mm ply.`
        : `No under-rib needed: the ${Math.round(seatClearDepth)}mm clear seat depth stays within ` +
          `the ~${supportEvery}mm support spacing for ${seatT}mm ply.`;

      const steps = [
        `Build ONE unit: cut 2 side panels (${D}×${Math.round(sideH)}), 1 seat top ` +
          `(${W}×${D}), 2 front/back rails and 2 foot skids` + (needRib ? ', 1 under-rib.' : '.'),
        'Screw a foot skid under the bottom edge of each side panel (keeps the raw ply off the dust).',
        'Stand the two sides up and tie them with the front and back rails just under the seat line ' +
          'to make an open box' + (needRib ? '; drop the under-rib in at mid-depth and screw to both rails.' : '.'),
        'Drop the seat top on and screw down into both sides and both rails' + (needRib ? ' and the rib' : '') +
          ' — that one unit is now a finished, standalone STOOL.',
        'To make a BENCH: stand the units flush side-by-side along their width so the side panels touch.',
        'For each touching pair, screw a connector cleat across the underside bridging the two seats, ' +
          'then run Torx bolts through the two touching side panels to draw them tight — the row is now ' +
          'one rigid bench. More units = a longer bench.',
        'Knock-down: back out the bolts + connector cleats and the bench separates back into individual ' +
          'stools; each stool further breaks down at its seat and rail screws for flat transport.',
      ];

      const arrangement = units === 1
        ? 'At units=1 this is a single standalone STOOL (no connectors emitted).'
        : `At units=${units} this is a BENCH: ${units} stools flush in a row, ` +
          `${units - 1} bolted connections, ~${Math.round(units * W)}mm long.`;

      const notes = [
        'Stool ↔ bench is the whole idea: the SAME unit is a stool on its own and a bench when you ' +
          'bolt a row of them side-by-side. ' + arrangement,
        ribLine,
        'The connection is real structure, not decoration: a connector cleat bridges each seat joint ' +
          'and Torx bolts pull the touching side panels together, so a multi-unit row behaves as one ' +
          'rigid bench rather than loose stools shoved together.',
        'Wind / anchoring: a single stool is light and can skitter in playa wind — a bolted row is far ' +
          'heavier and lower-leverage, so it stays put. For exposed sites, bolt up a longer row (or ' +
          'stake a foot skid down through a pre-drilled hole) and let the combined mass do the anchoring.',
        `Sheet economy: at ${sideT}mm ply, one unit is 2 sides + 1 seat` + (needRib ? ' + 1 rib' : '') +
          ' — several units nest from a single 2440×1220 sheet; the reglar is the per-unit cost.',
        'Festival-ready & knock-down: Torx throughout, no glue. Stools store/ship as flat panel stacks ' +
          'and bolt up on site into whatever bench length the space wants.',
      ];

      return { parts, joints, steps, notes };
    },
  },

];

export default MODULAR;
