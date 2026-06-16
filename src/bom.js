// ============================================================================
// bom.js — BILL-OF-MATERIALS / MATERIAL-TAKEOFF ENGINE
// ----------------------------------------------------------------------------
// Pure metric. Given { parts, joints } it computes exactly what to buy:
//   • how many plywood sheets (via real 2D shelf bin-packing, not area/area)
//   • how many lengths of each reglar section (via first-fit-decreasing cut nest)
//   • how many Torx screws + boxes (summed from joints)
//   • a rough SEK cost for the lot
//
// The deliverable: one shopping list a 10-person barrio can carry into a
// builder's merchant. All prices are ROUGH SEK estimates (see stock.js) — they
// are ballpark, VAT-inclusive merchant figures, for budgeting not invoicing.
//
// PURE FUNCTIONS ONLY. No Date.now / Math.random — deterministic for tests.
// All maths in millimetres unless a field name says otherwise (…M2 / …M / …Mm).
// ============================================================================

import {
  SHEETS, TIMBER, SCREWS,
  lengthOf, sectionOf, stockOf, fmtSize,
} from './stock.js?v=8';

// ----------------------------------------------------------------------------
// PRICING ASSUMPTION (timber) — documented choice:
//   Reglar `price` in stock.js is treated as the price of ONE stick at the
//   LONGEST listed length for that section. We then derive a price-per-metre
//   from that (price / (longestLength/1000)) and charge each actually-bought
//   stick at pricePerMetre × (stickLength/1000). This keeps a 4800 mm stick
//   cheaper-per-metre-fair while letting us buy shorter 3600 mm sticks at a
//   proportional cost. It is an approximation; merchant pricing is rarely
//   perfectly linear, but it is honest, monotonic, and good enough for a
//   shopping estimate.
//
// Sheets: `price` is per full 2440×1220 sheet, charged per sheet bought.
// Screws: `boxPrice` is per box of `boxQty`, charged per box bought.
// ----------------------------------------------------------------------------

const M2 = 1e-6; // mm² -> m²
const M  = 1e-3; // mm  -> m

const round2 = (n) => Math.round(n * 100) / 100;
const roundSEK = (n) => Math.round(n); // whole kronor for the list

// ============================================================================
// SHEET NESTING — heuristic 2D shelf (guillotine-ish) bin-packing
// ----------------------------------------------------------------------------
// Goal: estimate how many full sheets are needed, NOT total-area / sheet-area
// (which under-counts badly because offcuts can't always be reused). We do a
// First-Fit-Decreasing-Height *shelf* pack:
//   • Treat each sheet as rows ("shelves") stacked along the sheet height.
//   • Sort parts by their (oriented) height, tallest first.
//   • For each part, try to drop it into an existing shelf on some sheet where
//     it fits in remaining width AND the shelf is tall enough; else open a new
//     shelf; if no sheet has vertical room for a new shelf, open a new sheet.
//   • A part may be ROTATED 90° — we pick the orientation that fits / wastes
//     less, preferring the one whose height is <= remaining shelf-stack room.
//   • KERF (saw width) is added to each placed part's footprint on both axes,
//     so parts packed edge-to-edge still leave room for the blade.
//
// This is a known, auditable heuristic (shelf/NFDH-family). It over-counts
// slightly vs. a perfect nest — which is the safe direction for a buy list.
// Parts larger than the sheet (in both orientations) get their own sheet and a
// warning. Utilisation = packed part area / (sheetsNeeded × sheet area).
// ============================================================================

/**
 * @param {Array<{w:number,h:number}>} rects  part footprints in mm (w×h)
 * @param {{w:number,h:number}} sheet  sheet size mm
 * @param {number} kerf  saw kerf mm
 * @returns {{sheetsNeeded:number, oversizeCount:number}}
 */
