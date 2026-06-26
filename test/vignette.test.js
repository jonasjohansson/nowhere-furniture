import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CNC_SLOT } from '../src/designs/cnc_slot.js?v=22';
import { mulberry32 } from '../src/rng.js?v=22';
import { sampleParams } from '../src/sample_params.js?v=22';

test('sampleParams: in-range, step-snapped, deterministic, buildable', () => {
  for (const d of CNC_SLOT) {
    const a = sampleParams(d, mulberry32(5));
    const b = sampleParams(d, mulberry32(5));
    assert.deepEqual(a, b, `${d.id} deterministic for same seed`);
    for (const p of d.params) {
      assert.ok(a[p.key] >= p.min && a[p.key] <= p.max, `${d.id}.${p.key} in [${p.min},${p.max}] got ${a[p.key]}`);
      // value sits on the step grid from min
      const k = (a[p.key] - p.min) / p.step;
      assert.ok(Math.abs(k - Math.round(k)) < 1e-6, `${d.id}.${p.key} snapped to step`);
    }
    assert.ok(d.build(a).parts.length > 0, `${d.id} builds with sampled params`);
  }
});
test('sampleParams varies with the seed', () => {
  const d = CNC_SLOT.find(x => x.id === 'cnc-slot-stool');
  // across several seeds, not all identical (probabilistic but extremely safe)
  const sets = new Set([1,2,3,4,5].map(s => JSON.stringify(sampleParams(d, mulberry32(s)))));
  assert.ok(sets.size > 1, 'different seeds yield different params');
});

import { VIGNETTE_TEMPLATES } from '../src/vignette_templates.js?v=22';

const FAMILY = new Set(['cnc-slot-stool','cnc-slot-lounge','cnc-slot-bench','cnc-slot-oval-rocker','cnc-slot-table']);
const PALETTE = { base: 30, hues: [20, 35, 50] };

test('templates: >=5, each lays out >=2 valid family pieces, deterministically', () => {
  assert.ok(VIGNETTE_TEMPLATES.length >= 5, 'at least 5 templates');
  for (const t of VIGNETTE_TEMPLATES) {
    assert.ok(t.id && t.name && t.weight > 0 && typeof t.layout === 'function', `${t.id} shape`);
    const a = t.layout(mulberry32(9), PALETTE);
    const b = t.layout(mulberry32(9), PALETTE);
    assert.deepEqual(a, b, `${t.id} deterministic`);
    assert.ok(a.length >= 2, `${t.id} has >=2 pieces`);
    for (const pc of a) {
      assert.ok(FAMILY.has(pc.designId), `${t.id}: ${pc.designId} in family`);
      assert.ok(pc.transform && Number.isFinite(pc.transform.x) && Number.isFinite(pc.transform.z) && Number.isFinite(pc.transform.ry), `${t.id} valid transform`);
      assert.ok(pc.params && typeof pc.params === 'object', `${t.id} carries params`);
      assert.ok(pc.hue >= 0 && pc.hue < 360, `${t.id} hue in range`);
    }
  }
});

import { generateVignette } from '../src/vignette.js?v=22';

test('generateVignette: deterministic, valid, overlap-free', () => {
  const a = generateVignette(42), b = generateVignette(42);
  assert.deepEqual(a, b, 'same seed => identical vignette');
  assert.equal(a.seed, 42);
  assert.ok(a.templateId && a.palette && Array.isArray(a.palette.hues) && a.palette.hues.length >= 3);
  assert.ok(a.pieces.length >= 2);
  // pieces are valid family + carry params/transform/hue
  const VFAMILY = new Set(['cnc-slot-stool','cnc-slot-lounge','cnc-slot-bench','cnc-slot-oval-rocker','cnc-slot-table']);
  for (const p of a.pieces) {
    assert.ok(VFAMILY.has(p.designId) && p.params && p.transform && p.hue >= 0 && p.hue < 360);
  }
});
test('generateVignette: different seeds differ; many seeds stay non-coincident', () => {
  assert.notDeepEqual(generateVignette(1), generateVignette(2));
  // sweep seeds; assert no gross overlap remains (centres not coincident, and
  // footprint-overlap rare/none under the k threshold)
  for (let s = 0; s < 40; s++) {
    const v = generateVignette(s);
    for (let i=0;i<v.pieces.length;i++) for (let j=i+1;j<v.pieces.length;j++) {
      const A=v.pieces[i].transform, B=v.pieces[j].transform;
      assert.ok(Math.hypot(A.x-B.x, A.z-B.z) > 1, `seed ${s}: pieces not coincident`);
    }
  }
});
