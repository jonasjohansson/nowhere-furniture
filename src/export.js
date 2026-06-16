// ============================================================================
// export.js — "GET IT OUT OF THE APP" OUTPUTS
// ----------------------------------------------------------------------------
// Pure-browser, zero-dependency export layer for the furniture-prototyping app.
// Produces: spreadsheet CSVs, a print-ready BOM HTML doc, sheet-nesting cut
// sheets (SVG), orthographic shop-drawing elevations (SVG), project save/load
// (JSON), and the low-level download/print helpers.
//
// CONTRACT (see stock.js):
//   PartSpec = { ref, name, material:'sheet'|'timber', stock,
//                size:{w,h,d} mm, pos, rot, group? }
//   BOM      = computeBOM() output (from bom.js — we CONSUME, never recompute):
//     {
//       sheets: [ { stock, label?, count, sheetSize?:{w,h},
//                   items?:[ { ref, name, w, h, x?, y?, rot? } ],
//                   areaM2?, cost? } ],
//       timber: [ { stock, label?, section?:{w,h}, count, lengthMm?,
//                   pieces?:[{ref,name,length}], cost? } ],
//       screws: [ { stock, label?, count, boxes?, cost? } ],
//       totals: { sheetCost, timberCost, screwCost, grandCost, currency,
//                 partCount, plyAreaM2, timberLengthM, screwCount },
//       warnings: [ ... ]
//     }
//
// All shapes are tolerated defensively — sections may be missing/empty, item
// placement coordinates may be absent (we self-pack for the cut-sheet visual).
//
// PURITY: no Date.now()/Math.random() anywhere — dates arrive as params, ids
// come from stock.js's deterministic uid(). SVGs carry xmlns so they open
// standalone. 1 SVG unit = 1 mm; an outer <g transform="scale(...)"> shrinks
// the whole drawing into a sensible viewBox (commented at each call site).
// ============================================================================

import { SHEETS, TIMBER, SCREWS, lengthOf, fmtSize, stockOf } from './stock.js?v=20';

// ----------------------------------------------------------------------------
// Tiny shared utilities
// ----------------------------------------------------------------------------