function packSheets(rects, sheet, kerf) {
  const SW = sheet.w;
  const SH = sheet.h;

  // Each open sheet: { shelves:[{ y, height, usedW }], usedHeight }
  const sheets = [];
  let oversizeCount = 0;

  // Choose orientation for a rect (incl. kerf padding) that best fits the sheet.
  // Returns the oriented {w,h} (kerf-padded) or null if it can't fit at all.
  const orient = (w, h) => {
    const aw = w + kerf, ah = h + kerf; // padded footprint
    const a = { w: aw, h: ah };
    const b = { w: ah, h: aw }; // rotated 90°
    const aFits = a.w <= SW + kerf && a.h <= SH + kerf;
    const bFits = b.w <= SW + kerf && b.h <= SH + kerf;
    if (!aFits && !bFits) return null;
    if (aFits && !bFits) return a;
    if (bFits && !aFits) return b;
    // both fit: prefer the orientation that is "wider than tall" so shelves
    // stay shallow and stack well; tie-break to original.
    return a.h <= b.h ? a : b;
  };

  // FFDH wants tallest-first. Pre-orient + sort by padded height desc.
  const items = [];
  for (const r of rects) {
    const o = orient(r.w, r.h);
    if (!o) { oversizeCount++; continue; }
    items.push(o);
  }
  items.sort((p, q) => q.h - p.h);

  for (const it of items) {
    let placed = false;

    // Try existing shelves across all open sheets (first-fit).
    for (const s of sheets) {
      for (const shelf of s.shelves) {
        if (it.h <= shelf.height + 1e-9 && shelf.usedW + it.w <= SW + 1e-9) {
          shelf.usedW += it.w;
          placed = true;
          break;
        }
      }
      if (placed) break;

      // No shelf fit; can we open a NEW shelf on this sheet?
      if (s.usedHeight + it.h <= SH + 1e-9) {
        s.shelves.push({ y: s.usedHeight, height: it.h, usedW: it.w });
        s.usedHeight += it.h;
        placed = true;
        break;
      }
    }

    if (!placed) {
      // New sheet, new shelf.
      sheets.push({ shelves: [{ y: 0, height: it.h, usedW: it.w }], usedHeight: it.h });
    }
  }

  // Oversize parts each consume their own sheet.
  return { sheetsNeeded: sheets.length + oversizeCount, oversizeCount };
}

// ============================================================================
// TIMBER CUT NESTING — First-Fit-Decreasing bin-pack of part lengths into sticks
// ----------------------------------------------------------------------------
// For one section we have a set of required part-lengths and a menu of stock
// stick lengths (e.g. [3600,4200,4800]). We greedily pack:
//   • Sort required lengths DESC (longest first — they're hardest to place).
//   • Keep a list of open sticks, each with a chosen full length + remaining mm.
//   • Place each part in the FIRST open stick where it fits (incl. kerf per cut).
//   • If none fit, OPEN a new stick: pick the SHORTEST stock length that still
//     holds this part (least waste); if the part is longer than every stock
//     length, open the longest available, mark it oversize + warn.
// Kerf: each cut consumes `kerf` mm. We charge kerf once per part placed
// (the saw line that separates it from the rest of the stick) — a simple,
// slightly-conservative model.
//
// Result reports, per chosen stick length, how many sticks of that length, the
// total linear metres bought, and cost via the per-metre pricing assumption.
// ============================================================================

/**
 * @param {number[]} lengths  required part lengths in mm
 * @param {number[]} stockLengths  available stick lengths mm
 * @param {number} kerf  saw kerf mm
 * @returns {{sticks:Array<{length:number, remaining:number}>, oversizeCount:number}}
 */
function packTimber(lengths, stockLengths, kerf) {
  const menu = [...stockLengths].sort((a, b) => a - b); // shortest..longest
  const longest = menu[menu.length - 1];

  const sticks = []; // { length, remaining }
  let oversizeCount = 0;

  const sorted = [...lengths].sort((a, b) => b - a); // longest part first

  for (const L of sorted) {
    const cut = L + kerf; // this part costs L plus one saw line
    let placed = false;

    // First-fit into an open stick.
    for (const s of sticks) {
      if (s.remaining + 1e-9 >= cut) {
        s.remaining -= cut;
        placed = true;
        break;
      }
    }
    if (placed) continue;

    // Open a new stick: shortest stock length that holds this cut.
    let chosen = menu.find((m) => m >= cut);
    if (chosen == null) {
      // Part longer than every stock length — can't be made from one stick.
      chosen = longest;
      oversizeCount++;
    }
    sticks.push({ length: chosen, remaining: chosen - cut });
  }

  return { sticks, oversizeCount };
}

// ============================================================================
// MAIN ENTRY
// ============================================================================

