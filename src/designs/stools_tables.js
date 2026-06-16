// ============================================================================
// designs/stools_tables.js — STOOLS & TABLES that round out the Nowhere barrio.
// ----------------------------------------------------------------------------
// Three pieces, same two-material idiom as the main catalog (plywood + reglar,
// Torx, metric): a knock-down stool, a pure-plywood Judd bench/volume, and a
// big knock-down communal table that pairs visually with the benches.
//
// Everything is built from the SHARED structural vocabulary in engineering.js —
// the member factories (beam/leg/panel/cleat), the frameBase() sub-assembly,
// the joinery helpers (buttJoint/panelEdgeJoint/faceJoint) and the structural
// rules of thumb (panelSupportSpacing/slatField). No hand-rolled boxes.
//
// CONVENTIONS (from stock.js contract):
//   - metric, millimetres. Centre at x=0, z=0. y is up, ground at y=0.
//   - sheet part thickness == its stock thickness (panel() enforces this).
//   - panel(...,plane,...): 'xz' lies flat (a seat/top), 'xy' faces +/-z (a
//     back/side that spans x), 'zy' faces +/-x (a left/right end that spans z).
//   - all build()s are PURE: deterministic from params, no Date.now/Math.random.
// ============================================================================

import {
  ERGO, beam, plank, leg, panel, cleat, frameBase, slatField,
  buttJoint, panelEdgeJoint, faceJoint, panelSupportSpacing,
  difficultyOf, SHEETS, TIMBER,
} from '../engineering.js?v=22';

// Small local readability helpers (pure lookups, not box-builders).
const PLY = (key) => SHEETS[key].thickness;       // sheet thickness in mm
const SEC = (key) => TIMBER[key].section;          // timber {w,h} cross-section