/** Escape a single CSV cell per RFC 4180: quote if it holds , " \n or \r. */
function csvCell(v) {
  const s = v === null || v === undefined ? '' : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Join an array of cells into a CSV row. */
function csvRow(cells) {
  return cells.map(csvCell).join(',');
}

/** HTML-escape text for safe interpolation into the print doc. */
function esc(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** XML-escape for SVG text nodes / attributes. */
function xesc(v) {
  return esc(v); // same entity set is valid in XML
}

/** Round to n decimals, returning a Number (no trailing-zero noise). */
function round(n, dec = 0) {
  if (!isFinite(n)) return 0;
  const f = Math.pow(10, dec);
  return Math.round(n * f) / f;
}

/** Format a money figure with a currency suffix. */
function money(n, currency = 'SEK') {
  return `${round(n || 0, 0)} ${currency}`;
}

/** Resolve a human label for a stock key, falling back to the key itself. */
function stockLabel(key) {
  const rec = stockOf(key);
  return (rec && rec.label) || key || '';
}

/** Safe array — always returns an iterable array. */
function arr(x) {
  return Array.isArray(x) ? x : [];
}

// ============================================================================
// 1. bomToCSV — spreadsheet-ready, sectioned CSV
// ============================================================================
/**
 * Render a BOM as a single CSV string with Sheets / Timber / Screws sections
 * and a TOTALS block. Blank lines separate sections so it imports cleanly.
 * @param {object} bom
 * @returns {string}
 */
export function bomToCSV(bom) {
  bom = bom || {};
  const totals = bom.totals || {};
  const currency = totals.currency || 'SEK';
  const lines = [];

  // --- Sheets section -------------------------------------------------------
  lines.push(csvRow(['SHEETS']));
  lines.push(csvRow(['Stock', 'Label', 'Sheets needed', 'Area (m²)', `Cost (${currency})`]));
  for (const s of arr(bom.sheets)) {
    lines.push(csvRow([
      s.stock || '',
      s.label || stockLabel(s.stock),
      s.count != null ? s.count : '',
      s.areaM2 != null ? round(s.areaM2, 2) : '',
      s.cost != null ? round(s.cost, 0) : '',
    ]));
  }
  lines.push('');

  // --- Timber section -------------------------------------------------------
  lines.push(csvRow(['TIMBER']));
  lines.push(csvRow(['Stock', 'Label', 'Section (mm)', 'Sticks needed', 'Total length (m)', `Cost (${currency})`]));
  for (const t of arr(bom.timber)) {
    const sec = t.section ? `${t.section.w}×${t.section.h}` : '';
    const lenM = t.lengthMm != null ? round(t.lengthMm / 1000, 2) : '';
    lines.push(csvRow([
      t.stock || '',
      t.label || stockLabel(t.stock),
      sec,
      t.count != null ? t.count : '',
      lenM,
      t.cost != null ? round(t.cost, 0) : '',
    ]));
  }
  lines.push('');

  // --- Screws section -------------------------------------------------------
  lines.push(csvRow(['SCREWS']));
  lines.push(csvRow(['Stock', 'Label', 'Screws needed', 'Boxes', `Cost (${currency})`]));
  for (const sc of arr(bom.screws)) {
    lines.push(csvRow([
      sc.stock || '',
      sc.label || stockLabel(sc.stock),
      sc.count != null ? sc.count : '',
      sc.boxes != null ? sc.boxes : '',
      sc.cost != null ? round(sc.cost, 0) : '',
    ]));
  }
  lines.push('');

  // --- Totals ---------------------------------------------------------------
  lines.push(csvRow(['TOTALS']));
  lines.push(csvRow(['Sheet cost', round(totals.sheetCost || 0, 0)]));
  lines.push(csvRow(['Timber cost', round(totals.timberCost || 0, 0)]));
  lines.push(csvRow(['Screw cost', round(totals.screwCost || 0, 0)]));
  lines.push(csvRow([`Grand total (${currency})`, round(totals.grandCost || 0, 0)]));
  lines.push(csvRow(['Part count', totals.partCount != null ? totals.partCount : '']));
  lines.push(csvRow(['Plywood area (m²)', totals.plyAreaM2 != null ? round(totals.plyAreaM2, 2) : '']));
  lines.push(csvRow(['Timber length (m)', totals.timberLengthM != null ? round(totals.timberLengthM, 2) : '']));
  lines.push(csvRow(['Screw count', totals.screwCount != null ? totals.screwCount : '']));

  return lines.join('\r\n');
}

// ============================================================================
// 2. partsToCSV — flat cut list grouped by identical part
// ============================================================================
/**
 * Flatten a PartSpec[] into a cut list, grouping identical parts
 * (same name + size + stock) and counting qty. Sorted by material then size.
 * Columns: ref, name, material, stock, w, h, d, length(mm), qty.
 * @param {PartSpec[]} parts
 * @returns {string}
 */
export function partsToCSV(parts) {
  const groups = new Map();
  for (const p of arr(parts)) {
    const size = p.size || { w: 0, h: 0, d: 0 };
    const w = round(size.w, 0), h = round(size.h, 0), d = round(size.d, 0);
    const key = [p.name || '', p.stock || '', w, h, d].join('|');
    let g = groups.get(key);
    if (!g) {
      g = {
        ref: p.ref || '',
        name: p.name || '',
        material: p.material || '',
        stock: p.stock || '',
        w, h, d,
        length: round(lengthOf(size), 0),
        qty: 0,
      };
      groups.set(key, g);
    } else if (!g.ref && p.ref) {
      g.ref = p.ref; // keep first non-empty ref seen
    }
    g.qty += 1;
  }

  const rows = [...groups.values()].sort((a, b) => {
    if (a.material !== b.material) return a.material < b.material ? -1 : 1;
    // then by descending footprint so big pieces lead the list
    const fa = a.w * a.h, fb = b.w * b.h;
    if (fa !== fb) return fb - fa;
    return a.length - b.length;
  });

  const out = [csvRow(['ref', 'name', 'material', 'stock', 'w', 'h', 'd', 'length(mm)', 'qty'])];
  for (const g of rows) {
    out.push(csvRow([g.ref, g.name, g.material, g.stock, g.w, g.h, g.d, g.length, g.qty]));
  }
  return out.join('\r\n');
}

// ============================================================================
// 3. bomToHTML — self-contained, print-ready A4 document
// ============================================================================
/**
 * Build a full standalone HTML document (light/clean, A4 print CSS) presenting
 * the BOM as: a merchant shopping list, the per-part cut list, the screw
 * schedule, a rough SEK total, and an optional "pieces" summary.
 *
 * @param {object} bom
 * @param {{ projectName?:string, date?:string, designer?:string,
 *           pieces?:Array<{name:string,qty:number}>|object,
 *           parts?:PartSpec[] }} meta
 *           date is passed IN (never Date.now here). `parts` (if given) drives
 *           the per-part cut list; otherwise we render from bom items/pieces.
 * @returns {string}
 */
export function bomToHTML(bom, meta) {
  bom = bom || {};
  meta = meta || {};
  const totals = bom.totals || {};
  const currency = totals.currency || 'SEK';
  const projectName = meta.projectName || 'Untitled project';
  const date = meta.date || '';
  const designer = meta.designer || '';

  // --- shopping list rows (sheets + timber + screws) ------------------------
  const shopSheetRows = arr(bom.sheets).map((s) => `
      <tr>
        <td>${esc(s.label || stockLabel(s.stock))}</td>
        <td class="num">${esc(s.count != null ? s.count : '')}</td>
        <td>${esc(s.sheetSize ? `${round(s.sheetSize.w)}×${round(s.sheetSize.h)} mm` : '2440×1220 mm')}</td>
        <td class="num">${s.cost != null ? esc(money(s.cost, currency)) : ''}</td>
      </tr>`).join('');

  const shopTimberRows = arr(bom.timber).map((t) => {
    const sec = t.section ? `${t.section.w}×${t.section.h} mm` : '';
    const lenM = t.lengthMm != null ? `${round(t.lengthMm / 1000, 2)} m` : '';
    return `
      <tr>
        <td>${esc(t.label || stockLabel(t.stock))}</td>
        <td class="num">${esc(t.count != null ? t.count : '')}</td>
        <td>${esc(sec)}${lenM ? ` &middot; ${esc(lenM)} total` : ''}</td>
        <td class="num">${t.cost != null ? esc(money(t.cost, currency)) : ''}</td>
      </tr>`;
  }).join('');

  // --- screw schedule -------------------------------------------------------
  const screwRows = arr(bom.screws).map((sc) => {
    const rec = SCREWS[sc.stock] || {};
    return `
      <tr>
        <td>${esc(sc.label || stockLabel(sc.stock))}</td>
        <td class="num">${esc(sc.count != null ? sc.count : '')}</td>
        <td class="num">${esc(sc.boxes != null ? sc.boxes : '')}</td>
        <td>${esc(rec.drive || '')}</td>
        <td>${esc(rec.pilot != null ? rec.pilot + ' mm' : '')}</td>
        <td class="num">${sc.cost != null ? esc(money(sc.cost, currency)) : ''}</td>
      </tr>`;
  }).join('');

  // --- per-part cut list ----------------------------------------------------
  // Prefer explicit parts; else reconstruct rows from sheet items + timber pieces.
  let cutRows = '';
  if (arr(meta.parts).length) {
    // Group identical parts, same logic as partsToCSV.
    const groups = new Map();
    for (const p of meta.parts) {
      const size = p.size || { w: 0, h: 0, d: 0 };
      const key = [p.name || '', p.stock || '', round(size.w), round(size.h), round(size.d)].join('|');
      let g = groups.get(key);
      if (!g) {
        g = { ref: p.ref || '', name: p.name || '', material: p.material || '',
              stock: p.stock || '', size, qty: 0 };
        groups.set(key, g);
      }
      g.qty += 1;
    }
    const list = [...groups.values()].sort((a, b) =>
      a.material === b.material ? 0 : (a.material < b.material ? -1 : 1));
    cutRows = list.map((g) => `
      <tr>
        <td>${esc(g.ref)}</td>
        <td>${esc(g.name)}</td>
        <td>${esc(g.material === 'sheet' ? 'Plywood' : g.material === 'timber' ? 'Timber' : g.material)}</td>
        <td>${esc(g.label || stockLabel(g.stock))}</td>
        <td class="num">${esc(fmtSize(g.size))} mm</td>
        <td class="num">${esc(lengthOf(g.size))}</td>
        <td class="num">${esc(g.qty)}</td>
      </tr>`).join('');
  } else {
    const rows = [];
    for (const s of arr(bom.sheets)) {
      for (const it of arr(s.items)) {
        rows.push(`
      <tr>
        <td>${esc(it.ref || '')}</td>
        <td>${esc(it.name || '')}</td>
        <td>Plywood</td>
        <td>${esc(s.label || stockLabel(s.stock))}</td>
        <td class="num">${esc(round(it.w))}×${esc(round(it.h))} mm</td>
        <td class="num">${esc(Math.max(round(it.w), round(it.h)))}</td>
        <td class="num">1</td>
      </tr>`);
      }
    }
    for (const t of arr(bom.timber)) {
      for (const pc of arr(t.pieces)) {
        rows.push(`
      <tr>
        <td>${esc(pc.ref || '')}</td>
        <td>${esc(pc.name || '')}</td>
        <td>Timber</td>
        <td>${esc(t.label || stockLabel(t.stock))}</td>
        <td class="num">${esc(t.section ? `${t.section.w}×${t.section.h}` : '')} mm</td>
        <td class="num">${esc(round(pc.length))}</td>
        <td class="num">1</td>
      </tr>`);
      }
    }
    cutRows = rows.join('');
  }
  if (!cutRows) {
    cutRows = `<tr><td colspan="7" class="empty">No parts in this design.</td></tr>`;
  }

  // --- optional "how many of each piece" summary ----------------------------
  let piecesBlock = '';
  if (meta.pieces) {
    const list = Array.isArray(meta.pieces)
      ? meta.pieces
      : Object.entries(meta.pieces).map(([name, qty]) => ({ name, qty }));
    if (list.length) {
      const rows = list.map((p) => `
        <tr><td>${esc(p.name)}</td><td class="num">${esc(p.qty)}</td></tr>`).join('');
      piecesBlock = `
    <section>
      <h2>Pieces</h2>
      <table class="grid">
        <thead><tr><th>Piece</th><th class="num">Qty</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </section>`;
    }
  }

  // --- warnings -------------------------------------------------------------
  const warnings = arr(bom.warnings);
  const warnBlock = warnings.length ? `
    <section class="warnings">
      <h2>Notes &amp; warnings</h2>
      <ul>${warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>
    </section>` : '';

  // --- totals strip ---------------------------------------------------------
  const grand = totals.grandCost != null
    ? totals.grandCost
    : (totals.sheetCost || 0) + (totals.timberCost || 0) + (totals.screwCost || 0);

  // --- assemble document ----------------------------------------------------
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(projectName)} — Bill of Materials</title>
<style>
  :root {
    --ink: #1a1a1a;
    --muted: #666;
    --line: #d8d8d8;
    --accent: #2b5d8a;
    --bg: #ffffff;
    --zebra: #f6f7f9;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font: 13px/1.45 -apple-system, "Helvetica Neue", Arial, sans-serif;
    color: var(--ink);
    background: var(--bg);
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .page { max-width: 800px; margin: 0 auto; padding: 28px 32px 48px; }
  header.doc {
    border-bottom: 2px solid var(--ink);
    padding-bottom: 12px;
    margin-bottom: 20px;
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    flex-wrap: wrap;
    gap: 8px;
  }
  header.doc h1 { font-size: 22px; margin: 0; letter-spacing: -0.01em; }
  header.doc .meta { color: var(--muted); font-size: 12px; text-align: right; }
  section { margin: 22px 0; page-break-inside: avoid; }
  h2 {
    font-size: 14px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--accent);
    border-bottom: 1px solid var(--line);
    padding-bottom: 4px;
    margin: 0 0 10px;
  }
  table.grid { width: 100%; border-collapse: collapse; font-size: 12px; }
  table.grid th, table.grid td {
    text-align: left;
    padding: 5px 8px;
    border-bottom: 1px solid var(--line);
    vertical-align: top;
  }
  table.grid thead th {
    background: var(--zebra);
    font-weight: 600;
    border-bottom: 1.5px solid var(--line);
  }
  table.grid tbody tr:nth-child(even) td { background: var(--zebra); }
  .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  td.empty { color: var(--muted); font-style: italic; text-align: center; }
  .totals {
    display: flex;
    gap: 24px;
    flex-wrap: wrap;
    background: var(--zebra);
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 12px 16px;
  }
  .totals .item { display: flex; flex-direction: column; }
  .totals .item .k { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
  .totals .item .v { font-size: 16px; font-weight: 600; }
  .totals .grand .v { color: var(--accent); }
  .warnings ul { margin: 0; padding-left: 18px; color: #8a5a00; }
  footer.doc { margin-top: 32px; color: var(--muted); font-size: 11px; border-top: 1px solid var(--line); padding-top: 8px; }
  @page { size: A4; margin: 14mm; }
  @media print {
    .page { max-width: none; padding: 0; }
    body { font-size: 11.5px; }
  }
</style>
</head>
<body>
<div class="page">
  <header class="doc">
    <h1>${esc(projectName)}</h1>
    <div class="meta">
      Bill of Materials${designer ? `<br>Design: ${esc(designer)}` : ''}${date ? `<br>${esc(date)}` : ''}
    </div>
  </header>

  <section>
    <h2>Shopping list — sheet goods</h2>
    <table class="grid">
      <thead><tr><th>Material</th><th class="num">Sheets</th><th>Sheet size</th><th class="num">Cost</th></tr></thead>
      <tbody>${shopSheetRows || `<tr><td colspan="4" class="empty">No plywood needed.</td></tr>`}</tbody>
    </table>
  </section>

  <section>
    <h2>Shopping list — timber</h2>
    <table class="grid">
      <thead><tr><th>Material</th><th class="num">Sticks</th><th>Section &amp; length</th><th class="num">Cost</th></tr></thead>
      <tbody>${shopTimberRows || `<tr><td colspan="4" class="empty">No timber needed.</td></tr>`}</tbody>
    </table>
  </section>

  <section>
    <h2>Cut list</h2>
    <table class="grid">
      <thead><tr>
        <th>Ref</th><th>Part</th><th>Material</th><th>Stock</th>
        <th class="num">Cut size</th><th class="num">Length (mm)</th><th class="num">Qty</th>
      </tr></thead>
      <tbody>${cutRows}</tbody>
    </table>
  </section>

  <section>
    <h2>Screw schedule</h2>
    <table class="grid">
      <thead><tr>
        <th>Screw</th><th class="num">Count</th><th class="num">Boxes</th>
        <th>Drive</th><th>Pilot</th><th class="num">Cost</th>
      </tr></thead>
      <tbody>${screwRows || `<tr><td colspan="6" class="empty">No screws scheduled.</td></tr>`}</tbody>
    </table>
  </section>
${piecesBlock}
  <section>
    <h2>Estimated cost</h2>
    <div class="totals">
      <div class="item"><span class="k">Sheets</span><span class="v">${esc(money(totals.sheetCost, currency))}</span></div>
      <div class="item"><span class="k">Timber</span><span class="v">${esc(money(totals.timberCost, currency))}</span></div>
      <div class="item"><span class="k">Screws</span><span class="v">${esc(money(totals.screwCost, currency))}</span></div>
      <div class="item grand"><span class="k">Grand total</span><span class="v">${esc(money(grand, currency))}</span></div>
    </div>
    <p style="color:var(--muted);font-size:11px;margin-top:8px;">
      Prices are rough builder's-merchant ballpark figures incl. VAT, for estimating only.
    </p>
  </section>
${warnBlock}
  <footer class="doc">
    Generated by Nowhere Furniture${date ? ` &middot; ${esc(date)}` : ''}. All dimensions in millimetres.
  </footer>
</div>
</body>
</html>`;
}

// ============================================================================
// 4. buildCutSheetSVG — sheet-nesting layout
// ============================================================================
/**
 * Draw the plywood nesting layout: one 2440×1220 outline per sheet needed,
 * to scale, with each placed part drawn as a labelled rectangle. Sheets are
 * stacked vertically and numbered.
 *
 * Placement source:
 *   - If a sheet entry carries `items` with x/y coordinates, we honour them.
 *   - If `items` exist WITHOUT coordinates, OR the BOM gives no items at all,
 *     we self-pack using a simple shelf (first-fit) algorithm purely for
 *     visualisation — this is NOT an optimiser, just a readable picture.
 *
 * @param {object} bom
 * @returns {string} standalone SVG
 */
export function buildCutSheetSVG(bom) {
  bom = bom || {};
  const PADDING = 60;          // px around the whole drawing (in mm-space pre-scale)
  const SHEET_GAP = 220;       // mm vertical gap between stacked sheets
  const scale = 0.12;          // 1 mm -> 0.12 px. A 2440mm sheet => ~293px wide.

  // Expand sheet groups into individual physical sheets to draw.
  // Each group { stock, count, sheetSize, items } -> `count` sheet panels.
  const panels = [];
  for (const grp of arr(bom.sheets)) {
    const sheetSize = grp.sheetSize ||
      (SHEETS[grp.stock] && SHEETS[grp.stock].sheet) ||
      { w: 2440, h: 1220 };
    const count = Math.max(1, grp.count || 1);
    const items = arr(grp.items);
    const haveCoords = items.length > 0 && items.every((it) => it.x != null && it.y != null);

    if (haveCoords) {
      // Coordinates provided per item. Group items by their sheet index if any,
      // else assume all on sheet 0 and replicate the outline `count` times.
      // We bucket by it.sheet (default 0).
      const buckets = new Map();
      for (const it of items) {
        const si = it.sheet != null ? it.sheet : 0;
        if (!buckets.has(si)) buckets.set(si, []);
        buckets.get(si).push(it);
      }
      const keys = [...buckets.keys()].sort((a, b) => a - b);
      const n = Math.max(count, keys.length);
      for (let i = 0; i < n; i++) {
        const placed = buckets.get(keys[i]) || (i === 0 ? items : []);
        panels.push({ stock: grp.stock, label: grp.label || stockLabel(grp.stock),
                      sheetSize, items: placed.map((it) => ({
                        ref: it.ref, name: it.name,
                        w: it.w, h: it.h, x: it.x, y: it.y, rot: it.rot || 0,
                      })) });
      }
    } else {
      // No usable coordinates: shelf-pack the items ourselves across `count`
      // sheets. If there are no items either, draw `count` empty outlines.
      const toPack = items.map((it) => ({
        ref: it.ref, name: it.name,
        w: round(it.w || 0), h: round(it.h || 0),
      })).filter((it) => it.w > 0 && it.h > 0);
      const packed = shelfPack(toPack, sheetSize, count);
      for (let i = 0; i < packed.length; i++) {
        panels.push({ stock: grp.stock, label: grp.label || stockLabel(grp.stock),
                      sheetSize, items: packed[i] });
      }
      // ensure at least `count` outlines even if nothing packed
      for (let i = packed.length; i < count; i++) {
        panels.push({ stock: grp.stock, label: grp.label || stockLabel(grp.stock),
                      sheetSize, items: [] });
      }
    }
  }

  if (!panels.length) {
    return emptySVG('No sheet goods in this design.');
  }

  // Layout: stack panels vertically. Compute total mm height/width.
  let maxW = 0;
  let totalH = 0;
  for (const p of panels) {
    maxW = Math.max(maxW, p.sheetSize.w);
    totalH += p.sheetSize.h + SHEET_GAP;
  }
  totalH += 40; // header line space at top
  const contentW = maxW;
  const contentH = totalH;

  // Pre-scaled viewBox dimensions.
  const vbW = (contentW * scale) + PADDING * 2;
  const vbH = (contentH * scale) + PADDING * 2;

  const body = [];
  // Outer group: translate by padding then scale mm->px so children draw in mm.
  body.push(`<g transform="translate(${PADDING},${PADDING}) scale(${scale})">`);

  let yCursor = 40; // mm
  let sheetNo = 0;
  for (const p of panels) {
    sheetNo++;
    const { w: sw, h: sh } = p.sheetSize;
    body.push(`<g transform="translate(0,${round(yCursor, 1)})">`);
    // Sheet outline
    body.push(`<rect x="0" y="0" width="${sw}" height="${sh}" fill="#ffffff" stroke="#333" stroke-width="6"/>`);
    // Sheet number + label (drawn above the outline)
    body.push(`<text x="0" y="-14" font-family="Helvetica,Arial,sans-serif" font-size="64" fill="#333">Sheet ${sheetNo} — ${xesc(p.label)} (${sw}×${sh} mm)</text>`);
    // Parts
    for (const it of arr(p.items)) {
      const iw = it.rot ? round(it.h) : round(it.w);
      const ih = it.rot ? round(it.w) : round(it.h);
      const x = round(it.x || 0, 1);
      const y = round(it.y || 0, 1);
      body.push(`<rect x="${x}" y="${y}" width="${iw}" height="${ih}" fill="#cfe2f3" stroke="#2b5d8a" stroke-width="4"/>`);
      const cx = x + iw / 2;
      const cy = y + ih / 2;
      const label = `${it.ref ? it.ref + '  ' : ''}${round(it.w)}×${round(it.h)}`;
      body.push(`<text x="${round(cx, 1)}" y="${round(cy, 1)}" font-family="Helvetica,Arial,sans-serif" font-size="48" fill="#1a1a1a" text-anchor="middle" dominant-baseline="middle">${xesc(label)}</text>`);
    }
    body.push(`</g>`);
    yCursor += sh + SHEET_GAP;
  }
  body.push(`</g>`);

  return svgDoc(vbW, vbH, body.join('\n'));
}

/**
 * Simple shelf (first-fit-decreasing-height) bin packer for VISUALISATION only.
 * Lays parts left-to-right into rows ("shelves"); starts a new shelf when the
 * row is full, a new sheet when the sheet is full. Returns an array of sheets,
 * each an array of placed items { ref, name, w, h, x, y }.
 *
 * @param {Array<{ref,name,w,h}>} items
 * @param {{w:number,h:number}} sheetSize
 * @param {number} minSheets  draw at least this many sheets
 */
function shelfPack(items, sheetSize, minSheets = 1) {
  const GAP = 6; // mm spacing between parts so labels read
  const SW = sheetSize.w, SH = sheetSize.h;
  // Sort by descending height for a tidier shelf pack.
  const sorted = [...items].sort((a, b) => b.h - a.h);

  const sheets = [];
  let cur = [];
  let shelfX = GAP, shelfY = GAP, shelfH = 0;

  for (const it of sorted) {
    // Item larger than a sheet: clamp so it still draws (visual only).
    const w = Math.min(it.w, SW - GAP * 2);
    const h = Math.min(it.h, SH - GAP * 2);
    // New shelf if it doesn't fit horizontally.
    if (shelfX + w + GAP > SW) {
      shelfY += shelfH + GAP;
      shelfX = GAP;
      shelfH = 0;
    }
    // New sheet if it doesn't fit vertically.
    if (shelfY + h + GAP > SH) {
      sheets.push(cur);
      cur = [];
      shelfX = GAP; shelfY = GAP; shelfH = 0;
    }
    cur.push({ ref: it.ref, name: it.name, w: it.w, h: it.h, x: shelfX, y: shelfY });
    shelfX += w + GAP;
    shelfH = Math.max(shelfH, h);
  }
  if (cur.length) sheets.push(cur);

  // Pad to minSheets with empty sheets.
  while (sheets.length < minSheets) sheets.push([]);
  return sheets;
}

// ============================================================================
// 5. buildElevationsSVG — orthographic shop drawings
// ============================================================================
/**
 * Project the whole assembly to three orthographic elevations from each part's
 * bounding box:
 *   - Front (XY): width vs height   (looking along +Z)
 *   - Side  (ZY): depth vs height   (looking along +X)
 *   - Top   (XZ): width vs depth    (looking down -Y)
 * Overall dimensions are labelled with dimension ticks. Line-art only.
 *
 * Each part's axis-aligned box is derived from pos (centre) ± size/2. Rotation
 * is treated coarsely: we use the axis-aligned extent of the cut size, which is
 * correct for the common 0/90° furniture cases and a reasonable approximation
 * otherwise (a true rotated hull is out of scope for a quick plan view).
 *
 * @param {PartSpec[]} parts
 * @returns {string} standalone SVG
 */
export function buildElevationsSVG(parts) {
  parts = arr(parts);
  if (!parts.length) return emptySVG('No parts to draw.');

  // Build axis-aligned boxes in world mm. y is up.
  const boxes = parts.map((p) => {
    const s = p.size || { w: 0, h: 0, d: 0 };
    const pos = p.pos || { x: 0, y: 0, z: 0 };
    // Treat size.w -> x, size.h -> y, size.d -> z. For 90° rotation about Y,
    // swap x/z extents so the plan still reads correctly.
    let ex = s.w, ey = s.h, ez = s.d;
    const ry = ((p.rot && p.rot.y) || 0) % 180;
    if (ry === 90 || ry === -90) { const t = ex; ex = ez; ez = t; }
    return {
      ref: p.ref || '',
      x0: pos.x - ex / 2, x1: pos.x + ex / 2,
      y0: pos.y - ey / 2, y1: pos.y + ey / 2,
      z0: pos.z - ez / 2, z1: pos.z + ez / 2,
    };
  });

  // Overall bounds.
  const bounds = boxes.reduce((b, k) => ({
    x0: Math.min(b.x0, k.x0), x1: Math.max(b.x1, k.x1),
    y0: Math.min(b.y0, k.y0), y1: Math.max(b.y1, k.y1),
    z0: Math.min(b.z0, k.z0), z1: Math.max(b.z1, k.z1),
  }), { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity });

  const W = round(bounds.x1 - bounds.x0);
  const H = round(bounds.y1 - bounds.y0);
  const D = round(bounds.z1 - bounds.z0);

  // --- Layout: three views side by side, each in its own mm-space cell. ------
  // We render each view as a sub-<g>, scaling that view's local mm to a fixed
  // pixel cell so the three sit cleanly in one row.
  const CELL_PX = 320;          // px allotted per view (square-ish)
  const MARGIN_PX = 30;         // px margin inside each cell
  const GAP_PX = 50;            // px between cells
  const LABEL_PX = 28;          // px reserved under each view for the title
  const DIM_PX = 26;            // px reserved for dimension lines (left/bottom)

  // A view = { title, uExtent(mm), vExtent(mm), draw rects mapping (u,v) }.
  // u = horizontal axis (mm), v = vertical axis (mm, but SVG y grows down so we
  // flip for "up" axes). Each returns rects [{x,y,w,h,ref}] in LOCAL mm where
  // origin is top-left of the view's bounding content.
  function mkView(title, uMin, uMax, vMin, vMax, pick, flipV) {
    const uE = uMax - uMin;
    const vE = vMax - vMin;
    const rects = boxes.map((k) => {
      const [a0, a1, b0, b1] = pick(k);
      const x = a0 - uMin;
      // flipV: world "up" axis -> SVG down. Map so larger world v is at top.
      const y = flipV ? (vMax - b1) : (b0 - vMin);
      return { x, y, w: a1 - a0, h: b1 - b0, ref: k.ref };
    });
    return { title, uE, vE, rects };
  }

  const views = [
    // Front (XY): u=x, v=y(up)
    mkView('Front (XY)', bounds.x0, bounds.x1, bounds.y0, bounds.y1,
      (k) => [k.x0, k.x1, k.y0, k.y1], true),
    // Side (ZY): u=z, v=y(up)
    mkView('Side (ZY)', bounds.z0, bounds.z1, bounds.y0, bounds.y1,
      (k) => [k.z0, k.z1, k.y0, k.y1], true),
    // Top (XZ): u=x, v=z. Looking down: keep z growing downward in SVG.
    mkView('Top (XZ)', bounds.x0, bounds.x1, bounds.z0, bounds.z1,
      (k) => [k.x0, k.x1, k.z0, k.z1], false),
  ];

  // Dimension labels per view: { uDim, vDim } in mm.
  const dims = [
    { u: W, v: H, uName: 'W', vName: 'H' },
    { u: D, v: H, uName: 'D', vName: 'H' },
    { u: W, v: D, uName: 'W', vName: 'D' },
  ];

  const drawW = CELL_PX * 3 + GAP_PX * 2 + 40;
  const drawH = CELL_PX + 40 + LABEL_PX;

  const body = [];
  body.push(`<text x="${drawW / 2}" y="26" font-family="Helvetica,Arial,sans-serif" font-size="18" fill="#1a1a1a" text-anchor="middle" font-weight="bold">Elevations — overall ${W} × ${H} × ${D} mm</text>`);

  views.forEach((view, i) => {
    const dim = dims[i];
    const cellX = 20 + i * (CELL_PX + GAP_PX);
    const cellY = 44;
    // Fit the view's mm extent into the inner drawing area (cell minus margins
    // and dimension gutters). Uniform scale keeps proportions true.
    const innerW = CELL_PX - MARGIN_PX * 2 - DIM_PX;
    const innerH = CELL_PX - MARGIN_PX * 2 - DIM_PX;
    const sc = Math.min(
      view.uE > 0 ? innerW / view.uE : innerW,
      view.vE > 0 ? innerH / view.vE : innerH
    );
    const contentW = view.uE * sc;
    const contentH = view.vE * sc;
    // origin of drawing content inside the cell (leave DIM_PX gutter L & B).
    const ox = cellX + MARGIN_PX + DIM_PX;
    const oy = cellY + MARGIN_PX;

    // Cell frame
    body.push(`<rect x="${cellX}" y="${cellY}" width="${CELL_PX}" height="${CELL_PX}" fill="#fcfcfc" stroke="#e0e0e0" stroke-width="1"/>`);

    // View group scales local mm -> px.
    body.push(`<g transform="translate(${round(ox, 2)},${round(oy, 2)}) scale(${round(sc, 5)})">`);
    for (const r of view.rects) {
      body.push(`<rect x="${round(r.x, 1)}" y="${round(r.y, 1)}" width="${round(r.w, 1)}" height="${round(r.h, 1)}" fill="none" stroke="#1a1a1a" stroke-width="${round(1.2 / sc, 3)}"/>`);
    }
    body.push(`</g>`);

    // Dimension lines (in px, around the content box).
    const bx0 = ox, bx1 = ox + contentW, by0 = oy, by1 = oy + contentH;
    const tick = 5;
    // bottom = u dimension
    body.push(dimLine(bx0, by1 + 14, bx1, by1 + 14, `${dim.uName} ${round(dim.u)} mm`, 'h', tick));
    // left = v dimension
    body.push(dimLine(bx0 - 14, by0, bx0 - 14, by1, `${dim.vName} ${round(dim.v)} mm`, 'v', tick));

    // Title under the cell
    body.push(`<text x="${cellX + CELL_PX / 2}" y="${cellY + CELL_PX + 22}" font-family="Helvetica,Arial,sans-serif" font-size="14" fill="#333" text-anchor="middle">${xesc(view.title)}</text>`);
  });

  return svgDoc(drawW, drawH, body.join('\n'));
}

/**
 * A dimension line with end ticks and a centred label. Coordinates in px.
 * dir 'h' = horizontal (label above the line), 'v' = vertical (label rotated).
 */
function dimLine(x1, y1, x2, y2, label, dir, tick = 5) {
  const col = '#888';
  const out = [];
  out.push(`<line x1="${round(x1, 1)}" y1="${round(y1, 1)}" x2="${round(x2, 1)}" y2="${round(y2, 1)}" stroke="${col}" stroke-width="0.75"/>`);
  if (dir === 'h') {
    out.push(`<line x1="${round(x1, 1)}" y1="${round(y1 - tick, 1)}" x2="${round(x1, 1)}" y2="${round(y1 + tick, 1)}" stroke="${col}" stroke-width="0.75"/>`);
    out.push(`<line x1="${round(x2, 1)}" y1="${round(y2 - tick, 1)}" x2="${round(x2, 1)}" y2="${round(y2 + tick, 1)}" stroke="${col}" stroke-width="0.75"/>`);
    const mx = (x1 + x2) / 2;
    out.push(`<text x="${round(mx, 1)}" y="${round(y1 + 16, 1)}" font-family="Helvetica,Arial,sans-serif" font-size="11" fill="${col}" text-anchor="middle">${xesc(label)}</text>`);
  } else {
    out.push(`<line x1="${round(x1 - tick, 1)}" y1="${round(y1, 1)}" x2="${round(x1 + tick, 1)}" y2="${round(y1, 1)}" stroke="${col}" stroke-width="0.75"/>`);
    out.push(`<line x1="${round(x2 - tick, 1)}" y1="${round(y2, 1)}" x2="${round(x2 + tick, 1)}" y2="${round(y2, 1)}" stroke="${col}" stroke-width="0.75"/>`);
    const my = (y1 + y2) / 2;
    out.push(`<text x="${round(x1 - 6, 1)}" y="${round(my, 1)}" font-family="Helvetica,Arial,sans-serif" font-size="11" fill="${col}" text-anchor="middle" transform="rotate(-90 ${round(x1 - 6, 1)} ${round(my, 1)})">${xesc(label)}</text>`);
  }
  return out.join('');
}

// ============================================================================
// 5b. buildExplodedSVG — every distinct piece drawn to scale + dimensioned,
//     followed by the numbered assembly steps. One self-contained build sheet.
// ============================================================================
/**
 * "Exploded" parts plate: group the PartSpec[] into distinct pieces (same name +
 * cut size + stock), draw each ONE to a shared scale with its broad face shown,
 * fully dimensioned (width, height, thickness) and badged with its quantity, in
 * a wrapping grid. Below the pieces, the design's assembly steps are listed.
 *
 * Shared scale across every piece so relative sizes read true at a glance — a
 * builder sees the whole kit of parts and how many of each, then the steps.
 *
 * @param {PartSpec[]} parts
 * @param {{ steps?:string[], name?:string }} [opts]
 * @returns {string} standalone SVG
 */
export function buildExplodedSVG(parts, opts = {}) {
  parts = arr(parts);
  if (!parts.length) return emptySVG('No parts to draw.');

  // --- group into distinct pieces ------------------------------------------
  const groups = new Map();
  for (const p of parts) {
    const s = p.size || { w: 0, h: 0, d: 0 };
    const w = round(s.w), h = round(s.h), d = round(s.d);
    const key = [p.name || '', p.stock || '', w, h, d].join('|');
    let g = groups.get(key);
    if (!g) {
      // Broad face = two largest dims; thickness = smallest.
      const dims = [w, h, d].sort((a, b) => b - a);
      g = { ref: p.ref || '', name: p.name || '', stock: p.stock || '',
            material: p.material || '', face: [dims[0], dims[1]], thick: dims[2], qty: 0 };
      groups.set(key, g);
    }
    g.qty += 1;
  }
  // Biggest pieces first.
  const pieces = [...groups.values()].sort((a, b) =>
    (b.face[0] * b.face[1]) - (a.face[0] * a.face[1]));

  // --- shared mm -> px scale ------------------------------------------------
  const maxDim = Math.max(1, ...pieces.map((g) => g.face[0]));
  const scale = Math.min(0.26, 240 / maxDim);   // cap so small kits don't balloon

  // --- layout constants (px) ------------------------------------------------
  const PAGE_W = 1040, MARGIN = 40;
  const TOP_LABEL = 26, LEFT_GUTTER = 40, BOTTOM_DIM = 34, CELL_PAD = 26;
  const COL_GAP = 34, ROW_GAP = 30;

  const title = opts.name ? `${opts.name} — pieces & assembly` : 'Pieces & assembly';

  const body = [];
  let y = MARGIN;

  // Title (skipped when the host document provides its own header).
  if (!opts.omitTitle) {
    body.push(`<text x="${MARGIN}" y="${y + 6}" font-size="22" font-weight="bold" fill="#1a1a1a">${xesc(title)}</text>`);
    const totalParts = parts.length, kinds = pieces.length;
    body.push(`<text x="${PAGE_W - MARGIN}" y="${y + 6}" font-size="13" fill="#666" text-anchor="end">${kinds} distinct pieces · ${totalParts} parts total · mm</text>`);
    y += 34;
    body.push(`<line x1="${MARGIN}" y1="${y}" x2="${PAGE_W - MARGIN}" y2="${y}" stroke="#1a1a1a" stroke-width="1.5"/>`);
    y += 22;
  } else {
    y += 6;
  }

  // --- isometric exploded view (one unit) -----------------------------------
  body.push(`<text x="${MARGIN}" y="${y}" font-size="15" font-weight="bold" fill="#2b5d8a">Exploded view${parts.some((p) => /^U\d+-/.test(p.ref || '')) ? ' (one unit)' : ''}</text>`);
  y += 16;
  const iso = isoExplodedBlock(parts, MARGIN, y, PAGE_W - MARGIN * 2);
  body.push(...iso.body);
  y += iso.height + 44;

  // --- pieces grid ----------------------------------------------------------
  body.push(`<line x1="${MARGIN}" y1="${y}" x2="${PAGE_W - MARGIN}" y2="${y}" stroke="#d8d8d8" stroke-width="1"/>`);
  y += 24;
  body.push(`<text x="${MARGIN}" y="${y}" font-size="15" font-weight="bold" fill="#2b5d8a">Pieces</text>`);
  y += 26;
  let x = MARGIN, rowH = 0;
  for (const g of pieces) {
    const rw = g.face[0] * scale, rh = g.face[1] * scale;
    const cellW = LEFT_GUTTER + rw + CELL_PAD;
    const cellH = TOP_LABEL + rh + BOTTOM_DIM;
    if (x + cellW > PAGE_W - MARGIN) { x = MARGIN; y += rowH + ROW_GAP; rowH = 0; }

    const rx = x + LEFT_GUTTER, ry = y + TOP_LABEL;

    // header: ref + name + qty badge
    const head = `${g.ref ? g.ref + '  ' : ''}${g.name}`;
    body.push(`<text x="${round(x, 1)}" y="${round(y + 16, 1)}" font-size="13" font-weight="600" fill="#1a1a1a">${xesc(head)}</text>`);
    body.push(`<text x="${round(x + cellW, 1)}" y="${round(y + 16, 1)}" font-size="13" font-weight="700" fill="#2b5d8a" text-anchor="end">×${g.qty}</text>`);

    // the piece (broad face), plywood-blue fill like the cut sheet
    body.push(`<rect x="${round(rx, 1)}" y="${round(ry, 1)}" width="${round(rw, 1)}" height="${round(rh, 1)}" fill="#cfe2f3" stroke="#2b5d8a" stroke-width="1.5"/>`);
    // thickness note, centred on the face
    body.push(`<text x="${round(rx + rw / 2, 1)}" y="${round(ry + rh / 2, 1)}" font-size="12" fill="#1a1a1a" text-anchor="middle" dominant-baseline="middle">t = ${g.thick} mm${g.material === 'sheet' ? ' ply' : ''}</text>`);

    // width dim (bottom) + height dim (left)
    body.push(dimLine(rx, ry + rh + 12, rx + rw, ry + rh + 12, `${g.face[0]} mm`, 'h', 5));
    body.push(dimLine(rx - 12, ry, rx - 12, ry + rh, `${g.face[1]} mm`, 'v', 5));

    x += cellW + COL_GAP;
    rowH = Math.max(rowH, cellH);
  }
  y += rowH + 40;

  // --- assembly steps -------------------------------------------------------
  const steps = opts.omitSteps ? [] : arr(opts.steps);
  if (steps.length) {
    body.push(`<line x1="${MARGIN}" y1="${y}" x2="${PAGE_W - MARGIN}" y2="${y}" stroke="#d8d8d8" stroke-width="1"/>`);
    y += 26;
    body.push(`<text x="${MARGIN}" y="${y}" font-size="15" font-weight="bold" fill="#2b5d8a">Assembly steps</text>`);
    y += 24;
    const maxChars = Math.floor((PAGE_W - MARGIN * 2 - 26) / 7.3); // ~7.3px per char at 13px
    steps.forEach((s, i) => {
      const lines = wrapLines(`${i + 1}. ${s}`, maxChars);
      lines.forEach((ln, li) => {
        const tx = MARGIN + (li === 0 ? 0 : 22); // hang-indent continuation lines
        body.push(`<text x="${tx}" y="${round(y, 1)}" font-size="13" fill="#1a1a1a">${xesc(ln)}</text>`);
        y += 19;
      });
      y += 5;
    });
  }

  y += MARGIN;
  return svgDoc(PAGE_W, y, body.join('\n'));
}

// ============================================================================
// 5c. buildFullDocHTML — ONE print-ready document with everything
//     (exploded view + cut sheets + shopping list + cut list + screws + cost).
//     Print it and "Save as PDF" → a single PDF build sheet.
// ============================================================================
/**
 * @param {object} bom  computeBOM() output
 * @param {{ parts?:PartSpec[], steps?:string[], name?:string, designer?:string, date?:string }} meta
 * @returns {string} standalone, print-ready HTML document
 */
export function buildFullDocHTML(bom, meta = {}) {
  bom = bom || {};
  const totals = bom.totals || {};
  const currency = totals.currency || 'SEK';
  const name = meta.name || meta.projectName || 'Nowhere build';
  const date = meta.date || '';
  const designer = meta.designer || '';
  const parts = arr(meta.parts);

  // Exploded + dimensioned pieces drawing (the doc supplies its own title/header
  // and renders the steps as readable HTML below, so omit both from the SVG).
  const explodedSVG = buildExplodedSVG(parts, { name, omitTitle: true, omitSteps: true });

  // Cut-sheet nesting: the BOM's sheet items carry no draw coordinates, so feed
  // the cut-sheet packer the sheet PARTS directly (broad face w×h) and let it
  // shelf-pack a real layout across the sheetsNeeded count.
  const sheetGroups = new Map();
  for (const p of parts) {
    if (p.material !== 'sheet') continue;
    const s = p.size || { w: 0, h: 0, d: 0 };
    const dims = [round(s.w), round(s.h), round(s.d)].sort((a, b) => b - a);
    const key = p.stock || '';
    if (!sheetGroups.has(key)) sheetGroups.set(key, []);
    sheetGroups.get(key).push({ ref: p.ref || '', name: p.name || '', w: dims[0], h: dims[1] });
  }
  const cutSheets = [...sheetGroups.entries()].map(([stock, items]) => {
    const b = arr(bom.sheets).find((s) => s.stock === stock) || {};
    const sheetSize = b.sheetSize || (SHEETS[stock] && SHEETS[stock].sheet) || { w: 2440, h: 1220 };
    return { stock, label: b.label || stockLabel(stock), sheetSize, count: b.sheetsNeeded || 1, items };
  });
  const cutSVG = buildCutSheetSVG({ sheets: cutSheets });

  // --- shopping list rows (real bom.js field names) -------------------------
  const sheetRows = arr(bom.sheets).map((s) => `
        <tr><td>${esc(s.label || stockLabel(s.stock))}</td>
          <td class="num">${esc(s.sheetsNeeded != null ? s.sheetsNeeded : '')}</td>
          <td>${esc(s.sheetSize ? `${round(s.sheetSize.w)}×${round(s.sheetSize.h)} mm` : '2440×1220 mm')}</td>
          <td class="num">${s.lineTotal != null ? esc(money(s.lineTotal, currency)) : ''}</td></tr>`).join('');
  const timberRows = arr(bom.timber).map((t) => {
    const sticks = (t.sticks || []).reduce((n, s) => n + (s.count || 0), 0);
    const sec = t.section ? `${t.section.w}×${t.section.h} mm` : '';
    const lenM = t.totalLengthM != null ? `${t.totalLengthM} m` : '';
    return `
        <tr><td>${esc(t.label || stockLabel(t.stock))}</td>
          <td class="num">${esc(sticks || '')}</td>
          <td>${esc(sec)}${lenM ? ` &middot; ${esc(lenM)} total` : ''}</td>
          <td class="num">${t.lineTotal != null ? esc(money(t.lineTotal, currency)) : ''}</td></tr>`;
  }).join('');
  const screwRows = arr(bom.screws).map((sc) => {
    const rec = SCREWS[sc.screw] || {};
    return `
        <tr><td>${esc(sc.label || sc.screw || '')}</td>
          <td class="num">${esc(sc.count != null ? sc.count : '')}</td>
          <td class="num">${esc(sc.boxes != null ? sc.boxes : '')}</td>
          <td>${esc(rec.drive || '')}</td>
          <td class="num">${sc.lineTotal != null ? esc(money(sc.lineTotal, currency)) : ''}</td></tr>`;
  }).join('');

  // --- cut list (grouped identical parts) -----------------------------------
  const groups = new Map();
  for (const p of parts) {
    const s = p.size || { w: 0, h: 0, d: 0 };
    const key = [p.name || '', p.stock || '', round(s.w), round(s.h), round(s.d)].join('|');
    let g = groups.get(key);
    if (!g) { g = { name: p.name || '', material: p.material || '', size: s, qty: 0 }; groups.set(key, g); }
    g.qty += 1;
  }
  const cutRows = [...groups.values()]
    .sort((a, b) => (a.material === b.material ? 0 : a.material < b.material ? -1 : 1))
    .map((g) => `
        <tr><td>${esc(g.name)}</td>
          <td>${esc(g.material === 'sheet' ? 'Plywood' : g.material === 'timber' ? 'Timber' : g.material)}</td>
          <td class="num">${esc(fmtSize(g.size))} mm</td>
          <td class="num">${esc(g.qty)}</td></tr>`).join('');

  const grand = totals.grandCost != null ? totals.grandCost
    : (totals.sheetCost || 0) + (totals.timberCost || 0) + (totals.screwCost || 0);

  // Steps + notes as readable HTML (their own page), not baked into the drawing.
  const stepsHTML = arr(meta.steps).map((s) => `<li>${esc(s)}</li>`).join('');
  const notesHTML = arr(meta.notes).map((n) => `<li>${esc(n)}</li>`).join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(name)} — Build sheet</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font: 13px/1.45 -apple-system, "Helvetica Neue", Arial, sans-serif; color: #1a1a1a;
    -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { max-width: 860px; margin: 0 auto; padding: 28px 32px 48px; }
  header.doc { border-bottom: 2px solid #1a1a1a; padding-bottom: 12px; margin-bottom: 18px;
    display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 8px; }
  header.doc h1 { font-size: 22px; margin: 0; }
  header.doc .meta { color: #666; font-size: 12px; text-align: right; }
  section { margin: 20px 0; page-break-inside: avoid; }
  section.brk { break-before: page; page-break-before: always; }
  section.figure { page-break-inside: auto; }
  h2 { font-size: 14px; text-transform: uppercase; letter-spacing: .06em; color: #2b5d8a;
    border-bottom: 1px solid #d8d8d8; padding-bottom: 4px; margin: 0 0 12px; }
  .figure svg { width: 100%; height: auto; display: block; margin: 0 auto; }
  ol.steps { font-size: 15px; line-height: 1.6; padding-left: 26px; margin: 0; }
  ol.steps li { margin-bottom: 12px; }
  ul.notes { font-size: 13px; line-height: 1.55; color: #444; padding-left: 22px; margin: 10px 0 0; }
  ul.notes li { margin-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { text-align: left; padding: 5px 8px; border-bottom: 1px solid #e2e2e2; vertical-align: top; }
  thead th { background: #f6f7f9; font-weight: 600; }
  tbody tr:nth-child(even) td { background: #f6f7f9; }
  .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .totals { display: flex; gap: 24px; flex-wrap: wrap; background: #f6f7f9; border: 1px solid #e2e2e2;
    border-radius: 6px; padding: 12px 16px; }
  .totals .item { display: flex; flex-direction: column; }
  .totals .k { color: #666; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; }
  .totals .v { font-size: 16px; font-weight: 600; }
  .totals .grand .v { color: #2b5d8a; }
  footer.doc { margin-top: 28px; color: #666; font-size: 11px; border-top: 1px solid #d8d8d8; padding-top: 8px; }
  @page { size: A4; margin: 12mm; }
  @media print { .page { max-width: none; padding: 0; } }
</style>
</head>
<body>
<div class="page">
  <header class="doc">
    <h1>${esc(name)}</h1>
    <div class="meta">Build sheet${designer ? `<br>Design: ${esc(designer)}` : ''}${date ? `<br>${esc(date)}` : ''}</div>
  </header>

  <section class="figure">
    <h2>Exploded view &amp; pieces</h2>
    ${explodedSVG}
  </section>

  <section class="brk">
    <h2>Assembly steps</h2>
    <ol class="steps">${stepsHTML || '<li style="color:#999">No steps.</li>'}</ol>
    ${notesHTML ? `<h2 style="margin-top:22px">Engineering notes</h2><ul class="notes">${notesHTML}</ul>` : ''}
  </section>

  <section class="figure brk"><h2>Cut sheets — plywood nesting</h2>${cutSVG}</section>

  <section class="brk">
    <h2>Shopping list — sheet goods</h2>
    <table><thead><tr><th>Material</th><th class="num">Sheets</th><th>Sheet size</th><th class="num">Cost</th></tr></thead>
      <tbody>${sheetRows || `<tr><td colspan="4" style="color:#999">No plywood needed.</td></tr>`}</tbody></table>
  </section>

  <section>
    <h2>Shopping list — timber</h2>
    <table><thead><tr><th>Material</th><th class="num">Sticks</th><th>Section &amp; length</th><th class="num">Cost</th></tr></thead>
      <tbody>${timberRows || `<tr><td colspan="4" style="color:#999">No timber needed.</td></tr>`}</tbody></table>
  </section>

  <section>
    <h2>Cut list</h2>
    <table><thead><tr><th>Part</th><th>Material</th><th class="num">Cut size</th><th class="num">Qty</th></tr></thead>
      <tbody>${cutRows || `<tr><td colspan="4" style="color:#999">No parts.</td></tr>`}</tbody></table>
  </section>

  <section>
    <h2>Screw schedule</h2>
    <table><thead><tr><th>Screw</th><th class="num">Count</th><th class="num">Boxes</th><th>Drive</th><th class="num">Cost</th></tr></thead>
      <tbody>${screwRows || `<tr><td colspan="5" style="color:#999">No screws.</td></tr>`}</tbody></table>
  </section>

  <section>
    <h2>Estimated cost</h2>
    <div class="totals">
      <div class="item"><span class="k">Sheets</span><span class="v">${esc(money(totals.sheetCost, currency))}</span></div>
      <div class="item"><span class="k">Timber</span><span class="v">${esc(money(totals.timberCost, currency))}</span></div>
      <div class="item"><span class="k">Screws</span><span class="v">${esc(money(totals.screwCost, currency))}</span></div>
      <div class="item grand"><span class="k">Grand total</span><span class="v">${esc(money(grand, currency))}</span></div>
    </div>
    <p style="color:#666;font-size:11px;margin-top:8px;">Rough builder's-merchant estimate incl. VAT, for planning only.</p>
  </section>

  <footer class="doc">Nowhere Furniture${date ? ` &middot; ${esc(date)}` : ''}. All dimensions in millimetres.</footer>
</div>
</body>
</html>`;
}

// ----------------------------------------------------------------------------
// Isometric exploded-view helpers
// ----------------------------------------------------------------------------

/** If the parts carry unit refs (U1-, U2- …), keep only the first unit so the
 *  exploded diagram shows ONE assembly, not the whole repeated row. */
function firstUnitParts(parts) {
  const hasUnits = parts.some((p) => /^U\d+-/.test(p.ref || ''));
  return hasUnits ? parts.filter((p) => /^U1-/.test(p.ref || '')) : parts;
}

/** Shade a hex-int colour by a factor (0..1) -> "#rrggbb". */
function shadeHex(colorInt, f) {
  const c = (colorInt == null) ? 0xcfe2f3 : colorInt;
  const r = Math.round(((c >> 16) & 255) * f);
  const g = Math.round(((c >> 8) & 255) * f);
  const b = Math.round((c & 255) * f);
  const h = (v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

/**
 * Build an isometric EXPLODED assembly diagram of one unit: each part is pushed
 * radially out from the assembly centroid (so tops lift, legs drop & spread,
 * rails sit mid) and drawn as a shaded iso box in its own colour, with a dashed
 * guide line back toward where it seats. Returns { body, height } laid out from
 * (ox, oy), centred within `maxW` px.
 *
 * @param {PartSpec[]} parts
 * @param {number} ox  left px
 * @param {number} oy  top px
 * @param {number} maxW available width px
 * @returns {{body:string[], height:number}}
 */
function isoExplodedBlock(parts, ox, oy, maxW) {
  const sel = firstUnitParts(parts);
  if (!sel.length) return { body: [], height: 0 };

  // Axis-aligned boxes (handle 90° Y-rotation by swapping x/z extents).
  const boxes = sel.map((p) => {
    const s = p.size || { w: 0, h: 0, d: 0 };
    const pos = p.pos || { x: 0, y: 0, z: 0 };
    let ex = s.w, ey = s.h, ez = s.d;
    const ry = ((p.rot && p.rot.y) || 0) % 180;
    if (ry === 90 || ry === -90) { const t = ex; ex = ez; ez = t; }
    return { name: p.name || '', color: p.color, cx: pos.x, cy: pos.y, cz: pos.z, ex, ey, ez };
  });

  // Centroid, then explode each part outward from it.
  const cen = boxes.reduce((a, b) => ({ x: a.x + b.cx, y: a.y + b.cy, z: a.z + b.cz }), { x: 0, y: 0, z: 0 });
  cen.x /= boxes.length; cen.y /= boxes.length; cen.z /= boxes.length;
  const EX = 1.15; // explosion amount (1 = double the offset from centre)
  for (const b of boxes) {
    b.dx = cen.x + (b.cx - cen.x) * (1 + EX);
    b.dy = cen.y + (b.cy - cen.y) * (1 + EX);
    b.dz = cen.z + (b.cz - cen.z) * (1 + EX);
  }

  // Isometric projection (y up). Returns mm-space screen coords (pre-scale).
  const C = 0.866, S = 0.5;
  const pr = (x, y, z) => ({ X: (x - z) * C, Y: (x + z) * S - y });

  // Bounds over every projected corner so we can scale to fit.
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const b of boxes) {
    const xs = [b.dx - b.ex / 2, b.dx + b.ex / 2];
    const ys = [b.dy - b.ey / 2, b.dy + b.ey / 2];
    const zs = [b.dz - b.ez / 2, b.dz + b.ez / 2];
    for (const X of xs) for (const Y of ys) for (const Z of zs) {
      const q = pr(X, Y, Z);
      minX = Math.min(minX, q.X); maxX = Math.max(maxX, q.X);
      minY = Math.min(minY, q.Y); maxY = Math.max(maxY, q.Y);
    }
  }
  const wmm = Math.max(1, maxX - minX), hmm = Math.max(1, maxY - minY);
  const sc = Math.min(maxW / wmm, 380 / hmm);   // fit width, cap height ~380px
  const contentW = wmm * sc, contentH = hmm * sc;
  const padX = ox + (maxW - contentW) / 2;       // centre horizontally
  // Map a mm-space screen point to final px.
  const toPx = (q) => ({ x: padX + (q.X - minX) * sc, y: oy + (q.Y - minY) * sc });

  const body = [];

  // Dashed guide lines from seated centre -> exploded centre (drawn behind).
  for (const b of boxes) {
    const a = toPx(pr(b.cx, b.cy, b.cz));
    const d = toPx(pr(b.dx, b.dy, b.dz));
    body.push(`<line x1="${round(a.x, 1)}" y1="${round(a.y, 1)}" x2="${round(d.x, 1)}" y2="${round(d.y, 1)}" stroke="#bbb" stroke-width="1" stroke-dasharray="4 4"/>`);
  }

  // Painter's order: far (small x+y+z) first.
  boxes.sort((a, b) => (a.dx + a.dy + a.dz) - (b.dx + b.dy + b.dz));

  const poly = (pts, fill) =>
    `<polygon points="${pts.map((p) => `${round(p.x, 1)},${round(p.y, 1)}`).join(' ')}" fill="${fill}" stroke="#1a1a1a" stroke-width="1" stroke-linejoin="round"/>`;

  for (const b of boxes) {
    const x0 = b.dx - b.ex / 2, x1 = b.dx + b.ex / 2;
    const y0 = b.dy - b.ey / 2, y1 = b.dy + b.ey / 2;
    const z0 = b.dz - b.ez / 2, z1 = b.dz + b.ez / 2;
    const P = (x, y, z) => toPx(pr(x, y, z));
    // three visible faces: top (y1), right (x1), front (z1)
    body.push(poly([P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1)], shadeHex(b.color, 1.0)));   // top
    body.push(poly([P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), P(x1, y0, z1)], shadeHex(b.color, 0.80)));  // right
    body.push(poly([P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)], shadeHex(b.color, 0.62)));  // front
  }

  return { body, height: contentH };
}

/** Greedy word-wrap into lines of at most `maxChars` characters. */
function wrapLines(text, maxChars) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if (!cur) { cur = w; continue; }
    if ((cur + ' ' + w).length > maxChars) { lines.push(cur); cur = w; }
    else cur += ' ' + w;
  }
  if (cur) lines.push(cur);
  return lines;
}

