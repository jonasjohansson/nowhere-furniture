// ============================================================================
// designs/classics.js — RECOGNISED CLASSICS, honest-plank idiom.
// ----------------------------------------------------------------------------
// Four easy-to-build, sturdy, beautiful classics for a 10-person Nowhere barrio,
// translated into the catalog's two-material language (plywood + reglar softwood,
// Torx screws, fully metric, knock-down where it counts):
//   1. Aalto Stacking Stool  — after Alvar Aalto (Stool 60), a low stool/bench.
//   2. Judd Plywood Chair     — after Donald Judd, a pure-plane plywood cube chair.
//   3. Barrio Picnic Trestle  — the classic A-frame park picnic table + benches.
//   4. Nakashima Plank Bench   — after George Nakashima, a long solid plank seat.
//
// Built from the SHARED structural vocabulary in engineering.js — member
// factories (beam/leg/panel/cleat/frameBase), slat helper (slatField), joinery
// helpers (buttJoint/panelEdgeJoint/faceJoint), and span rules of thumb
// (beamMaxSpan/bearersFor). No hand-rolled boxes.
//
// CONVENTIONS (from stock.js contract):
//   - metric, millimetres. Centre at x=0, z=0. y is up, ground at y=0.
//   - sheet part thickness == its stock thickness (panel() enforces this).
//   - panel(...,plane,...): 'xz' lies flat (a seat/top), 'xy' faces +/-z (a
//     back/side that spans x), 'zy' faces +/-x (a left/right end that spans z).
//   - every part rests on the ground or touches another part — nothing floats.
//   - all build()s are PURE: deterministic from params, no Date.now/Math.random.
// ============================================================================

import {
  ERGO, beam, leg, panel, cleat, slatField,
  buttJoint, panelEdgeJoint, faceJoint, beamMaxSpan, bearersFor,
  reviewBuild, difficultyOf, SHEETS, TIMBER,
} from '../engineering.js?v=15';

// Small local readability helpers (pure lookups, not box-builders).
const TH  = (key) => SHEETS[key].thickness;        // sheet thickness in mm
const SEC = (key) => TIMBER[key].section;          // timber {w,h} cross-section

/** Evenly spaced X positions for `n` supports across a centred length L,
 *  first/last set `edgeInset` in from each end. n>=2. */
function spanXs(n, L, edgeInset) {
  const left = -L / 2 + edgeInset;
  const right = L / 2 - edgeInset;
  if (n <= 1) return [0];
  const step = (right - left) / (n - 1);
  return Array.from({ length: n }, (_, i) => Math.round(left + i * step));
}

