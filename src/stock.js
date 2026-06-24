// ============================================================================
// stock.js — SHARED FOUNDATION + DATA CONTRACT
// Every other module imports from here. Do NOT redefine these shapes elsewhere.
// All dimensions are METRIC. Authoring units = millimetres (mm). The 3D builder
// converts mm -> metres internally (x0.001); everything else stays in mm.
// ============================================================================

// ----------------------------------------------------------------------------
// CANONICAL SHAPES (JSDoc — the contract all modules agree on)
// ----------------------------------------------------------------------------
/**
 * @typedef {Object} PartSpec   A single cut part. Produced by catalog designs,
 *                              rendered/edited by the builder, consumed by BOM
 *                              and export. ONE shape used everywhere.
 * @property {string}  ref       short human ref, e.g. "A1", "leg-FL"
 * @property {string}  name      readable name, e.g. "Bench end panel"
 * @property {'sheet'|'timber'} material
 * @property {string}  stock     key into SHEETS or TIMBER below
 * @property {{w:number,h:number,d:number}} size  cut size in mm. For timber the
 *                              LENGTH is the largest of w/h/d; cross-section is
 *                              the other two. For sheet, d = panel thickness.
 * @property {{x:number,y:number,z:number}} pos   centre position in mm, y is up
 * @property {{x:number,y:number,z:number}} rot   rotation in DEGREES
 * @property {string} [group]    optional sub-assembly label, e.g. "Left end"
 * @property {number} [color]    optional hex override
 */

/**
 * @typedef {Object} Joint   A fastening between parts, drives the screw schedule.
 * @property {string}  type    e.g. "torx-butt", "torx-face", "torx-edge"; or the
 *                             screwless slot types "slot-crosslap", "wedge-tenon"
 *                             (count = engagements / wedges; `screw` omitted).
 * @property {string} [screw]  key into SCREWS below (omitted for slot types)
 * @property {number}  count   number of screws in this joint
 * @property {string} [note]   e.g. "pre-drill 3mm pilot"
 */

/**
 * @typedef {Object} Design  A parametric furniture template in the catalog.
 * @property {string} id
 * @property {string} name
 * @property {string} designer
 * @property {number} [year]
 * @property {string} blurb
 * @property {Array<{key:string,label:string,min:number,max:number,step:number,default:number,unit:string}>} params
 * @property {(p:Object)=>{parts:PartSpec[],joints:Joint[]}} build  // p = {paramKey: value}
 */

// ----------------------------------------------------------------------------
// SHEET GOODS — plywood. Standard EU sheet is 2440 x 1220 mm.
// Prices are rough SEK incl. VAT, builder's-merchant ballpark — for estimates.
// ----------------------------------------------------------------------------
export const SHEETS = {
  ply12: { label: 'Plywood 12 mm', thickness: 12, sheet: { w: 2440, h: 1220 }, kerf: 4, price: 450, color: 0xe0c089 },
  ply15: { label: 'Plywood 15 mm', thickness: 15, sheet: { w: 2440, h: 1220 }, kerf: 4, price: 520, color: 0xdcb87f },
  ply18: { label: 'Plywood 18 mm', thickness: 18, sheet: { w: 2440, h: 1220 }, kerf: 4, price: 620, color: 0xd9b382 },
  ply21: { label: 'Plywood 21 mm', thickness: 21, sheet: { w: 2440, h: 1220 }, kerf: 4, price: 720, color: 0xd2a96f },
};

// ----------------------------------------------------------------------------
// TIMBER — planed softwood "reglar". Cross-section w x h (mm); sold in fixed
// lengths (mm). The BOM optimiser cuts parts from these sticks.
// ----------------------------------------------------------------------------
export const TIMBER = {
  reglar34x45: { label: 'Reglar 34×45', section: { w: 34, h: 45 }, lengths: [3600, 4200, 4800], kerf: 3, price: 38, color: 0xc9a063 },
  reglar45x45: { label: 'Reglar 45×45', section: { w: 45, h: 45 }, lengths: [3600, 4200, 4800], kerf: 3, price: 52, color: 0xbf9450 },
  reglar45x70: { label: 'Reglar 45×70', section: { w: 45, h: 70 }, lengths: [3600, 4200, 4800], kerf: 3, price: 78, color: 0xb98a4e },
  reglar45x95: { label: 'Reglar 45×95', section: { w: 45, h: 95 }, lengths: [3600, 4200, 4800, 5400], kerf: 3, price: 104, color: 0xae8043 },
  reglar45x120:{ label: 'Reglar 45×120',section: { w: 45, h: 120 },lengths: [3600, 4200, 4800, 5400], kerf: 3, price: 138, color: 0xa3763b },
};

