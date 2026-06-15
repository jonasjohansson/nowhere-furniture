// ============================================================================
// catalog.js — PARAMETRIC OUTDOOR FURNITURE FOR THE NOWHERE BARRIO
// ----------------------------------------------------------------------------
// A catalog of simple, robust, knock-down/flat-pack festival furniture built
// from TWO materials only — sheet plywood + reglar softwood beams — fastened
// with Torx wood screws. Aesthetic + structural lineage: Enzo Mari's
// Autoprogettazione (1974) above all, plus Rietveld's Crate furniture, Donald
// Judd's plywood volumes, Jean Prouvé's compas geometry, Aldo van Eyck's
// playground plainness, and Charlotte Perriand's Les Arcs benches.
//
// EVERYTHING IS METRIC, in millimetres. Each design's build(p) returns
// { parts: PartSpec[], joints: Joint[] } per the contract in stock.js.
// All builds are PURE: no Date.now / Math.random, deterministic from params.
// ============================================================================

import { SHEETS, TIMBER } from './stock.js';

// ----------------------------------------------------------------------------
// SHARED GEOMETRY HELPERS
// Keep build() functions honest and readable. Pure, deterministic.
// ----------------------------------------------------------------------------

/** Thickness (mm) of a sheet stock key, e.g. PLY('ply18') -> 18. */
const PLY = (key) => SHEETS[key].thickness;

/** Cross-section {w,h} (mm) of a timber stock key, e.g. SEC('reglar45x70'). */
const SEC = (key) => TIMBER[key].section;

/**
 * One sheet part, sized so size.d == stock thickness automatically.
 * w,h are the panel face dimensions; the panel lies in whatever plane the
 * caller positions it via rot.
 */
function panel(ref, name, stock, w, h, pos, rot = { x: 0, y: 0, z: 0 }, group) {
  return {
    ref, name, material: 'sheet', stock,
    size: { w, h, d: PLY(stock) },
    pos, rot, group,
  };
}

/**
 * One timber stick of a given length. The cross-section is taken from stock,
 * the length goes on the chosen axis. axis: 'x' | 'y' | 'z' tells us which way
 * the stick runs so size + rot stay coherent. We keep size as the as-cut box
 * (length on the run axis, section on the other two) and rot at 0 — the run
 * axis is encoded directly in the size, which is what the BOM/3D layer reads.
 */
function stick(ref, name, stock, length, axis, pos, group) {
  const s = SEC(stock); // { w, h }
  let size;
  if (axis === 'x') size = { w: length, h: s.h, d: s.w };
  else if (axis === 'y') size = { w: s.w, h: length, d: s.h };
  else size = { w: s.w, h: s.h, d: length }; // axis 'z'
  return {
    ref, name, material: 'timber', stock,
    size, pos, rot: { x: 0, y: 0, z: 0 }, group,
  };
}

/**
 * Build a row of evenly-gapped slats running along ONE axis, laid flat on top
 * of a structure at height `topY` (their own centre y = topY - half-thickness
 * is computed by the caller; here we just spread them across `span`).
 *
 * @param prefix   ref prefix, e.g. 'SLAT'
 * @param stock    sheet or timber key
 * @param opts     {
 *   runAxis: 'x'|'z'  direction each slat's length runs,
 *   spreadAxis: 'x'|'z' direction slats are distributed across,
 *   slatLen, slatWidth, gap, span (across spreadAxis), y (centre height),
 *   isSheet (bool), group
 * }
 * @returns PartSpec[]
 */
function slatRow(prefix, stock, opts) {
  const {
    runAxis, spreadAxis, slatLen, slatWidth, gap, span, y, isSheet, group,
  } = opts;
  const pitch = slatWidth + gap;
  const n = Math.max(1, Math.floor((span + gap) / pitch));
  const used = n * slatWidth + (n - 1) * gap;
  const start = -used / 2 + slatWidth / 2;
  const thick = isSheet ? PLY(stock) : SEC(stock).h; // sheet d, or timber height
  const parts = [];
  for (let i = 0; i < n; i++) {
    const c = start + i * pitch;
    const pos = { x: 0, y, z: 0 };
    pos[spreadAxis] = c;
    let part;
    if (isSheet) {
      // sheet slat: face up, length on runAxis, width on spreadAxis
      const w = runAxis === 'x' ? slatLen : slatWidth;
      const h = runAxis === 'x' ? slatWidth : slatLen;
      part = panel(`${prefix}-${i + 1}`, `Slat ${i + 1}`, stock, w, h, pos,
        { x: 0, y: 0, z: 0 }, group);
    } else {
      // timber slat lying flat: length on runAxis, the 'h' of section is its
      // vertical thickness, 'w' of section is its width across the spread.
      const s = SEC(stock);
      const size = runAxis === 'x'
        ? { w: slatLen, h: s.h, d: s.w }
        : { w: s.w, h: s.h, d: slatLen };
      part = {
        ref: `${prefix}-${i + 1}`, name: `Slat ${i + 1}`,
        material: 'timber', stock, size, pos,
        rot: { x: 0, y: 0, z: 0 }, group,
      };
    }
    parts.push(part);
  }
  return { parts, n, thick };
}

