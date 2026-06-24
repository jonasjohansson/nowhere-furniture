// ============================================================================
// designs/cnc_slot.js — CNC SLOT-TOGETHER furniture (screwless, press-fit).
// ----------------------------------------------------------------------------
// Parts are CUT FROM ONE SHEET on a CNC router and assemble with no hardware:
// cross-lap slots (each mating part half-notched so the two mesh flush) and tab
// tenons that drop through mating slots. Fit is keyed to the measured ply
// thickness via slotWidth(thk, fit) so a fit change (snug/standard/outdoor)
// propagates to every slot at once.
//
// Built from the shared engineering.js vocabulary (profilePanel + outline
// generators + crossLapSlot/slotJoint). No hand-rolled boxes. Metric, mm; y up,
// ground at y=0; centred on x=z=0. build() is PURE (deterministic, no
// Date.now/Math.random).
//
// First design: the SLOT-IN STOOL — an X of two identical vertical fins that
// cross-lap at the centre, carrying a flat top panel that slots onto their tab
// tenons. Two fins + one top = three CNC parts, screwless.
//
// ----------------------------------------------------------------------------
// SLOT CONVENTION (read this once — Tasks 6/7/8 and the builder all share it).
// A slot is an object { x, y, w, depth, angle }, produced by crossLapSlot():
//   • It is a NOTCH cut into a part's profile, expressed in THAT PART'S LOCAL
//     2-D plane coordinates (the same x,y the profile's pts use, before the
//     part is placed in the world). It lives in the part's `slots` array.
//   • (x, y)  = the CENTRE of the notch, in local profile coords (mm).
//   • w       = the notch WIDTH across the cut, = slotWidth(mateThk, fit), so
//               it receives a mating sheet edge of `mateThk` at the chosen fit.
//   • depth   = how far the notch cuts INTO the part from the mating edge (mm).
//               A THROUGH cut sets depth = the part's full dimension in the cut
//               direction; a HALF-LAP sets depth = half of that overlap.
//   • angle   = the notch's rotation in degrees within the local plane (0° = the
//               notch runs along local-y / cuts in from a horizontal edge; 90° =
//               rotated a quarter turn). Used to orient perpendicular mortises.
// Two parts cross-lap by each carrying a complementary HALF-depth notch on their
// shared line (one cutting in from one edge, the other from the opposite edge)
// so together they mesh flush. A locating tenon enters a mating THROUGH slot.
// ============================================================================

import {
  ERGO,
  profilePanel, trapezoid, rect,
  crossLapSlot, slotJoint,
  SHEETS,
} from '../engineering.js?v=22';
import { slotWidth } from '../stock.js?v=22';

const PLY = (key) => SHEETS[key].thickness;   // sheet thickness in mm