/**
 * Compute a full Bill-of-Materials from parts + joints.
 * @param {{parts: import('./stock.js').PartSpec[], joints: import('./stock.js').Joint[]}} input
 * @returns {Object} BOM (see file header / shape below)
 */
export function computeBOM({ parts = [], joints = [] } = {}) {
  const warnings = [];

  // ---- bucket parts by stock key, validated ----
  const sheetGroups = new Map(); // stockKey -> PartSpec[]
  const timberGroups = new Map();

  for (const p of parts) {
    const rec = stockOf(p.stock);
    if (!rec) {
      warnings.push(`Unknown stock key "${p.stock}" on part ${p.ref || p.name || '?'} — skipped.`);
      continue;
    }
    if (p.material === 'sheet') {
      if (!SHEETS[p.stock]) {
        warnings.push(`Part ${p.ref || p.name} is material:'sheet' but stock "${p.stock}" is not a sheet — skipped.`);
        continue;
      }
      if (!sheetGroups.has(p.stock)) sheetGroups.set(p.stock, []);
      sheetGroups.get(p.stock).push(p);
    } else if (p.material === 'timber') {
      if (!TIMBER[p.stock]) {
        warnings.push(`Part ${p.ref || p.name} is material:'timber' but stock "${p.stock}" is not timber — skipped.`);
        continue;
      }
      if (!timberGroups.has(p.stock)) timberGroups.set(p.stock, []);
      timberGroups.get(p.stock).push(p);
    } else {
      warnings.push(`Part ${p.ref || p.name} has unknown material "${p.material}" — skipped.`);
    }
  }

  // ------------------------------------------------------------------ SHEETS
  const sheets = [];
  for (const [key, group] of sheetGroups) {
    const rec = SHEETS[key];
    const sheetArea = rec.sheet.w * rec.sheet.h * M2; // m²

    // Footprints: a sheet part's two largest dims are its w×h on the panel;
    // the smallest dim (d) is the thickness. Use lengthOf/sectionOf to be safe
    // regardless of which axis the author put the thickness on.
    const rects = group.map((p) => {
      const len = lengthOf(p.size);
      const { b } = sectionOf(p.size); // b = middle dim = the other panel edge
      return { w: len, h: b };
    });

    // Detect parts that simply cannot fit a sheet in either orientation.
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      const fits =
        (r.w <= rec.sheet.w && r.h <= rec.sheet.h) ||
        (r.h <= rec.sheet.w && r.w <= rec.sheet.h);
      if (!fits) {
        const p = group[i];
        warnings.push(
          `Part ${p.ref || p.name} (${fmtSize(p.size)}) exceeds ${rec.label} sheet ` +
          `${rec.sheet.w}×${rec.sheet.h} — counted as its own sheet, will need splitting.`
        );
      }
    }

    const { sheetsNeeded } = packSheets(rects, rec.sheet, rec.kerf);

    const areaUsedM2 = round2(rects.reduce((s, r) => s + r.w * r.h * M2, 0));
    const areaSheetM2 = round2(sheetsNeeded * sheetArea);
    const utilisation = areaSheetM2 > 0 ? round2(areaUsedM2 / areaSheetM2) : 0;
    const lineTotal = roundSEK(sheetsNeeded * rec.price);

    // collapse identical parts into items with qty
    const items = collapseItems(group, (p) => ({
      ref: p.ref, name: p.name, size: fmtSize(p.size),
    }));

    sheets.push({
      stock: key,
      label: rec.label,
      thickness: rec.thickness,
      sheetSize: { w: rec.sheet.w, h: rec.sheet.h },
      sheetsNeeded,
      partsCount: group.length,
      areaUsedM2,
      areaSheetM2,
      utilisation, // 0..1
      price: rec.price,
      lineTotal,
      items,
    });
  }
  sheets.sort((a, b) => a.label.localeCompare(b.label));

  // ------------------------------------------------------------------ TIMBER
  const timber = [];
  for (const [key, group] of timberGroups) {
    const rec = TIMBER[key];
    const sec = rec.section;
    const longest = Math.max(...rec.lengths);
    // pricing assumption: price = one stick at the LONGEST listed length
    const pricePerMm = rec.price / longest;

    const partLengths = group.map((p) => lengthOf(p.size));
    const totalLengthMm = partLengths.reduce((s, l) => s + l, 0);

    const { sticks, oversizeCount } = packTimber(partLengths, rec.lengths, rec.kerf);
    if (oversizeCount > 0) {
      warnings.push(
        `${oversizeCount} ${rec.label} part(s) exceed the longest stock length ` +
        `(${longest} mm) — they will need joining/scarfing.`
      );
    }

    // tally sticks by chosen length
    const byLen = new Map();
    let boughtMm = 0;
    for (const s of sticks) {
      byLen.set(s.length, (byLen.get(s.length) || 0) + 1);
      boughtMm += s.length;
    }
    const stickList = [...byLen.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([length, count]) => ({ length, count }));

    const lineTotal = roundSEK(boughtMm * pricePerMm);
    const stickPrice = round2(longest * pricePerMm); // == rec.price, for display

    const items = collapseItems(group, (p) => ({
      ref: p.ref, name: p.name, length: lengthOf(p.size),
    }));

    timber.push({
      stock: key,
      label: rec.label,
      section: { w: sec.w, h: sec.h },
      totalLengthMm,
      totalLengthM: round2(totalLengthMm * M),
      boughtLengthM: round2(boughtMm * M),
      sticks: stickList,
      stickPrice, // SEK per longest-length stick (the pricing anchor)
      lineTotal,
      items,
    });
  }
  timber.sort((a, b) => a.label.localeCompare(b.label));

  // ------------------------------------------------------------------ SCREWS
  const screwTally = new Map(); // key -> count
  for (const j of joints) {
    if (!j || j.screw == null) continue;
    const rec = SCREWS[j.screw];
    if (!rec) {
      warnings.push(`Unknown screw key "${j.screw}" on joint "${j.type || '?'}" — skipped.`);
      continue;
    }
    const c = Number(j.count) || 0;
    screwTally.set(j.screw, (screwTally.get(j.screw) || 0) + c);
  }

  const screws = [...screwTally.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, count]) => {
      const rec = SCREWS[key];
      const boxes = count > 0 ? Math.ceil(count / rec.boxQty) : 0;
      const lineTotal = roundSEK(boxes * rec.boxPrice);
      return {
        screw: key,
        label: rec.label,
        count,
        boxes,
        boxPrice: rec.boxPrice,
        lineTotal,
      };
    });

  // ------------------------------------------------------------------ TOTALS
  const sheetCost = sheets.reduce((s, r) => s + r.lineTotal, 0);
  const timberCost = timber.reduce((s, r) => s + r.lineTotal, 0);
  const screwCost = screws.reduce((s, r) => s + r.lineTotal, 0);

  const totals = {
    sheetCost: roundSEK(sheetCost),
    timberCost: roundSEK(timberCost),
    screwCost: roundSEK(screwCost),
    grandCost: roundSEK(sheetCost + timberCost + screwCost),
    currency: 'SEK',
    partCount: parts.length,
    plyAreaM2: round2(sheets.reduce((s, r) => s + r.areaUsedM2, 0)),
    timberLengthM: round2(timber.reduce((s, r) => s + r.totalLengthM, 0)),
    screwCount: screws.reduce((s, r) => s + r.count, 0),
  };

  // Waste is NOT baked into prices (the nest already over-counts sheets/sticks
  // a little, but breakage / mistakes are not). Flag a standard buffer.
  if (parts.length > 0) {
    warnings.push('Prices are rough SEK estimates — add ~10% for waste, breakage and offcuts you can\'t reuse.');
  }

  return { sheets, timber, screws, totals, warnings };
}

