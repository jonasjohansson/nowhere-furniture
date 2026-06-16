// ============================================================================
// designs/lounge.js — LOW LOUNGE / CHILL PIECES FOR THE NOWHERE BARRIO
// ----------------------------------------------------------------------------
// Three reclined, comfortable, plywood + reglar lounge pieces. Built entirely
// from the SHARED structural vocabulary in engineering.js (ERGO presets, the
// member factories beam/leg/panel/cleat, slatField, and the Torx joinery
// helpers) so they speak the same constructional language as the rest of the
// catalog and inherit its span/screw rules of thumb.
//
// All metric, millimetres. y is up, ground = y 0. Centre at x 0, z 0. Every
// build(p) is PURE (no Date.now / Math.random) and returns
//   { parts, joints, steps:string[], notes:string[] }.
//
// Lineage: Gerrit Rietveld's Krat / Crate furniture (1934), Charlotte
// Perriand's Les Arcs slatted loungers (1968), and the barrio's own communal
// daybed idiom. Low and reclined throughout — these are for sitting back in,
// not eating at.
// ============================================================================
import {
  ERGO, beam, leg, panel, cleat, slatField,
  buttJoint, panelEdgeJoint, faceJoint, beamMaxSpan, bearersFor,
  difficultyOf, SHEETS, TIMBER,
} from '../engineering.js?v=10';

// Small local conveniences (kept pure). Thickness of a sheet key; section of a
// timber key. These only READ the shared tables — they don't redefine shapes.
const PLY = (key) => SHEETS[key].thickness;
const SEC = (key) => TIMBER[key].section;
const DEG = Math.PI / 180;

