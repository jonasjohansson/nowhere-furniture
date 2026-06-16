// ============================================================================
// designs/benches.js — THE WORKHORSE BENCHES for a 10-person Nowhere barrio.
// ----------------------------------------------------------------------------
// Three burner-friendly benches in the catalog's two-material language
// (plywood + reglar softwood, Torx screws, fully metric, all knock-down where
// it counts). These are the pieces that take the most abuse: people stand on
// them, dance on them, sleep on them, and they ship flat in a Burner's car.
// So the brief here is STRUCTURE FIRST — no racking, no sag, no wobble — while
// staying handsome (Mari / Perriand / Prouvé lineage).
//
// All builds are PURE: deterministic from params, no Date.now / Math.random.
// Every assembly is centred at x=0, z=0; y is up with ground at y=0; nothing
// dips below ground. Screw sizes come from the joinery helpers, never guessed.
//
// We build with the engineering.js MEMBER FACTORIES (beam/leg/panel/cleat/
// slatField) and STRUCTURAL helpers (beamMaxSpan/bearersFor/reviewBuild) rather
// than hand-rolling boxes, so these speak the same constructional grammar as
// the rest of the catalog and the BOM/3D layers read them for free.
// ============================================================================
import {
  ERGO, beam, leg, panel, cleat, slatField,
  buttJoint, panelEdgeJoint, faceJoint, beamMaxSpan, bearersFor,
  reviewBuild, difficultyOf, SHEETS, TIMBER,
} from '../engineering.js?v=13';

// ----------------------------------------------------------------------------
// Tiny local conveniences (pure). Keep build() functions readable.
// ----------------------------------------------------------------------------
const TH = (key) => SHEETS[key].thickness;        // sheet thickness (mm)
const SEC = (key) => TIMBER[key].section;          // timber cross-section {w,h}

/** Evenly spaced X positions for `n` bearers across a centred length L. */
function bearerXs(n, L, edgeInset) {
  // First and last bearers sit `edgeInset` in from each end; the rest are
  // distributed evenly between them. n >= 2 always (bearersFor guarantees it).
  const left = -L / 2 + edgeInset;
  const right = L / 2 - edgeInset;
  if (n === 1) return [0];
  const step = (right - left) / (n - 1);
  return Array.from({ length: n }, (_, i) => Math.round(left + i * step));
}