// ----------------------------------------------------------------------------
// collapseItems — fold a part group into { …, qty } rows, merging identical
// rows (same ref+name+dimension key) so the items list reads like a cut list.
// ----------------------------------------------------------------------------
function collapseItems(group, projector) {
  const map = new Map();
  for (const p of group) {
    const row = projector(p);
    const k = JSON.stringify(row);
    if (map.has(k)) map.get(k).qty += 1;
    else map.set(k, { ...row, qty: 1 });
  }
  return [...map.values()];
}

// ============================================================================
// bomSummaryLine — one-line headline for UI chips / share text.
//   "3 sheets ply18 · 14.2 m reglar · 180 screws · ~4 200 SEK"
// ============================================================================
export function bomSummaryLine(bom) {
  if (!bom) return '';
  const parts = [];

  const totalSheets = bom.sheets.reduce((s, r) => s + r.sheetsNeeded, 0);
  if (totalSheets > 0) {
    // name the dominant ply by sheet count
    const top = [...bom.sheets].sort((a, b) => b.sheetsNeeded - a.sheetsNeeded)[0];
    parts.push(`${totalSheets} sheet${totalSheets === 1 ? '' : 's'} ${top.stock}`);
  }

  if (bom.totals.timberLengthM > 0) {
    parts.push(`${bom.totals.timberLengthM.toFixed(1)} m reglar`);
  }

  if (bom.totals.screwCount > 0) {
    parts.push(`${bom.totals.screwCount} screw${bom.totals.screwCount === 1 ? '' : 's'}`);
  }

  parts.push(`~${groupThousands(bom.totals.grandCost)} SEK`);
  return parts.join(' · ');
}