export const CNC_SLOT = [

  // --------------------------------------------------------------------------
  // SLOT-IN STOOL — Nowhere CNC Crew, 2026.
  // Two identical trapezoidal fins crossed in an X and half-lapped at the centre
  // line, topped by a rectangular seat that drops onto the fins' tab tenons.
  // One sheet, three nested parts, no screws.
  // --------------------------------------------------------------------------
  {
    id: 'cnc-slot-stool',
    name: 'Slot-in Stool',
    designer: 'Nowhere CNC Crew',
    year: 2026,
    blurb: 'A screwless CNC stool: two identical trapezoidal fins cross in an X ' +
      'and half-lap at the centre, a flat seat drops onto their tab tenons. ' +
      'Three nested parts from one ply sheet — press-fit, flat-pack, no hardware.',
    difficulty: 'Easy',
    buildTime: '30–45 min',
    params: [
      { key: 'seatH',   label: 'Seat height',                 min: 360, max: 520, step: 5,  default: ERGO.stool.seatH, unit: 'mm' },
      { key: 'topW',    label: 'Seat width',                  min: 280, max: 480, step: 10, default: 360, unit: 'mm' },
      { key: 'depth',   label: 'Seat depth',                  min: 240, max: 440, step: 10, default: 320, unit: 'mm' },
      { key: 'footW',   label: 'Foot spread (fin base)',      min: 200, max: 460, step: 10, default: 300, unit: 'mm' },
      { key: 'fit',     label: 'Fit class (0 snug,1 std,2 outdoor)', min: 0, max: 2, step: 1, default: 1, unit: '' },
    ],

    build(p) {
      const FIT = ['snug', 'standard', 'outdoor'][p.fit] ?? 'standard';
      const stock = 'ply18';
      const thk = PLY(stock);                       // 18mm — the mating thickness

      const seatTop = p.seatH;
      const topY = seatTop - thk / 2;               // seat centre (panel thickness up)

      // --- Fin geometry ---------------------------------------------------
      // Each fin is a vertical trapezoid: wide foot (footW) tapering to a top
      // edge that supports the seat. It rises to just under the seat underside,
      // with a short tab tenon on top that drops through a mating slot in the
      // seat. Fins are identical; one faces +x, one faces +z (an X in plan).
      const tabLen = 24;                            // tab tenon height above the fin body
      const finBodyH = seatTop - thk;               // fin body top sits at the seat underside
      const footW = p.footW;
      // Top edge narrower than the foot, but clamped so the trapezoid can never
      // invert (top wider than base) at extreme params.
      let finTopW = Math.min(p.topW, p.depth) * 0.55;
      finTopW = Math.min(finTopW, footW * 0.9);

      // The fin top carries a NARROW LOCATING TENON whose width matches the seat
      // mortise (= slotWidth(thk, fit)) so the tenon actually fits the slot it
      // drops into. It is a locating feature only — the structural joint is the
      // fin↔fin centre cross-lap below — so a thin tenon is correct here.
      const tenonW = slotWidth(thk, FIT);           // tenon width == seat mortise width

      // trapezoid() is centred on x=0, anchored at y=0 (foot on the ground).
      // We add a centred tenon on top by inserting two points above the top edge,
      // built manually around trapezoid()'s 4 corners so the profile bbox still
      // matches the part size the factory derives.
      const finOutline = () => {
        const hb = footW / 2, ht = finTopW / 2;
        const tw = tenonW / 2;                       // centred narrow tenon
        return {
          pts: [
            { x: -hb, y: 0 }, { x: hb, y: 0 },       // foot
            { x: ht, y: finBodyH },                  // up to top edge (right)
            { x: tw, y: finBodyH },                  // step in to the tenon (right)
            { x: tw, y: finBodyH + tabLen },         // tenon right
            { x: -tw, y: finBodyH + tabLen },        // tenon left
            { x: -tw, y: finBodyH },                 // step out from the tenon (left)
            { x: -ht, y: finBodyH },                 // back to top edge (left)
          ],
          arcs: [],
        };
      };

      // Centre cross-lap: each fin is half-notched at x=0 so the two interlock.
      // crossLapSlot(x, y, mateThk, depth, fit). The slot is a vertical notch on
      // the centreline. Fin A is notched from the TOP (slot reaches down), fin B
      // from the BOTTOM (slot reaches up) — together a full-depth interlock.
      // Notch depth = half the overlap height where the fins cross.
      const lapH = finBodyH;                        // the fins overlap over the body height
      const halfLap = lapH / 2;
      // Slot centred at mid-height of the lap; width = mating fin thickness + fit.
      const slotFromTop = crossLapSlot(0, finBodyH - halfLap / 2, thk, halfLap, FIT);
      const slotFromBottom = crossLapSlot(0, halfLap / 2, thk, halfLap, FIT);

      // --- Seat top -------------------------------------------------------
      // Flat rect panel in plane 'xz'. It carries a PLUS (+) of two perpendicular
      // THROUGH mortises at its centre — one per fin tenon. They cross at the
      // panel centre (topW/2, depth/2); each is a through cut (depth = seat
      // thickness) so the locating tenons pass fully through. Angles 0° and 90°
      // keep them perpendicular (the two arms of the +).
      const topProfile = rect(p.topW, p.depth);     // origin-anchored bottom-left in its own plane
      const topSlots = [
        // fin A (faces +x, body runs in z): tenon runs along z -> mortise rotated 90°
        crossLapSlot(p.topW / 2, p.depth / 2, thk, thk, FIT, 90),
        // fin B (faces +z, body runs in x): tenon runs along x -> mortise at 0°
        crossLapSlot(p.topW / 2, p.depth / 2, thk, thk, FIT, 0),
      ];

      const parts = [];

      // NOTE: both fins share the centre origin (x=z=0) ON PURPOSE — they occupy
      // the same crossing volume and the apparent overlap is RESOLVED by their
      // complementary half-lap notches (fin A notched from the top, fin B from
      // the bottom). Do NOT "fix" this by offsetting the fins; the cross-lap is
      // the joint.
      //
      // Fin A: plane 'zy' (flat faces ±x, body runs along z), notched from top.
      // profilePanel anchors the profile in its plane; the trapezoid foot is at
      // local y=0, so each fin already stands on the ground (foot at y=0).
      const finA = profilePanel('FIN-A', 'Fin', stock,
        { plane: 'zy', ...finOutline(), slots: [slotFromTop] },
        { x: 0, y: 0, z: 0 }, 'Fins');

      // Fin B: plane 'xy' (flat faces ±z, body runs along x), notched from bottom.
      const finB = profilePanel('FIN-B', 'Fin', stock,
        { plane: 'xy', ...finOutline(), slots: [slotFromBottom] },
        { x: 0, y: 0, z: 0 }, 'Fins');

      // Seat top.
      const top = profilePanel('TOP', 'Seat', stock,
        { plane: 'xz', ...topProfile, slots: topSlots },
        { x: 0, y: topY, z: 0 }, 'Seat');

      parts.push(finA, finB, top);

      const joints = [
        slotJoint(1, 'two fins half-lapped at the centre X (one centre cross-lap engagement)'),
        slotJoint(2, 'each fin top locating tenon drops into a mating through-mortise in the seat (2 engagements)'),
      ];

      const finFoot = Math.round(footW);
      const finTop = Math.round(finTopW);
      const steps = [
        `CNC-cut from one ${stock} sheet: 2 identical fins (foot ${finFoot}mm, top edge ${finTop}mm, ${Math.round(finBodyH + tabLen)}mm tall incl. tab) + 1 seat ${p.topW}×${p.depth}mm.`,
        `All slots are cut for a ${FIT} fit (${slotFromTop.w.toFixed(2)}mm wide for ${thk}mm ply). Clear any dogbone reliefs before assembly.`,
        'Stand one fin upright (centre notch UP), drop the second fin (centre notch DOWN) into it so they cross in an X and the notches mesh flush.',
        `Lower the seat onto the fin tops so each fin's ${Math.round(tenonW)}mm locating tenon enters its mating through-mortise (the two cross in a + at the seat centre). Tap home with a mallet over a block.`,
        'Check the stool sits flat and rocks on no leg; ease the seat edges. For outdoor use pick the outdoor fit and oil the ply.',
      ];
      const notes = [
        'Screwless: the centre half-lap is the structural joint; the two narrow top tenons just locate the seat. Fit class sets every slot clearance.',
        'All three parts nest from a single 18mm ply sheet with the two fins identical, so it cuts and stores flat.',
        'Press-fit stools can loosen with humidity swings; a dab of PVA in the slots makes it permanent if you do not need to flat-pack it again.',
      ];

      return { parts, joints, steps, notes };
    },
  },
];

export default CNC_SLOT;
