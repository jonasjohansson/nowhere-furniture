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
// Designs in this module:
//   • SLOT-IN STOOL — an X of two identical vertical fins that cross-lap at the
//     centre (true 50% half-lap, lapH/2 each), carrying a flat top panel that
//     slots onto their tab tenons. Two fins + one top = three CNC parts.
//   • WEDGE LOUNGE CHAIR — two mirrored side fins (from ergonomic anchors via
//     fin()) with a seat + reclined back that pass THROUGH housings in the fins.
// Two joinery flavours appear: a 50% HALF-LAP (two members each notch to mid-
// depth, e.g. the stool's fin↔fin centre) and a THROUGH-HOUSING (one member
// passes through the other, the housing cut = the mating thickness, e.g. the
// lounge's seat/back↔fin). Both are expressed with crossLapSlot (see depth below).
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
//
// PROFILE PLACEMENT (Task 10 / builder convention — keep all designs consistent):
//   • A part's `pos` is its CENTRE, exactly as for box parts; the builder centres
//     the profile's BOUNDING BOX on `pos`. So designs may author an outline in any
//     convenient local frame (origin-anchored rect() or centred oval() alike) —
//     the bbox-centring makes `size` (= bbox) and `pos` (= centre) self-consistent.
//   • A slot's `angle` is in the PART'S OWN local plane. When two mating parts meet
//     at different orientations (e.g. a fin housing at 90° vs a panel mortise at
//     0°), each angle is correct in its own frame; reconciling them into one world
//     mesh is the builder's job (Task 10), not something a design pre-rotates.
// ============================================================================