// ============================================================================
// EXPORT
// ============================================================================
export const CLASSICS = [

  // ==========================================================================
  // 1. AALTO STACKING STOOL — after Alvar Aalto, Stool 60 (1933).
  // --------------------------------------------------------------------------
  // The most-copied stool on earth, here in the honest-plank idiom: a round-ish
  // square ply seat on three (or four) splayed legs. The real Stool 60 bends
  // L-legs from laminated birch; we can't steam-bend on the playa, so we honour
  // the SPIRIT — very few cuts, stackable, light — with straight reglar legs
  // splayed out for stability and a single ply seat that caps them. Each leg
  // foot touches the ground and its top touches the seat: nothing floats, and
  // with the legs splayed the footprint is wider than the seat so it can't tip
  // easily. Stack several by nesting the seats — they're all one height.
  // ==========================================================================
  {
    id: 'aalto-stacking-stool',
    name: 'Aalto Stacking Stool',
    designer: 'after Alvar Aalto (Stool 60)',
    year: 1933,
    blurb: 'The most-copied stool on earth in honest plank: a single ply seat ' +
      'on three or four splayed reglar legs. Few cuts, light, and they stack by ' +
      'nesting the seats. Splayed feet give a wider footprint than the seat so ' +
      'it sits rock-steady. Set Legs to 4 and Size up for a low perch-bench.',
    difficulty: 'Easy',
    buildTime: '30–45 min',
    params: [
      { key: 'seatH', label: 'Seat height', min: 420, max: 460, step: 5, default: ERGO.stool.seatH, unit: 'mm' },
      { key: 'top',   label: 'Seat size',   min: 320, max: 440, step: 10, default: 360, unit: 'mm' },
      { key: 'legs',  label: 'Legs (3 or 4)', min: 3, max: 4, step: 1, default: 3, unit: '' },
      { key: 'splay', label: 'Leg splay',   min: 6,   max: 16,  step: 1,  default: 10, unit: '°' },
    ],
    build(p) {
      const seatStock = 'ply18';        // one square ply seat caps the legs
      const legStock  = 'reglar45x45';  // straight reglar legs, splayed out
      const railStock = 'reglar34x45';  // short rails under the seat tie the legs

      const seatTh  = TH(seatStock);
      const legSec  = SEC(legStock);    // {45,45}
      const seatTop = p.seatH;
      const seatUnderY = seatTop - seatTh;        // legs reach up to here
      const legCount = p.legs >= 4 ? 4 : 3;

      const splayRad = (p.splay * Math.PI) / 180;
      // Leg top sits inset under the seat; foot kicks OUT by the splay so the
      // footprint is wider than the seat. Top ring radius vs foot ring radius.
      const topRing  = p.top / 2 - legSec.w / 2 - 18;   // leg-top circle radius
      const footKick = Math.tan(splayRad) * seatUnderY; // how far the foot kicks out
      const footRing = topRing + footKick;

      const parts = [];
      const joints = [];

      // Angular positions of the legs around the seat centre.
      const angles = legCount === 3
        ? [90, 210, 330]                // tripod, one leg to the back
        : [45, 135, 225, 315];          // square, legs under the corners
      angles.forEach((deg, i) => {
        const a = (deg * Math.PI) / 180;
        const tx = Math.cos(a) * topRing,  tz = Math.sin(a) * topRing;
        const fx = Math.cos(a) * footRing, fz = Math.sin(a) * footRing;
        // Centre of the leg = midpoint of foot (ground) and top (seat underside).
        const cx = (tx + fx) / 2, cz = (tz + fz) / 2, cy = seatUnderY / 2;
        // Splay is a tilt away from centre; decompose into rot.x / rot.z so the
        // top leans inward toward the axis. The leg LENGTH is the slant length.
        const slant = Math.hypot(seatUnderY, footKick);
        // Tilt direction: outward radial -> tip about both axes by splay,
        // signed by the radial unit vector (cos a, sin a) in the x/z plane.
        parts.push({
          ...beam(`LEG-${i + 1}`, 'Splayed leg', legStock, slant, 'y',
            { x: cx, y: cy, z: cz }, 'Legs'),
          // rot.x tilts in z, rot.z tilts in x; sign so the foot kicks outward.
          rot: { x: -Math.sin(a) * p.splay, y: 0, z: Math.cos(a) * p.splay },
        });
      });
      joints.push(buttJoint(legStock, legCount * 2,
        `each of ${legCount} legs screwed up into the seat, 2 each — the seat caps them`));

      // ---- short under-seat rails tie adjacent leg tops (kills wobble) -------
      // A ring of short rails just under the seat connects the leg tops so the
      // splayed legs can't spread or fold. They sit one rail-height below the
      // seat underside and bridge between consecutive leg-top positions.
      const railY = seatUnderY - SEC(railStock).h / 2;
      for (let i = 0; i < legCount; i++) {
        const a0 = (angles[i] * Math.PI) / 180;
        const a1 = (angles[(i + 1) % legCount] * Math.PI) / 180;
        const x0 = Math.cos(a0) * topRing, z0 = Math.sin(a0) * topRing;
        const x1 = Math.cos(a1) * topRing, z1 = Math.sin(a1) * topRing;
        const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
        const railLen = Math.round(Math.hypot(x1 - x0, z1 - z0));
        const angDeg = (Math.atan2(z1 - z0, x1 - x0) * 180) / Math.PI;
        parts.push({
          ...beam(`RAIL-${i + 1}`, 'Under-seat rail', railStock, railLen, 'x',
            { x: mx, y: railY, z: mz }, 'Rails'),
          rot: { x: 0, y: -angDeg, z: 0 }, // swing the rail to span between legs
        });
      }
      joints.push(buttJoint(railStock, legCount * 2,
        `ring of ${legCount} under-seat rails into the leg tops, 2 per leg — stops the splay spreading`));

      // ---- the ply seat (caps everything) -----------------------------------
      parts.push(panel('SEAT', 'Stool seat', seatStock, p.top, p.top, 'xz',
        { x: 0, y: seatTop - seatTh / 2, z: 0 }, 'Seat'));
      joints.push(panelEdgeJoint(seatStock, p.top * 2, 200,
        'seat screwed down into each leg top — a couple of screws per leg'));

      const review = reviewBuild({ parts, seatH: p.seatH });

      const steps = [
        `1. Cut one ply seat (${p.top}×${p.top}) and ${legCount} reglar legs to the splayed slant length.`,
        '2. Cut the short under-seat rails to the marked spacing between leg tops.',
        '3. Lay the seat face-down; mark the leg-top circle and stand each leg on it at the splay angle.',
        '4. Screw each leg up into the seat (2 screws each) — the seat caps and aligns them.',
        '5. Fit the ring of under-seat rails between the leg tops to lock the splay.',
        '6. Stand it up, rock-test, and stack spares by nesting the seats.',
        '7. Anchor or weight before wind (see notes).',
      ];

      const notes = [
        `Splay set to ${p.splay}° so the foot ring (${Math.round(footRing * 2)}mm across) is wider ` +
          `than the ${p.top}mm seat — the stool sits well outside its own centre of gravity and won't tip.`,
        'Honours Aalto in spirit, not method: the Stool 60 bends laminated birch L-legs, ' +
          'impossible on the playa, so we use straight splayed reglar and let the seat + rail ring ' +
          'do the bracing. Few cuts, light, and genuinely stackable.',
        'The under-seat rail ring is what keeps the splayed legs from spreading under load — ' +
          'do not omit it, or a hard sit-down slowly walks the feet outward.',
        'WIND / ANCHORING: a stool this light is a frisbee in a gust. Bring them inside the ' +
          'shade structure when not in use, or run a strap through the rail ring to a ground ' +
          'anchor; never leave a stack free-standing in open desert overnight.',
        ...review,
      ];

      return { parts, joints, steps, notes };
    },
  },

  // ==========================================================================
  // 2. JUDD PLYWOOD CHAIR — after Donald Judd (his plywood furniture, 1980s).
  // --------------------------------------------------------------------------
  // A pure-plane plywood volume: a calm cube chair of butt-jointed ply panels,
  // no visible structure, all geometry. Judd's furniture is exactly this — flat
  // planes meeting at right angles, the material doing the talking. Five panels:
  // two sides, a seat, a back, and a front rail/skirt that closes the box and
  // stops it racking. Every panel touches at least two others; the sides reach
  // the floor so the whole thing rests on the ground. Butt-jointed with Torx
  // through the side faces — honest, screw-heads-showing, very buildable.
  // ==========================================================================
  {
    id: 'judd-plywood-chair',
    name: 'Judd Plywood Chair',
    designer: 'after Donald Judd',
    year: 1984,
    blurb: 'A calm plywood cube chair after Judd: two side planes, a seat, a ' +
      'back and a front skirt, all butt-jointed ply — no legs, no frame, just ' +
      'geometry. The sides run to the floor so it rests flat; the seat, back ' +
      'and skirt tie the box so it can\'t rack. Pure planes, screw-heads honest.',
    difficulty: 'Easy',
    buildTime: '1–1.5 h',
    params: [
      { key: 'seatH', label: 'Seat height', min: 420, max: 460, step: 5, default: ERGO.chair.seatH, unit: 'mm' },
      { key: 'seatD', label: 'Seat depth',  min: 380, max: 460, step: 10, default: ERGO.chair.seatD, unit: 'mm' },
      { key: 'width', label: 'Seat width',  min: 380, max: 460, step: 10, default: 420, unit: 'mm' },
      { key: 'backH', label: 'Back height', min: 340, max: 420, step: 10, default: ERGO.chair.backH, unit: 'mm' },
    ],
    build(p) {
      const stock = 'ply18';            // every plane is the same ply — pure volume
      const th = TH(stock);
      const seatTop = p.seatH;
      const backTopY = seatTop + p.backH;

      const parts = [];
      const joints = [];

      // ---- two SIDE panels (the structure + the legs in one) ----------------
      // Full-height ply sides facing X ('zy'), from floor to back-top. They span
      // the seat depth and carry everything; their bottom edge is the foot.
      const sideD = p.seatD;            // side depth = seat depth
      const sideH = backTopY;           // floor to back top
      const sideCX = p.width / 2 - th / 2; // inner faces p.width-2*th apart? -> sides outside seat
      for (const side of [-1, 1]) {
        parts.push(panel(
          `SIDE-${side < 0 ? 'L' : 'R'}`, 'Side panel', stock,
          sideD, sideH, 'zy',
          { x: side * sideCX, y: sideH / 2, z: 0 },
          side < 0 ? 'Left side' : 'Right side',
        ));
      }
      // Clear width between the inner faces of the two sides:
      const innerW = p.width - 2 * th;

      // ---- SEAT panel (lies flat between the sides) -------------------------
      // Sits with its top at seatTop, spanning the inner width, full seat depth.
      parts.push(panel(
        'SEAT', 'Seat panel', stock,
        innerW, sideD, 'xz',
        { x: 0, y: seatTop - th / 2, z: 0 },
        'Seat',
      ));
      joints.push(faceJoint(th, 2 * Math.max(2, Math.round(sideD / 200)),
        'seat butt-jointed to both sides, screwed through the side faces into the seat edge'));

      // ---- BACK panel (upright, closes the rear between the sides) ----------
      // Faces Z ('xy'), spans inner width, from seat level up to back top, sat
      // at the rear edge so it ties the side tops and backs the sitter.
      const backH = backTopY - (seatTop - th); // from seat underside up to back top
      const backCY = (seatTop - th + backTopY) / 2;
      parts.push(panel(
        'BACK', 'Back panel', stock,
        innerW, backH, 'xy',
        { x: 0, y: backCY, z: -sideD / 2 + th / 2 },
        'Back',
      ));
      joints.push(faceJoint(th, 2 * Math.max(2, Math.round(backH / 200)),
        'back butt-jointed to both sides, screwed through the side faces into the back edge'));

      // ---- FRONT SKIRT (closes the box front, kills racking) ----------------
      // A shallow upright ply skirt under the front of the seat, spanning the
      // inner width, tying the side fronts together. This is the panel that
      // turns three planes into a rigid box — without it the open front racks.
      const skirtH = Math.min(140, seatTop - th - 40); // shallow front rail/skirt
      const skirtCY = (seatTop - th) - skirtH / 2;
      parts.push(panel(
        'SKIRT', 'Front skirt', stock,
        innerW, skirtH, 'xy',
        { x: 0, y: skirtCY, z: sideD / 2 - th / 2 },
        'Front skirt',
      ));
      joints.push(faceJoint(th, 2 * 2,
        'front skirt butt-jointed to both sides, screwed through the side faces — closes the box'));

      const review = reviewBuild({ parts, seatH: p.seatH, seatSpan: innerW, seatStock: stock });

      const steps = [
        '1. Cut all five panels from 18mm ply: two sides, a seat, a back, a front skirt.',
        '2. Mark the seat line and back-edge line on the inside face of each side panel.',
        '3. Stand the two sides parallel; clamp the seat between them at the seat line.',
        '4. Screw the seat to both sides through the outer side faces (butt joint).',
        '5. Fit the back panel at the rear between the sides and screw it the same way.',
        '6. Fit the front skirt under the seat front and screw it to both sides — this squares the box.',
        '7. Stand it up, sit-test, ease the front seat edge, and anchor before wind (see notes).',
      ];

      const notes = [
        'Pure Judd logic: no legs, no frame — five flat ply planes butt-jointed into a calm cube. ' +
          'The sides ARE the legs (they run to the floor), and the seat/back/skirt are the bracing.',
        'The front skirt is structural, not decoration: with the front open the box would rack ' +
          '(parallelogram side-to-side). The skirt closes the fourth face and makes it rigid.',
        'All butt joints, screw-heads showing on the side faces — honest and very buildable. ' +
          'Pre-drill the ply edges to stop them splitting, and a bead of glue makes the joints stiffer still.',
        'WIND / ANCHORING: a hollow ply box is light and catches gusts on its back panel like a sail. ' +
          'Drop a sandbag inside the box onto the seat, or strap it down through the back panel to a ' +
          'ground anchor; never leave it free-standing in open desert.',
        ...review,
      ];

      return { parts, joints, steps, notes };
    },
  },

  // ==========================================================================
  // 3. BARRIO PICNIC TRESTLE — the classic A-frame park picnic table.
  // --------------------------------------------------------------------------
  // The communal win: a slatted top with TWO attached bench seats, all carried
  // on a pair of splayed A-frame legs. The A-frame is the whole trick — the legs
  // cross in an X, the seat bearers and the top bearers hang off the crossing,
  // and a long stretcher + diagonal sway-braces tie the two A-frames so the
  // thing is a rigid space-frame you can dance on. Splayed feet give a huge
  // footprint. Top slats run the length on the top bearers; seat slats run the
  // length on the seat bearers; everything rests on the A-frames which rest on
  // the ground. Nothing floats.
  // ==========================================================================
  {
    id: 'barrio-picnic-trestle',
    name: 'Barrio Picnic Trestle',
    designer: 'Nowhere Build Crew (park-table classic)',
    year: 2026,
    blurb: 'The classic A-frame park picnic table: a slatted top with two ' +
      'attached bench seats on splayed A-frame legs, tied by a long stretcher ' +
      'and diagonal sway-braces into a rigid space-frame. Seats 6 to 8 face to ' +
      'face — the big communal centre of the barrio. Splayed feet, dance-proof.',
    difficulty: 'Moderate',
    buildTime: '2.5–3.5 h',
    params: [
      { key: 'len',    label: 'Length',      min: 1600, max: 2400, step: 50, default: 2000, unit: 'mm' },
      { key: 'topH',   label: 'Table height', min: 700, max: 760, step: 5, default: ERGO.table.topH, unit: 'mm' },
      { key: 'topW',   label: 'Top width',    min: 600, max: 800, step: 20, default: 700, unit: 'mm' },
      { key: 'seatH',  label: 'Seat height',  min: 430, max: 460, step: 5, default: ERGO.bench.seatH, unit: 'mm' },
      { key: 'slatGap', label: 'Slat gap',    min: 6,   max: 16,  step: 1,  default: 10, unit: 'mm' },
    ],
    build(p) {
      const legStock    = 'reglar45x95';  // A-frame legs, deep + splayed
      const topBearStock = 'reglar45x95'; // cross-bearer under the top
      const seatBearStock = 'reglar45x95';// cross-bearer under each seat (cantilever)
      const slatStock   = 'reglar45x70';  // top + seat slats, laid flat
      const tieStock    = 'reglar45x70';  // long centre stretcher
      const braceStock  = 'reglar45x45';  // diagonal sway braces

      const legSec   = SEC(legStock);     // {45,95}
      const slatSec  = SEC(slatStock);    // {45,70} -> 45 thick flat
      const slatThick = slatSec.w;        // 45 thick when laid flat

      const topTop  = p.topH;
      const seatTop = p.seatH;
      const seatW   = 280;                          // bench seat depth (per side)
      const seatOut = p.topW / 2 + 230;             // seat centreline reach from middle
      const seatSpan = (seatOut + seatW / 2) * 2;   // overall seat-to-seat width

      // The two A-frames sit in from the ends so the top/seats overhang a little.
      const frameInset = 280;
      const frameX = p.len / 2 - frameInset;        // |x| of each A-frame plane

      const topBearTopY  = topTop - slatThick;      // top slats lie on the bearer
      const topBearY     = topBearTopY - legSec.h / 2;
      const seatBearTopY = seatTop - slatThick;     // seat slats lie on seat bearer
      const seatBearY    = seatBearTopY - legSec.h / 2;

      const parts = [];
      const joints = [];

      // ---- two A-FRAMES (each: two splayed legs + top bearer + seat bearer) --
      // Legs cross in an X: each leg runs from a wide foot up to the opposite
      // side under the top, so the footprint spans the full seat width. We model
      // each leg as a beam tilted in the Z-Y plane (rot.x) so it leans inward.
      const footHalf = seatSpan / 2 - 40;           // foot kicks out to here in z
      const topHalf  = p.topW / 2 - legSec.w;        // legs meet under the top here
      const legRise  = topBearTopY;                  // floor to under-top
      const legSlant = Math.round(Math.hypot(legRise, footHalf - topHalf));
      const legTiltDeg = (Math.atan2(footHalf - topHalf, legRise) * 180) / Math.PI;

      [-1, 1].forEach((fx) => {                      // each A-frame at +/-frameX
        const tag = fx < 0 ? 'L' : 'R';
        [-1, 1].forEach((sz) => {                    // two crossing legs per frame
          // foot at z = sz*footHalf (ground), top at z = -sz*topHalf (under top):
          // so the leg crosses the centre — classic A/X frame.
          const footZ = sz * footHalf;
          const topZ  = -sz * topHalf;
          const cz = (footZ + topZ) / 2;
          const cy = legRise / 2;
          parts.push({
            ...beam(`LEG-${tag}${sz < 0 ? '1' : '2'}`, 'A-frame leg (splayed)', legStock,
              legSlant, 'y', { x: fx * frameX, y: cy, z: cz }, `${tag} A-frame`),
            // tilt in the Z-Y plane (about X). Sign so the top leans toward centre.
            rot: { x: sz * legTiltDeg, y: 0, z: 0 },
          });
        });
        // TOP cross-bearer: short beam across the top of this A-frame (along z),
        // carrying the top slats and clamping the two leg tops together.
        parts.push(beam(
          `TBEAR-${tag}`, 'Top cross-bearer', topBearStock,
          p.topW, 'z', { x: fx * frameX, y: topBearY, z: 0 }, `${tag} A-frame`,
        ));
        // SEAT cross-bearer: longer beam across the seat height (along z), its
        // ends carry the two bench seats. Bolts to both legs where they pass.
        parts.push(beam(
          `SBEAR-${tag}`, 'Seat cross-bearer', seatBearStock,
          seatSpan, 'z', { x: fx * frameX, y: seatBearY, z: 0 }, `${tag} A-frame`,
        ));
      });
      joints.push(buttJoint(legStock, 2 * 2 * 2,
        'each A-frame: two legs cross and bolt to the top bearer + seat bearer, 2 per crossing'));
      joints.push(buttJoint(seatBearStock, 2 * 2 * 2,
        'seat bearer bolted across both legs of each A-frame, 2 per leg (carries the bench cantilever)'));

      // ---- long CENTRE STRETCHER tying the two A-frames ---------------------
      // A single deep stretcher down the middle at seat-bearer height ties the
      // two A-frames so they can't fan apart along the length. Runs along x,
      // centred, landing on both seat bearers.
      parts.push(beam(
        'STRETCH', 'Centre stretcher', tieStock,
        p.len - 2 * frameInset + 200, 'x',
        { x: 0, y: seatBearY + legSec.h / 2 + SEC(tieStock).h / 2, z: 0 },
        'Stretcher',
      ));
      joints.push(buttJoint(tieStock, 2 * 2,
        'centre stretcher onto both seat bearers, 2 per crossing — stops the A-frames fanning'));

      // ---- diagonal SWAY BRACES (centre stretcher up to the top bearers) ----
      // Two diagonals from the centre stretcher up to each top bearer turn the
      // long plane into braced triangles so the table can't lozenge end-to-end.
      const braceRun = frameX;                       // x reach to a frame
      const braceRise = topBearY - (seatBearY + legSec.h / 2);
      const braceLen = Math.round(Math.hypot(braceRun, braceRise));
      const braceAng = (Math.atan2(braceRise, braceRun) * 180) / Math.PI;
      [-1, 1].forEach((dx) => {
        parts.push({
          ...beam(`SWAY-${dx < 0 ? 'L' : 'R'}`, 'Diagonal sway brace', braceStock,
            braceLen, 'x',
            { x: dx * frameX / 2,
              y: (topBearY + seatBearY + legSec.h / 2) / 2, z: 0 },
            'Sway braces'),
          rot: { x: 0, y: 0, z: dx * -braceAng }, // diagonal in the X-Y plane
        });
      });
      joints.push(faceJoint(SEC(braceStock).w, 2 * 2,
        'each diagonal sway brace screwed from the centre stretcher up to a top bearer'));

      // ---- TOP SLATS (run the length on the two top bearers) ----------------
      const topField = slatField(p.topW, slatSec.h, p.slatGap);
      topField.positions.forEach((z, i) => {
        parts.push(beam(
          `TSLAT-${i + 1}`, 'Top slat', slatStock,
          p.len, 'x', { x: 0, y: topTop - slatThick / 2, z }, 'Top slats',
        ));
      });
      joints.push(panelEdgeJoint(slatStock, p.len, 700,
        `each of ${topField.count} top slats screwed down to both top bearers`));

      // ---- SEAT SLATS (two benches, run the length on the seat bearers) -----
      // Each side bench is a couple of slats centred on its seat centreline.
      [-1, 1].forEach((sd) => {
        const seatField = slatField(seatW, slatSec.h, p.slatGap, sd * seatOut - seatW / 2 + slatSec.h / 2);
        seatField.positions.forEach((z, i) => {
          parts.push(beam(
            `SSLAT-${sd < 0 ? 'L' : 'R'}${i + 1}`, 'Bench seat slat', slatStock,
            p.len, 'x', { x: 0, y: seatTop - slatThick / 2, z }, 'Seat slats',
          ));
        });
      });
      joints.push(panelEdgeJoint(slatStock, p.len, 700,
        'each bench seat slat screwed down to both seat-bearer ends'));

      const clearSpan = p.len - 2 * frameInset;
      const review = reviewBuild({ parts, seatH: p.seatH, seatSpan: clearSpan, seatStock: slatStock });

      const steps = [
        '1. Build the two A-frames: cross two splayed legs, then bolt a top cross-bearer and a long seat cross-bearer across each.',
        '2. Stand the two A-frames up the right distance apart (length minus the end overhangs).',
        '3. Tie them with the long centre stretcher onto both seat bearers — this stops them fanning apart.',
        '4. Fit the two diagonal sway braces from the stretcher up to the top bearers — squares the long plane.',
        '5. Lay the top slats along the length on the two top bearers, spacing with the slat-gap spacer; screw each down.',
        '6. Lay the two bench seats: seat slats along the length on the seat-bearer ends; screw each down.',
        '7. Rock-test hard (people WILL stand on it), then anchor before wind (see notes).',
      ];

      const notes = [
        'The A-frame is the whole structural idea: the crossed splayed legs put the feet way ' +
          `outside the top (footprint ~${Math.round(seatSpan)}mm across), the seat bearer cantilevers ` +
          'the benches off the same crossing, and the centre stretcher + sway braces lock the two ' +
          'frames into a rigid space-frame. That triangulation is why you can dance on it.',
        `Top span between A-frames ${clearSpan}mm carried by deep ${slatStock} slats over ` +
          `beamMaxSpan(${slatStock}) ${beamMaxSpan(slatStock)}mm bays — the two end overhangs keep the ` +
          'working span short; lengthen past the cap and you would add a third middle A-frame.',
        'Seats are a true cantilever off the seat bearer, so that bearer is deep (45×95) and bolted ' +
          'to BOTH legs of each A-frame — a single screw there would hinge under a heavy guest.',
        'WIND / ANCHORING: a big table is a big sail and a big lever. Stake all four feet to ground ' +
          'anchors (rebar + duckbill) or strap the seat bearers down; with the splayed footprint it is ' +
          'hard to tip, but a gust can still walk it — never leave it un-anchored overnight.',
        ...review,
      ];

      return { parts, joints, steps, notes };
    },
  },

  // ==========================================================================
  // 4. NAKASHIMA PLANK BENCH — after George Nakashima, a long solid plank seat.
  // --------------------------------------------------------------------------
  // The quiet, beautiful one: a single long thick plank as the seat, carried on
  // two simple splayed trestles, tied by one through-stretcher down the middle —
  // the Shaker/Nakashima "let the plank be the thing" idiom. We can't get a live
  // edge slab on the playa, so the seat is a thick ply plank (or a doubled one),
  // and the legs are honest reglar trestles. Each trestle is a small rigid frame
  // (two splayed legs + a top cleat + a foot) so it stands without racking; the
  // central stretcher ties them so they can't sway. Plank rests on the cleats,
  // cleats rest on the legs, legs rest on the ground — nothing floats.
  // ==========================================================================
  {
    id: 'nakashima-plank-bench',
    name: 'Nakashima Plank Bench',
    designer: 'after George Nakashima',
    year: 1960,
    blurb: 'The quiet beautiful one: a single long thick plank seat on two ' +
      'splayed reglar trestles tied by one through-stretcher — the Shaker / ' +
      'Nakashima "let the plank be the thing" idiom. Each trestle is a rigid ' +
      'little frame so it stands solid; minimal, fast, and it reads as a slab.',
    difficulty: 'Easy',
    buildTime: '1–1.5 h',
    params: [
      { key: 'len',    label: 'Length',      min: 1200, max: 2000, step: 50, default: 1600, unit: 'mm' },
      { key: 'seatH',  label: 'Seat height', min: 420, max: 460, step: 5, default: ERGO.bench.seatH, unit: 'mm' },
      { key: 'depth',  label: 'Plank depth', min: 300, max: 420, step: 10, default: 360, unit: 'mm' },
      { key: 'splay',  label: 'Leg splay',   min: 6,   max: 16,  step: 1,  default: 10, unit: '°' },
    ],
    build(p) {
      const plankStock = 'ply21';        // one thick ply plank = the seat (the slab)
      const legStock   = 'reglar45x70';  // trestle legs, splayed
      const cleatStock = 'reglar45x70';  // trestle top cleat + foot
      const tieStock   = 'reglar45x70';  // central through-stretcher

      const plankTh = TH(plankStock);
      const legSec  = SEC(legStock);     // {45,70}
      const seatTop = p.seatH;
      const plankUnderY = seatTop - plankTh;     // cleats reach up to here

      // Two trestles sit in from the ends so the plank overhangs (a clean reveal).
      const overhang = 80;
      const trestleX = p.len / 2 - overhang - legSec.w / 2;

      const splayRad = (p.splay * Math.PI) / 180;
      const footKick = Math.tan(splayRad) * plankUnderY;  // feet kick out in z
      const cleatTopY = plankUnderY;                       // cleat top = plank underside
      const cleatY = cleatTopY - legSec.h / 2;
      const topHalf = p.depth / 2 - legSec.w / 2;          // leg tops under the plank
      const footHalf = topHalf + footKick;                 // splayed feet
      const legSlant = Math.round(Math.hypot(cleatTopY, footKick));
      const legTiltDeg = (Math.atan2(footKick, cleatTopY) * 180) / Math.PI;

      const parts = [];
      const joints = [];

      // ---- two TRESTLES (each: two splayed legs + top cleat + foot) ---------
      ['L', 'R'].forEach((tag, ti) => {
        const x = (ti === 0 ? -1 : 1) * trestleX;
        [-1, 1].forEach((sz) => {        // front (+z) and back (-z) splayed leg
          const topZ  = sz * topHalf;
          const footZ = sz * footHalf;
          const cz = (topZ + footZ) / 2;
          parts.push({
            ...beam(`LEG-${tag}${sz < 0 ? 'B' : 'F'}`, 'Splayed trestle leg', legStock,
              legSlant, 'y', { x, y: cleatTopY / 2, z: cz }, `${tag} trestle`),
            rot: { x: -sz * legTiltDeg, y: 0, z: 0 }, // top leans inward
          });
        });
        // Top cleat across the leg tops (along z), the plank lands on this.
        parts.push(beam(
          `CLEAT-${tag}`, 'Trestle top cleat', cleatStock,
          p.depth, 'z', { x, y: cleatY, z: 0 }, `${tag} trestle`,
        ));
        // Foot beam on the floor across the splayed feet (along z), ties them.
        parts.push(beam(
          `FOOT-${tag}`, 'Trestle foot', cleatStock,
          footHalf * 2 + legSec.w, 'z',
          { x, y: legSec.h / 2, z: 0 }, `${tag} trestle`,
        ));
      });
      joints.push(buttJoint(legStock, 2 * 2 * 2,
        'each trestle: both splayed legs into the top cleat and the foot, 2 each — makes a rigid frame'));

      // ---- central THROUGH-STRETCHER tying the two trestles -----------------
      // One stretcher down the middle at mid-height ties the trestles so they
      // can't sway toward/away from each other. Lands on both top cleats' under
      // sides via short blocks? — simplest: run it just under the cleats, centred
      // in depth, touching both cleats and both inner legs.
      // Tuck the stretcher directly up against the underside of the cleats so it
      // ties them with no gap. A beam run along x sits on its SMALLER section
      // dimension (w=45) vertically, so use that for the offset.
      const cleatBottomY = cleatY - legSec.h / 2;
      const tieVert = SEC(tieStock).w; // 45 — the on-x vertical height
      const stY = cleatBottomY - tieVert / 2 + 4;
      parts.push(beam(
        'STRETCH', 'Central stretcher', tieStock,
        p.len - 2 * overhang, 'x', { x: 0, y: stY, z: 0 }, 'Stretcher',
      ));
      joints.push(buttJoint(tieStock, 2 * 2,
        'central stretcher into both trestle cleats/legs, 2 per end — stops the trestles swaying'));

      // ---- the PLANK (one thick ply slab, lies flat on the cleats) ----------
      parts.push(panel(
        'PLANK', 'Plank seat (slab)', plankStock,
        p.len, p.depth, 'xz',
        { x: 0, y: seatTop - plankTh / 2, z: 0 },
        'Seat',
      ));
      joints.push(panelEdgeJoint(plankStock, p.depth * 2, 160,
        'plank screwed down into both top cleats — a short column of screws over each trestle'));

      const clearSpan = p.len - 2 * overhang;
      const review = reviewBuild({ parts, seatH: p.seatH, seatSpan: clearSpan, seatStock: plankStock });

      const steps = [
        '1. Cut one thick ply plank (the slab), 4 splayed trestle legs, 2 top cleats and 2 feet.',
        '2. Build each trestle: screw both splayed legs to a top cleat and a foot — a rigid little frame.',
        '3. Stand the two trestles the right distance apart (length minus the overhangs).',
        '4. Fit the central stretcher between the trestles to stop them swaying toward each other.',
        '5. Lay the plank on, centre the overhang each end, and screw it down into both top cleats.',
        '6. Ease and sand the plank edges (this is the piece people will run a hand along), then rock-test.',
        '7. Anchor or weight before wind (see notes).',
      ];

      const notes = [
        'Let the plank be the thing: the whole design is one thick slab on the simplest honest legs, ' +
          'in the Shaker / Nakashima spirit. We swap the live-edge walnut slab for thick ply (live edge ' +
          'isn\'t a playa material), but the idiom — minimal, the seat doing the talking — holds.',
        `Splayed trestles (${p.splay}°) widen the foot beyond the plank for stability and read as ` +
          'deliberate; each trestle is a closed frame (legs + cleat + foot) so it can\'t rack, and the ' +
          'central stretcher ties the two so they can\'t sway. That is the entire structure.',
        `Plank span ${clearSpan}mm on ${plankStock} (21mm ply) — thick ply over a short span barely ` +
          'deflects; past ~1700mm you would double the plank or add a centre trestle, which is why ' +
          'the length is capped.',
        'WIND / ANCHORING: a flat plank is a wing in a gust. Strap or stake it down through the central ' +
          'stretcher, or set a sandbag on each foot inside the trestle; never leave it free-standing ' +
          'in open desert overnight.',
        ...review,
      ];

      return { parts, joints, steps, notes };
    },
  },
];

export default CLASSICS;