// ----------------------------------------------------------------------------
// SCREWS — Torx-drive wood screws (ESSVE/SPAX style). size = "d x length" mm.
// `pilot` = recommended pilot drill (mm). Sold per box; price is per box.
// ----------------------------------------------------------------------------
export const SCREWS = {
  torx4x40:  { label: 'Torx 4.0×40',  d: 4.0, length: 40,  drive: 'T20', pilot: 2.5, boxQty: 200, boxPrice: 110 },
  torx45x50: { label: 'Torx 4.5×50',  d: 4.5, length: 50,  drive: 'T20', pilot: 3.0, boxQty: 200, boxPrice: 130 },
  torx5x60:  { label: 'Torx 5.0×60',  d: 5.0, length: 60,  drive: 'T25', pilot: 3.0, boxQty: 100, boxPrice: 120 },
  torx5x80:  { label: 'Torx 5.0×80',  d: 5.0, length: 80,  drive: 'T25', pilot: 3.5, boxQty: 100, boxPrice: 150 },
  torx6x100: { label: 'Torx 6.0×100', d: 6.0, length: 100, drive: 'T30', pilot: 4.0, boxQty: 50,  boxPrice: 145 },
  torx6x120: { label: 'Torx 6.0×120', d: 6.0, length: 120, drive: 'T30', pilot: 4.0, boxQty: 50,  boxPrice: 170 },
};

// --- CNC slot-together joinery constants -----------------------------------
// Press-fit clearance PER SIDE (mm). Ply thickness varies ±0.13mm, so slot
// width is keyed to MEASURED thickness + 2*fit. Numbers from the research brief.
export const SLOT_FIT = { snug: 0.10, standard: 0.25, outdoor: 0.35 };

// Inside-corner relief so a square tab seats against a round router bit.
// dogbone radius should be >= 1.1 * bit radius.
export const RELIEF = { bitDia: 6.35, kind: 'dogbone' }; // 'dogbone' | 'tbone'

/** slot width to receive a sheet edge of `thicknessMm`, for a fit class. */
export function slotWidth(thicknessMm, fit = 'standard') {
  const f = SLOT_FIT[fit] ?? SLOT_FIT.standard;
  return thicknessMm + 2 * f;
}

/** dogbone relief radius for the configured bit. */
export function reliefRadius() { return (RELIEF.bitDia / 2) * 1.1; }

// ----------------------------------------------------------------------------
// Helpers shared across modules.
// ----------------------------------------------------------------------------
export const MM = 0.001; // mm -> metres for the 3D scene

/** longest edge of a part = its "length" for timber takeoff */
export function lengthOf(size) { return Math.max(size.w, size.h, size.d); }

/** the two cross-section dims (everything except the longest edge) */
export function sectionOf(size) {
  const dims = [size.w, size.h, size.d].sort((a, b) => a - b);
  return { a: dims[0], b: dims[1] }; // smallest two
}

/** look up a stock record by key across all tables */
export function stockOf(key) {
  return SHEETS[key] || TIMBER[key] || SCREWS[key] || null;
}

/** "1800 × 70 × 45" */
export function fmtSize(size) {
  return `${Math.round(size.w)} × ${Math.round(size.h)} × ${Math.round(size.d)}`;
}

/** stable-ish id generator (no Date.now/random reliance for determinism in tests) */
let _idc = 0;
export function uid(prefix = 'p') { return `${prefix}${++_idc}`; }

export const SHEET_KEYS = Object.keys(SHEETS);
export const TIMBER_KEYS = Object.keys(TIMBER);
export const SCREW_KEYS = Object.keys(SCREWS);
