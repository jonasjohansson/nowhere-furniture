import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CNC_SLOT } from '../src/designs/cnc_slot.js?v=23';
import { computeBOM } from '../src/bom.js?v=23';

// computeBOM's real signature is computeBOM({ parts, joints }) -> a BOM object
// with { sheets, timber, screws, totals, warnings } (+ new joinery summary).
const build = (id) => {
  const d = CNC_SLOT.find(x => x.id === id);
  const p = Object.fromEntries(d.params.map(x => [x.key, x.default]));
  return d.build(p);
};

test('BOM: profile parts nest as sheet parts (no crash, counted)', () => {
  const { parts, joints } = build('cnc-slot-oval-rocker');
  const bom = computeBOM({ parts, joints });
  assert.ok(bom, 'computeBOM returns a result');

  // The 4 oval profile parts are ply18 sheet parts -> they must show up as a
  // sheet group requiring at least one sheet, with real area used.
  assert.ok(Array.isArray(bom.sheets) && bom.sheets.length > 0, 'has a sheet group');
  const ply = bom.sheets.find(s => s.stock === 'ply18');
  assert.ok(ply, 'ply18 sheet group present');
  assert.equal(ply.partsCount, 4, 'all four oval parts counted as sheet parts');
  assert.ok(ply.sheetsNeeded >= 1, 'at least one sheet required');
  assert.ok(ply.areaUsedM2 > 0, 'profile parts contribute real sheet area (bbox nest)');
  assert.ok(bom.totals.plyAreaM2 > 0, 'totals report plywood area');
  // No warnings about parts being skipped for these well-formed profile parts.
  assert.ok(!bom.warnings.some(w => /skipped/.test(w)), 'no profile parts skipped');
});

test('BOM: slot-crosslap & wedge-tenon joints are NOT in the screw schedule', () => {
  const bench = build('cnc-slot-bench'); // slot-crosslap + wedge-tenon, no screws
  const bbom = computeBOM({ parts: bench.parts, joints: bench.joints });
  assert.equal(bbom.screws.length, 0, 'no screw lines for an all-screwless bench');
  assert.equal(bbom.totals.screwCount, 0, 'zero screws counted');
  assert.equal(bbom.totals.screwCost, 0, 'zero screw cost');

  const rocker = build('cnc-slot-oval-rocker'); // ALL joints slot-crosslap
  const rbom = computeBOM({ parts: rocker.parts, joints: rocker.joints });
  assert.equal(rbom.screws.length, 0, 'rocker screw schedule is empty');
  assert.equal(rbom.totals.screwCount, 0, 'rocker has zero screws');
  assert.equal(rbom.totals.screwCost, 0, 'rocker has zero screw cost');
});

test('BOM: reports slot engagements + wedges', () => {
  const { parts, joints } = build('cnc-slot-bench');
  const bom = computeBOM({ parts, joints });

  // The bench declares: slotJoint(2) [seat housings] + wedgeTenon(...,2) [tusks].
  assert.ok(bom.joinery, 'BOM surfaces a joinery summary');
  assert.equal(bom.joinery.slotEngagements, 2, 'two slot-crosslap engagements');
  assert.equal(bom.joinery.wedges, 2, 'two driven wedges');

  // Cross-check against the design's declared counts so the test tracks the data.
  const slotCount = joints.filter(j => j.type === 'slot-crosslap')
    .reduce((s, j) => s + (Number(j.count) || 0), 0);
  const wedgeCount = joints.filter(j => j.type === 'wedge-tenon')
    .reduce((s, j) => s + (Number(j.count) || 0), 0);
  assert.equal(bom.joinery.slotEngagements, slotCount, 'slot total matches joints');
  assert.equal(bom.joinery.wedges, wedgeCount, 'wedge total matches joints');

  // A screwed design must still report zero slot/wedge joinery (additive, no leak).
  const screwed = computeBOM({
    parts: [],
    joints: [{ type: 'torx-butt', screw: 'torx5x60', count: 8 }],
  });
  assert.equal(screwed.joinery.slotEngagements, 0, 'torx-only -> 0 slot engagements');
  assert.equal(screwed.joinery.wedges, 0, 'torx-only -> 0 wedges');
});