export const STOOLS = [

  // --------------------------------------------------------------------------
  // 1. BERLIN HOCKER (STOOL) — Van Bo Le-Mentzel, 2010 idiom.
  // A pocket-money square knock-down stool: one small ply seat + four reglar
  // legs braced by two pairs of reglar rails just under the seat. Very few cuts
  // (1 panel, 4 legs, 4 rails). The basic counting-unit of the barrio.
  //
  // Construction logic: four legs at the corners, inset from the seat edge so
  // the seat overhangs slightly and your knees clear the legs. Two x-rails and
  // two z-rails sit just under the seat, stacked so they don't collide at the
  // corners (z-rails drop one rail-height below the x-rails). The ply seat caps
  // the whole thing and is the only sheet part — screwed straight down into the
  // four leg tops, which is what makes it rigid AND knock-down.
  // --------------------------------------------------------------------------
  {
    id: 'berlin-hocker',
    name: 'Berlin Hocker (Stool)',
    designer: 'Van Bo Le-Mentzel',
    year: 2010,
    blurb: 'A pocket-money square stool after the Berlin Hocker: one ply seat ' +
      'capping four reglar legs braced by two rail pairs. Almost no cuts, ' +
      'builds from offcuts, and it knocks down flat — the counting-unit of the barrio.',
    difficulty: 'Easy',
    buildTime: '30–45 min',
    params: [
      { key: 'seatH', label: 'Seat height', min: 420, max: 460, step: 5, default: ERGO.stool.seatH, unit: 'mm' },
      { key: 'top',   label: 'Seat size',   min: 300, max: 420, step: 10, default: 360, unit: 'mm' },
      { key: 'inset', label: 'Leg inset',   min: 20,  max: 60,  step: 5,  default: 40,  unit: 'mm' },
    ],
    build(p) {
      const legStock  = 'reglar45x45';   // square legs
      const railStock = 'reglar34x45';   // light braces under the seat
      const seatStock = 'ply18';         // single sheet part

      const legSec = SEC(legStock);      // 45x45
      const railH  = SEC(railStock).h;   // 45 (rail on edge)
      const seatT  = PLY(seatStock);     // 18

      const half    = p.top / 2;
      const seatTop = p.seatH;                       // top face of the seat
      const legTop  = seatTop - seatT;               // legs stop under the seat
      // leg centres: inset from the seat edge, accounting for leg thickness.
      const off     = half - p.inset - legSec.w / 2;

      const parts = [];
      const joints = [];

      // Four legs at the corners (length runs y).
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const r = `LEG-${sx < 0 ? 'L' : 'R'}${sz < 0 ? 'B' : 'F'}`;
        parts.push(leg(r, legStock, legTop, { x: sx * off, y: legTop / 2, z: sz * off }, 'Legs'));
      }

      // Two x-rails (front+back) just under the seat, then two z-rails dropped
      // one rail-height below so the four braces interlock at the corners.
      const railTopY = legTop - 10;                  // a touch under the seat
      const xRailY = railTopY - railH / 2;
      const zRailY = railTopY - railH - railH / 2;
      for (const sz of [-1, 1]) {
        parts.push(beam(`RX-${sz < 0 ? 'B' : 'F'}`, 'Rail (x)', railStock,
          2 * off, 'x', { x: 0, y: xRailY, z: sz * off }, 'Rails'));
        joints.push(buttJoint(railStock, 2, 'x-rail into two legs, 1 per end'));
      }
      for (const sx of [-1, 1]) {
        parts.push(beam(`RZ-${sx < 0 ? 'L' : 'R'}`, 'Rail (z)', railStock,
          2 * off, 'z', { x: sx * off, y: zRailY, z: 0 }, 'Rails'));
        joints.push(buttJoint(railStock, 2, 'z-rail into two legs, 1 per end (stacked under the x-rails)'));
      }

      // Ply seat lies flat (plane 'xz'), capping the legs. Only sheet part.
      parts.push(panel('SEAT', 'Stool seat', seatStock, p.top, p.top, 'xz',
        { x: 0, y: seatTop - seatT / 2, z: 0 }, 'Seat'));
      // seat screwed down into all four leg tops (one Torx per leg).
      joints.push(faceJoint(seatT, 4, 'seat down into all four legs'));

      const steps = [
        'Cut 4 legs, 2 x-rails, 2 z-rails from reglar and 1 ply seat (one square cut).',
        'Pre-drill the rail ends; screw the two x-rails to a pair of legs to make two leg+rail H-frames.',
        'Stand the two H-frames up and tie them with the two z-rails (dropped one rail-height) to make the cube.',
        'Check it is square and sits flat, then drop the ply seat on and screw down into each leg top.',
      ];
      const notes = [
        'Only one sheet part: a 360×360 seat. ~16+ seat blanks come off a single ' +
          '2440×1220 ply sheet — stools are basically free on plywood; the cost is the reglar.',
        'Knock-down: back out the four seat screws and the seat lifts off; the leg ' +
          'frames still hold each other for flat transport.',
        'Legs are inset so the seat overhangs slightly — knees clear the legs and the ' +
          'edges chamfer nicely.',
      ];
      return { parts, joints, steps, notes };
    },
  },

  // --------------------------------------------------------------------------
  // 2. JUDD PLYWOOD BENCH — Donald Judd, 1984 idiom.
  // A pure plywood box-volume bench: two end panels carry a seat slab and a
  // front+back apron slab, all butt-joined sheet. Calm geometry, the form IS
  // the structure. No timber at all.
  //
  // Construction logic: two solid 'zy' end panels (faces +/-x) stand the full
  // seat height. A flat 'xz' seat slab lands on top, butting into the ends.
  // Two upright 'xy' aprons (front + back) close the long sides into a rigid
  // box and stop the seat slab from sagging at its long edges. We then ASK
  // panelSupportSpacing() whether the seat ply needs an internal rib: if the
  // unsupported span between the two long aprons exceeds the advised spacing
  // for that thickness, we drop in one central ply rib (a hidden 'xy' web).
  // --------------------------------------------------------------------------
  {
    id: 'judd-bench',
    name: 'Judd Plywood Bench',
    designer: 'Donald Judd',
    year: 1984,
    blurb: 'A pure plywood box volume after Judd: two end panels carry a seat ' +
      'slab closed by front and back aprons into one calm rigid box. All sheet, ' +
      'all butt-joined — the proportion is the point and an internal rib hides if ' +
      'the span needs it.',
    difficulty: 'Moderate',
    buildTime: '2–3 h',
    params: [
      { key: 'len',   label: 'Length',      min: 1000, max: 1800, step: 50, default: 1400, unit: 'mm' },
      { key: 'seatH', label: 'Seat height', min: 420,  max: 460,  step: 5,  default: ERGO.bench.seatH, unit: 'mm' },
      { key: 'depth', label: 'Depth',       min: 360,  max: 460,  step: 10, default: ERGO.bench.seatD, unit: 'mm' },
    ],
    build(p) {
      const stock = 'ply21';                 // heavy ply — it is the structure
      const t = PLY(stock);                  // 21
      const seatTop = p.seatH;
      const halfL = p.len / 2;
      // aprons hang down under the seat by this much, set the box's "reveal".
      const apronDrop = 120;

      const parts = [];
      const joints = [];

      // Two solid end panels: plane 'zy' = upright, faces +/-x, spans depth(z) × height(y).
      for (const end of [-1, 1]) {
        parts.push(panel(`END-${end < 0 ? 'L' : 'R'}`, 'End panel', stock,
          p.depth, p.seatH, 'zy',
          { x: end * (halfL - t / 2), y: p.seatH / 2, z: 0 },
          end < 0 ? 'Left end' : 'Right end'));
        joints.push(buttJoint(stock, 4, 'seat + aprons butt into this end panel'));
      }

      // Seat slab lies flat (plane 'xz'), spanning between the two ends.
      const seatSpan = p.len - 2 * t;        // clear length carried by the box
      parts.push(panel('SEAT', 'Seat slab', stock, seatSpan, p.depth, 'xz',
        { x: 0, y: seatTop - t / 2, z: 0 }, 'Seat'));

      // Front + back aprons: plane 'xy' = upright, faces +/-z, span length(x) × drop(y).
      // They close the long sides and support the seat's long edges.
      const apronH = apronDrop;
      const apronY = seatTop - t - apronH / 2;     // hang just under the seat
      for (const fb of [-1, 1]) {
        parts.push(panel(`APRON-${fb < 0 ? 'B' : 'F'}`, 'Apron', stock,
          seatSpan, apronH, 'xy',
          { x: 0, y: apronY, z: fb * (p.depth / 2 - t / 2) },
          'Aprons'));
        joints.push(panelEdgeJoint(stock, seatSpan, 220, 'apron edge into ends + up into seat'));
      }

      // DECIDE on an internal rib using the structural rule of thumb.
      // The sag-prone span is the seat's LENGTH between the two end panels (the
      // long, unsupported axis). If that clear length exceeds the advised
      // support spacing for this ply thickness, drop in one central cross rib at
      // mid-length so a person sitting in the middle doesn't bow the slab.
      const supportEvery = panelSupportSpacing(t);          // ~525 for 21mm
      const clearLen = seatSpan;                            // length between ends
      const needRib = clearLen > supportEvery;
      if (needRib) {
        // central rib: an upright 'zy' web (faces +/-x) at x=0, spanning the
        // depth between the two aprons and propping the seat at mid-length.
        const ribSpan = p.depth - 2 * t;                    // clear depth between aprons
        parts.push(panel('RIB', 'Internal seat rib', stock,
          ribSpan, apronH, 'zy',
          { x: 0, y: apronY, z: 0 }, 'Rib'));
        joints.push(faceJoint(t, 6, 'central rib up into seat + into both aprons'));
      }

      const sheetNote = needRib
        ? 'An internal rib was added because the seat span exceeds the ~' +
          `${supportEvery}mm support spacing for ${t}mm ply.`
        : `No internal rib needed: the seat span stays within the ~${supportEvery}mm ` +
          `support spacing for ${t}mm ply.`;

      const steps = [
        'Cut from 21mm ply: 2 end panels, 1 seat slab, 2 aprons' + (needRib ? ', 1 internal rib.' : '.'),
        'Pre-drill all butt joints (3.5mm pilot for the 5.0mm Torx) so the ply faces do not split.',
        'Screw the two aprons to the two end panels to make an open rectangular box.',
        needRib
          ? 'Stand the internal rib at mid-length between the aprons and screw it to both.'
          : 'Check the box is square across the diagonals.',
        'Drop the seat slab on top and screw down through the seat into the ends, both aprons' +
          (needRib ? ' and the rib.' : '.'),
      ];
      const notes = [
        sheetNote,
        'Sheet economy: end panels (~' + Math.round(p.depth) + '×' + Math.round(p.seatH) +
          ') + seat (~' + Math.round(seatSpan) + '×' + Math.round(p.depth) + ') + two aprons all ' +
          'nest from roughly ONE 2440×1220 sheet of 21mm ply for the default size — one bench per sheet.',
        'Pure Judd logic: no timber, no slats, no visible fasteners on the long faces if you ' +
          'screw the seat from above and counterbore — the calm box is the whole design.',
        'Pairs with the communal table: same plywood, same butt-jointed box language.',
      ];
      return { parts, joints, steps, notes };
    },
  },

  // --------------------------------------------------------------------------
  // 3. BARRIO COMMUNAL TABLE — big knock-down table to seat ~8–10.
  // ERGO.table.topH (~730). A rigid four-leg + apron base (built in ONE call by
  // frameBase) carries a plank-or-ply top that simply LIFTS OFF so the whole
  // thing ships flat. Sized and detailed to pair visually with the benches.
  //
  // Construction logic: frameBase() gives us four corner legs tied by four
  // aprons just under the top — that's the rigid, rackproof base. The top is a
  // field of reglar planks (laid with slatField for an even, self-spacing look
  // that echoes the benches) running the length of the table, resting on the
  // aprons. The top is NOT glued or permanently fixed: a few locator cleats
  // screwed to the underside drop between the aprons to stop it sliding, so it
  // lifts straight off for flat transport (base knocks down further at the
  // apron-to-leg screws if needed). Seating ~8–10 = ~600mm of edge per person
  // along both long sides.
  // --------------------------------------------------------------------------
  {
    id: 'barrio-communal-table',
    name: 'Barrio Communal Table',
    designer: 'Nowhere Build Crew',
    year: 2026,
    blurb: 'A big communal table for eight to ten: a rigid reglar leg-and-apron ' +
      'base built in one move, carrying a self-spacing plank top that simply ' +
      'lifts off so the whole thing ships flat. Built to pair with the barrio benches.',
    difficulty: 'Moderate',
    buildTime: '3–4 h',
    params: [
      { key: 'len',   label: 'Length',      min: 1800, max: 3000, step: 100, default: 2400, unit: 'mm' },
      { key: 'width', label: 'Width',       min: 800,  max: 1100, step: 50,  default: 900,  unit: 'mm' },
      { key: 'topH',  label: 'Top height',  min: 710,  max: 750,  step: 5,   default: ERGO.table.topH, unit: 'mm' },
      { key: 'gap',   label: 'Plank gap',   min: 4,    max: 14,   step: 2,   default: 8,    unit: 'mm' },
    ],
    build(p) {
      const legStock   = 'reglar45x95';   // beefy legs for a 2.4m table
      const apronStock = 'reglar45x95';   // deep aprons = a rigid, rack-proof base
      const plankStock = 'reglar45x70';   // top planks lying flat (45 thick, 70 wide)
      const cleatStock = 'reglar34x45';   // locator cleats under the top

      const plankSec = SEC(plankStock);   // 45x70
      // Top planks lie FLAT (wide face up) via plank(): the WIDE section dim (70)
      // runs ACROSS the top and the NARROW dim (45) is the board's THICKNESS
      // (vertical). This makes a real flat eating surface — not a row of on-edge
      // fins with deep slots. Flat is less stiff than on-edge, so the cross-bearers
      // below carry the field (see nBearers) and no plank free-spans too far.
      const plankThick = Math.min(plankSec.w, plankSec.h); // 45 — VERTICAL thickness
      const plankWidth = Math.max(plankSec.w, plankSec.h); // 70 — across the top

      // The top sits ON the apron base. frameBase puts the apron TOP at (h - 10),
      // not at h, so for the plank underside to land exactly on the apron top —
      // and the finished top SURFACE to sit at topH — the base height passed to
      // frameBase must be: apronTop + plankThick = topH, with apronTop = h - 10.
      //   => h = topH - plankThick + 10
      // Flat planks are thinner (45 vs the old on-edge 70), so the base rises to
      // keep the surface exactly at topH. This seats the top on the base, no float.
      const apronTopY = p.topH - plankThick;          // underside-of-planks plane
      const baseH = apronTopY + 10;                   // frameBase's apronTop = h - 10

      const parts = [];
      const joints = [];

      // --- BASE: four legs + four aprons in a single, well-braced call. ---
      // inset pulls legs in from the corners so the top overhangs ~knees clear.
      const inset = 60;
      const base = frameBase({
        legStock, apronStock,
        w: p.width, d: p.len,            // footprint: width (x) × length (z)
        h: baseH, inset,
        group: 'Base',
      });
      parts.push(...base.parts);
      joints.push(...base.joints);       // aprons-into-legs schedule comes baked in

      // --- CROSS-BEARERS: full-width bearers at apron-top level that EVERY plank
      // rests on. The frame aprons alone don't catch the outermost planks (the
      // top overhangs the apron rectangle for knee clearance), so the planks must
      // bear on members that span the WHOLE width. These run along x at apron-top
      // height (their top flush with the apron top), spaced along the length so no
      // plank ever free-spans more than ~600mm — important now the planks are laid
      // FLAT (45mm thick) and so less stiff than the old on-edge orientation.
      // The planks (running z) cross every bearer => every plank is supported.
      // beam() laid along x renders section.w on the vertical (y) axis, so a
      // 45×95 stick lying flat along x stands bearerSec.w (=45) tall. Seat the
      // bearer TOP flush with the apron top using its REAL rendered height.
      const bearerSec = SEC(apronStock);              // {w:45, h:95}
      const bearerVert = bearerSec.w;                 // vertical dim of a flat x-beam = 45
      const bearerTopY = apronTopY;                   // flush with the apron top
      const bearerY = bearerTopY - bearerVert / 2;    // centre of the bearer
      const bearerLen = p.width;                       // full width — catches all planks
      const bearerDepth = Math.max(bearerSec.w, bearerSec.h); // 95 — z-extent of an x-beam
      // The cross-bearers cross the two long side aprons and are screwed into them
      // where they meet, so every bearer must land WITHIN the side aprons' length —
      // an end bearer hung out past the apron ends would carry the top on nothing.
      // frameBase makes each side apron (d - 2*leg - 2*inset) long, centred. The
      // end bearers sit one half-bearer-depth inboard of the apron ends so they
      // rest fully on the side aprons; intermediate bearers are spaced so no plank
      // free-spans more than ~600mm (the planks lie FLAT and so are less stiff).
      const sideApronHalf = (p.len - 2 * SEC(legStock).w - 2 * inset) / 2;
      const bearerReach = sideApronHalf - bearerDepth / 2; // outermost bearer centre
      const bearerSpan = 2 * bearerReach;             // end-bearer to end-bearer
      const nBearers = Math.max(2, Math.ceil(bearerSpan / 600) + 1);
      for (let i = 0; i < nBearers; i++) {
        const z = -bearerReach + (nBearers > 1 ? (bearerSpan * i) / (nBearers - 1) : 0);
        parts.push(beam(`BEARER-${i + 1}`, `Cross-bearer ${i + 1}`, apronStock,
          bearerLen, 'x', { x: 0, y: bearerY, z }, 'Bearers'));
      }
      joints.push(buttJoint(apronStock, nBearers * 4,
        `${nBearers} cross-bearers, 2 screws into each long side apron`));

      // --- TOP: a field of FLAT planks running the LENGTH (z), across WIDTH (x). ---
      // plank() lays each board wide-face-up (flat) for a real eating surface.
      // slatField self-spaces n planks across the width to the target gap, so the
      // top reads like the bench seats. Planks run the full length and rest
      // directly on the full-width cross-bearers (and on the front/back aprons),
      // their underside on the apron-top plane — the top SITS on the base.
      const topY = apronTopY + plankThick / 2;        // bottom of planks == apron top
      const field = slatField(p.width, plankWidth, p.gap);
      field.positions.forEach((x, i) => {
        parts.push(plank(`PLANK-${i + 1}`, `Top plank ${i + 1}`, plankStock,
          p.len, 'z', { x, y: topY, z: 0 }, 'Top'));
      });
      // each plank screwed down into the cross-bearers (2 screws per bearer).
      joints.push(faceJoint(plankThick, field.count * nBearers,
        `${field.count} top planks, 2 screws into each of the ${nBearers} cross-bearers`));

      // --- LOCATOR CLEATS: keep the lift-off top from sliding, no permanent fix. ---
      // Two cleats screwed across the underside of the plank field, just inside
      // the short-end aprons, so they drop between the aprons and locate the top.
      // This is what makes the top KNOCK-DOWN: no glue, lift it straight up.
      const cleatLen = p.width - 2 * SEC(apronStock).w - 40;
      // A cleat laid along x renders its section.w on the vertical axis (beam()
      // puts the first section dim on the cross-axis), so the REAL vertical height
      // of a reglar34x45 cleat run along x is 34, not section.h (45). Use the real
      // height so the cleat top meets the plank underside and is actually screwed
      // up into it — using the wrong dim floats the cleat a few mm clear of the top.
      const cleatVert = Math.min(SEC(cleatStock).w, SEC(cleatStock).h); // 34 vertical
      const cleatY = apronTopY - cleatVert / 2;       // cleat top flush with plank underside
      const cleatZ = p.len / 2 - SEC(apronStock).w - 60;
      for (const ze of [-1, 1]) {
        parts.push(cleat(`CLEAT-${ze < 0 ? 'A' : 'B'}`, cleatStock,
          cleatLen, 'x', { x: 0, y: cleatY, z: ze * cleatZ }, 'Top cleats'));
        joints.push(faceJoint(plankThick, Math.max(3, field.count),
          'locator cleat up into every plank (top lifts off as one mat)'));
      }

      const steps = [
        `Build the base: cut 4 legs (${legStock}) and 4 aprons (${apronStock}); ` +
          'screw each apron between two legs (2 Torx per end) to make a rigid rectangular base.',
        'Stand the base, check it sits flat and is square across the diagonals.',
        `Cut and fit ${nBearers} full-width cross-bearers (${apronStock}) between the two long ` +
          'side aprons, their TOP edge flush with the apron top, evenly along the length — ' +
          'these are what the whole plank field rests on, including the overhanging outer planks.',
        `Cut ${field.count} top planks to length and lay them FLAT (wide face up) with the ${p.gap}mm gaps — a proper flat eating surface, not on-edge fins.`,
        'Screw the two locator cleats across the underside of the plank field, set to drop just ' +
          'inside the short-end aprons — this binds the planks into one liftable mat.',
        'Drop the plank mat onto the base (it lands on the cross-bearers, cleats locate it ' +
          'between the aprons) and screw each plank down into every cross-bearer.',
        'To pack flat: back out the top-to-bearer screws, lift the plank mat off, and (if needed) ' +
          'unscrew the aprons and bearers from the legs/aprons.',
      ];
      const notes = [
        'frameBase() leg/apron strategy: four corner legs (45×95) tied by four 45×95 aprons ' +
          'set just under the top — the deep aprons triangulate against racking, giving a ' +
          'rigid base with no stretcher in the leg room, so 8–10 people get clear knees.',
        `Top planks lie FLAT (wide ${plankWidth}mm face up, ${plankThick}mm thick) for a real eating ` +
          'surface, not on-edge fins with deep slots. The surface stays at the dining height because ' +
          `the base rose to ${baseH}mm under the thinner flat planks.`,
        `The top SITS on the base: ${nBearers} full-width cross-bearers run flush with the apron ` +
          'top, so every plank — including the ones that overhang the apron rectangle for knee ' +
          'clearance — physically rests on a bearer, and flat (less stiff) planks never free-span ' +
          'more than ~600mm. Nothing floats; the slab is fully carried.',
        `Seats ~8–10: at ${p.len}mm length that is ~${Math.floor(p.len / 600)} per long side ` +
          'plus one at each end (~600mm of edge per person).',
        'Knock-down: the plank top lifts straight off (located, not fixed, by two cleats that ' +
          'drop between the aprons) and the base breaks down at the apron screws — ships flat.',
        'Plank top vs ply: planks chosen so the table reads like the bench seats (same reglar, ' +
          'same self-spaced gaps). Swap to a ply top (ply21, two half-sheets butt-joined over a ' +
          'mid cleat) for a Judd-matching slab — both rest on the same bearers.',
        'Sheet/stick economy: the top is reglar, not sheet, so it costs no plywood; the base ' +
          `plus ${nBearers} bearers are ~${(4 * baseH + 2 * (p.len) + (2 + nBearers) * (p.width)) / 1000 | 0}m ` +
          'of 45×95 reglar, and the whole top is one stick-length class of 45×70 planks.',
      ];
      return { parts, joints, steps, notes };
    },
  },

];

export default STOOLS;