// ============================================================================
// THE CATALOG
// ============================================================================

export const CATALOG = [

  // --------------------------------------------------------------------------
  // 1. MARI SEDIA — the Autoprogettazione chair, reglar-and-ply interpretation
  // Construction: a back-leg/back-post frame and a front-leg frame joined by
  // side rails; a plywood seat panel screwed down onto the rails, a ply back
  // panel screwed to the back posts. Honest butt joints, screws from outside.
  // --------------------------------------------------------------------------
  {
    id: 'mari-sedia',
    name: 'Mari Sedia (Chair)',
    designer: 'Enzo Mari',
    year: 1974,
    blurb: 'The Autoprogettazione chair reread in reglar + plywood: two leg ' +
      'frames bridged by side rails, a ply seat dropped on top and a ply back ' +
      'panel screwed to the rear posts. All butt joints, all screwed from outside.',
    params: [
      { key: 'seatH',   label: 'Seat height',  min: 400, max: 480, step: 5, default: 450, unit: 'mm' },
      { key: 'seatD',   label: 'Seat depth',   min: 380, max: 460, step: 10, default: 420, unit: 'mm' },
      { key: 'seatW',   label: 'Seat width',   min: 380, max: 460, step: 10, default: 420, unit: 'mm' },
      { key: 'backH',   label: 'Back height',  min: 280, max: 420, step: 10, default: 360, unit: 'mm' },
    ],
    build(p) {
      const legStock = 'reglar45x45';
      const railStock = 'reglar34x45';
      const seatStock = 'ply18';
      const backStock = 'ply15';
      const sec = SEC(legStock); // 45x45
      const halfW = p.seatW / 2;
      const seatTop = p.seatH;
      const seatT = PLY(seatStock);
      const railTop = seatTop - seatT;         // rails sit just under the seat
      const railH = SEC(railStock).h;          // 45
      const frontZ =  p.seatD / 2 - sec.w / 2;
      const backZ  = -p.seatD / 2 + sec.w / 2;

      const parts = [];
      const joints = [];

      // Front legs (run vertically, full to seat top)
      for (const side of [-1, 1]) {
        parts.push(stick(`FL-${side < 0 ? 'L' : 'R'}`, 'Front leg', legStock,
          seatTop, 'y',
          { x: side * (halfW - sec.w / 2), y: seatTop / 2, z: frontZ },
          'Front frame'));
      }
      // Rear posts (legs that continue up as the back posts)
      const postTop = seatTop + p.backH;
      for (const side of [-1, 1]) {
        parts.push(stick(`RP-${side < 0 ? 'L' : 'R'}`, 'Rear post / back leg',
          legStock, postTop, 'y',
          { x: side * (halfW - sec.w / 2), y: postTop / 2, z: backZ },
          'Back frame'));
      }
      // Side rails (run front-to-back, z), one per side, just under the seat
      for (const side of [-1, 1]) {
        parts.push(stick(`SR-${side < 0 ? 'L' : 'R'}`, 'Side rail', railStock,
          p.seatD - sec.w, 'z',
          { x: side * (halfW - sec.w / 2), y: railTop - railH / 2, z: 0 },
          'Side rails'));
        joints.push({ type: 'torx-butt', screw: 'torx5x60', count: 4,
          note: 'rail into front leg + rear post, 2 each end' });
      }
      // Seat panel
      parts.push(panel('SEAT', 'Seat panel', seatStock, p.seatW, p.seatD,
        { x: 0, y: seatTop - seatT / 2, z: 0 },
        { x: 90, y: 0, z: 0 }, 'Seat'));
      joints.push({ type: 'torx-face', screw: 'torx45x50', count: 6,
        note: 'seat panel down into both side rails' });
      // Back panel between the posts
      parts.push(panel('BACK', 'Back panel', backStock, p.seatW, p.backH,
        { x: 0, y: seatTop + p.backH / 2, z: backZ - sec.w / 2 - PLY(backStock) / 2 },
        { x: 0, y: 0, z: 0 }, 'Back'));
      joints.push({ type: 'torx-face', screw: 'torx45x50', count: 6,
        note: 'back panel into both rear posts' });

      return { parts, joints };
    },
  },

  // --------------------------------------------------------------------------
  // 2. MARI PANCA — the Autoprogettazione bench
  // Two A-shaped leg frames (a vertical leg + a foot beam) bridged by a long
  // stretcher and topped with reglar seat planks. The most literal Mari piece:
  // visible structure, every plank screwed down.
  // --------------------------------------------------------------------------
  {
    id: 'mari-panca',
    name: 'Mari Panca (Bench)',
    designer: 'Enzo Mari',
    year: 1974,
    blurb: 'Autoprogettazione bench: two leg frames (vertical legs on cross ' +
      'feet) bridged by a long stretcher rail, topped with reglar seat planks ' +
      'screwed straight down. Reads as pure structure.',
    params: [
      { key: 'len',     label: 'Length',      min: 1000, max: 2000, step: 50, default: 1500, unit: 'mm' },
      { key: 'seatH',   label: 'Seat height', min: 420, max: 460, step: 5, default: 440, unit: 'mm' },
      { key: 'depth',   label: 'Seat depth',  min: 300, max: 420, step: 10, default: 360, unit: 'mm' },
      { key: 'gap',     label: 'Slat gap',    min: 6, max: 20, step: 2, default: 10, unit: 'mm' },
    ],
    build(p) {
      const legStock = 'reglar45x70';
      const footStock = 'reglar45x70';
      const stretchStock = 'reglar45x95';
      const plankStock = 'reglar45x70'; // planks lying flat (45 thick, 70 wide)
      const legSec = SEC(legStock);     // 45x70
      const plankSec = SEC(plankStock); // 45x70
      const plankThick = plankSec.w;    // lying flat -> 45 tall
      const railH = SEC(stretchStock).h;

      const footH = SEC(footStock).h;            // foot lies with 70 vertical
      const seatTop = p.seatH;
      const legTop = seatTop - plankThick;       // legs stop under the planks
      const footY = footH / 2;                   // foot flat on ground
      const endInset = legSec.w / 2 + 20;
      const endZ = p.len / 2 - endInset;

      const parts = [];
      const joints = [];

      // Two leg-frames at each end
      for (const end of [-1, 1]) {
        const z = end * endZ;
        // cross foot (runs along depth, x)
        parts.push(stick(`FOOT-${end < 0 ? 'A' : 'B'}`, 'Cross foot', footStock,
          p.depth, 'x', { x: 0, y: footY, z }, end < 0 ? 'End A' : 'End B'));
        // two vertical legs sitting on the foot
        for (const side of [-1, 1]) {
          parts.push(stick(`LEG-${end < 0 ? 'A' : 'B'}${side < 0 ? 'L' : 'R'}`,
            'Vertical leg', legStock, legTop - footH, 'y',
            { x: side * (p.depth / 2 - legSec.w / 2),
              y: footH + (legTop - footH) / 2, z },
            end < 0 ? 'End A' : 'End B'));
          joints.push({ type: 'torx-butt', screw: 'torx6x100', count: 2,
            note: 'leg down onto cross foot' });
        }
      }
      // Long stretcher rail down the centre, just under seat level
      parts.push(stick('STR', 'Centre stretcher', stretchStock,
        p.len - 2 * endInset + legSec.w, 'z',
        { x: 0, y: legTop - railH / 2, z: 0 }, 'Stretcher'));
      joints.push({ type: 'torx-butt', screw: 'torx6x100', count: 4,
        note: 'stretcher into both leg frames, 2 each end' });

      // Seat planks across the top (run along length, z), spread across depth
      const row = slatRow('PLANK', plankStock, {
        runAxis: 'z', spreadAxis: 'x',
        slatLen: p.len, slatWidth: plankSec.h, gap: p.gap,
        span: p.depth, y: seatTop - plankThick / 2, isSheet: false, group: 'Seat',
      });
      parts.push(...row.parts);
      joints.push({ type: 'torx-face', screw: 'torx45x50', count: row.n * 4,
        note: `${row.n} planks, 2 screws into each leg frame` });

      return { parts, joints };
    },
  },

  // --------------------------------------------------------------------------
  // 3. RIETVELD CRATE LOUNGE — low slatted lounge from "crate" planks
  // Inspired by Rietveld's Krat (Crate) series: everything from the same wide
  // plank stock, deliberately rough, low and reclined. Plank sides, plank seat
  // and back, all face-screwed. Low seat (~320) for festival lounging.
  // --------------------------------------------------------------------------
  {
    id: 'rietveld-crate-lounge',
    name: 'Rietveld Crate Lounge',
    designer: 'Gerrit Rietveld',
    year: 1934,
    blurb: 'A low slatted lounge in the spirit of Rietveld\'s Crate furniture: ' +
      'solid plywood crate sides, a slatted plank seat and a reclined plank ' +
      'back, all from the same stock and face-screwed. Made to look unfinished.',
    params: [
      { key: 'width',   label: 'Seat width',  min: 600, max: 800, step: 20, default: 680, unit: 'mm' },
      { key: 'seatD',   label: 'Seat depth',  min: 520, max: 680, step: 20, default: 600, unit: 'mm' },
      { key: 'seatH',   label: 'Seat height', min: 280, max: 360, step: 10, default: 320, unit: 'mm' },
      { key: 'backH',   label: 'Back height', min: 360, max: 520, step: 20, default: 440, unit: 'mm' },
    ],
    build(p) {
      const sideStock = 'ply18';
      const slatStock = 'reglar34x45';   // crate-y narrow planks
      const sideT = PLY(sideStock);
      const slatSec = SEC(slatStock);    // 34x45
      const slatThick = slatSec.w;       // 34 tall when laid flat
      const seatTop = p.seatH;
      const halfW = p.width / 2;

      const parts = [];
      const joints = [];

      // Two solid ply side panels (stand vertical, in the x-z? -> in y-z plane)
      // Profile height = seatH + backH at rear; we keep them simple rectangles
      // of seatD x (seatH) plus a back extension implied by the back slats.
      for (const side of [-1, 1]) {
        parts.push(panel(`SIDE-${side < 0 ? 'L' : 'R'}`, 'Crate side panel',
          sideStock, p.seatD, p.seatH,
          { x: side * (halfW - sideT / 2), y: p.seatH / 2, z: 0 },
          { x: 0, y: 90, z: 0 }, side < 0 ? 'Left side' : 'Right side'));
      }
      // Seat slats across the top, running width-wise (x), spread over depth (z)
      const seatRow = slatRow('SEAT', slatStock, {
        runAxis: 'x', spreadAxis: 'z',
        slatLen: p.width, slatWidth: slatSec.h, gap: 12,
        span: p.seatD, y: seatTop - slatThick / 2, isSheet: false, group: 'Seat',
      });
      parts.push(...seatRow.parts);
      joints.push({ type: 'torx-face', screw: 'torx45x50', count: seatRow.n * 2,
        note: `${seatRow.n} seat slats, 1 screw into each side panel` });

      // Reclined back: slats climbing up the rear, leaned back ~15°
      const backRow = slatRow('BACK', slatStock, {
        runAxis: 'x', spreadAxis: 'y',
        slatLen: p.width, slatWidth: slatSec.h, gap: 18,
        span: p.backH, y: seatTop + p.backH / 2, isSheet: false, group: 'Back',
      });
      // shift the back slats to the rear edge and lean them
      const backZ = -p.seatD / 2 + slatThick / 2;
      for (const part of backRow.parts) {
        part.pos.z = backZ;
        part.rot = { x: -15, y: 0, z: 0 };
      }
      parts.push(...backRow.parts);
      joints.push({ type: 'torx-face', screw: 'torx45x50', count: backRow.n * 2,
        note: `${backRow.n} back slats into the side panels` });

      return { parts, joints };
    },
  },

  // --------------------------------------------------------------------------
  // 4. JUDD PLYWOOD BENCH — pure plywood box volume
  // Donald Judd's furniture logic: an unornamented plywood volume. Two end
  // panels, a seat, and a continuous back/spine slab, butt-joined. Nothing but
  // sheet. The form IS the structure.
  // --------------------------------------------------------------------------
  {
    id: 'judd-bench',
    name: 'Judd Plywood Bench',
    designer: 'Donald Judd',
    year: 1984,
    blurb: 'A pure plywood box volume after Judd: two solid end panels carry a ' +
      'seat slab and a back slab, butt-joined and face-screwed. No timber at ' +
      'all — the panels are the structure and the proportion is the point.',
    params: [
      { key: 'len',     label: 'Length',      min: 1000, max: 1800, step: 50, default: 1400, unit: 'mm' },
      { key: 'seatH',   label: 'Seat height', min: 420, max: 460, step: 5, default: 440, unit: 'mm' },
      { key: 'depth',   label: 'Depth',       min: 360, max: 460, step: 10, default: 400, unit: 'mm' },
      { key: 'backH',   label: 'Back height', min: 0, max: 400, step: 20, default: 300, unit: 'mm' },
    ],
    build(p) {
      const stock = 'ply21';            // heavy ply, it is the structure
      const t = PLY(stock);
      const seatTop = p.seatH;
      const halfL = p.len / 2;

      const parts = [];
      const joints = [];

      // Two end panels (vertical, full seat height, in y-z plane)
      for (const end of [-1, 1]) {
        parts.push(panel(`END-${end < 0 ? 'L' : 'R'}`, 'End panel', stock,
          p.depth, p.seatH,
          { x: end * (halfL - t / 2), y: p.seatH / 2, z: 0 },
          { x: 0, y: 90, z: 0 }, end < 0 ? 'Left end' : 'Right end'));
        joints.push({ type: 'torx-butt', screw: 'torx5x80', count: 4,
          note: 'seat slab into end panel' });
      }
      // Seat slab spanning between ends, sitting on top, length runs x
      parts.push(panel('SEAT', 'Seat slab', stock, p.len - 2 * t, p.depth,
        { x: 0, y: seatTop - t / 2, z: 0 },
        { x: 90, y: 0, z: 0 }, 'Seat'));

      // Optional back slab (vertical, behind the seat)
      if (p.backH > 0) {
        parts.push(panel('BACK', 'Back slab', stock, p.len - 2 * t, p.backH,
          { x: 0, y: seatTop + p.backH / 2, z: -p.depth / 2 + t / 2 },
          { x: 0, y: 0, z: 0 }, 'Back'));
        joints.push({ type: 'torx-butt', screw: 'torx5x80', count: 6,
          note: 'back slab into both ends + edge of seat' });
      }
      return { parts, joints };
    },
  },

  // --------------------------------------------------------------------------
  // 5. BARRIO COMMUNAL BENCH — long knock-down 3-seater
  // The workhorse of the barrio: 2 plywood end gables + reglar rails that the
  // gables capture (screwed through), with a reglar slatted seat. Designed to
  // flat-pack: ends and rails come apart, slats stay as a mat. Seats ~3.
  // --------------------------------------------------------------------------
  {
    id: 'barrio-communal-bench',
    name: 'Barrio Communal Bench',
    designer: 'Nowhere Build Crew',
    year: 2026,
    blurb: 'The barrio workhorse: two plywood end gables captured onto reglar ' +
      'rails (screwed through the ply), carrying a reglar slatted seat for ' +
      'three. Fully knock-down — ends and rails unscrew, slats lift off.',
    params: [
      { key: 'len',     label: 'Length',      min: 1600, max: 2400, step: 50, default: 1800, unit: 'mm' },
      { key: 'seatH',   label: 'Seat height', min: 420, max: 460, step: 5, default: 440, unit: 'mm' },
      { key: 'depth',   label: 'Seat depth',  min: 360, max: 460, step: 10, default: 420, unit: 'mm' },
      { key: 'gap',     label: 'Slat gap',    min: 8, max: 20, step: 2, default: 12, unit: 'mm' },
    ],
    build(p) {
      const gableStock = 'ply18';
      const railStock = 'reglar45x70';
      const slatStock = 'reglar45x70';
      const t = PLY(gableStock);
      const railSec = SEC(railStock);   // 45x70
      const slatSec = SEC(slatStock);
      const slatThick = slatSec.w;      // flat -> 45 tall
      const seatTop = p.seatH;
      const halfL = p.len / 2;
      const railH = railSec.h;          // 70
      const railTop = seatTop - slatThick;
      const gableInset = t / 2;

      const parts = [];
      const joints = [];

      // Two ply end gables, full height to under the slats
      for (const end of [-1, 1]) {
        parts.push(panel(`GABLE-${end < 0 ? 'L' : 'R'}`, 'End gable', gableStock,
          p.depth, railTop,
          { x: end * (halfL - gableInset), y: railTop / 2, z: 0 },
          { x: 0, y: 90, z: 0 }, end < 0 ? 'Left gable' : 'Right gable'));
      }
      // Two long rails near front + back edges, captured by the gables
      const railZ = p.depth / 2 - railSec.w / 2 - 20;
      for (const fb of [-1, 1]) {
        parts.push(stick(`RAIL-${fb < 0 ? 'B' : 'F'}`, 'Long rail', railStock,
          p.len - 2 * t, 'z',
          { x: 0, y: railTop - railH / 2, z: fb * railZ }, 'Rails'));
        joints.push({ type: 'torx-face', screw: 'torx5x80', count: 4,
          note: 'rail captured through each gable, 2 per end' });
      }
      // Reglar seat slats run along the length (z), spread across depth (x)
      const row = slatRow('SLAT', slatStock, {
        runAxis: 'z', spreadAxis: 'x',
        slatLen: p.len - 2 * t, slatWidth: slatSec.h, gap: p.gap,
        span: p.depth, y: seatTop - slatThick / 2, isSheet: false, group: 'Seat',
      });
      parts.push(...row.parts);
      joints.push({ type: 'torx-face', screw: 'torx45x50', count: row.n * 4,
        note: `${row.n} slats, screwed down into both rails` });

      return { parts, joints };
    },
  },

  // --------------------------------------------------------------------------
  // 6. PROUVÉ SETTLE — backed bench with leaning compas legs
  // Jean Prouvé's compas (compass) leg: a splayed structural leg that leans the
  // load. Here a backed bench whose rear legs rake back to carry the backrest,
  // ply seat + ply back, reglar legs and rails. Bench height ~440.
  // --------------------------------------------------------------------------
  {
    id: 'prouve-settle',
    name: 'Prouvé Settle',
    designer: 'Jean Prouvé',
    year: 1950,
    blurb: 'A backed bench on Prouvé compas geometry: raked rear legs lean back ' +
      'to carry the backrest while front legs stand plumb, tied by side and ' +
      'long rails. Ply seat and back screwed to a reglar frame.',
    params: [
      { key: 'len',      label: 'Length',       min: 1100, max: 1800, step: 50, default: 1400, unit: 'mm' },
      { key: 'seatH',    label: 'Seat height',  min: 420, max: 460, step: 5, default: 440, unit: 'mm' },
      { key: 'depth',    label: 'Seat depth',   min: 400, max: 480, step: 10, default: 440, unit: 'mm' },
      { key: 'backH',    label: 'Back height',  min: 300, max: 450, step: 10, default: 380, unit: 'mm' },
      { key: 'rake',     label: 'Back rake',    min: 8, max: 24, step: 2, default: 16, unit: 'deg' },
    ],
    build(p) {
      const legStock = 'reglar45x70';
      const railStock = 'reglar34x45';
      const seatStock = 'ply18';
      const backStock = 'ply15';
      const legSec = SEC(legStock);     // 45x70
      const seatT = PLY(seatStock);
      const halfL = p.len / 2;
      const railH = SEC(railStock).h;
      const seatTop = p.seatH;
      const legInset = legSec.h / 2 + 30;
      const frontZ =  p.depth / 2 - legSec.w / 2;
      const backZ  = -p.depth / 2 + legSec.w / 2;

      const parts = [];
      const joints = [];

      for (const end of [-1, 1]) {
        const x = end * (halfL - legInset);
        // front leg, plumb, to seat top
        parts.push(stick(`FL-${end < 0 ? 'L' : 'R'}`, 'Front leg', legStock,
          seatTop - seatT, 'y',
          { x, y: (seatTop - seatT) / 2, z: frontZ },
          end < 0 ? 'Left frame' : 'Right frame'));
        // rear leg/back post, raked back, continues up to carry the back
        const postLen = seatTop + p.backH;
        parts.push({
          ref: `RP-${end < 0 ? 'L' : 'R'}`, name: 'Raked rear post',
          material: 'timber', stock: legStock,
          size: { w: legSec.w, h: postLen, d: legSec.h },
          pos: { x, y: postLen / 2, z: backZ },
          rot: { x: -p.rake, y: 0, z: 0 },
          group: end < 0 ? 'Left frame' : 'Right frame',
        });
        // side rail tying front leg to rear post, under seat
        parts.push(stick(`SR-${end < 0 ? 'L' : 'R'}`, 'Side rail', railStock,
          p.depth - legSec.w, 'z',
          { x, y: seatTop - seatT - railH / 2, z: 0 },
          end < 0 ? 'Left frame' : 'Right frame'));
        joints.push({ type: 'torx-butt', screw: 'torx5x80', count: 4,
          note: 'side rail into front leg + rear post' });
      }
      // Two long rails (front + back) tying the two frames
      for (const fb of [-1, 1]) {
        const z = fb > 0 ? frontZ : backZ;
        parts.push(stick(`LR-${fb < 0 ? 'B' : 'F'}`, 'Long rail', railStock,
          p.len - 2 * legInset, 'x',
          { x: 0, y: seatTop - seatT - railH / 2, z }, 'Long rails'));
        joints.push({ type: 'torx-butt', screw: 'torx5x60', count: 4,
          note: 'long rail into both frames' });
      }
      // Seat panel
      parts.push(panel('SEAT', 'Seat panel', seatStock, p.len - 40, p.depth,
        { x: 0, y: seatTop - seatT / 2, z: 0 },
        { x: 90, y: 0, z: 0 }, 'Seat'));
      joints.push({ type: 'torx-face', screw: 'torx45x50', count: 8,
        note: 'seat into side + long rails' });
      // Back panel, raked to match the posts
      const backCY = seatTop + p.backH / 2;
      const backCZ = backZ - (p.backH / 2) * Math.sin(p.rake * Math.PI / 180);
      parts.push(panel('BACK', 'Back panel', backStock, p.len - 40, p.backH,
        { x: 0, y: backCY, z: backCZ - SEC(legStock).h / 2 - PLY(backStock) / 2 },
        { x: -p.rake, y: 0, z: 0 }, 'Back'));
      joints.push({ type: 'torx-face', screw: 'torx45x50', count: 6,
        note: 'back panel into both raked posts' });

      return { parts, joints };
    },
  },

  // --------------------------------------------------------------------------
  // 7. BERLIN HOCKER STOOL — small square knock-down stool
  // After the Van Bo Le-Mentzel "Hartz IV / Berlin" hocker: a tiny stool you
  // can build from offcuts. Four legs, a square ply top, two rail pairs. Cheap,
  // stackable-ish, the unit of the barrio. Seat ~440.
  // --------------------------------------------------------------------------
  {
    id: 'berlin-hocker',
    name: 'Berlin Hocker (Stool)',
    designer: 'Van Bo Le-Mentzel',
    year: 2010,
    blurb: 'A pocket-money square stool after the Berlin Hocker: four reglar ' +
      'legs, paired rails, and a ply top screwed down. Buildable from offcuts ' +
      'and the basic counting-unit of the barrio.',
    params: [
      { key: 'seatH',   label: 'Seat height', min: 420, max: 460, step: 5, default: 440, unit: 'mm' },
      { key: 'top',     label: 'Top size',    min: 300, max: 420, step: 10, default: 360, unit: 'mm' },
      { key: 'inset',   label: 'Leg inset',   min: 20, max: 60, step: 5, default: 40, unit: 'mm' },
    ],
    build(p) {
      const legStock = 'reglar45x45';
      const railStock = 'reglar34x45';
      const topStock = 'ply18';
      const legSec = SEC(legStock);     // 45x45
      const topT = PLY(topStock);
      const half = p.top / 2;
      const seatTop = p.seatH;
      const legTop = seatTop - topT;
      const railH = SEC(railStock).h;
      const off = half - p.inset - legSec.w / 2;

      const parts = [];
      const joints = [];

      // Four legs
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        parts.push(stick(`LEG-${sx < 0 ? 'L' : 'R'}${sz < 0 ? 'B' : 'F'}`,
          'Leg', legStock, legTop, 'y',
          { x: sx * off, y: legTop / 2, z: sz * off },
          'Legs'));
      }
      // Rail pairs near the top: two running x, two running z
      const railTop = legTop - 10;
      for (const sz of [-1, 1]) {
        parts.push(stick(`RX-${sz < 0 ? 'B' : 'F'}`, 'Rail (x)', railStock,
          2 * off, 'x',
          { x: 0, y: railTop - railH / 2, z: sz * off }, 'Rails'));
        joints.push({ type: 'torx-butt', screw: 'torx5x60', count: 2,
          note: 'rail into two legs' });
      }
      for (const sx of [-1, 1]) {
        parts.push(stick(`RZ-${sx < 0 ? 'L' : 'R'}`, 'Rail (z)', railStock,
          2 * off, 'z',
          { x: sx * off, y: railTop - railH / 2 - railH, z: 0 }, 'Rails'));
        joints.push({ type: 'torx-butt', screw: 'torx5x60', count: 2,
          note: 'rail into two legs, stacked under the x rails' });
      }
      // Ply top
      parts.push(panel('TOP', 'Stool top', topStock, p.top, p.top,
        { x: 0, y: seatTop - topT / 2, z: 0 },
        { x: 90, y: 0, z: 0 }, 'Top'));
      joints.push({ type: 'torx-face', screw: 'torx45x50', count: 4,
        note: 'top down into all four legs' });

      return { parts, joints };
    },
  },

  // --------------------------------------------------------------------------
  // 8. PERRIAND PLANK LOUNGER — reclined slatted chill chair
  // After Charlotte Perriand's Les Arcs slatted benches/loungers: a low
  // reclined seat for chilling, continuous reglar slats sweeping from seat into
  // back over two ply A-frames. Low seat (~300), long reclined back.
  // --------------------------------------------------------------------------
  {
    id: 'perriand-lounger',
    name: 'Perriand Plank Lounger',
    designer: 'Charlotte Perriand',
    year: 1968,
    blurb: 'A reclined slatted lounger after Perriand\'s Les Arcs benches: two ' +
      'plywood A-frames carry a low seat that sweeps up into a long leaned ' +
      'back, all reglar slats. Built for festival chilling, seat sits low.',
    params: [
      { key: 'width',   label: 'Width',        min: 600, max: 760, step: 20, default: 680, unit: 'mm' },
      { key: 'seatH',   label: 'Seat height',  min: 280, max: 340, step: 10, default: 300, unit: 'mm' },
      { key: 'seatD',   label: 'Seat depth',   min: 520, max: 680, step: 20, default: 600, unit: 'mm' },
      { key: 'backH',   label: 'Back height',  min: 500, max: 720, step: 20, default: 620, unit: 'mm' },
      { key: 'gap',     label: 'Slat gap',     min: 10, max: 24, step: 2, default: 16, unit: 'mm' },
    ],
    build(p) {
      const frameStock = 'ply18';
      const slatStock = 'reglar34x45';
      const t = PLY(frameStock);
      const slatSec = SEC(slatStock);   // 34x45
      const slatThick = slatSec.w;      // 34 tall flat
      const halfW = p.width / 2;
      const seatTop = p.seatH;
      const backRake = 26;              // strongly reclined

      const parts = [];
      const joints = [];

      // Two ply side A-frames (vertical, profile depth = seatD, height = seatH)
      for (const side of [-1, 1]) {
        parts.push(panel(`FRAME-${side < 0 ? 'L' : 'R'}`, 'Side A-frame',
          frameStock, p.seatD, p.seatH,
          { x: side * (halfW - t / 2), y: p.seatH / 2, z: 0 },
          { x: 0, y: 90, z: 0 }, side < 0 ? 'Left frame' : 'Right frame'));
      }
      // Seat slats run across width (x), spread along depth (z)
      const seatRow = slatRow('SEAT', slatStock, {
        runAxis: 'x', spreadAxis: 'z',
        slatLen: p.width, slatWidth: slatSec.h, gap: p.gap,
        span: p.seatD, y: seatTop - slatThick / 2, isSheet: false, group: 'Seat',
      });
      parts.push(...seatRow.parts);
      joints.push({ type: 'torx-face', screw: 'torx45x50', count: seatRow.n * 2,
        note: `${seatRow.n} seat slats into both frames` });

      // Back slats sweep up from the rear edge, strongly reclined
      const backRow = slatRow('BACK', slatStock, {
        runAxis: 'x', spreadAxis: 'y',
        slatLen: p.width, slatWidth: slatSec.h, gap: p.gap,
        span: p.backH, y: seatTop + p.backH / 2, isSheet: false, group: 'Back',
      });
      const backZ = -p.seatD / 2 + slatThick;
      for (const part of backRow.parts) {
        part.pos.z = backZ - (part.pos.y - seatTop) * Math.sin(backRake * Math.PI / 180);
        part.rot = { x: -backRake, y: 0, z: 0 };
      }
      parts.push(...backRow.parts);
      joints.push({ type: 'torx-face', screw: 'torx45x50', count: backRow.n * 2,
        note: `${backRow.n} back slats into both frames` });

      return { parts, joints };
    },
  },

  // --------------------------------------------------------------------------
  // 9. BARRIO DAYBED — low plank daybed / podium
  // A bonus piece in the same idiom: a big low plank platform for lounging or
  // as a stage step. Reglar ladder frame on ply gable ends, reglar deck slats.
  // Knock-down: gables + frame unscrew, deck lifts off. Low (~300).
  // --------------------------------------------------------------------------
  {
    id: 'barrio-daybed',
    name: 'Barrio Daybed / Podium',
    designer: 'Nowhere Build Crew',
    year: 2026,
    blurb: 'A low plank platform for lounging or as a stage step: a reglar ' +
      'ladder frame sits on two ply gable ends and carries a reglar deck. ' +
      'Knock-down for transport, robust enough to stand on.',
    params: [
      { key: 'len',     label: 'Length',      min: 1600, max: 2200, step: 50, default: 1900, unit: 'mm' },
      { key: 'width',   label: 'Width',       min: 700, max: 1000, step: 20, default: 800, unit: 'mm' },
      { key: 'deckH',   label: 'Deck height', min: 260, max: 360, step: 10, default: 300, unit: 'mm' },
      { key: 'gap',     label: 'Deck gap',    min: 8, max: 18, step: 2, default: 12, unit: 'mm' },
    ],
    build(p) {
      const gableStock = 'ply18';
      const railStock = 'reglar45x95';
      const deckStock = 'reglar45x70';
      const t = PLY(gableStock);
      const railSec = SEC(railStock);   // 45x95
      const deckSec = SEC(deckStock);   // 45x70
      const deckThick = deckSec.w;      // 45 tall flat
      const deckTop = p.deckH;
      const halfL = p.len / 2;
      const railTop = deckTop - deckThick;
      const railH = railSec.h;          // 95

      const parts = [];
      const joints = [];

      // Two ply gable ends
      for (const end of [-1, 1]) {
        parts.push(panel(`GABLE-${end < 0 ? 'L' : 'R'}`, 'End gable', gableStock,
          p.width, railTop,
          { x: end * (halfL - t / 2), y: railTop / 2, z: 0 },
          { x: 0, y: 90, z: 0 }, end < 0 ? 'Left gable' : 'Right gable'));
      }
      // Two long ladder rails (front + back) between the gables
      const railZ = p.width / 2 - railSec.w / 2 - 30;
      for (const fb of [-1, 1]) {
        parts.push(stick(`RAIL-${fb < 0 ? 'B' : 'F'}`, 'Ladder rail', railStock,
          p.len - 2 * t, 'z',
          { x: 0, y: railTop - railH / 2, z: fb * railZ }, 'Rails'));
        joints.push({ type: 'torx-face', screw: 'torx5x80', count: 4,
          note: 'rail captured through each gable' });
      }
      // Deck slats run along length (z), spread across width (x)
      const row = slatRow('DECK', deckStock, {
        runAxis: 'z', spreadAxis: 'x',
        slatLen: p.len - 2 * t, slatWidth: deckSec.h, gap: p.gap,
        span: p.width, y: deckTop - deckThick / 2, isSheet: false, group: 'Deck',
      });
      parts.push(...row.parts);
      joints.push({ type: 'torx-face', screw: 'torx45x50', count: row.n * 4,
        note: `${row.n} deck slats, screwed into both rails` });

      return { parts, joints };
    },
  },

];

export default CATALOG;