import {
  ERGO,
  profilePanel, profileBBox, trapezoid, rect, wedge, fin, oval,
  crossLapSlot, slotJoint, wedgeTenon,
  reviewBuild,
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

      // GROUNDING: the builder centres the profile's BBOX on pos, so a fin whose
      // outline foot is at local y=0 must be placed at pos.y = bbox.h/2 to land the
      // foot on the floor (world y=0) and the top at world y = bbox.h. With foot at
      // local 0 the bbox centre is at h/2, so this makes local-y == world-y: the fin
      // body top (finBodyH) lands at the seat underside and the tenon projects above.
      const finBBoxH = profileBBox(finOutline()).h;     // = finBodyH + tabLen
      const finCentreY = finBBoxH / 2;
      // NOTE: both fins share the centre origin (x=z=0) ON PURPOSE — they occupy
      // the same crossing volume and the apparent overlap is RESOLVED by their
      // complementary half-lap notches (fin A notched from the top, fin B from
      // the bottom). Do NOT "fix" this by offsetting the fins; the cross-lap is
      // the joint.
      //
      // Fin A: plane 'zy' (flat faces ±x, body runs along z), notched from top.
      const finA = profilePanel('FIN-A', 'Fin', stock,
        { plane: 'zy', ...finOutline(), slots: [slotFromTop] },
        { x: 0, y: finCentreY, z: 0 }, 'Fins');

      // Fin B: plane 'xy' (flat faces ±z, body runs along x), notched from bottom.
      const finB = profilePanel('FIN-B', 'Fin', stock,
        { plane: 'xy', ...finOutline(), slots: [slotFromBottom] },
        { x: 0, y: finCentreY, z: 0 }, 'Fins');

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

  // --------------------------------------------------------------------------
  // WEDGE LOUNGE CHAIR — Nowhere CNC Crew, 2026.
  // Two identical side fins (the side silhouette of a low reclined lounger) stand
  // upright facing each other; a flat SEAT panel and a reclined BACK panel span
  // between them, each passing THROUGH housings cut in both fins.
  // Three sheet shapes (2 fins + seat + back = 4 parts), no screws.
  // --------------------------------------------------------------------------
  {
    id: 'cnc-slot-lounge',
    name: 'Wedge Lounge Chair',
    designer: 'Nowhere CNC Crew',
    year: 2026,
    blurb: 'A screwless CNC lounger: two identical side fins carry a low flat ' +
      'seat and a reclined back, each panel passing through housings ' +
      'cut in the fins. Flat-pack, press-fit, cut from one ply sheet.',
    difficulty: 'Medium',
    buildTime: '45–60 min',
    params: [
      { key: 'seatH',     label: 'Seat height',                      min: 280, max: 420, step: 5,  default: ERGO.lounge.seatH,     unit: 'mm' },
      { key: 'seatD',     label: 'Seat depth',                       min: 420, max: 620, step: 10, default: ERGO.lounge.seatD,     unit: 'mm' },
      { key: 'backAngle', label: 'Back recline (deg from seat)',     min: 100, max: 125, step: 1,  default: ERGO.lounge.backAngle, unit: '°'  },
      { key: 'backH',     label: 'Back height',                      min: 420, max: 620, step: 10, default: ERGO.lounge.backH,     unit: 'mm' },
      { key: 'width',     label: 'Seat width (between fins)',        min: 420, max: 640, step: 10, default: 540, unit: 'mm' },
      { key: 'fidelity',  label: 'Edge style (0 faceted,1 curved)',  min: 0, max: 1, step: 1, default: 1, unit: '' },
      { key: 'fit',       label: 'Fit class (0 snug,1 std,2 outdoor)', min: 0, max: 2, step: 1, default: 1, unit: '' },
    ],

    build(p) {
      const FIT = ['snug', 'standard', 'outdoor'][p.fit] ?? 'standard';
      const FIDELITY = ['poly', 'curve'][p.fidelity] ?? 'curve';
      const stock = 'ply18';
      const thk = PLY(stock);                       // 18mm — the mating thickness

      // --- Side-fin anchor model -----------------------------------------
      // Pure side silhouette in LOCAL profile coords: local-x = front→back depth,
      // local-y = up (foot on the ground at y=0). Anchor order follows the fin()
      // convention: front-foot → seat-front → seat-back/pivot → back-top → rear-foot.
      const rad = (p.backAngle * Math.PI) / 180;     // recline measured from the seat
      // Back leans BACKWARD: with backAngle>90, cos is negative, so -cos>0 pushes
      // the back-top rearward (+x) of the pivot. sin gives its rise.
      const backDX = -p.backH * Math.cos(rad);       // horizontal run of the back
      const backDY =  p.backH * Math.sin(rad);       // vertical rise of the back
      const seatFrontX = 0;                          // front of the seat (front foot above it)
      const seatBackX  = p.seatD;                    // pivot where seat meets back
      const backTopX   = seatBackX + backDX;
      const backTopY   = p.seatH + backDY;
      const rearFootX  = backTopX;                   // rear foot sits under the back-top

      const anchors = [
        { x: seatFrontX, y: 0 },           // front foot (ground, under seat front)
        { x: seatFrontX, y: p.seatH },     // seat front (top of the seat lip)
        { x: seatBackX,  y: p.seatH },     // seat back / back pivot
        { x: backTopX,   y: backTopY },    // back top
        { x: rearFootX,  y: 0 },           // rear foot (ground, under the back top)
      ];
      const finOutline = fin(anchors, FIDELITY); // { pts, arcs }

      // --- Through-housing slots in the fins -----------------------------
      // The seat spans z between the fins along the seat segment; the back spans
      // z along the back segment. Each fin carries a THROUGH-HOUSING where the
      // panel passes through it — the notch is cut `thk` deep (the mating panel's
      // thickness) so panel and fin mesh flush. (This is a through-housing, not a
      // 50% half-lap: the panel runs through the fin rather than the two members
      // each notching to mid-depth — cf. the stool's fin↔fin lapH/2 cross-lap.)
      const housingSeat = thk;                       // housing depth = mating thickness (seat)
      const housingBack = thk;                       // housing depth = mating thickness (back)
      // Seat-crossing point: mid-seat, at seat height. Notch runs vertically (0°)
      // down into the fin from the seat top edge.
      const seatMidX = (seatFrontX + seatBackX) / 2;
      const seatSlot = crossLapSlot(seatMidX, p.seatH, thk, housingSeat, FIT, 0);
      // Back-crossing point: mid-back along the reclined segment. Notch rotated to
      // sit square to the back's lean (90° = across the back face).
      const backMidX = (seatBackX + backTopX) / 2;
      const backMidY = (p.seatH + backTopY) / 2;
      const backSlot = crossLapSlot(backMidX, backMidY, thk, housingBack, FIT, 90);
      const finSlots = [seatSlot, backSlot];

      // --- Seat & back panels --------------------------------------------
      // Each is a flat rect spanning `width` in z between the fins. Length along
      // the panel runs in its own plane-x; the fins are at z = ±width/2 so the
      // panel mortises align with the fin housings. The panel carries two mating
      // through-mortises (one per fin) cut at its ends so it seats into the fins.
      const seatLen = seatBackX - seatFrontX;        // seat board length (depth dir)
      const backLen = p.backH;                       // back board length (up the lean)
      const seatProfile = rect(seatLen, p.width);    // origin-anchored in its plane
      const backProfile = rect(backLen, p.width);
      // Mortises near each z-end where the board passes through a fin (housing).
      const mortiseInset = thk;                      // fin sheet thickness from each edge
      const seatPanelSlots = [
        crossLapSlot(seatLen / 2, mortiseInset, thk, thk, FIT, 0),
        crossLapSlot(seatLen / 2, p.width - mortiseInset, thk, thk, FIT, 0),
      ];
      const backPanelSlots = [
        crossLapSlot(backLen / 2, mortiseInset, thk, thk, FIT, 0),
        crossLapSlot(backLen / 2, p.width - mortiseInset, thk, thk, FIT, 0),
      ];

      const halfW = p.width / 2;
      const parts = [];

      // GROUNDING: the builder centres the profile's BBOX on pos. The fin outline's
      // feet are at local y=0, so placing the fin at pos.y = bbox.h/2 lands the feet
      // on the floor (world y=0) and makes local-y == world-y. Then the seat housing
      // (local y=seatH) lands at world seatH and the back housing (local y=backMidY)
      // at world backMidY — exactly where the seat and back panels sit.
      const finCentreY = profileBBox(finOutline).h / 2;
      // Two identical side fins, plane 'xy' so the flat face is vertical and the
      // silhouette (local-x = depth runs along world-x, local-y = height up) is the
      // side profile. They stand facing each other at z = ±width/2. Same outline →
      // identical bbox (the test asserts this).
      const finL = profilePanel('FIN-L', 'Side fin', stock,
        { plane: 'xy', ...finOutline, slots: finSlots },
        { x: 0, y: finCentreY, z: -halfW }, 'Sides');
      const finR = profilePanel('FIN-R', 'Side fin', stock,
        { plane: 'xy', ...finOutline, slots: finSlots },
        { x: 0, y: finCentreY, z:  halfW }, 'Sides');

      // Seat panel: flat-ish board running in depth (world-x) and width (world-z).
      // plane 'xz' lies flat (thickness up); its profile-x is the seat length and
      // profile-y is the width. Placed at the seat height, spanning the seat depth.
      const seat = profilePanel('SEAT', 'Seat', stock,
        { plane: 'xz', ...seatProfile, slots: seatPanelSlots },
        { x: seatMidX, y: p.seatH - thk / 2, z: 0 }, 'Seat');

      // Back panel: an upright board facing the sitter, leaning at backAngle. Built
      // in plane 'xz' too (its local x = length up the back, local y = width). It is
      // placed at the mid-back point; full 3D tilt is a later tuning task, but the
      // joinery (housing into the fins) is correct.
      const back = profilePanel('BACK', 'Back', stock,
        { plane: 'xz', ...backProfile, slots: backPanelSlots },
        { x: backMidX, y: backMidY, z: 0 }, 'Back');

      parts.push(finL, finR, seat, back);

      const joints = [
        slotJoint(2, 'seat board passes through a housing in each side fin (2 engagements)'),
        slotJoint(2, 'back board passes through a housing in each side fin (2 engagements)'),
      ];

      const seatHr = Math.round(p.seatH);
      const recliner = Math.round(p.backAngle);
      const steps = [
        `CNC-cut from one ${stock} sheet: 2 identical side fins (${Math.round(rearFootX)}mm deep, ${Math.round(backTopY)}mm tall) + 1 seat ${Math.round(seatLen)}×${p.width}mm + 1 back ${Math.round(backLen)}×${p.width}mm.`,
        `All slots are cut for a ${FIT} fit (${seatSlot.w.toFixed(2)}mm wide for ${thk}mm ply). Clear any dogbone reliefs before assembly.`,
        'Stand the two side fins upright, slot side up, facing each other the seat width apart.',
        `Drop the seat board into the seat housings (seat top at ${seatHr}mm) so it meshes flush with both fins.`,
        `Lower the back board into the reclined back housings (${recliner}° recline) so it locks the fins together.`,
        'Check the lounger sits flat and rocks on no foot; ease all edges. For outdoor use pick the outdoor fit and oil the ply.',
      ];
      const notes = [
        'Screwless: the four housings lock the seat, back and both fins into one rigid frame. Fit class sets every slot clearance.',
        'All four parts nest from a single 18mm ply sheet with the two fins identical, so it cuts and stores flat.',
        'Press-fit loungers can loosen with humidity swings; a dab of PVA in the slots makes it permanent if you do not need to flat-pack it again.',
      ];

      return { parts, joints, steps, notes };
    },
  },

  // --------------------------------------------------------------------------
  // SLAB TRESTLE BENCH — Nowhere CNC Crew, 2026.
  // Two identical angled slab ENDS stand vertical at each end of the bench; a
  // flat SEAT spans the length and drops THROUGH a housing in each end. Lower
  // down, a STRETCHER ties the two feet: its tabs project through a slot in each
  // end and a flat WEDGE is driven through each projecting tab — a demountable
  // tusk (wedged through-tenon). Two ends + seat + stretcher + 2 wedges = five
  // sheet shapes, no screws, knock-down.
  // --------------------------------------------------------------------------
  {
    id: 'cnc-slot-bench',
    name: 'Slab Trestle Bench',
    designer: 'Nowhere CNC Crew',
    year: 2026,
    blurb: 'A screwless CNC bench: two identical slab ends carry a flat seat ' +
      'through a housing in each end, and a stretcher is locked low down by ' +
      'driven tusk wedges. Knock-down, flat-pack, cut from one ply sheet.',
    difficulty: 'Medium',
    buildTime: '45–60 min',
    params: [
      { key: 'len',    label: 'Bench length',                       min: 900, max: 2000, step: 10, default: 1500, unit: 'mm' },
      { key: 'seatH',  label: 'Seat height',                        min: 380, max: 500,  step: 5,  default: ERGO.bench.seatH, unit: 'mm' },
      { key: 'seatD',  label: 'Seat depth',                         min: 280, max: 440,  step: 10, default: ERGO.bench.seatD, unit: 'mm' },
      { key: 'footW',  label: 'Foot spread (slab base)',            min: 280, max: 480,  step: 10, default: 360, unit: 'mm' },
      { key: 'spine',  label: 'Mid spine fin (0 off,1 on)',         min: 0, max: 1, step: 1, default: 0, unit: '' },
      { key: 'fit',    label: 'Fit class (0 snug,1 std,2 outdoor)', min: 0, max: 2, step: 1, default: 1, unit: '' },
    ],

    build(p) {
      const FIT = ['snug', 'standard', 'outdoor'][p.fit] ?? 'standard';
      const stock = 'ply18';
      const thk = PLY(stock);                       // 18mm — the mating thickness

      const seatTop = p.seatH;
      const seatLen = p.len;
      const seatDepth = p.seatD;

      // --- Slab END geometry ---------------------------------------------
      // Each end is a vertical trapezoidal slab: a wide foot tapering up to a
      // narrower top edge that the seat sits across. Authored in the part's
      // LOCAL plane where local-x = bench depth (world z) and local-y = height.
      // trapezoid() is centred on x=0, anchored at y=0 (foot on the ground), so
      // the slab already stands on the ground. Same outline for both ends →
      // identical bbox (the test asserts this).
      const footW = p.footW;
      const endTopW = Math.min(seatDepth, footW * 0.85);  // top edge ≤ foot, ≤ seat depth
      const endH = seatTop - thk;                          // top edge at the seat underside
      const endOutline = () => trapezoid(footW, endTopW, endH);

      // Through-housing for the seat: the seat passes through the slab top edge.
      // Notch centred on the slab centreline (local x=0), at the top edge, cut
      // `thk` deep (the seat thickness) so seat and slab mesh flush. (Through-
      // housing, like the lounge — not a 50% half-lap.)
      const seatHousing = crossLapSlot(0, endH, thk, thk, FIT, 0);

      // Tusk slot for the stretcher: lower down, on the centreline, a THROUGH
      // slot the stretcher's tab passes through (cut = stretcher thickness).
      const stretcherY = Math.max(thk * 4, endH * 0.28);   // low rail, clear of the ground
      const tuskSlot = crossLapSlot(0, stretcherY, thk, thk, FIT, 90);

      const endSlots = [seatHousing, tuskSlot];

      // --- Seat panel ----------------------------------------------------
      // Flat rect in plane 'xz' (lies flat, thickness up). Local-x = bench
      // length, local-y = seat depth. Spans the full length; carries a mating
      // through-mortise over each end so it seats into the slab housings.
      const seatProfile = rect(seatLen, seatDepth);
      // Ends stand at x = ±len/2; their slabs run in z, so the seat meets each
      // end near its x-ends. Mortise centred in depth, one inset from each end.
      const mortiseInset = thk;
      const seatSlots = [
        crossLapSlot(mortiseInset, seatDepth / 2, thk, thk, FIT, 90),
        crossLapSlot(seatLen - mortiseInset, seatDepth / 2, thk, thk, FIT, 90),
      ];
      // With the mid spine on, the seat also houses onto a central support: add a
      // third mortise at the seat's mid-length so the declared 3rd engagement is
      // backed by a real mating feature (same crossLapSlot pattern as the ends).
      if (p.spine) {
        seatSlots.push(crossLapSlot(seatLen / 2, seatDepth / 2, thk, thk, FIT, 90));
      }

      // --- Stretcher (rail) with projecting tusk tabs --------------------
      // An upright board running the bench length, plane 'xy' (faces ±z). Local-x
      // = length (world x), local-y = height. It is long enough to PROJECT a tab
      // beyond each end slab; each tab carries a slot the flat wedge drives
      // through, drawing the ends tight. Rail height is a fixed structural depth.
      const railH = 90;                              // structural depth of the rail
      const tabLen = 70;                             // tab projecting beyond each slab
      const wedgeW = 26;                             // wedge slot/part width
      // The two end slabs sit at x = ±len/2; the rail body runs between them and
      // a tab pokes through each. Body span = len (slab faces), + tabLen each end.
      const railLen = seatLen + 2 * tabLen;
      const stretcherProfile = rect(railLen, railH);
      // A vertical mortise where the wedge passes through each tab, just OUTSIDE
      // each slab face (tab mid-point). Local-x positions of the slab faces:
      const slabFaceL = tabLen;                      // inner face of the left tab region
      const slabFaceR = railLen - tabLen;
      const wedgeMortL = slabFaceL - tabLen / 2;     // wedge sits mid-tab, outside the slab
      const wedgeMortR = slabFaceR + tabLen / 2;
      const stretcherSlots = [
        crossLapSlot(wedgeMortL, railH / 2, thk, wedgeW, FIT, 90),
        crossLapSlot(wedgeMortR, railH / 2, thk, wedgeW, FIT, 90),
      ];

      // --- Wedges --------------------------------------------------------
      // Two flat tapered wedges (their own profile parts), driven down through
      // the tab mortises to lock the stretcher. A simple wedge() outline: wide
      // base tapering to a narrow tip. Plane 'xy' (a thin flat key).
      const wedgeBaseW = wedgeW;
      const wedgeTipInset = wedgeBaseW * 0.3;        // taper per side
      const wedgeH = railH * 0.9;
      const wedgeOutline = () => wedge(wedgeBaseW, wedgeH, wedgeTipInset);

      const parts = [];

      // GROUNDING: the builder centres the profile's BBOX on pos. The trapezoid
      // foot is at local y=0, so placing each end at pos.y = bbox.h/2 lands the foot
      // on the floor (world y=0) and makes local-y == world-y: the top edge (endH)
      // lands at the seat underside and the seat housing/tusk slot land at their
      // authored world heights (endH and stretcherY).
      const endCentreY = profileBBox(endOutline()).h / 2; // = endH/2
      // Two identical end slabs, plane 'zy' (flat faces ±x, body runs in z & y).
      // At x = ±len/2.
      const endL = profilePanel('END-L', 'Slab end', stock,
        { plane: 'zy', ...endOutline(), slots: endSlots },
        { x: -seatLen / 2, y: endCentreY, z: 0 }, 'Ends');
      const endR = profilePanel('END-R', 'Slab end', stock,
        { plane: 'zy', ...endOutline(), slots: endSlots },
        { x: seatLen / 2, y: endCentreY, z: 0 }, 'Ends');

      // Seat, flat at the seat height (top at seatTop).
      const seat = profilePanel('SEAT', 'Seat', stock,
        { plane: 'xz', ...seatProfile, slots: seatSlots },
        { x: 0, y: seatTop - thk / 2, z: 0 }, 'Seat');

      // Stretcher, upright low rail tying the two ends; centred on x=0.
      const stretcher = profilePanel('STRETCHER', 'Stretcher', stock,
        { plane: 'xy', ...stretcherProfile, slots: stretcherSlots },
        { x: 0, y: stretcherY, z: 0 }, 'Stretcher');

      parts.push(endL, endR, seat, stretcher);

      // Two driven wedges, one per projecting tab, plane 'xy'. Placed outside each
      // slab face, at the rail height.
      const wedgeL = profilePanel('WEDGE-1', 'Wedge', stock,
        { plane: 'xy', ...wedgeOutline(), slots: [] },
        { x: -seatLen / 2 - tabLen / 2, y: stretcherY, z: 0 }, 'Wedges');
      const wedgeR = profilePanel('WEDGE-2', 'Wedge', stock,
        { plane: 'xy', ...wedgeOutline(), slots: [] },
        { x: seatLen / 2 + tabLen / 2, y: stretcherY, z: 0 }, 'Wedges');
      parts.push(wedgeL, wedgeR);

      // Optional central spine fin for long spans: a FLOOR-STANDING central slab
      // (a third trestle leg at mid-span) anchored at y=0, reaching the full end
      // height, that the seat houses onto at the bench mid-point.
      let spine = null;
      if (p.spine) {
        const spineH = endH;
        const spineOutline = () => trapezoid(endTopW, endTopW * 0.7, spineH);
        const spineSeatHousing = crossLapSlot(0, spineH, thk, thk, FIT, 0);
        // Grounded like the ends: foot at local y=0 → pos.y = bbox.h/2 so the foot
        // lands on the floor and the top edge (spineH) reaches the seat underside.
        const spineCentreY = profileBBox(spineOutline()).h / 2;
        spine = profilePanel('SPINE', 'Spine fin', stock,
          { plane: 'zy', ...spineOutline(), slots: [spineSeatHousing] },
          { x: 0, y: spineCentreY, z: 0 }, 'Spine');
        parts.push(spine);
      }

      const joints = [
        slotJoint(2, 'seat board passes through a through-housing in each slab end (2 engagements)'),
        wedgeTenon(thk, tabLen, 2, 'stretcher tabs project through each slab end and are locked by a driven tusk wedge (2 wedges)'),
      ];
      if (p.spine) {
        joints[0] = slotJoint(3, 'seat board passes through a through-housing in each slab end and the mid spine (3 engagements)');
      }

      // --- Span guardrail ------------------------------------------------
      // An 18mm seat unsupported over a long clear span sags. With no spine the
      // clear span is the full length between the ends; the central reviewBuild
      // guardrail decides the limit (span⁴/thickness³ → ~750mm at 18mm).
      const clearSpan = Math.max(0, seatLen - 2 * footW); // rough clear span between feet (clamped)
      const spanWarnings = p.spine ? [] : reviewBuild({ sheetSpan: clearSpan, sheetThicknessMm: thk });

      const steps = [
        `CNC-cut from one ${stock} sheet: 2 identical slab ends (foot ${Math.round(footW)}mm, ${Math.round(endH)}mm tall) + 1 seat ${seatLen}×${seatDepth}mm + 1 stretcher ${Math.round(railLen)}×${railH}mm + 2 wedges${p.spine ? ' + 1 mid spine fin' : ''}.`,
        `All slots are cut for a ${FIT} fit (${seatHousing.w.toFixed(2)}mm wide for ${thk}mm ply). Clear any dogbone reliefs before assembly.`,
        'Stand the two slab ends upright, housing side up, the bench length apart.',
        `Drop the seat into the housing in each end (seat top at ${Math.round(seatTop)}mm) so it meshes flush with both slabs.`,
        'Pass the stretcher through the low slot in each end so a tab projects beyond each slab face.',
        'Drive a wedge down through each projecting tab to draw the ends tight against the seat. Tap home with a mallet; the wedges are demountable for flat-pack.',
        'Check the bench sits flat and rocks on no end; ease all edges. For outdoor use pick the outdoor fit and oil the ply.',
      ];
      const notes = [
        'Knock-down: the seat housings locate the slabs and the two tusk wedges lock the stretcher, squaring the frame. No glue, no screws — drive the wedges out to flat-pack.',
        'All parts nest from a single 18mm ply sheet with the two ends and two wedges identical, so it cuts and stores flat.',
        'Press-fit benches can loosen with humidity swings; the tusk wedges can simply be re-driven to take up any slack.',
      ];
      if (spanWarnings.length) {
        notes.push(
          ...spanWarnings,
          'Turn on the mid spine fin (a central bearer/support under the seat) or add an intermediate trestle for this length.'
        );
      }

      return { parts, joints, steps, notes };
    },
  },

  // --------------------------------------------------------------------------
  // OVAL ROCKER — Nowhere CNC Crew, 2026 (after Andrew Doxtater's "Oval Rocker").
  // The HEADLINE freeform piece: FOUR IDENTICAL oval profiles cut from one sheet.
  // Only the slot positions differ per copy. Two ovals STAND vertically as the
  // two rocker sides (plane 'xy', at z = ±width/2 — each oval's lower arc rides
  // the floor as the rocker curve); two LIE ACROSS them (plane 'zy', spanning the
  // width in z) as the SEAT (upper) and a LOWER BRACE. Matching cross-lap notches
  // interlock all four into a self-bracing rocking cage. No hardware.
  // --------------------------------------------------------------------------
  {
    id: 'cnc-slot-oval-rocker',
    name: 'Oval Rocker',
    designer: 'Nowhere CNC Crew',
    year: 2026,
    blurb: 'A screwless CNC rocker: four IDENTICAL ovals cut from one sheet cross-lap ' +
      'into a self-bracing cage — two stand as the rocking sides (their lower arc is ' +
      'the rocker curve), two lie across as seat and brace. Only the slots differ.',
    difficulty: 'Medium',
    buildTime: '60–90 min',
    params: [
      { key: 'ovalR',  label: 'Oval radius (half-size)',            min: 240, max: 420, step: 5,  default: 320, unit: 'mm' },
      { key: 'width',  label: 'Width (between the side ovals)',     min: 360, max: 620, step: 10, default: 480, unit: 'mm' },
      { key: 'seatH',  label: 'Seat height',                        min: 320, max: 460, step: 5,  default: 380, unit: 'mm' },
      { key: 'fit',    label: 'Fit class (0 snug,1 std,2 outdoor)', min: 0, max: 2, step: 1, default: 1, unit: '' },
    ],

    build(p) {
      const FIT = ['snug', 'standard', 'outdoor'][p.fit] ?? 'standard';
      const stock = 'ply18';
      const thk = PLY(stock);                       // 18mm — the mating thickness

      // --- ONE oval outline, reused for all four parts -------------------
      // A roughly-round oval (aspect ratio kept moderate, ~1.15:1, so oval()'s
      // circular-arc bbox stays accurate). Built ONCE; every copy below reuses
      // the SAME {pts,arcs} data — only the per-copy `slots` array differs.
      const rx = p.ovalR;
      const ry = Math.round(p.ovalR * 0.87);        // moderate aspect ratio (≈1.15:1)
      const outline = oval(rx, ry);                 // centred (0,0); bbox ≈ 2rx × 2ry
      // profilePanel centres the bbox on `pos`, so the oval's own centre lands at
      // pos. The bbox is ~2rx wide × 2ry tall (oval is centred at the origin).

      // --- Crossing geometry --------------------------------------------
      // The two SIDE ovals stand in plane 'xy' (faces ±z): their local-x runs in
      // world-x, local-y in world-y. The two LYING ovals are in plane 'zy' (faces
      // ±x): their local-x runs in world-z (across the width), local-y in world-y.
      // The seat oval crosses the sides high (forward of centre, near the top);
      // the brace oval crosses them low (rearward, near the bottom arc).

      // Local crossing coordinates inside the (centred) oval, in mm offsets from
      // the oval centre. These are structural anchor points; exact tuning happens
      // in the 3D view (Task 10). x>0 = toward the front, y>0 = up.
      const seatLocalX  =  rx * 0.30;               // seat crosses forward-of-centre, high
      const seatLocalY  =  ry * 0.55;
      const braceLocalX = -rx * 0.35;               // brace crosses rearward, low
      const braceLocalY = -ry * 0.40;

      // --- True panel half-lap depths -----------------------------------
      // Two crossing FLAT panels half-lap: each member's notch is cut from its
      // own edge inward to the crossing line, and each takes HALF the overlap so
      // they interlock and mesh flush — exactly the stool's lapH/2 convention
      // (lapH = the full overlap; depth = lapH/2), hundreds of mm, NOT a thk-deep
      // face lap. The overlap at a crossing is the shared in-plane extent of the
      // two ovals along the cut axis: from the crossing line out to the nearer
      // edge (the oval half-height ry minus the crossing's offset from centre).
      const seatOverlap  = ry - Math.abs(seatLocalY);   // shared vertical extent at the seat crossing
      const braceOverlap = ry - Math.abs(braceLocalY);  // ditto at the brace crossing
      const seatDepth  = seatOverlap  / 2;          // each mating part takes half
      const braceDepth = braceOverlap / 2;

      // --- Per-copy SLOT maps (the only thing that differs) --------------
      // CONVENTION (avoid double-counting the crossing offset): each LYING oval's
      // pos.y already bakes its crossing height (pos.y = centreY + localY), so its
      // notches are cut at local-y = 0 (the oval centre). The SIDE ovals share one
      // centre (centreY) and carry both crossings as offsets from it. Result: the
      // two mating notches of each declared half-lap land on the SAME world point.
      //
      // SIDE ovals (plane 'xy'): each carries TWO notches — one where the seat
      // crosses (offset +seatLocalY from centre), one where the brace crosses.
      const sideSlots = [
        crossLapSlot(seatLocalX,  seatLocalY,  thk, seatDepth,  FIT, 0),
        crossLapSlot(braceLocalX, braceLocalY, thk, braceDepth, FIT, 0),
      ];
      // SEAT oval (plane 'zy'): crosses BOTH sides → two notches, one per side, at
      // the side z-positions mapped into the seat's own local-x (across the width).
      // local-y = 0 (pos.y already at the crossing height). 90° to mesh square.
      const halfW = p.width / 2;
      const seatSlots = [
        crossLapSlot(-halfW, 0, thk, seatDepth, FIT, 90),
        crossLapSlot( halfW, 0, thk, seatDepth, FIT, 90),
      ];
      // BRACE oval (plane 'zy'): likewise crosses both sides, lower down.
      const braceSlots = [
        crossLapSlot(-halfW, 0, thk, braceDepth, FIT, 90),
        crossLapSlot( halfW, 0, thk, braceDepth, FIT, 90),
      ];

      // --- Placement -----------------------------------------------------
      // The oval centre sits at the seat height so the seat oval's crossing lands
      // near seatH. Side ovals stand at z = ±width/2. Lying ovals span the width
      // (centred z=0) and meet the sides; the seat sits high, the brace low.
      const centreY = p.seatH - seatLocalY;         // oval centre so the seat crossing ≈ seatH

      const parts = [];

      // Two SIDE ovals — plane 'xy', flat faces ±z, standing at z = ±width/2.
      // The lower arc of each rides the floor as the rocker curve. Same outline →
      // identical bbox; the test asserts byte-identical {pts,arcs}.
      const sideL = profilePanel('SIDE-L', 'Side oval', stock,
        { plane: 'xy', pts: outline.pts, arcs: outline.arcs, slots: sideSlots },
        { x: 0, y: centreY, z: -halfW }, 'Sides');
      const sideR = profilePanel('SIDE-R', 'Side oval', stock,
        { plane: 'xy', pts: outline.pts, arcs: outline.arcs, slots: sideSlots },
        { x: 0, y: centreY, z:  halfW }, 'Sides');

      // SEAT oval — plane 'zy', faces ±x, lying ACROSS the sides high up. Its
      // local-x runs across the width (world-z), local-y up. Same outline.
      const seat = profilePanel('SEAT', 'Seat oval', stock,
        { plane: 'zy', pts: outline.pts, arcs: outline.arcs, slots: seatSlots },
        { x: seatLocalX, y: centreY + seatLocalY, z: 0 }, 'Seat');

      // BRACE oval — plane 'zy', faces ±x, lying across the sides low down to
      // triangulate the cage. Same outline.
      const brace = profilePanel('BRACE', 'Brace oval', stock,
        { plane: 'zy', pts: outline.pts, arcs: outline.arcs, slots: braceSlots },
        { x: braceLocalX, y: centreY + braceLocalY, z: 0 }, 'Brace');

      parts.push(sideL, sideR, seat, brace);

      const joints = [
        slotJoint(2, 'seat oval half-laps into both side ovals (2 cross-lap engagements)'),
        slotJoint(2, 'brace oval half-laps into both side ovals (2 cross-lap engagements)'),
      ];

      const w = Math.round(2 * rx), h = Math.round(2 * ry);
      const steps = [
        `CNC-cut from one ${stock} sheet: FOUR IDENTICAL ovals (${w}×${h}mm bbox). Only the slot map differs between the four — the outline is one nested shape cut four times.`,
        `All slots are cut for a ${FIT} fit (${sideSlots[0].w.toFixed(2)}mm wide for ${thk}mm ply). Clear any dogbone reliefs before assembly.`,
        'Stand the two SIDE ovals on edge, slots facing inward, the width apart — their lower arcs are the rocker curves on the floor.',
        'Drop the SEAT oval across the tops so its two notches half-lap into both side ovals and mesh flush.',
        'Drop the BRACE oval across the sides low down the same way to triangulate the cage; tap each crossing home with a mallet over a block.',
        'Check it rocks smoothly on the two lower arcs and sits square; ease all edges. For outdoor use pick the outdoor fit and oil the ply.',
      ];
      const notes = [
        'Screwless: all four ovals interlock by complementary half-lap notches alone — no hardware. Fit class sets every slot clearance.',
        'The headline trick: ONE oval outline is nested and cut FOUR times; the parts are byte-identical and differ only by which slots are cut, so it cuts and stores flat from a single 18mm sheet.',
        'It ROCKS: the two standing ovals sit on their lower arcs, which act as the rocker rails. Keep the oval roughly round so it rocks evenly and the cut bbox stays true.',
        'Press-fit rockers can loosen with humidity swings; a dab of PVA in the slots makes it permanent if you do not need to flat-pack it again.',
      ];

      return { parts, joints, steps, notes };
    },
  },

  // --------------------------------------------------------------------------
  // SLAB TRESTLE TABLE — Nowhere CNC Crew, 2026.
  // The bench, grown to table height. Two identical slab ENDS stand vertical at
  // each end; a flat TOP spans the length and drops THROUGH a housing in each
  // end. Lower down, a STRETCHER ties the two feet: its tabs project through a
  // slot in each end and a flat WEDGE is driven through each projecting tab — a
  // demountable tusk (wedged through-tenon). Two ends + top + stretcher + 2
  // wedges = five sheet shapes, no screws, knock-down. Rounds out the family so
  // a generator can lay up "table + stools" arrangements.
  // --------------------------------------------------------------------------
  {
    id: 'cnc-slot-table',
    name: 'Slab Trestle Table',
    designer: 'Nowhere CNC Crew',
    year: 2026,
    blurb: 'A screwless CNC table: two identical slab ends carry a flat top ' +
      'through a housing in each end, and a stretcher is locked low down by ' +
      'driven tusk wedges. Knock-down, flat-pack, cut from one ply sheet.',
    difficulty: 'Medium',
    buildTime: '60–90 min',
    params: [
      { key: 'len',   label: 'Table length',                       min: 900, max: 2200, step: 10, default: 1400, unit: 'mm' },
      { key: 'depth', label: 'Table depth',                        min: 600, max: 1000, step: 10, default: 800,  unit: 'mm' },
      { key: 'topH',  label: 'Top height',                         min: 650, max: 760,  step: 5,  default: ERGO.table.topH, unit: 'mm' },
      { key: 'fit',   label: 'Fit class (0 snug,1 std,2 outdoor)', min: 0, max: 2, step: 1, default: 1, unit: '' },
    ],

    build(p) {
      const FIT = ['snug', 'standard', 'outdoor'][p.fit] ?? 'standard';
      const stock = 'ply18';
      const thk = PLY(stock);                       // 18mm — the mating thickness

      const topTop = p.topH;
      const topLen = p.len;
      const topDepth = p.depth;

      // --- Slab END geometry ---------------------------------------------
      // Each end is a vertical trapezoidal slab: a wide foot tapering up to a
      // narrower top edge that the top sits across. Authored in the part's
      // LOCAL plane where local-x = table depth (world z) and local-y = height.
      // trapezoid() is centred on x=0, anchored at y=0 (foot on the ground), so
      // the slab already stands on the ground. Same outline for both ends →
      // identical bbox.
      const footW = Math.min(topDepth * 0.7, 520);         // generous foot for stability
      const endTopW = Math.min(topDepth * 0.85, footW);    // top edge ≤ foot, ≤ table depth
      const endH = topTop - thk;                           // top edge at the top's underside
      const endOutline = () => trapezoid(footW, endTopW, endH);

      // Through-housing for the top: the top passes through the slab top edge.
      // Notch centred on the slab centreline (local x=0), at the top edge, cut
      // `thk` deep (the top thickness) so top and slab mesh flush. (Through-
      // housing, like the bench — not a 50% half-lap.)
      const topHousing = crossLapSlot(0, endH, thk, thk, FIT, 0);

      // Tusk slot for the stretcher: lower down, on the centreline, a THROUGH
      // slot the stretcher's tab passes through (cut = stretcher thickness).
      const stretcherY = Math.max(thk * 4, endH * 0.25);   // low rail, clear of the ground
      const tuskSlot = crossLapSlot(0, stretcherY, thk, thk, FIT, 90);

      const endSlots = [topHousing, tuskSlot];

      // --- Top panel -----------------------------------------------------
      // Flat rect in plane 'xz' (lies flat, thickness up). Local-x = table
      // length, local-y = table depth. Spans the full length; carries a mating
      // through-mortise over each end so it seats into the slab housings.
      const topProfile = rect(topLen, topDepth);
      // Ends stand at x = ±len/2; their slabs run in z, so the top meets each
      // end near its x-ends. Mortise centred in depth, one inset from each end.
      const mortiseInset = thk;
      const topSlots = [
        crossLapSlot(mortiseInset, topDepth / 2, thk, thk, FIT, 90),
        crossLapSlot(topLen - mortiseInset, topDepth / 2, thk, thk, FIT, 90),
      ];

      // --- Stretcher (rail) with projecting tusk tabs --------------------
      // An upright board running the table length, plane 'xy' (faces ±z). Local-x
      // = length (world x), local-y = height. It is long enough to PROJECT a tab
      // beyond each end slab; each tab carries a slot the flat wedge drives
      // through, drawing the ends tight. Rail height is a fixed structural depth.
      const railH = 120;                             // structural depth of the rail
      const tabLen = 80;                             // tab projecting beyond each slab
      const wedgeW = 30;                             // wedge slot/part width
      const railLen = topLen + 2 * tabLen;
      const stretcherProfile = rect(railLen, railH);
      const slabFaceL = tabLen;                      // inner face of the left tab region
      const slabFaceR = railLen - tabLen;
      const wedgeMortL = slabFaceL - tabLen / 2;     // wedge sits mid-tab, outside the slab
      const wedgeMortR = slabFaceR + tabLen / 2;
      const stretcherSlots = [
        crossLapSlot(wedgeMortL, railH / 2, thk, wedgeW, FIT, 90),
        crossLapSlot(wedgeMortR, railH / 2, thk, wedgeW, FIT, 90),
      ];

      // --- Wedges --------------------------------------------------------
      // Two flat tapered wedges (their own profile parts), driven down through
      // the tab mortises to lock the stretcher. A simple wedge() outline: wide
      // base tapering to a narrow tip. Plane 'xy' (a thin flat key).
      const wedgeBaseW = wedgeW;
      const wedgeTipInset = wedgeBaseW * 0.3;        // taper per side
      const wedgeH = railH * 0.9;
      const wedgeOutline = () => wedge(wedgeBaseW, wedgeH, wedgeTipInset);

      const parts = [];

      // GROUNDING: the builder centres the profile's BBOX on pos. The trapezoid
      // foot is at local y=0, so placing each end at pos.y = bbox.h/2 lands the foot
      // on the floor (world y=0) and makes local-y == world-y: the top edge (endH)
      // lands at the top's underside and the top housing/tusk slot land at their
      // authored world heights (endH and stretcherY).
      const endCentreY = profileBBox(endOutline()).h / 2; // = endH/2
      // Two identical end slabs, plane 'zy' (flat faces ±x, body runs in z & y).
      // At x = ±len/2.
      const endL = profilePanel('END-L', 'Slab end', stock,
        { plane: 'zy', ...endOutline(), slots: endSlots },
        { x: -topLen / 2, y: endCentreY, z: 0 }, 'Ends');
      const endR = profilePanel('END-R', 'Slab end', stock,
        { plane: 'zy', ...endOutline(), slots: endSlots },
        { x: topLen / 2, y: endCentreY, z: 0 }, 'Ends');

      // Top, flat at table height (top surface at topTop).
      const top = profilePanel('TOP', 'Top', stock,
        { plane: 'xz', ...topProfile, slots: topSlots },
        { x: 0, y: topTop - thk / 2, z: 0 }, 'Top');

      // Stretcher, upright low rail tying the two ends; centred on x=0.
      const stretcher = profilePanel('STRETCHER', 'Stretcher', stock,
        { plane: 'xy', ...stretcherProfile, slots: stretcherSlots },
        { x: 0, y: stretcherY, z: 0 }, 'Stretcher');

      parts.push(endL, endR, top, stretcher);

      // Two driven wedges, one per projecting tab, plane 'xy'. Placed outside each
      // slab face, at the rail height.
      const wedgeL = profilePanel('WEDGE-1', 'Wedge', stock,
        { plane: 'xy', ...wedgeOutline(), slots: [] },
        { x: -topLen / 2 - tabLen / 2, y: stretcherY, z: 0 }, 'Wedges');
      const wedgeR = profilePanel('WEDGE-2', 'Wedge', stock,
        { plane: 'xy', ...wedgeOutline(), slots: [] },
        { x: topLen / 2 + tabLen / 2, y: stretcherY, z: 0 }, 'Wedges');
      parts.push(wedgeL, wedgeR);

      const joints = [
        slotJoint(2, 'top board passes through a through-housing in each slab end (2 engagements)'),
        wedgeTenon(thk, tabLen, 2, 'stretcher tabs project through each slab end and are locked by a driven tusk wedge (2 wedges)'),
      ];

      // --- Span guardrail ------------------------------------------------
      // An 18mm top unsupported over a long clear span sags. The clear span is the
      // length between the ends; the central reviewBuild guardrail decides the
      // limit (span⁴/thickness³). The trestle ends carry the top near each end.
      const clearSpan = Math.max(0, topLen - 2 * footW);
      const spanWarnings = reviewBuild({ sheetSpan: clearSpan, sheetThicknessMm: thk });

      const steps = [
        `CNC-cut from one ${stock} sheet: 2 identical slab ends (foot ${Math.round(footW)}mm, ${Math.round(endH)}mm tall) + 1 top ${topLen}×${topDepth}mm + 1 stretcher ${Math.round(railLen)}×${railH}mm + 2 wedges.`,
        `All slots are cut for a ${FIT} fit (${topHousing.w.toFixed(2)}mm wide for ${thk}mm ply). Clear any dogbone reliefs before assembly.`,
        'Stand the two slab ends upright, housing side up, the table length apart.',
        `Drop the top into the housing in each end (top surface at ${Math.round(topTop)}mm) so it meshes flush with both slabs.`,
        'Pass the stretcher through the low slot in each end so a tab projects beyond each slab face.',
        'Drive a wedge down through each projecting tab to draw the ends tight against the top. Tap home with a mallet; the wedges are demountable for flat-pack.',
        'Check the table sits flat and rocks on no end; ease all edges. For outdoor use pick the outdoor fit and oil the ply.',
      ];
      const notes = [
        'Knock-down: the top housings locate the slabs and the two tusk wedges lock the stretcher, squaring the frame. No glue, no screws — drive the wedges out to flat-pack.',
        'All parts nest from a single 18mm ply sheet with the two ends and two wedges identical, so it cuts and stores flat.',
        'Press-fit tables can loosen with humidity swings; the tusk wedges can simply be re-driven to take up any slack.',
      ];
      if (spanWarnings.length) {
        notes.push(
          ...spanWarnings,
          'Add an intermediate trestle or a thicker top for this length to keep the unsupported span from sagging.'
        );
      }

      return { parts, joints, steps, notes };
    },
  },
];

export default CNC_SLOT;
