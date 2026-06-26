import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reviewBuild } from '../src/engineering.js?v=23';

test('flags an over-long unsupported 18mm sheet span', () => {
  const w = reviewBuild({ sheetSpan: 900, sheetThicknessMm: 18 });
  assert.ok(w.some(s => /span|spine|bearer|support/i.test(s)), 'warns on 900mm/18mm');
});
test('no span warning for a safe 18mm span', () => {
  const w = reviewBuild({ sheetSpan: 600, sheetThicknessMm: 18 });
  assert.ok(!w.some(s => /spine|bearer/i.test(s)), 'no warning at 600mm/18mm');
});
test('flags a too-thin slot web (margin < 1.5x thickness)', () => {
  const w = reviewBuild({ slotWebMm: 20, sheetThicknessMm: 18 }); // 20 < 1.5*18=27
  assert.ok(w.some(s => /web|edge|slot|margin/i.test(s)), 'warns on thin slot web');
});
test('backward compatible: existing seat-height/seat-span review still works', () => {
  // call with the OLD fields only and assert it still returns an array and the
  // existing seat-height warning still fires for an extreme height.
  const w = reviewBuild({ seatH: 250 });
  assert.ok(Array.isArray(w));
  assert.ok(w.some(s => /seat height|height/i.test(s)), 'still flags a too-low seat height');
});