// ----------------------------------------------------------------------------
// SVG document helpers
// ----------------------------------------------------------------------------

/** Wrap body markup in a standalone, namespaced SVG of the given px size. */
function svgDoc(w, h, body) {
  const W = round(w, 1), H = round(h, 1);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Helvetica,Arial,sans-serif">
<rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff"/>
${body}
</svg>`;
}

/** A small standalone SVG that just shows a message (empty-state). */
function emptySVG(msg) {
  return svgDoc(420, 120, `<text x="210" y="64" font-size="16" fill="#888" text-anchor="middle">${xesc(msg)}</text>`);
}

// ============================================================================
// 6. downloadFile — Blob + anchor download helper
// ============================================================================
/**
 * Trigger a browser download of `content` as `filename`.
 * @param {string} filename
 * @param {string|Blob} content
 * @param {string} [mime='text/plain']
 */
export function downloadFile(filename, content, mime = 'text/plain') {
  const blob = content instanceof Blob
    ? content
    : new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  // Defer revocation so the download has time to start.
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);
}

// ============================================================================
// 7. Project save / load (JSON)
// ============================================================================
/**
 * Serialise the full project and trigger a .json download.
 * @param {{ design?:object, params?:object, parts?:PartSpec[] }} state
 * @param {string} [filename]  defaults to 'project.json' (no Date.now here)
 */
export function exportProjectJSON(state, filename = 'project.json') {
  const payload = {
    format: 'nowhere-furniture/project',
    version: 1,
    design: (state && state.design) || null,
    params: (state && state.params) || {},
    parts: arr(state && state.parts),
  };
  downloadFile(filename, JSON.stringify(payload, null, 2), 'application/json');
  return payload;
}

/**
 * Read a project .json File (from an <input type=file>) back into state.
 * @param {File} file
 * @returns {Promise<{ design:object, params:object, parts:PartSpec[] }>}
 */
export function readProjectJSON(file) {
  return new Promise((resolve, reject) => {
    if (!file) { reject(new Error('No file provided')); return; }
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        if (data && data.format && data.format !== 'nowhere-furniture/project') {
          // Not our format — still try to salvage the obvious fields.
          // (Don't hard-fail: keep load forgiving.)
        }
        resolve({
          design: data.design || null,
          params: data.params || {},
          parts: Array.isArray(data.parts) ? data.parts : [],
        });
      } catch (err) {
        reject(new Error('Invalid project file: ' + err.message));
      }
    };
    reader.readAsText(file);
  });
}

// ============================================================================
// 8. printHTML — open a print-ready doc in a new window and print it
// ============================================================================
/**
 * Open the given HTML document string in a new window and invoke print().
 * Falls back to a Blob URL if document.write is blocked. The caller supplies a
 * fully-formed document (e.g. from bomToHTML).
 * @param {string} htmlString
 * @returns {Window|null} the opened window, or null if popups were blocked
 */
export function printHTML(htmlString) {
  const win = window.open('', '_blank');
  if (!win) {
    // Popup blocked: fall back to a Blob URL the user can print manually.
    const blob = new Blob([htmlString], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    return null;
  }
  win.document.open();
  win.document.write(htmlString);
  win.document.close();
  // Wait for layout/fonts before printing.
  const fire = () => { try { win.focus(); win.print(); } catch (e) { /* ignore */ } };
  if (win.document.readyState === 'complete') {
    setTimeout(fire, 150);
  } else {
    win.onload = () => setTimeout(fire, 150);
  }
  return win;
}
