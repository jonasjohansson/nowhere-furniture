import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CNC_SLOT } from '../src/designs/cnc_slot.js?v=22';
import { mulberry32 } from '../src/rng.js?v=22';
import { sampleParams } from '../src/vignette.js?v=22';

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
