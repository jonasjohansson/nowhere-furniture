// ============================================================================
// designs/mari.js — ENZO MARI, AUTOPROGETTAZIONE (1974), REREAD FOR THE BARRIO
// ----------------------------------------------------------------------------
// Three pieces — chair, bench, table — in plywood + reglar, Torx-screwed.
// Mari's ethos: rough standard timber, honest butt joints, screws driven from
// the OUTSIDE where you can reach them, nothing hidden, dead simple to build.
// The job here is to keep that directness while making the proportions genuinely
// good — comfortable seat heights, sane spans, a bench and table that pair up.
//
// Everything is METRIC, millimetres, y up, ground at y=0. Each assembly is
// centred on x=0, z=0. Every member comes from the shared engineering.js
// vocabulary (beam/leg/panel/cleat/frameBase) so the BOM, 3D builder and export
// all read one consistent language; sheet part thickness always equals its
// stock thickness because panel() takes thickness straight from SHEETS.
//
// Builds are PURE: deterministic from params, no Date.now / Math.random.
// ============================================================================

import {
  ERGO, beam, plank, leg, panel, cleat, frameBase, slatField,
  buttJoint, panelEdgeJoint, faceJoint, beamMaxSpan, bearersFor,
  panelSupportSpacing, difficultyOf, SHEETS, TIMBER,
} from '../engineering.js?v=11';

// Small local readability helpers (pure). Thickness/section pulled from stock so
// a sheet part can never disagree with its material.
const PLY = (key) => SHEETS[key].thickness;
const SEC = (key) => TIMBER[key].section;

