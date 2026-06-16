// ============================================================================
// materials.js — CURATED MATERIALS LIBRARY for the furniture app
//
// A small, opinionated, festival-appropriate palette of named finishes the user
// can pick from in the UI. Each entry is a thin descriptor:
//   { id, name, category, style:{species, finish, paintColor?}, swatch }
// `style` is handed straight to the extended createWoodMaterial() in wood.js,
// which turns species + finish into a procedural, seamless, end-grained material.
//
// Resolution flow:
//   MATERIALS (this file)  --id-->  materialMaterial(THREE, id, partOpts)
//        -> looks up the entry's `style`
//        -> createWoodMaterial(THREE, { ...partOpts, style })  (wood.js)
//        -> a 6-material BoxGeometry array (end grain on the cut ends).
//
// Nothing here builds textures or touches THREE directly except via wood.js, so
// it stays cheap to import and the heavy work stays cached in wood.js.
// ============================================================================

import { createWoodMaterial } from './wood.js?v=10';
import { SHEETS } from './stock.js?v=10';

// ----------------------------------------------------------------------------
// THE LIBRARY
//
// `category` groups entries for the picker: softwood | hardwood | plywood |
// painted | charred. `swatch` is an approximate hex for a UI colour chip (the
// real look comes from the procedural texture, but the chip wants one colour).
// Paint colours are muted, outdoor/festival-friendly tones — not primaries.
// ----------------------------------------------------------------------------
export const MATERIALS = [
  // --- Softwood --------------------------------------------------------------
  {
    id: 'raw-pine',
    name: 'Raw Pine',
    category: 'softwood',
    style: { species: 'pine', finish: 'raw' },
    swatch: 0xcdaa6a,
  },
  {
    id: 'oiled-pine',
    name: 'Oiled Pine',
    category: 'softwood',
    style: { species: 'pine', finish: 'oiled' },
    swatch: 0xc69a55,
  },

  // --- Hardwood --------------------------------------------------------------
  {
    id: 'oiled-oak',
    name: 'Oiled Oak',
    category: 'hardwood',
    style: { species: 'oak', finish: 'oiled' },
    swatch: 0xa9803f,
  },
  {
    id: 'raw-oak',
    name: 'Raw Oak',
    category: 'hardwood',
    style: { species: 'oak', finish: 'raw' },
    swatch: 0xb38a4c,
  },
  {
    id: 'oiled-walnut',
    name: 'Oiled Walnut',
    category: 'hardwood',
    style: { species: 'walnut', finish: 'oiled' },
    swatch: 0x5a3d28,
  },
  {
    id: 'limewashed-oak',
    name: 'Limewashed Oak',
    category: 'hardwood',
    style: { species: 'oak', finish: 'limewashed' },
    swatch: 0xcabfa6,
  },
  {
    id: 'iroko-outdoor',
    name: 'Iroko (outdoor)',
    category: 'hardwood',
    style: { species: 'iroko', finish: 'oiled' },
    swatch: 0xa57334,
  },
  {
    id: 'teak-oiled',
    name: 'Oiled Teak',
    category: 'hardwood',
    style: { species: 'teak', finish: 'oiled' },
    swatch: 0xab7a3c,
  },

  // --- Plywood ---------------------------------------------------------------
  {
    id: 'birch-ply',
    name: 'Birch Plywood',
    category: 'plywood',
    style: { species: 'birch-ply', finish: 'raw' },
    swatch: 0xe3d2a8,
  },
  {
    id: 'oiled-birch-ply',
    name: 'Oiled Birch Plywood',
    category: 'plywood',
    style: { species: 'birch-ply', finish: 'oiled' },
    swatch: 0xdcc794,
  },

  // --- Charred ---------------------------------------------------------------
  {
    id: 'charred-cedar',
    name: 'Charred Cedar',
    category: 'charred',
    style: { species: 'pine', finish: 'charred' },
    swatch: 0x231f1c,
  },

  // --- Painted (muted, festival-appropriate pigments) ------------------------
  {
    id: 'barn-red',
    name: 'Barn Red (painted)',
    category: 'painted',
    // Swedish falu-röd; the species underneath barely shows but lends texture.
    style: { species: 'pine', finish: 'painted', paintColor: 0x8a3b2e },
    swatch: 0x8a3b2e,
  },
  {
    id: 'off-white',
    name: 'Off-White (painted)',
    category: 'painted',
    style: { species: 'birch-ply', finish: 'painted', paintColor: 0xe8e2d4 },
    swatch: 0xe8e2d4,
  },
  {
    id: 'forest-green',
    name: 'Forest Green (painted)',
    category: 'painted',
    style: { species: 'pine', finish: 'painted', paintColor: 0x3f5641 },
    swatch: 0x3f5641,
  },
  {
    id: 'dusk-blue',
    name: 'Dusk Blue (painted)',
    category: 'painted',
    style: { species: 'pine', finish: 'painted', paintColor: 0x4a5d6b },
    swatch: 0x4a5d6b,
  },
];

// Fast id -> entry index for resolution.
const _byId = new Map(MATERIALS.map((m) => [m.id, m]));

/** Look up a MATERIALS entry by id, or undefined. */
export function getMaterial(id) {
  return _byId.get(id);
}

// ----------------------------------------------------------------------------
// Stock -> sane default material
// ----------------------------------------------------------------------------

/**
 * Pick a sensible default MATERIALS id for a given stock key so the app can
 * assign every part a material without the user choosing. Sheet stock (plywood)
 * -> birch ply; timber (reglar / unknown) -> raw pine.
 *
 * @param {string} stockKey  a key into SHEETS or TIMBER (see stock.js)
 * @returns {string} a MATERIALS id (always one that exists in MATERIALS)
 */
export function defaultMaterialForStock(stockKey) {
  if (stockKey && SHEETS && Object.prototype.hasOwnProperty.call(SHEETS, stockKey)) {
    return 'birch-ply';
  }
  // Crude string fallback for callers that pass an unregistered ply* key.
  if (typeof stockKey === 'string' && /ply/i.test(stockKey)) return 'birch-ply';
  return 'raw-pine';
}

// ----------------------------------------------------------------------------
// Resolve a material id -> a built material (array) for one part.
// ----------------------------------------------------------------------------

/**
 * Resolve a MATERIALS id to its style and build the wood material for a part.
 * Robust: an unknown / missing id falls back to a sensible default chosen by the
 * part's stock (plywood -> birch ply, otherwise raw pine), so a bad id never
 * throws or yields an untextured part.
 *
 * @param {object} THREE      the three.js module (r160)
 * @param {string} materialId a MATERIALS id
 * @param {object} partOpts   { stockKey, baseColor, longAxis, sizeMM, seed, environment }
 * @returns {THREE.Material[]|THREE.Material}  whatever createWoodMaterial returns
 */
export function materialMaterial(THREE, materialId, partOpts) {
  const po = partOpts || {};
  let entry = _byId.get(materialId);
  if (!entry) {
    // Unknown id -> default by stock, then default-of-default if that's odd too.
    entry = _byId.get(defaultMaterialForStock(po.stockKey)) || MATERIALS[0];
  }
  // The style descriptor is plain data; wood.js's resolveStyle() validates it and
  // falls back to the legacy look if it's ever unusable.
  return createWoodMaterial(THREE, { ...po, style: entry.style });
}