/** 4200 -> "4 200" (Swedish-style space thousands, ASCII space). */
function groupThousands(n) {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

// ============================================================================
// INLINE SELF-TESTS (read-only documentation of expected behaviour).
// No framework — these are the asserts you'd get if you ran the snippets.
//
//  import { computeBOM, bomSummaryLine } from './bom.js?v=8';
//
//  // 1) Empty in -> valid empty BOM, no crash:
//  const empty = computeBOM({ parts: [], joints: [] });
//  // empty.totals.grandCost === 0; empty.sheets/timber/screws === []
//  // empty.warnings === []  (no "add 10%" note since there are no parts)
//
//  // 2) Two ply18 panels that each fill ~half a sheet -> 1 sheet, util ~0.5–0.9:
//  const r2 = computeBOM({ parts: [
//    { ref:'A', name:'panel', material:'sheet', stock:'ply18',
//      size:{w:1200,h:1200,d:18}, pos:{x:0,y:0,z:0}, rot:{x:0,y:0,z:0} },
//    { ref:'B', name:'panel', material:'sheet', stock:'ply18',
//      size:{w:1200,h:1200,d:18}, pos:{x:0,y:0,z:0}, rot:{x:0,y:0,z:0} },
//  ], joints: [] });
//  // r2.sheets[0].sheetsNeeded === 1  (two 1200×1200 tiles fit on 2440×1220)
//  // r2.totals.sheetCost === 620
//
//  // 3) One oversize panel -> warning + its own sheet:
//  const r3 = computeBOM({ parts: [
//    { ref:'X', name:'huge', material:'sheet', stock:'ply12',
//      size:{w:3000,h:1300,d:12}, pos:{x:0,y:0,z:0}, rot:{x:0,y:0,z:0} },
//  ], joints: [] });
//  // r3.sheets[0].sheetsNeeded === 1; r3.warnings includes "exceeds"
//
//  // 4) Timber FFD: three 2000 mm reglar34x45 cuts. FFD opens the SHORTEST
//  //    stock length that fits each cut (2000+3 kerf -> 3600). A second
//  //    2000 cut won't fit the 1597 mm remainder, so each part opens its own
//  //    3600 stick -> three 3600 sticks (boughtM 10.8, totalM 6.0):
//  const r4 = computeBOM({ parts: [
//    { ref:'L1', name:'leg', material:'timber', stock:'reglar34x45',
//      size:{w:34,h:45,d:2000}, pos:{x:0,y:0,z:0}, rot:{x:0,y:0,z:0} },
//    { ref:'L2', name:'leg', material:'timber', stock:'reglar34x45',
//      size:{w:34,h:45,d:2000}, pos:{x:0,y:0,z:0}, rot:{x:0,y:0,z:0} },
//    { ref:'L3', name:'leg', material:'timber', stock:'reglar34x45',
//      size:{w:34,h:45,d:2000}, pos:{x:0,y:0,z:0}, rot:{x:0,y:0,z:0} },
//  ], joints: [
//    { type:'torx-butt', screw:'torx5x60', count:8 },
//  ] });
//  // r4.timber[0].sticks -> [{length:3600,count:3}]  (boughtLengthM 10.8)
//  // r4.screws -> [{ screw:'torx5x60', count:8, boxes:1, lineTotal:120 }]
//
//  // 5) Summary line shape:
//  // bomSummaryLine(r4) -> "6.0 m reglar · 8 screws · ~206 SEK"
// ============================================================================
