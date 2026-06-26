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
