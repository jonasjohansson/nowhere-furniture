import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CNC_SLOT } from '../src/designs/cnc_slot.js?v=22';
import { INTERLOCK } from '../src/designs/interlock.js?v=22';
import { buildCutSheetSVG, buildFullDocHTML } from '../src/export.js?v=22';
import { computeBOM } from '../src/bom.js?v=22';
import { CATALOG } from '../src/catalog.js?v=22';

// Build a design to its default parameters.
const build = (catalog, id) => {
  const d = catalog.find((x) => x.id === id);
  const p = Object.fromEntries(d.params.map((x) => [x.key, x.default]));
  return d.build(p);
};

// Turn a PartSpec[] into a single-sheet BOM payload the cut-sheet packer accepts,
// carrying each sheet part's broad-face w×h PLUS its profile/slots (so true
// outlines can be drawn). Mirrors buildFullDocHTML's feed, with profile passthrough.
const sheetBom = (parts) => {
  const items = parts
    .filter((p) => p.material === 'sheet')
    .map((p) => {
      const s = p.size || { w: 0, h: 0, d: 0 };
      const dims = [s.w, s.h, s.d].sort((a, b) => b - a);
      return {
        ref: p.ref, name: p.name,
        w: dims[0], h: dims[1],
        profile: p.profile, slots: p.slots,
      };
    });
  return { sheets: [{ stock: 'ply18', label: 'Ply 18mm', sheetSize: { w: 2440, h: 1220 }, count: 1, items }] };
};

test('cut-sheet SVG draws profile parts as <path>, not just <rect>', () => {
  const { parts } = build(CNC_SLOT, 'cnc-slot-oval-rocker'); // all 4 parts are profiles w/ arcs
  const svg = buildCutSheetSVG(sheetBom(parts));
  assert.match(svg, /<path/, 'profile parts emit a <path> outline');
  // and the path uses arc commands for the oval (A) — the rocker ovals are curved
  assert.ok(/[ ,]A[ \d.-]/.test(svg) || /\bA\d/.test(svg), 'oval outline uses SVG arc commands');
});

test('cut-sheet SVG still emits <rect> for box parts', () => {
  const { parts } = build(INTERLOCK, 'board-stool'); // all sheet parts are plain boxes (no profile)
  const svg = buildCutSheetSVG(sheetBom(parts));
  assert.match(svg, /<rect/, 'box parts still render as <rect>');
  // No part has a profile, so the only paths (if any) would be from outlines — assert none.
  assert.ok(!/<path[^>]*class="part-outline"/.test(svg), 'box parts do not get a profile outline path');
});

test('profile slots appear in the cut sheet', () => {
  const { parts } = build(CNC_SLOT, 'cnc-slot-bench');
  // the bench has slotted profile parts (ends, seat, stretcher)
  const slotted = parts.filter((p) => p.material === 'sheet' && (p.slots || []).length);
  assert.ok(slotted.length > 0, 'fixture has slotted parts');
  const svg = buildCutSheetSVG(sheetBom(parts));
  // slots are drawn as their own marked cutout elements
  assert.match(svg, /class="slot"/, 'slot geometry is drawn with a slot marker');
});

// --- Integration: the REAL export chain (computeBOM → buildFullDocHTML) -------
// These exercise the actual app path (app.js 'pdf' case), not a hand-made fixture.

test('full build sheet (real path) draws profile outlines + slots for a CNC design', () => {
  const built = build(CNC_SLOT, 'cnc-slot-oval-rocker');
  const bom = computeBOM(built);
  const html = buildFullDocHTML(bom, {
    name: 'Oval Rocker', parts: built.parts, steps: built.steps, notes: built.notes,
  });
  assert.match(html, /<path/, 'real export emits profile <path> outlines');
  assert.ok(/ A \d/.test(html) || /\bA \d/.test(html), 'real export uses SVG arc commands for the ovals');
  assert.match(html, /class="slot"/, 'real export draws slot cutouts');
  assert.match(html, /class="part-outline"/, 'real export draws true part outlines');
});

test('full build sheet (real path) surfaces slot-together joinery for a screwless design', () => {
  const built = build(CNC_SLOT, 'cnc-slot-bench');   // slots + driven wedges, no screws
  const bom = computeBOM(built);
  assert.ok((bom.joinery && bom.joinery.slotEngagements) > 0, 'BOM reports slot engagements');
  const html = buildFullDocHTML(bom, { name: 'Slab Trestle Bench', parts: built.parts, steps: built.steps });
  assert.match(html, /Slot-together joinery/, 'joinery section appears in the real export');
  assert.match(html, /Cross-lap \/ housing slot engagements/, 'slot-engagement line shown');
});

test('full build sheet (real path) keeps <rect> and no outline path for box designs', () => {
  const d = CATALOG.find((x) => x.id === 'board-stool');
  const params = Object.fromEntries(d.params.map((x) => [x.key, x.default]));
  const built = d.build(params);
  const bom = computeBOM(built);
  const html = buildFullDocHTML(bom, { name: 'Board Stool', parts: built.parts, steps: built.steps });
  assert.match(html, /<rect/, 'box parts still render as <rect> on the real path');
  assert.ok(!/class="part-outline"/.test(html), 'box parts get no profile outline path');
});