// ============================================================================
// THE LOUNGE COLLECTION
// ============================================================================
export const LOUNGE = [

  // --------------------------------------------------------------------------
  // 1. RIETVELD CRATE LOUNGE — low slatted lounge chair from "crate" planks
  // --------------------------------------------------------------------------
  // After Rietveld's Krat (Crate) furniture: rough, honest, everything from the
  // same narrow plank stock and face-screwed. Two solid plywood side frames
  // carry a slatted seat PLANE and, behind it, a slatted back PLANE reclined to
  // a genuine lounge angle. Seat sits low (~330) so you drop into it; the back
  // leans to ERGO.lounge's 112° open angle for a relaxed, chest-open recline.
  {
    id: 'rietveld-crate-lounge',
    name: 'Rietveld Crate Lounge',
    designer: 'Gerrit Rietveld',
    year: 1934,
    blurb: 'A low slatted lounge chair in the spirit of Rietveld\'s Crate ' +
      'furniture: two solid plywood side frames carry a slatted seat plane and ' +
      'a reclined slatted back plane, all from the same narrow plank stock and ' +
      'face-screwed. Deliberately unfinished, built to be sunk into.',
    difficulty: 'Moderate',
    buildTime: '~3 h',
    params: [
      { key: 'width',     label: 'Seat width',  min: 600, max: 800, step: 20, default: 700, unit: 'mm' },
      { key: 'seatD',     label: 'Seat depth',  min: 480, max: 600, step: 20, default: 540, unit: 'mm' },
      { key: 'seatH',     label: 'Seat height', min: 300, max: 380, step: 10, default: 330, unit: 'mm' },
      { key: 'backH',     label: 'Back height', min: 440, max: 600, step: 20, default: 520, unit: 'mm' },
      { key: 'backAngle', label: 'Back recline', min: 105, max: 120, step: 1, default: 112, unit: 'deg' },
      { key: 'gap',       label: 'Slat gap',    min: 10, max: 24, step: 2, default: 16, unit: 'mm' },
    ],
    build(p) {
      const sideStock = 'ply18';                  // solid crate side frames
      const slatStock = 'reglar34x45';            // crate-y narrow planks
      const sideT = PLY(sideStock);               // 18
      const slatSec = SEC(slatStock);             // {w:34, h:45}
      const slatW = slatSec.h;                    // 45 wide laid flat
      const slatThick = slatSec.w;                // 34 tall laid flat
      const halfW = p.width / 2;
      const seatTop = p.seatH;

      // recline geometry: backAngle is measured from the seat plane, so the
      // lean back from vertical is (backAngle - 90). 112° -> 22° off vertical.
      const recline = p.backAngle - 90;           // degrees the back leans back
      const rake = recline * DEG;
      const seatY = seatTop - slatThick / 2;      // top of seat slats at seatTop

      const parts = [];
      const joints = [];

      // ---- Two solid ply side frames (face +/-x, the 'zy' plane). Profile is
      // seatD deep x seatH tall; the back slats hang off their rear top edge. ----
      for (const side of [-1, 1]) {
        parts.push(panel(`SIDE-${side < 0 ? 'L' : 'R'}`, 'Crate side frame',
          sideStock, p.seatD, p.seatH, 'zy',
          { x: side * (halfW - sideT / 2), y: p.seatH / 2, z: 0 },
          side < 0 ? 'Left side' : 'Right side'));
      }

      // ---- Seat slats: run across the WIDTH (x), spread along the DEPTH (z). ----
      const seat = slatField(p.seatD, slatW, p.gap);
      seat.positions.forEach((z, i) => {
        parts.push(beam(`SEAT-${i + 1}`, `Seat slat ${i + 1}`, slatStock,
          p.width, 'x', { x: 0, y: seatY, z }, 'Seat'));
      });
      // each seat slat lands on the two side frames: a screw into each end.
      joints.push(panelEdgeJoint(slatStock, p.seatD, p.seatD / seat.count,
        `${seat.count} seat slats face-screwed down into both side frames`));

      // ---- Raked back POSTS / stiles: two timber uprights, one in line with
      // each side frame, leaned to the SAME recline angle as the back slats.
      // They rise from below seat level (overlapping the side frame, so the
      // back is triangulated into the seat box and can't fold) up past the top
      // back slat. EVERY back slat lands on and screws to these two posts — the
      // posts are what the back plane is actually built on, not thin air. ----
      const backZ = -p.seatD / 2 + slatThick / 2;     // rear edge of the frame
      const postFoot = -120;                          // start 120 below seat → laps the side frame
      const postTop = p.backH + slatW / 2;            // reach just past the top slat
      const postLen = postTop - postFoot;             // length up the raked plane
      const postMidS = (postFoot + postTop) / 2;      // plane-distance of post centre
      const postY = seatTop + postMidS * Math.cos(rake);
      const postZ = backZ - postMidS * Math.sin(rake);
      for (const side of [-1, 1]) {
        parts.push({
          ...beam(`POST-${side < 0 ? 'L' : 'R'}`, 'Raked back post', slatStock,
            postLen, 'y',
            { x: side * (halfW - sideT / 2), y: postY, z: postZ }, 'Back'),
          rot: { x: -recline, y: 0, z: 0 },           // same lean as the slats
        });
      }
      joints.push(buttJoint(slatStock, 4,
        'each raked back post lapped onto its side frame, 2 screws (triangulates the back)'));

      // ---- Back slats: spread up the BACK height, leaned to the recline angle,
      // each one landing ACROSS the two raked posts (it screws to a post at each
      // end). The slats form the reclined plane the sitter's spine rests against;
      // the posts behind them carry the load. ----
      const back = slatField(p.backH, slatW, p.gap);
      back.positions.forEach((s, i) => {
        // s = distance up the (un-raked) back plane from seat level. Project it
        // into world y/z so the slats actually tilt back as they climb — staying
        // on the same plane line as the posts, so every slat meets both posts.
        const dy = s * Math.cos(rake);
        const dz = s * Math.sin(rake);
        parts.push({
          ...beam(`BACK-${i + 1}`, `Back slat ${i + 1}`, slatStock,
            p.width, 'x', { x: 0, y: seatTop + dy, z: backZ - dz }, 'Back'),
          rot: { x: -recline, y: 0, z: 0 },           // lean back about x
        });
      });
      joints.push(panelEdgeJoint(slatStock, p.backH, p.backH / back.count,
        `${back.count} back slats face-screwed onto both raked back posts`));

      const seatSpan = p.width;                       // unsupported run of a seat slat
      const steps = [
        'Cut the two ply side frames (seatD x seatH), the two raked back posts, and all seat + back slats to width.',
        'Stand the two side frames parallel, seatD apart, on a flat floor.',
        `Mark the seat line at ${seatTop} mm; screw the seat slats across the top with a ${seat.gap} mm gap.`,
        `Lap a raked back post onto each side frame's rear edge, pre-set to the ${recline}° lean ` +
          'and lapping ~120 mm down past the seat so the back is triangulated into the seat box.',
        'Screw the back slats across the two posts, working bottom to top — every slat lands on both posts, keeping the lean consistent.',
        'Check the chair sits square and rocks on nothing; ease any sharp front-edge slat.',
      ];
      const notes = [
        `Seat height ${seatTop} mm (ERGO.lounge ${ERGO.lounge.seatH} mm) — low and ` +
          'reclined, you drop into it rather than perch on it.',
        `Back reclined to ${p.backAngle}° from the seat (${recline}° off vertical), ` +
          'matching ERGO.lounge — an open chest-back angle for relaxed lounging, not dining.',
        'Two raked back posts, one per side, carry the back: they lap ~120 mm down onto the side ' +
          'frames (triangulating the back into the seat box so it cannot fold) and every back slat ' +
          'screws across both posts — nothing in the back hangs unsupported.',
        `Seat slat unsupported span is the full width ${seatSpan} mm; ` +
          (seatSpan > beamMaxSpan(slatStock)
            ? `that exceeds ~${beamMaxSpan(slatStock)} mm for ${slatStock} — keep the ` +
              'width at the lower end or step up the slat stock.'
            : `within ~${beamMaxSpan(slatStock)} mm advisable for ${slatStock}, no mid bearer needed.`),
        'All butt/face joints, screwed from the outside — Torx sizes come from the joinery helpers.',
      ];

      return { parts, joints, steps, notes };
    },
  },

  // --------------------------------------------------------------------------
  // 2. PERRIAND PLANK LOUNGER — a longer reclined slatted lounger to stretch out
  // --------------------------------------------------------------------------
  // Charlotte Perriand's Les Arcs idiom: a long, low, all-slat lounger you lie
  // back in with your legs out. Two ply A-frame sides carry a long slatted seat
  // (laid with slatField at a comfortable gap) sweeping up into a leaned back.
  // Seat low (~320), back strongly reclined toward the daybed-ish chill angle.
  {
    id: 'perriand-plank-lounger',
    name: 'Perriand Plank Lounger',
    designer: 'Charlotte Perriand',
    year: 1968,
    blurb: 'A long reclined slatted lounger after Perriand\'s Les Arcs benches: ' +
      'two plywood A-frames carry a low slatted seat that sweeps up into a long ' +
      'leaned back. One person, legs out, fully stretched. All reglar slats laid ' +
      'with an even comfortable gap.',
    difficulty: 'Involved',
    buildTime: '~4 h',
    params: [
      { key: 'width',     label: 'Width',        min: 600, max: 760, step: 20, default: 680, unit: 'mm' },
      { key: 'seatH',     label: 'Seat height',  min: 300, max: 360, step: 10, default: 320, unit: 'mm' },
      { key: 'seatD',     label: 'Seat length',  min: 900, max: 1300, step: 50, default: 1100, unit: 'mm' },
      { key: 'backH',     label: 'Back height',  min: 520, max: 720, step: 20, default: 620, unit: 'mm' },
      { key: 'backAngle', label: 'Back recline', min: 112, max: 126, step: 1, default: 118, unit: 'deg' },
      { key: 'gap',       label: 'Slat gap',     min: 12, max: 24, step: 2, default: 18, unit: 'mm' },
    ],
    build(p) {
      const frameStock = 'ply18';                 // A-frame sides
      const slatStock = 'reglar34x45';            // light slats, many of them
      const t = PLY(frameStock);                  // 18
      const slatSec = SEC(slatStock);             // {w:34, h:45}
      const slatW = slatSec.h;                    // 45 wide flat
      const slatThick = slatSec.w;                // 34 tall flat
      const halfW = p.width / 2;
      const seatTop = p.seatH;

      // strong recline for a lie-back lounger: backAngle off the seat plane.
      const recline = p.backAngle - 90;           // degrees off vertical
      const rake = recline * DEG;
      const seatY = seatTop - slatThick / 2;

      const parts = [];
      const joints = [];

      // ---- Two ply A-frame sides (face +/-x). Profile = seat length deep x
      // seat height tall; long enough to carry the whole stretched seat. ----
      for (const side of [-1, 1]) {
        parts.push(panel(`FRAME-${side < 0 ? 'L' : 'R'}`, 'Side A-frame',
          frameStock, p.seatD, p.seatH, 'zy',
          { x: side * (halfW - t / 2), y: p.seatH / 2, z: 0 },
          side < 0 ? 'Left frame' : 'Right frame'));
      }

      // ---- A mid bearer if the seat is long enough to want one (engineering
      // rule of thumb). It runs across the width under the seat slats so a long
      // span doesn't sag under a reclined sitter's weight. ----
      const needBearers = bearersFor(p.seatD, slatStock);   // includes the 2 ends
      const midBearers = Math.max(0, needBearers - 2);
      const bearerStock = 'reglar34x45';
      const bearerH = SEC(bearerStock).h;                   // 45
      const bearerY = seatTop - slatThick - bearerH / 2;    // just under the slats
      if (midBearers > 0) {
        // distribute mid bearers evenly along the depth (z), skipping the ends.
        for (let b = 1; b <= midBearers; b++) {
          const z = -p.seatD / 2 + (p.seatD * b) / (midBearers + 1);
          parts.push(beam(`BEARER-${b}`, `Mid bearer ${b}`, bearerStock,
            p.width - 2 * t, 'x', { x: 0, y: bearerY, z }, 'Bearers'));
        }
        joints.push(buttJoint(bearerStock, 2 * midBearers,
          `${midBearers} mid bearer(s) into both A-frames, 2 screws per end`));
      }

      // ---- Seat slats: run across WIDTH (x), spread along the seat LENGTH (z),
      // laid with slatField at the comfortable gap. ----
      const seat = slatField(p.seatD, slatW, p.gap);
      seat.positions.forEach((z, i) => {
        parts.push(beam(`SEAT-${i + 1}`, `Seat slat ${i + 1}`, slatStock,
          p.width, 'x', { x: 0, y: seatY, z }, 'Seat'));
      });
      joints.push(panelEdgeJoint(slatStock, p.seatD, p.seatD / seat.count,
        `${seat.count} seat slats face-screwed into both frames (and any mid bearer)`));

      // ---- Raked back POSTS / stiles: two timber uprights in line with the
      // A-frame sides, leaned to the same strong recline as the back slats. They
      // lap down onto the A-frames (triangulating the leaned back into the seat
      // frame so it stays rigid under a lie-back load) and every back slat lands
      // on and screws to them. Without these the upper back slats would float. ----
      const backZ = -p.seatD / 2 + slatThick / 2;
      const postFoot = -140;                          // start 140 below seat → laps the A-frame
      const postTop = p.backH + slatW / 2;            // reach just past the top slat
      const postLen = postTop - postFoot;
      const postMidS = (postFoot + postTop) / 2;
      const postY = seatTop + postMidS * Math.cos(rake);
      const postZ = backZ - postMidS * Math.sin(rake);
      for (const side of [-1, 1]) {
        parts.push({
          ...beam(`POST-${side < 0 ? 'L' : 'R'}`, 'Raked back post', slatStock,
            postLen, 'y',
            { x: side * (halfW - t / 2), y: postY, z: postZ }, 'Back'),
          rot: { x: -recline, y: 0, z: 0 },
        });
      }
      joints.push(buttJoint(slatStock, 4,
        'each raked back post lapped onto its A-frame, 2 screws (triangulates the back)'));

      // ---- Back slats sweep up from the head (rear) edge, strongly reclined,
      // each one landing across the two raked posts (a screw to a post at each
      // end). The posts behind the plane carry the load; the slats are the face. ----
      const back = slatField(p.backH, slatW, p.gap);
      back.positions.forEach((s, i) => {
        const dy = s * Math.cos(rake);
        const dz = s * Math.sin(rake);
        parts.push({
          ...beam(`BACK-${i + 1}`, `Back slat ${i + 1}`, slatStock,
            p.width, 'x', { x: 0, y: seatTop + dy, z: backZ - dz }, 'Back'),
          rot: { x: -recline, y: 0, z: 0 },
        });
      });
      joints.push(panelEdgeJoint(slatStock, p.backH, p.backH / back.count,
        `${back.count} back slats face-screwed onto both raked back posts`));

      const steps = [
        'Cut the two ply A-frame sides (seatD x seatH), the two raked back posts, and the full run of slats.',
        midBearers > 0
          ? `Fit ${midBearers} mid bearer(s) across the width to stop the long seat sagging.`
          : 'Seat span is short enough that no mid bearer is needed.',
        'Stand the frames parallel, seatD apart; lay the seat slats with slatField spacing.',
        `Screw the seat slats down across the whole length at a ${seat.gap} mm gap.`,
        `Lap a raked back post onto each A-frame's rear edge at the ${recline}° lean, lapping ` +
          '~140 mm down so the back is triangulated into the seat frame.',
        'Screw the back slats across both posts, bottom to top — every slat lands on both posts.',
        'Lie in it: head should land on the back, knees fall naturally — adjust nothing if so.',
      ];
      const notes = [
        `Seat height ${seatTop} mm — low like ERGO.lounge/daybed (${ERGO.daybed.seatH} mm) so ` +
          'you can stretch your legs out flat in front of you.',
        `Back reclined to ${p.backAngle}° from the seat (${recline}° off vertical) — ` +
          'a deep lie-back angle for a stretched-out lounger, more open than the upright lounge ' +
          `preset's ${ERGO.lounge.backAngle}°.`,
        'Two raked back posts, one per A-frame, are what the back is built on: they lap ~140 mm ' +
          'down onto the A-frames (triangulating the leaned back so it stays rigid under a lie-back ' +
          'load) and every back slat screws across both — no back slat hangs unsupported.',
        `Seat length ${p.seatD} mm wants ${needBearers} bearers total for ${slatStock} ` +
          `(~${beamMaxSpan(slatStock)} mm safe span); ${midBearers} mid bearer(s) added.`,
        'Slats laid with slatField() so the gap stays even regardless of length parameter.',
      ];

      return { parts, joints, steps, notes };
    },
  },

  // --------------------------------------------------------------------------
  // 3. BARRIO DAYBED / PODIUM — low wide communal platform for lounging
  // --------------------------------------------------------------------------
  // Big, simple, communal. A low wide slatted platform (ERGO.daybed) you sprawl
  // or nap on, or use as a low stage step. A reglar grid frame (long rails +
  // cross bearers) sits on two ply gable ends and carries a slatted deck.
  // Fully knock-down: gables + frame unscrew, the deck lifts off as a mat.
  {
    id: 'barrio-daybed-podium',
    name: 'Barrio Daybed / Podium',
    designer: 'Nowhere Build Crew',
    year: 2026,
    blurb: 'A low wide platform for lounging, napping, or use as a stage step: ' +
      'a reglar grid frame on two plywood gable ends carries a slatted deck. ' +
      'Big and communal, dead simple, and fully knock-down for transport.',
    difficulty: 'Moderate',
    buildTime: '~3.5 h',
    params: [
      { key: 'len',    label: 'Length',      min: 1600, max: 2200, step: 50, default: 1900, unit: 'mm' },
      { key: 'width',  label: 'Width',       min: 760, max: 1100, step: 20, default: 900, unit: 'mm' },
      { key: 'deckH',  label: 'Deck height', min: 280, max: 360, step: 10, default: 320, unit: 'mm' },
      { key: 'gap',    label: 'Deck gap',    min: 8, max: 18, step: 2, default: 12, unit: 'mm' },
    ],
    build(p) {
      const gableStock = 'ply18';                 // end gables
      const railStock = 'reglar45x95';            // deep long rails carry the span
      const bearerStock = 'reglar45x70';          // cross bearers under the deck
      const deckStock = 'reglar45x70';            // deck slats laid flat
      const t = PLY(gableStock);                  // 18
      const railSec = SEC(railStock);             // {w:45, h:95}
      const bearerSec = SEC(bearerStock);         // {w:45, h:70}
      const deckSec = SEC(deckStock);             // {w:45, h:70}
      const deckW = deckSec.h;                    // 70 wide flat
      const deckThick = deckSec.w;                // 45 tall flat
      const deckTop = p.deckH;
      const halfL = p.len / 2;
      const railTop = deckTop - deckThick;        // rails stop under the deck
      const railH = railSec.h;                    // 95
      const bearerH = bearerSec.h;                // 70

      const parts = [];
      const joints = [];

      // ---- Two ply gable ends (face +/-x), full width, up to under the deck. ----
      for (const end of [-1, 1]) {
        parts.push(panel(`GABLE-${end < 0 ? 'L' : 'R'}`, 'End gable', gableStock,
          p.width, railTop, 'zy',
          { x: end * (halfL - t / 2), y: railTop / 2, z: 0 },
          end < 0 ? 'Left gable' : 'Right gable'));
      }

      // ---- Two long rails (front + back) between the gables, on edge so their
      // 95 mm depth carries the platform span without sag. ----
      const railZ = p.width / 2 - railSec.w / 2 - 30;
      for (const fb of [-1, 1]) {
        parts.push(beam(`RAIL-${fb < 0 ? 'B' : 'F'}`, 'Long rail', railStock,
          p.len - 2 * t, 'z', { x: 0, y: railTop - railH / 2, z: fb * railZ },
          'Rails'));
      }
      joints.push(faceJoint(t, 4,
        'each long rail captured through a ply gable, 2 screws per end (knock-down)'));

      // ---- Cross bearers spanning width between the two rails, spaced by the
      // engineering rule so the deck slats never sag underfoot. ----
      const nBearers = bearersFor(p.len, bearerStock);   // total incl. virtual ends
      const midBearers = Math.max(1, nBearers - 2);
      const bearerY = railTop - bearerH / 2;             // sit on top run of rails
      for (let b = 1; b <= midBearers; b++) {
        const z = -p.len / 2 + (p.len * b) / (midBearers + 1);
        parts.push(beam(`BEARER-${b}`, `Cross bearer ${b}`, bearerStock,
          p.width - 2 * t, 'x', { x: 0, y: bearerY, z }, 'Bearers'));
      }
      joints.push(buttJoint(bearerStock, 2 * midBearers,
        `${midBearers} cross bearer(s) into both long rails, 2 screws per end`));

      // ---- Deck slats: run along the LENGTH (z), spread across the WIDTH (x),
      // laid with slatField at a tight gap so it reads as a near-solid platform. ----
      const deck = slatField(p.width, deckW, p.gap);
      deck.positions.forEach((x, i) => {
        parts.push(beam(`DECK-${i + 1}`, `Deck slat ${i + 1}`, deckStock,
          p.len - 2 * t, 'z', { x, y: deckTop - deckThick / 2, z: 0 }, 'Deck'));
      });
      joints.push(panelEdgeJoint(deckStock, p.len, p.len / (midBearers + 1),
        `${deck.count} deck slats screwed down into every cross bearer + both rails`));

      const steps = [
        'Cut the two ply gables, two long rails, the cross bearers, and the deck slats.',
        'Stand the gables parallel, len apart; capture a long rail through each gable end.',
        `Drop in ${midBearers} cross bearer(s) on the rails, evenly along the length.`,
        `Lay the deck slats along the length with slatField spacing (${deck.gap} mm gap).`,
        'Screw each deck slat down into every cross bearer and both rails.',
        'For transport: lift the deck off, then unscrew rails from gables — flat-packs to four bundles.',
      ];
      const notes = [
        `Deck height ${deckTop} mm matches ERGO.daybed (${ERGO.daybed.seatH} mm) — low and wide ` +
          'for sprawling, napping, or stepping up onto; no back, it is a platform.',
        `No recline angle: a daybed is a flat lounging surface (ERGO.daybed backAngle ` +
          `${ERGO.daybed.backAngle}° = upright/none). Add cushions or a Crate Lounge alongside for a backrest.`,
        `Long rails on edge (95 mm deep) span ${p.len - 2 * t} mm; ${midBearers} cross bearer(s) ` +
          `keep the deck within ${beamMaxSpan(deckStock)} mm safe span for ${deckStock}.`,
        'Knock-down by design — deck lifts off, rails unscrew from the gables for flat transport.',
      ];

      return { parts, joints, steps, notes };
    },
  },

];

export default LOUNGE;