export const MARI = [

  // ==========================================================================
  // 1. MARI SEDIA — the Autoprogettazione chair.
  // --------------------------------------------------------------------------
  // Construction logic: two side frames define the chair. The front leg is
  // short (to the seat); the rear leg runs tall and keeps going up to BECOME the
  // back post — one stick, the most Mari move there is. The two side frames are
  // bridged front-to-back by a seat rail on each side. A ply seat drops onto the
  // rails and is screwed down from above; a ply back panel screws to the faces
  // of the two rear posts. A front apron under the seat front stops the frame
  // racking. Every screw lands on an outside face.
  // ==========================================================================
  {
    id: 'mari-sedia',
    name: 'Mari Sedia (Chair)',
    designer: 'Enzo Mari',
    year: 1974,
    blurb:
      'The Autoprogettazione chair in reglar + plywood. Two side frames whose ' +
      'rear legs run on up to become the back posts, bridged by seat rails; a ' +
      'ply seat dropped on and screwed down, a ply back screwed to the posts. ' +
      'All butt joints, every screw driven from the outside.',
    difficulty: 'Easy',
    buildTime: '2-3 h',
    params: [
      { key: 'seatH', label: 'Seat height', min: 420, max: 480, step: 5, default: ERGO.chair.seatH, unit: 'mm' },
      { key: 'seatD', label: 'Seat depth',  min: 380, max: 460, step: 10, default: ERGO.chair.seatD, unit: 'mm' },
      { key: 'seatW', label: 'Seat width',  min: 380, max: 460, step: 10, default: 420, unit: 'mm' },
      { key: 'backH', label: 'Back height', min: 300, max: 440, step: 10, default: ERGO.chair.backH, unit: 'mm' },
    ],
    build(p) {
      const legStock  = 'reglar45x45'; // legs + back posts
      const railStock = 'reglar34x45'; // seat rails + front apron
      const seatStock = 'ply18';       // sits down, takes the weight
      const backStock = 'ply12';       // light, only braces / leans on

      const legW   = SEC(legStock).w;  // 45
      const railH  = SEC(railStock).h; // 45
      const seatT  = PLY(seatStock);
      const backT  = PLY(backStock);

      const halfW  = p.seatW / 2;
      const sideX  = halfW - legW / 2;                 // leg centres
      const frontZ =  p.seatD / 2 - legW / 2;          // front leg row
      const backZ  = -p.seatD / 2 + legW / 2;          // rear post row
      const railTopY = p.seatH - seatT;                // rails just under seat
      const postTopY = p.seatH + p.backH;              // rear post full height

      const parts = [];
      const joints = [];

      // --- Two side frames: a front leg + a rear post per side ---------------
      for (const s of [-1, 1]) {
        const tag = s < 0 ? 'L' : 'R';
        const grp = s < 0 ? 'Left frame' : 'Right frame';
        // front leg: floor up to seat top
        parts.push(leg(`FL-${tag}`, legStock, p.seatH,
          { x: s * sideX, y: p.seatH / 2, z: frontZ }, grp));
        // rear post = back leg continued up into the backrest (one stick)
        parts.push(leg(`RP-${tag}`, legStock, postTopY,
          { x: s * sideX, y: postTopY / 2, z: backZ }, grp));
        // seat rail front-to-back, screwed into both legs of this side
        parts.push(beam(`SR-${tag}`, 'Seat rail', railStock, p.seatD - legW, 'z',
          { x: s * sideX, y: railTopY - railH / 2, z: 0 }, grp));
        joints.push(buttJoint(railStock, 2, `seat rail ${tag} into front leg + rear post, 2 per end`));
      }

      // --- Front apron ties the two side frames together at the front -------
      const aproW = p.seatW - 2 * legW;
      parts.push(beam('AP', 'Front apron', railStock, aproW, 'x',
        { x: 0, y: railTopY - railH / 2, z: frontZ }, 'Frame ties'));
      joints.push(buttJoint(railStock, 2, 'front apron into both front legs, 2 per end'));

      // --- Seat panel drops on the rails, screwed straight down -------------
      parts.push(panel('SEAT', 'Seat panel', seatStock, p.seatW, p.seatD, 'xz',
        { x: 0, y: p.seatH - seatT / 2, z: 0 }, 'Seat'));
      joints.push(panelEdgeJoint(seatStock, 2 * (p.seatD), 200, 'seat down into both side rails'));

      // --- Back panel screws to the front faces of the rear posts ----------
      const backY = p.seatH + p.backH / 2;
      parts.push(panel('BACK', 'Back panel', backStock, p.seatW, p.backH, 'xy',
        { x: 0, y: backY, z: backZ + legW / 2 + backT / 2 }, 'Back'));
      joints.push(faceJoint(backT, 6, 'back panel into both rear posts'));

      const steps = [
        'Cut list: 2 front legs, 2 rear posts (long), 2 seat rails, 1 front apron, 1 ply seat, 1 ply back.',
        'Build each side frame flat: stand a front leg and a rear post on the bench and screw a seat rail between them, 2 Torx per end, flush at the top.',
        'Stand the two side frames up and screw the front apron between the two front legs to lock them square.',
        'Drop the plywood seat onto the rails, centre it, and screw it down into both rails from above (a screw roughly every 200 mm).',
        'Stand the back panel against the front of the rear posts and screw it on, 3 screws per post.',
        'Check it sits flat and does not rack; add a screw anywhere it still moves.',
      ];
      const notes = [
        'The rear leg and back post are one continuous stick — fewer joints, and the backrest load runs straight to the floor.',
        'Seat at ' + p.seatH + ' mm, depth ' + p.seatD + ' mm sit inside the comfortable dining range; the 12 mm ply back only needs to brace and lean on, so it stays light.',
        'All screws land on outside faces — no blind driving, easy to take apart and stack flat after the burn.',
        'Outdoor tip: leave a hairline gap at the seat\'s back edge so dust and rain drain instead of pooling; knock the sharp ply arrises off so wind-blown grit does not chew them.',
      ];

      return { parts, joints, steps, notes };
    },
  },

  // ==========================================================================
  // 2. MARI PANCA — the Autoprogettazione bench (2-3 seats).
  // --------------------------------------------------------------------------
  // Construction logic: a pair of end leg-frames (two legs on a cross foot, with
  // a short rail under the seat so each end reads as a little ladder) carry a
  // long seat. A centre stringer runs the length just under the top to stop the
  // bench sagging and to give the middle planks something to bite. bearersFor()
  // decides whether the span needs an extra mid leg-frame; if it does, we drop
  // one in at x=0. The top is reglar planks laid flat, evenly gapped with
  // slatField(), every plank screwed down onto the bearers.
  // ==========================================================================
  {
    id: 'mari-panca',
    name: 'Mari Panca (Bench)',
    designer: 'Enzo Mari',
    year: 1974,
    blurb:
      'Autoprogettazione bench for two or three: end leg-frames on cross feet, ' +
      'a stringer down the spine, and a top of reglar planks laid flat and ' +
      'screwed straight down. A mid bearer appears automatically when the span ' +
      'asks for it. Pure visible structure.',
    difficulty: 'Easy',
    buildTime: '3-4 h',
    params: [
      { key: 'len',   label: 'Length',      min: 1100, max: 2100, step: 50, default: 1600, unit: 'mm' },
      { key: 'seatH', label: 'Seat height', min: 420, max: 460, step: 5, default: ERGO.bench.seatH, unit: 'mm' },
      { key: 'depth', label: 'Seat depth',  min: 320, max: 420, step: 10, default: ERGO.bench.seatD, unit: 'mm' },
      { key: 'gap',   label: 'Plank gap',   min: 6,   max: 18,  step: 2,  default: 10,  unit: 'mm' },
    ],
    build(p) {
      const legStock     = 'reglar45x70'; // legs on edge — depth carries the load
      const footStock    = 'reglar45x70'; // cross feet
      const railStock    = 'reglar34x45'; // end under-seat rails
      const stringerStock= 'reglar45x95'; // long spine bearer
      const plankStock   = 'reglar45x70'; // top planks laid flat (45 tall, 70 wide)

      const legW    = SEC(legStock).w;    // 45
      // The cross foot is laid flat across the depth (axis 'x'), so its LENGTH is
      // p.depth and its VERTICAL height is the stock's smaller face dim (w=45) —
      // NOT section.h (70), which is the foot's horizontal width on the ground.
      const footVert = SEC(footStock).w;  // 45 — foot's true height off the floor
      const railH   = SEC(railStock).h;   // 45
      const strH    = SEC(stringerStock).h; // 95
      const plankSec= SEC(plankStock);    // {w:45, h:70}
      const plankThick = plankSec.w;      // 45 tall when laid flat
      const plankWide  = plankSec.h;      // 70 across

      const seatTop = p.seatH;
      const topUnderside = seatTop - plankThick; // where bearers/legs top out

      // How many cross supports does this length need? bearersFor() returns the
      // total count incl. the two ends; anything over 2 means add a mid frame.
      const totalBearers = bearersFor(p.len, plankStock);
      const midFrames = Math.max(0, totalBearers - 2);

      // End frames inset from the very ends so the top overhangs a little.
      const endInset = legW / 2 + 40;
      const endZ = p.len / 2 - endInset;

      const parts = [];
      const joints = [];

      // Build a leg-frame (cross foot + two legs + under-seat rail) at z.
      const legFrame = (z, name) => {
        const grp = name;
        // cross foot runs across the depth (x), lying flat on the ground: it
        // spans y = 0 .. footVert. Centre it at footVert/2 so it rests on y=0.
        parts.push(beam(`FOOT-${name}`, 'Cross foot', footStock, p.depth, 'x',
          { x: 0, y: footVert / 2, z }, grp));
        // two legs land ON the foot top (y=footVert) and run up to the plank
        // underside, so foot and leg physically meet — no gap, no float.
        const legLen = topUnderside - footVert;
        for (const s of [-1, 1]) {
          const tag = s < 0 ? 'L' : 'R';
          parts.push(leg(`LEG-${name}${tag}`, legStock, legLen,
            { x: s * (p.depth / 2 - legW / 2), y: footVert + legLen / 2, z }, grp));
          joints.push(buttJoint(legStock, 2, `leg ${name}${tag} down onto cross foot, 2 screws`));
        }
        // under-seat rail ties the two legs, just below the planks
        parts.push(beam(`RAIL-${name}`, 'End rail', railStock, p.depth - 2 * legW, 'x',
          { x: 0, y: topUnderside - railH / 2, z }, grp));
        joints.push(buttJoint(railStock, 2, `end rail ${name} into both legs, 2 per end`));
      };

      legFrame(-endZ, 'A');
      legFrame( endZ, 'B');
      // Mid frame(s) for long benches — distribute them evenly across the span.
      for (let i = 1; i <= midFrames; i++) {
        const z = -endZ + (2 * endZ) * (i / (midFrames + 1));
        legFrame(Math.round(z), `M${i}`);
      }

      // Long stringer down the spine, just under the planks, screwed into every
      // frame — this is what actually beats the sag over the run.
      const stringerLen = 2 * endZ + legW; // reach into both end frames
      parts.push(beam('STR', 'Centre stringer', stringerStock, stringerLen, 'z',
        { x: 0, y: topUnderside - strH / 2, z: 0 }, 'Stringer'));
      joints.push(buttJoint(stringerStock, 2 * totalBearers,
        `stringer into all ${totalBearers} frames, 2 screws each`));

      // Top planks: laid flat, length along z, spread across the depth (x),
      // evenly gapped. slatField gives count + centre positions.
      const field = slatField(p.depth, plankWide, p.gap);
      const plankY = seatTop - plankThick / 2;
      field.positions.forEach((x, i) => {
        parts.push(beam(`PLK-${i + 1}`, 'Seat plank', plankStock, p.len, 'z',
          { x: Math.round(x), y: plankY, z: 0 }, 'Seat'));
      });
      // each plank screwed down into every cross support it crosses
      joints.push(panelEdgeJoint('ply18', field.count * totalBearers * 60, 60,
        `${field.count} planks, 1 screw into each of ${totalBearers} supports`));

      const steps = [
        `Cut list: ${2 + midFrames} cross feet, ${(2 + midFrames) * 2} legs, ${2 + midFrames} end rails, 1 long stringer, ${field.count} seat planks.`,
        'Build each leg-frame flat: stand two legs on a cross foot, screw them down (2 each), then screw the end rail across the legs just below their tops.',
        'Stand the end frames up the right distance apart and screw the centre stringer along the spine into each frame.' + (midFrames ? ' Slot the mid frame(s) in and screw them to the stringer too.' : ''),
        'Lay the planks across the top with the chosen gap, starting from the centre and working out so the gaps stay even.',
        'Screw each plank straight down — one screw into every frame it crosses. Sit on it and find any rock; add screws where it moves.',
      ];
      const notes = [
        `Span check: bearersFor() asked for ${totalBearers} supports across ${p.len} mm (a ${plankStock} plank is good to ~${beamMaxSpan(plankStock)} mm unsupported), so ${midFrames ? `${midFrames} mid frame(s) were added automatically` : 'the two end frames are enough'}.`,
        'Legs and stringer stand on edge so their depth, not width, carries the load — the bench feels solid, not springy.',
        `Each leg sits directly on top of its cross foot (foot ${footVert} mm high off the floor, leg landing flush on it) and is Torx-screwed down through the foot — every leg lands on its foot and the foot rests on the ground, nothing hangs in the air.`,
        'The top overhangs the end frames by ~40 mm so knees clear the legs and the structure reads as a clean line.',
        'Outdoor tip: keep the plank gaps at 8-12 mm so water and dust fall through instead of sitting in the seat; the same gaps let the timber dry fast after a desert rain.',
      ];

      return { parts, joints, steps, notes };
    },
  },

  // ==========================================================================
  // 3. MARI TAVOLO — the Autoprogettazione dining table (pairs with the bench).
  // --------------------------------------------------------------------------
  // Construction logic: frameBase() gives the honest four-leg + apron base in
  // one call (legs at the corners, aprons just under the top for rigidity).
  // On top of that we lay a FLAT plank field — reglar boards laid wide-face-up
  // (plank()), running the length, evenly gapped with slatField() — so the top
  // is a real flat eating surface, not a row of on-edge fins. Because flat boards
  // are less stiff than on-edge, full-width cross-bearers run across the width at
  // apron-top level so every plank rests on a bearer and nothing free-spans too
  // far. The top is sized to seat the bench down each long side at dining height
  // (~730 mm), with apron kept high enough for real knee clearance.
  // ==========================================================================
  {
    id: 'mari-tavolo',
    name: 'Mari Tavolo (Table)',
    designer: 'Enzo Mari',
    year: 1974,
    blurb:
      'Autoprogettazione dining table: a four-leg + apron base (frameBase) ' +
      'carrying a flat plank top (boards laid wide-face-up) with even gaps, on ' +
      'full-width cross-bearers so it stays flat. Sized at dining height to seat ' +
      'the Mari Panca down each side. Butt-jointed and screwed from where you reach.',
    difficulty: 'Moderate',
    buildTime: '4-5 h',
    params: [
      { key: 'len',   label: 'Length',      min: 1200, max: 2200, step: 50, default: 1700, unit: 'mm' },
      { key: 'width', label: 'Width',       min: 700,  max: 1000, step: 20, default: 820,  unit: 'mm' },
      { key: 'topH',  label: 'Top height',  min: 700,  max: 760,  step: 5,  default: ERGO.table.topH, unit: 'mm' },
      { key: 'gap',   label: 'Plank gap',   min: 4,    max: 14,   step: 2,  default: 8,    unit: 'mm' },
    ],
    build(p) {
      const legStock   = 'reglar45x70';   // sturdier legs for a table
      const apronStock = 'reglar45x70';   // deep aprons, real rigidity
      const plankStock = 'reglar45x95';   // wide top boards, laid FLAT (wide face up)
      const bearerStock= 'reglar45x70';   // cross-bearers under the flat top

      const plankSec = SEC(plankStock);   // {w:45, h:95}
      // Top planks lie FLAT via plank(): the WIDE section dim (95) runs across the
      // top, the NARROW dim (45) is the board thickness (vertical). This is a real
      // eating surface, not a row of on-edge fins.
      const plankThick = Math.min(plankSec.w, plankSec.h); // 45 — vertical thickness
      const plankWide  = Math.max(plankSec.w, plankSec.h); // 95 — across the top
      const bearerSec  = SEC(bearerStock);

      // Top SURFACE must land at p.topH. Flat planks are only 45 thick (vs 70
      // on-edge before), so the planks' underside sits one (thinner) plank-thickness
      // down. frameBase puts its apron TOP at (h - 10), NOT at h, so to land the
      // plank underside exactly on the apron top we pass h = apronTopY + 10 — this
      // seats the top on the base instead of floating it 10mm clear.
      const apronTopY = p.topH - plankThick;          // underside-of-planks plane (685)
      const baseH = apronTopY + 10;                   // frameBase's apronTop = h - 10

      const parts = [];
      const joints = [];

      // --- Base: legs + aprons in one honest call --------------------------
      const base = frameBase({
        legStock, apronStock,
        w: p.width, d: p.len, h: baseH, inset: 0, group: 'Base',
      });
      parts.push(...base.parts);
      joints.push(...base.joints);

      // --- CROSS-BEARERS: full-width bearers (run along x) at apron-top level so
      // every flat plank rests on a bearer along its length. Flat planks are far
      // less stiff on-edge than before, so we add enough bearers that no plank
      // free-spans more than panelSupportSpacing reasoning allows (~600mm). beam()
      // laid along x renders section.w (=45) on the vertical axis, so seat the
      // bearer top flush with the apron top using that real height.
      const bearerVert = bearerSec.w;                  // 45 — vertical dim of a flat x-beam
      const bearerY = apronTopY - bearerVert / 2;      // centre, top flush with apron top
      const endInset = SEC(apronStock).w + 20;         // clear the short-end aprons
      const innerLen = p.len - 2 * endInset;           // span between end bearers
      const nBearers = Math.max(2, Math.ceil(innerLen / 600) + 1);
      for (let i = 0; i < nBearers; i++) {
        const z = innerLen / -2 + (nBearers > 1 ? (innerLen * i) / (nBearers - 1) : 0);
        parts.push(beam(`BEARER-${i + 1}`, `Cross-bearer ${i + 1}`, bearerStock,
          p.width, 'x', { x: 0, y: bearerY, z: Math.round(z) }, 'Bearers'));
      }
      joints.push(buttJoint(apronStock, nBearers * 4,
        `${nBearers} cross-bearers, 2 screws into each long side apron`));

      // --- Top: FLAT plank field running the length (z), spread across width (x).
      // plank() lays each board wide-face-up; slatField self-spaces them to the gap.
      const field = slatField(p.width, plankWide, p.gap);
      const plankY = p.topH - plankThick / 2;          // bottom of planks == apron top
      field.positions.forEach((x, i) => {
        parts.push(plank(`TOP-${i + 1}`, 'Top plank', plankStock, p.len, 'z',
          { x: Math.round(x), y: plankY, z: 0 }, 'Top'));
      });
      // each plank screwed down into every cross-bearer it crosses.
      joints.push(faceJoint(plankThick, field.count * nBearers,
        `${field.count} planks, 1 screw into each of the ${nBearers} cross-bearers`));

      const supportEvery = panelSupportSpacing(plankThick); // sanity figure for the note

      const steps = [
        `Cut list: 4 legs, 4 aprons (2 long, 2 short), ${nBearers} cross-bearers, ${field.count} top planks.`,
        'Build the base: stand the four legs and screw the two long aprons then the two short aprons between them just under the top — 2 Torx per apron end (8 joints). Check it is square and does not rack.',
        `Fit the ${nBearers} full-width cross-bearers between the two long aprons, their TOP edge flush with the apron top, evenly along the length — these carry the flat planks so none sags.`,
        `Lay the ${field.count} top planks FLAT (wide face up) across the bearers with the ${p.gap}mm gaps, starting from the centre so the gaps stay even — a proper flat eating surface, not on-edge fins.`,
        'Screw each plank straight down into every cross-bearer it crosses. The top is located on the base; lift it off for flat transport.',
        'Turn the whole table over, stand it, and check every leg meets the floor; pack or trim any short leg.',
      ];
      const notes = [
        'frameBase() handles the leg + apron geometry and its own screw schedule, so the base is consistent with the rest of the catalog instead of hand-built.',
        `Top planks lie FLAT (wide ${plankWide}mm face up, ${plankThick}mm thick) for a real eating surface — boards on-edge would give narrow fins with deep slots, no good for a table.`,
        `Because flat planks are less stiff than on-edge, ${nBearers} full-width cross-bearers carry the field so no plank free-spans more than ~600mm (well inside the ~${supportEvery}mm guide for ${plankThick}mm); every plank rests on bearers — nothing floats.`,
        `Top is ${p.topH} mm — dining height — kept exactly there by dropping the base to ${baseH} mm under the thinner flat planks; the deep ${apronStock} aprons still clear the Mari Panca bench underneath.`,
        'Knock-down: the plank top lifts straight off the base for flat transport; the base breaks down at the apron screws.',
        'Outdoor tip: the open plank gaps drain rain and let wind through so the table is not a sail; round the top edges so a gust-blown plate slides rather than catches.',
      ];

      return { parts, joints, steps, notes };
    },
  },

];

export default MARI;