// ============================================================================
// EXPORT
// ============================================================================
export const BENCHES = [

  // ==========================================================================
  // 1. BARRIO COMMUNAL BENCH — the hero piece.
  // --------------------------------------------------------------------------
  // KNOCK-DOWN logic: two plywood END panels are the whole structure. Long
  // reglar RAILS pass BETWEEN the ends (front + back, on-edge) and bolt/screw
  // through the end panels — so it ships as 2 panels + a bundle of sticks +
  // loose slats, then screws together on site. The slatted seat sits on the
  // rails. Long versions get a mid bearer (a third interior panel "rib") sized
  // by bearersFor(), so the rails never span past beamMaxSpan().
  //
  // Why it won't rack: the two big ply ends are shear walls in the X-Y plane;
  // the front+back rails (on-edge, deep) tie them together and resist sag; a
  // low stretcher rail near the floor triangulates against side-to-side lean.
  // Why it won't sag: rail span is checked against beamMaxSpan and broken by
  // interior ribs when the bench gets long.
  // ==========================================================================
  {
    id: 'barrio-communal-bench',
    name: 'Barrio Communal Bench',
    designer: 'Nowhere Build Crew',
    year: 2026,
    blurb: 'The hero knock-down bench: two plywood end panels, deep reglar ' +
      'rails bolted between them, and a slatted reglar seat dropped on top. ' +
      'Ships flat, screws together on the playa, seats 2 to 4. Big ply ends ' +
      'act as shear walls so it never racks; long versions grow a mid rib.',
    difficulty: 'Moderate',
    buildTime: '1.5–2 h',
    params: [
      // Length drives seating: ~520mm of bum per person. 1100 ~2p, 2200 ~4p.
      { key: 'len',     label: 'Length',     min: 1100, max: 2200, step: 50, default: 1600, unit: 'mm' },
      { key: 'seatH',   label: 'Seat height', min: 420, max: 460, step: 5,  default: ERGO.bench.seatH, unit: 'mm' },
      { key: 'depth',   label: 'Seat depth',  min: 360, max: 440, step: 10, default: ERGO.bench.seatD, unit: 'mm' },
      { key: 'slatGap', label: 'Slat gap',    min: 6,   max: 18,  step: 1,  default: 10, unit: 'mm' },
    ],
    build(p) {
      // ---- stock choices -----------------------------------------------------
      const endStock   = 'ply18';        // structural end panels — stiff shear walls
      const railStock  = 'reglar45x95';  // deep on-edge rails carry the seat span
      const lowStock   = 'reglar45x45';  // low stretcher for side-to-side bracing
      const slatStock  = 'reglar45x70';  // seat slats, laid flat (45 thick, 70 wide)
      const cleatStock = 'reglar34x45';  // cleats that bolt rails into the ply ends

      const seatTop = p.seatH;
      const endTh   = TH(endStock);
      const railSec = SEC(railStock);    // {w:45, h:95}
      const slatSec = SEC(slatStock);    // {w:45, h:70} -> laid flat: 45 tall, 70 wide
      const slatThick = slatSec.w;       // 45mm thick when flat

      // Seat slats lie flat; their TOP must reach seatTop. Rails carry them, so
      // the rails' TOP sits one slat-thickness below seatTop.
      const railTopY = seatTop - slatThick;
      const railY    = railTopY - railSec.h / 2;

      // The structural rail span = distance between the inner faces of the two
      // end panels. That is the number we must keep under beamMaxSpan().
      // End panels stand at +/- (len/2 - endTh/2); inner faces len-2*endTh apart.
      const endCentreX = p.len / 2 - endTh / 2;
      const clearSpan  = p.len - 2 * endTh;          // rail unsupported length

      // ---- size the supports: how many ply "ribs" hold the seat? -------------
      // bearersFor() counts total cross-supports incl. the two ends. Anything
      // beyond 2 becomes an interior rib so no rail bay exceeds beamMaxSpan.
      const totalBearers = bearersFor(p.len, railStock); // >= 2
      const interiorRibs = Math.max(0, totalBearers - 2);
      const ribXs = interiorRibs > 0
        ? bearerXs(totalBearers, p.len, endTh / 2).slice(1, -1) // drop the two ends
        : [];

      const parts = [];
      const joints = [];

      // ---- END PANELS (the structure) ---------------------------------------
      // Full-height ply ends, facing X ('zy' plane), footprint = seat depth.
      // They run from the floor up to seatTop, so they're feet + legs + shear
      // wall in one cut. A foot-wide arch could be cut but we keep them solid
      // for max stiffness and a clean Judd-ish silhouette.
      const endH = seatTop;             // panel height = floor to seat top
      const endD = p.depth;             // panel depth = seat depth
      for (const side of [-1, 1]) {
        parts.push(panel(
          `END-${side < 0 ? 'L' : 'R'}`, 'End panel', endStock,
          endD, endH, 'zy',
          { x: side * endCentreX, y: endH / 2, z: 0 },
          side < 0 ? 'Left end' : 'Right end',
        ));
      }

      // ---- INTERIOR RIBS (only on long benches) -----------------------------
      // Same ply, shorter (they hang under the seat, not full-height to floor —
      // but for a knock-down bench a full-height rib doubles as an extra foot,
      // so we make them full-height too: more feet = less tipping, and it keeps
      // the cut list to ONE end-panel size).
      ribXs.forEach((x, i) => {
        parts.push(panel(
          `RIB-${i + 1}`, 'Mid rib (full-height support)', endStock,
          endD, endH, 'zy',
          { x, y: endH / 2, z: 0 },
          'Mid rib',
        ));
      });

      // ---- RAILS between the ends (front + back, on-edge) --------------------
      // These tie the ends together and carry the seat. On-edge (95 deep) for
      // stiffness. They run the FULL length so they screw THROUGH the end
      // panels from outside (knock-down) and through any rib.
      const railZ = endD / 2 - railSec.w / 2 - 6; // tuck just inside the depth
      for (const sign of [-1, 1]) {
        parts.push(beam(
          `RAIL-${sign < 0 ? 'B' : 'F'}`, 'Seat rail (on-edge)', railStock,
          p.len, 'x',
          { x: 0, y: railY, z: sign * railZ },
          'Seat rails',
        ));
      }
      // KNOCK-DOWN joint: each rail bolts/screws into each end through a cleat
      // glued/screwed to the ply inner face. perEnd screws via buttJoint().
      const railCleatLen = railSec.h;  // cleat as tall as the rail is deep
      let cleatN = 0;
      for (const sign of [-1, 1]) {
        for (const side of [-1, 1]) {
          parts.push(cleat(
            `RC-${++cleatN}`, cleatStock, railCleatLen, 'y',
            { x: side * (endCentreX - endTh / 2 - SEC(cleatStock).w / 2),
              y: railY, z: sign * railZ },
            'Rail cleats',
          ));
        }
      }
      // Rails-into-ends: screwed from OUTSIDE the ply ends, into the rail end
      // grain + cleat. This is the connection that lets it ship flat.
      joints.push(buttJoint(railStock, 3,
        'KNOCK-DOWN: each rail end screwed from outside through the ply end ' +
        'panel into the rail + cleat (3 per end). Undo these 4×2 screws to flat-pack.'));
      // Rails-through-ribs (long versions): rail passes the rib, screwed through.
      if (interiorRibs > 0) {
        joints.push(faceJoint(endTh, 2 * 2 * interiorRibs,
          `both rails screwed through each of ${interiorRibs} mid rib(s), 2 per crossing`));
      }

      // ---- LOW STRETCHER (anti-sway brace, near the floor) ------------------
      // A single rail low down between the ends triangulates the tall ends so
      // the bench can't parallelogram side-to-side when shoved. Centred in
      // depth, ~120mm off the floor.
      const lowY = 120 + SEC(lowStock).h / 2;
      parts.push(beam(
        'STRETCH', 'Low stretcher (anti-sway)', lowStock,
        p.len, 'x',
        { x: 0, y: lowY, z: 0 },
        'Brace',
      ));
      joints.push(buttJoint(lowStock, 2,
        'low stretcher into each end / rib, 2 per crossing — kills side-to-side sway'));

      // ---- SLATTED SEAT (laid across the rails) -----------------------------
      // Slats run ALONG the bench length (x), spaced across the depth with
      // slatField so water drains and the field is even edge to edge. Each slat
      // screwed down into every rail (and rib top, if present).
      const field = slatField(p.depth, slatSec.h /*70 wide flat*/, p.slatGap);
      field.positions.forEach((z, i) => {
        parts.push(beam(
          `SLAT-${i + 1}`, 'Seat slat', slatStock,
          p.len - 4, 'x',            // 2mm reveal each end so it drops in clean
          { x: 0, y: seatTop - slatThick / 2, z },
          'Seat slats',
        ));
      });
      // Each slat lands on front rail, back rail, and every rib top = fixings.
      const landings = 2 + interiorRibs;
      joints.push(panelEdgeJoint(slatStock, p.len, 600,
        `each of ${field.count} slats screwed down at ${landings} landings ` +
        '(front rail, back rail' + (interiorRibs ? ', rib tops' : '') + ')'));

      // ---- structural review (advisory) -------------------------------------
      const review = reviewBuild({
        parts, seatH: p.seatH, seatSpan: clearSpan, seatStock: railStock,
      });

      // ---- ordered build sequence -------------------------------------------
      const steps = [
        '1. Cut the two end panels (and any mid rib) from 18mm ply — all the same size.',
        '2. Screw a rail cleat to the inner face of each end (and rib) where the front + back rails land.',
        '3. Stand the two ends on edge; offer up the front + back on-edge rails between them.',
        '4. KNOCK-DOWN JOINT: screw from OUTSIDE each end panel into the rail ends + cleats (3 each). Square it as you go.',
        '5. Fit the low stretcher near the floor between the ends — this brace stops side-to-side sway.',
        interiorRibs > 0
          ? `6. Slide the ${interiorRibs} mid rib(s) onto the rails at the marked positions and screw the rails through them.`
          : '6. (No mid rib needed at this length.)',
        '7. Lay the seat slats across the rails using the slat-gap spacer; screw each slat down at every rail/rib landing.',
        '8. Check it sits flat and rock-tests solid; anchor it (see notes) before the wind comes up.',
      ];

      // ---- structural rationale + playa notes --------------------------------
      const notes = [
        `Rail clear span ${clearSpan}mm vs beamMaxSpan(${railStock}) ${beamMaxSpan(railStock)}mm — ` +
          (clearSpan <= beamMaxSpan(railStock)
            ? `OK with ${totalBearers} supports (2 ends${interiorRibs ? ` + ${interiorRibs} rib` : ''}).`
            : `OVER — bearersFor() added ${interiorRibs} mid rib(s) to bring each bay under the limit.`),
        'The two plywood ends are the structure: as full-height shear walls they ' +
          'stop racking in the long plane; the front+back on-edge rails resist sag ' +
          'and the low stretcher triangulates against side-to-side lean.',
        'KNOCK-DOWN: only the 8 rail-end screws + stretcher screws hold it together, ' +
          'so it strips to 2 panels, a stick bundle, and loose slats for the drive in.',
        'WIND / ANCHORING: a light bench is a sail at Nowhere. Stake or ratchet-strap ' +
          'it to ground anchors (rebar + duckbill) through the low stretcher, or weight ' +
          'the inside of each end with a sandbag. Never leave it un-anchored overnight.',
        ...review,
      ];

      return { parts, joints, steps, notes };
    },
  },

  // ==========================================================================
  // 2. PROUVÉ SETTLE — a backed bench on raked compas-style posts.
  // --------------------------------------------------------------------------
  // A bench WITH a backrest. The back posts rake back (~100–105°, from
  // ERGO.bench.backAngle) in Prouvé "compas" fashion. Ergonomics straight from
  // ERGO.bench (+ back). The structural problem with any backed bench is the
  // back lever: lean on it and it wants to fold rearward. We solve that two
  // ways: (a) the back post is one continuous member from floor to back-top, so
  // the load path is unbroken; (b) a TRIANGULATING brace runs from the back-
  // post base forward to the front of the seat frame, turning the wobble into a
  // rigid triangle. Seat is slatted; two leg frames bridged by deep seat
  // bearers; mid bearer added by bearersFor on long versions.
  // ==========================================================================
  {
    id: 'prouve-settle',
    name: 'Prouvé Settle (Backed Bench)',
    designer: 'after Jean Prouvé',
    year: 2026,
    blurb: 'A backed bench on raked compas posts: continuous back legs leaned ' +
      'to ~102° meet a slatted seat on deep bearers, triangulated by a brace ' +
      'from the back-post foot to the seat front so leaning on the back can\'t ' +
      'fold it. Ergonomics from the bench preset. Seats 2 to 3.',
    difficulty: 'Involved',
    buildTime: '2.5–3 h',
    params: [
      { key: 'len',       label: 'Length',     min: 1100, max: 1900, step: 50, default: 1500, unit: 'mm' },
      { key: 'seatH',     label: 'Seat height', min: 420, max: 460, step: 5, default: ERGO.bench.seatH, unit: 'mm' },
      { key: 'depth',     label: 'Seat depth',  min: 380, max: 440, step: 10, default: ERGO.bench.seatD, unit: 'mm' },
      { key: 'backH',     label: 'Back height', min: 300, max: 420, step: 10, default: ERGO.bench.backH, unit: 'mm' },
      { key: 'backAngle', label: 'Back rake',   min: 100, max: 106, step: 1, default: ERGO.bench.backAngle, unit: '°' },
    ],
    build(p) {
      const legStock    = 'reglar45x70';  // front legs + back posts
      const bearerStock = 'reglar45x95';  // deep seat bearers (carry the span)
      const railStock   = 'reglar34x45';  // long tie rails front + back
      const braceStock  = 'reglar45x45';  // triangulating back braces
      const slatStock   = 'reglar45x70';  // seat + back slats
      const backRailStock = 'reglar45x45';// top + mid back rails the back slats fix to

      const legSec    = SEC(legStock);    // {45,70}
      const bearerSec = SEC(bearerStock); // {45,95}
      const slatSec   = SEC(slatStock);   // {45,70}
      const slatThick = slatSec.w;        // 45 flat

      const seatTop = p.seatH;
      // Seat slats lie flat on the bearers -> bearer top one slat-thick below.
      const bearerTopY = seatTop - slatThick;
      const bearerY    = bearerTopY - bearerSec.h / 2;

      // Footprint: end frames sit at +/-(len/2 - legSec.w/2). Bearers run front
      // to back (z) at each frame; the slatted seat spans the length (x).
      const frameX  = p.len / 2 - legSec.w / 2;
      const frontZ  =  p.depth / 2 - legSec.w / 2;  // front leg line
      const backZ   = -p.depth / 2 + legSec.w / 2;  // back post line (at seat)

      // Back rake: posts lean back by (backAngle-90)° about their seat-level
      // pivot. Positive backAngle>90 => top travels in -z (rearward). We model
      // the lean as a Z rotation? No — the post runs in the Y-Z plane, so the
      // rake is a rotation about the X axis. rot.x tips the top rearward.
      const rake = p.backAngle - 90;                // degrees past vertical
      const rakeRad = (rake * Math.PI) / 180;
      const postLen = (seatTop - 0) + p.backH;      // floor to back top (along post)
      // horizontal rearward travel of the post top vs its base:
      const topDrop = Math.sin(rakeRad) * postLen;  // how far -z the top goes

      // ---- bearers: how many across the length? -----------------------------
      const clearSpan   = p.len - 2 * legSec.w;      // seat span between end bearers
      const totalBearers = bearersFor(p.len, bearerStock);
      const interior     = Math.max(0, totalBearers - 2);
      const bearerXall   = bearerXs(totalBearers, p.len, legSec.w / 2);

      const parts = [];
      const joints = [];

      // ---- per end-frame: front leg + raked back post + seat bearer ---------
      const ends = [
        { x: -frameX, tag: 'L' },
        { x:  frameX, tag: 'R' },
      ];
      ends.forEach(({ x, tag }) => {
        // Front leg: vertical, floor to bearer top.
        const frontLegLen = bearerTopY + bearerSec.h; // up to seat underside line
        parts.push(leg(
          `FL-${tag}`, legStock, seatTop,
          { x, y: seatTop / 2, z: frontZ },
          `${tag} frame`,
        ));
        // Back post: continuous floor -> back top, raked rearward by rot.x.
        // Position its CENTRE so the seat-level point lands on backZ.
        const postCY = postLen / 2; // centre height along the (near-vertical) post
        parts.push({
          ...beam(`BP-${tag}`, 'Back post (compas, continuous)', legStock,
            postLen, 'y',
            { x, y: postCY, z: backZ - topDrop / 2 },
            `${tag} frame`),
          rot: { x: rake, y: 0, z: 0 }, // tip the top rearward
        });
        // Triangulating brace: from the back-post FOOT area forward+up to the
        // front of the seat bearer. This is the part that stops the back lever
        // folding the bench. Runs in the Y-Z plane.
        parts.push({
          ...beam(`BR-${tag}`, 'Back brace (triangulation)', braceStock,
            Math.round(Math.hypot(p.depth - legSec.w, bearerY - (120))), 'z',
            { x, y: (bearerY + 120) / 2, z: 0 },
            `${tag} frame`),
          rot: { x: 35, y: 0, z: 0 }, // diagonal: foot-of-back to front-of-seat
        });
      });
      // Frame joinery: bearer into both legs, back post sister-screwed to bearer.
      joints.push(buttJoint(bearerStock, 4 * 2,
        'each seat bearer screwed into front leg + back post, 2 per end (both frames)'));
      joints.push(faceJoint(legSec.w, 4 * 2,
        'each triangulating brace lag-screwed to back-post foot + bearer front, both ends'));

      // ---- seat bearers (run front-to-back at each frame + interior) --------
      bearerXall.forEach((bx, i) => {
        parts.push(beam(
          `BEAR-${i + 1}`, 'Seat bearer (on-edge)', bearerStock,
          p.depth - legSec.w, 'z',
          { x: bx, y: bearerY, z: 0 },
          'Seat bearers',
        ));
      });
      if (interior > 0) {
        joints.push(buttJoint(bearerStock, 2 * interior,
          `${interior} interior seat bearer(s) added by bearersFor() so no bay sags`));
      }

      // ---- long tie rails (front + back, under seat) tie the frames together -
      // These stop the frames from leaning relative to each other (racking in
      // the long plane) and give the slats continuous backing at the edges.
      for (const sign of [-1, 1]) {
        parts.push(beam(
          `TIE-${sign < 0 ? 'B' : 'F'}`, 'Tie rail', railStock,
          p.len - 2 * legSec.w, 'x',
          { x: 0, y: bearerTopY - SEC(railStock).h / 2,
            z: sign * (p.depth / 2 - legSec.w / 2 - SEC(railStock).w) },
          'Tie rails',
        ));
      }
      joints.push(buttJoint(railStock, 2 * 2 * 2,
        'tie rails into the end frames, 2 per end (front + back rail)'));

      // ---- seat slats (along length, spaced across depth) -------------------
      const seatField = slatField(p.depth - legSec.w, slatSec.h, 10);
      seatField.positions.forEach((z, i) => {
        parts.push(beam(
          `SSLAT-${i + 1}`, 'Seat slat', slatStock,
          p.len - 2 * legSec.w - 4, 'x',
          { x: 0, y: seatTop - slatThick / 2, z },
          'Seat slats',
        ));
      });
      joints.push(panelEdgeJoint(slatStock, p.len, 600,
        `each of ${seatField.count} seat slats screwed down to every bearer`));

      // ---- back: a single RAKED PLANE of horizontal slats on the posts ------
      // The back posts are raked (rot.x = rake), so the back is NOT a vertical
      // plane — it's a leaning plane. Every back member must lie IN that plane:
      // rotated by the SAME rake and offset out to sit flush on the FRONT face
      // of the posts (so the slats actually touch/screw to the posts). If we
      // left them at rot 0 they'd stick straight out at scattered depths — the
      // "staircase" bug. Instead we march UP the post's own length axis and lay
      // each slat flush, evenly spaced, with the top slat flush to the post top.
      //
      // Post geometry, replayed exactly so members land on the real BP posts.
      // BP is a beam on axis 'y' (length postLen), centred at
      //   pos = { y: postLen/2, z: backZ - topDrop/2 }, rot.x = rake.
      // A point at local length-coord `ly` (−postLen/2..+postLen/2 up the post)
      // sits on the post CENTRELINE at:
      const postCZ = backZ - topDrop / 2;                 // post centre z
      const postCentreline = (ly) => ({
        y: ly * Math.cos(rakeRad) + postLen / 2,
        z: ly * Math.sin(rakeRad) + postCZ,
      });
      // Post FRONT-face outward normal (local +z of the post, rotated by rake):
      //   local [0,0,1] -> world ( y:-sin(rake), z:+cos(rake) ).
      const frontNy = -Math.sin(rakeRad);
      const frontNz =  Math.cos(rakeRad);
      // Post cross-section (axis 'y' beam, stock reglar45x70): d-dim (z) = 70.
      const postHalfD = legSec.h / 2;                     // 35 (half post depth)
      // A back member, axis 'x' (stock reglar45x70): d-dim (z) = 70 -> half 35.
      const backHalfD = slatSec.h / 2;                    // 35
      const flushOff  = postHalfD + backHalfD;            // sit flush, no overlap
      // Given a length-coord up the post, return the flush member CENTRE that
      // lies in the raked plane against the post front face at that height.
      const flushCentre = (ly) => {
        const c = postCentreline(ly);
        return { y: c.y + flushOff * frontNy, z: c.z + flushOff * frontNz };
      };
      const railLen   = p.len - 2 * legSec.w;
      const backRake  = { x: rake, y: 0, z: 0 };          // same lean as posts
      // Usable run of the back ALONG the post: from the seat-level pivot up to
      // the post top. ly_seat = where the centreline crosses y=seatTop.
      const lySeat = (seatTop - postLen / 2) / Math.cos(rakeRad);
      const lyTop  = postLen / 2;                          // post top
      const halfRun = slatSec.h / 2;                       // member half-length along the post (h=45)
      // Top + mid rails the slats also screw to, placed up the post by fraction.
      const lyRail = (frac) => lySeat + frac * (lyTop - lySeat);
      [['BRAIL-T', lyTop - halfRun], ['BRAIL-M', lyRail(0.45)]].forEach(([ref, ly]) => {
        const c = flushCentre(ly);
        parts.push({
          ...beam(ref, 'Back rail (in raked plane)', backRailStock,
            railLen, 'x', { x: 0, y: c.y, z: c.z }, 'Back frame'),
          rot: { ...backRake },
        });
      });
      joints.push(buttJoint(backRailStock, 2 * 2,
        'top + mid back rails screwed to both raked back posts, 2 per end (flush in the lean plane)'));
      // Horizontal back slats, evenly spaced UP the post between just above the
      // seat and the top rail, each flush on the posts and raked into the plane.
      const runStart = lySeat + halfRun + 20;              // clear the seat
      const runEnd   = lyTop - halfRun;                    // top slat flush to post top
      const backField = slatField(runEnd - runStart, slatSec.h, 14, runStart + halfRun);
      backField.positions.forEach((ly, i) => {
        const c = flushCentre(ly);
        parts.push({
          ...beam(`BSLAT-${i + 1}`, 'Back slat (in raked plane)', slatStock,
            railLen - 4, 'x', { x: 0, y: c.y, z: c.z }, 'Back slats'),
          rot: { ...backRake },
        });
      });
      joints.push(faceJoint(slatThick, backField.count * 2,
        `each of ${backField.count} back slats screwed flat to the raked back posts ` +
        '(and the top/mid back rails), lying flush in the lean plane'));

      const review = reviewBuild({
        parts, seatH: p.seatH, seatSpan: clearSpan, seatStock: bearerStock,
      });

      const steps = [
        '1. Build the two end frames: front leg + continuous raked back post + deep seat bearer, screwed into a rigid triangle.',
        '2. Fit the triangulating brace from each back-post foot forward to the seat-bearer front — this is what stops the back folding.',
        '3. Drop in any interior seat bearer(s) added for length, evenly spaced.',
        '4. Tie the two frames together with the front + back tie rails under the seat (squares the long plane).',
        '5. Screw the seat slats down across the bearers using a 10mm spacer.',
        '6. Fit the top + mid back rails flush against the front face of the raked posts, then screw the horizontal back slats up the posts in the same lean plane (top slat flush with the post tops) — every slat lands flat on the posts.',
        '7. Sit-test the rake and rock-test the frame; anchor before wind (see notes).',
      ];

      const notes = [
        `Back rake set to ${p.backAngle}° (ERGO.bench backAngle ${ERGO.bench.backAngle}°) — leaned for comfort without tipping.`,
        `Seat span ${clearSpan}mm vs beamMaxSpan(${bearerStock}) ${beamMaxSpan(bearerStock)}mm — ` +
          (clearSpan <= beamMaxSpan(bearerStock)
            ? `OK on ${totalBearers} bearers (${interior} interior).`
            : `OVER — bearersFor() added ${interior} interior bearer(s).`),
        'TRIANGULATION is the whole game on a backed bench: the back post is a ' +
          'lever, so the foot-to-seat-front brace converts a lean into compression ' +
          'in a rigid triangle instead of a rearward fold. Do not omit it.',
        'The continuous back post (one stick floor-to-top) keeps the load path ' +
          'unbroken — no mid-height butt joint to hinge open.',
        'WIND / ANCHORING: with a tall back this bench is an even bigger sail than ' +
          'a backless one. Stake the rear feet to ground anchors or strap to a heavy ' +
          'base; the back catches gusts, so never leave it free-standing in open desert.',
        ...review,
      ];

      return { parts, joints, steps, notes };
    },
  },

  // ==========================================================================
  // 3. PLANK BENCH — fast, beautiful, backless (Rietveld-ish economy).
  // --------------------------------------------------------------------------
  // The overflow-seating workhorse: a single plywood plank top on two box-leg
  // ends, the whole thing made of ONE repeated cut where possible. Rietveld
  // Crate logic — the cheapest honest bench that still looks deliberate.
  // Structure: each end is a little box (two uprights + a foot + a top cleat)
  // so it stands without racking; a stretcher down low ties the two ends and
  // kills sway. No backrest, minimal unique parts, builds in well under an hour.
  // ==========================================================================
  {
    id: 'plank-bench',
    name: 'Plank Bench (Simple)',
    designer: 'after Gerrit Rietveld',
    year: 2026,
    blurb: 'The fast overflow bench: one plywood plank on two box-leg ends, ' +
      'tied by a low stretcher. Almost one repeated cut, builds in under an ' +
      'hour, and still reads as a deliberate Crate-style object. Seats 2 to 3.',
    difficulty: 'Easy',
    buildTime: '40–60 min',
    params: [
      { key: 'len',   label: 'Length',     min: 1000, max: 1800, step: 50, default: 1400, unit: 'mm' },
      { key: 'seatH', label: 'Seat height', min: 420, max: 460, step: 5, default: ERGO.bench.seatH, unit: 'mm' },
      { key: 'depth', label: 'Seat depth',  min: 300, max: 400, step: 10, default: 340, unit: 'mm' },
    ],
    build(p) {
      const topStock     = 'ply21';        // one thick plywood plank = the seat
      const legStock     = 'reglar45x70';  // box-leg uprights + feet + cleats
      const stretchStock = 'reglar45x70';  // low stretcher tie

      const legSec  = SEC(legStock);       // {45,70}
      const topTh   = TH(topStock);
      const seatTop = p.seatH;

      // Box-leg ends sit in from the ends so the plank slightly overhangs (a
      // 60mm reveal each end reads intentional and protects the leg edge).
      const overhang  = 60;
      const endX      = p.len / 2 - overhang - legSec.w / 2;
      const topUnderY = seatTop - topTh;   // plank underside = top of the leg boxes

      const parts = [];
      const joints = [];

      // ---- two box-leg ends -------------------------------------------------
      // Each end = two uprights (front+back) + a foot beam on the floor + a top
      // cleat the plank screws down onto. The box resists racking in its own
      // plane; uprights are the only "leg" cut, repeated 4×.
      const uprightLen = topUnderY;        // floor to plank underside
      const footLen    = p.depth;          // foot spans the full seat depth
      ['L', 'R'].forEach((tag, ei) => {
        const x = (ei === 0 ? -1 : 1) * endX;
        for (const sign of [-1, 1]) {      // front (+z) and back (-z) upright
          const z = sign * (p.depth / 2 - legSec.w / 2);
          parts.push(leg(
            `UP-${tag}${sign < 0 ? 'B' : 'F'}`, legStock, uprightLen,
            { x, y: uprightLen / 2, z },
            `${tag} end`,
          ));
        }
        // Foot beam on the floor, tying the two uprights of this end together.
        parts.push(beam(
          `FOOT-${tag}`, 'Foot', legStock, footLen, 'z',
          { x, y: legSec.h / 2, z: 0 },
          `${tag} end`,
        ));
        // Top cleat just under the plank, tying the uprights at the top and
        // giving the plank a screw landing across the depth.
        parts.push(beam(
          `CLT-${tag}`, 'Top cleat', legStock, footLen, 'z',
          { x, y: topUnderY - legSec.h / 2, z: 0 },
          `${tag} end`,
        ));
      });
      // Box-end joinery: each upright into foot + cleat = the rack-proof box.
      joints.push(buttJoint(legStock, 2 * 2 * 2,
        'each upright screwed into the foot and the top cleat, 2 each — makes each end a rigid box'));

      // ---- low stretcher tying the two ends ---------------------------------
      // Without this the two box-ends could lean toward/away from each other;
      // a single low stretcher along x triangulates the long plane and stiffens
      // the whole bench. It runs at z=0 (centred in depth) where the uprights
      // are NOT — so to physically tie the ends it must reach the FOOT beams,
      // which span the full depth and so are present at z=0. We therefore length
      // the stretcher so each end butts hard into the inner face of a foot beam,
      // and drop it to floor level so it overlaps the feet in height. That makes
      // a real, screwed joint instead of a stick hanging in mid-air.
      const stretchSec = SEC(stretchStock);          // {w:45, h:70}
      // Foot beams run along z at x = +/-endX, section w (x-dim) = stretchSec.w.
      const footInnerX = endX - stretchSec.w / 2;     // inner face of each foot
      // Span the stretcher between the two foot inner faces and bury its ends a
      // touch into each foot so the butt joint has meat to screw into.
      const stretchLen = 2 * footInnerX + stretchSec.w; // ends reach foot centres
      // Sit it on the floor, sharing the feet's height band so it actually
      // touches them (feet occupy y 0..legSec.h). Low + centred = anti-sway tie.
      const stY = stretchSec.h / 2;                   // bottom on the ground
      parts.push(beam(
        'STRETCH', 'Low stretcher', stretchStock, stretchLen,
        'x', { x: 0, y: stY, z: 0 }, 'Brace',
      ));
      joints.push(buttJoint(stretchStock, 2 * 2,
        'low stretcher butted into each box-end foot at z=0 and screwed through ' +
        'the foot, 2 per end — ties the two ends and kills them swaying'));

      // ---- the plank top ----------------------------------------------------
      // One plywood panel, lies flat ('xz'), screwed down into both top cleats.
      parts.push(panel(
        'TOP', 'Plank top', topStock,
        p.len, p.depth, 'xz',
        { x: 0, y: seatTop - topTh / 2, z: 0 },
        'Seat',
      ));
      // Screwed down the long edges into the cleats (a column at each end).
      joints.push(panelEdgeJoint(topStock, p.depth, 150,
        'plank screwed down into both top cleats — a short column of screws at each end'));

      const clearSpan = p.len - 2 * (overhang + legSec.w); // top span between ends
      const review = reviewBuild({
        parts, seatH: p.seatH, seatSpan: clearSpan, seatStock: topStock,
      });

      const steps = [
        '1. Cut 4 identical uprights, 2 feet, 2 top cleats from reglar, and one plywood plank.',
        '2. Build each end into a rigid box: screw both uprights to a foot and a top cleat.',
        '3. Stand the two box-ends the right distance apart (plank length minus the overhangs).',
        '4. Fit the low stretcher between the ends near the floor — this stops them swaying.',
        '5. Drop the plank on, centre the overhang each end, and screw it down into both top cleats.',
        '6. Rock-test, then anchor before wind (see notes).',
      ];

      const notes = [
        'Economy by design: the upright is the only repeated cut (4×), feet and ' +
          'cleats share one length, and the top is a single panel — fast to batch-cut.',
        'Each end is a closed box (uprights + foot + cleat), so it can\'t rack in ' +
          'its own plane; the low stretcher ties the two ends so they can\'t sway ' +
          'toward each other. That is the whole structural story.',
        `Plank span ${clearSpan}mm on ${topStock} (21mm ply) — a thick plank over a ` +
          'short span barely deflects; lengthen past ~1500mm and you\'d want a centre ' +
          'leg, which is why max length is capped.',
        'WIND / ANCHORING: backless and light, this one skitters in gusts. Strap or ' +
          'stake it down through the low stretcher, or load a sandbag onto each foot ' +
          'inside the box — a flying bench is how people get hurt at Nowhere.',
        ...review,
      ];

      return { parts, joints, steps, notes };
    },
  },
];

export default BENCHES;
