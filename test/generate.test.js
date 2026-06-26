import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../src/rng.js?v=23';
import { varyFin } from '../src/generate.js?v=23';
import { profileBBox } from '../src/engineering.js?v=23';

test('varyFin: deterministic, in-bounds outline from ergonomic anchors', () => {
  const spec = { seatH: 330, seatD: 520, backAngle: 112, backH: 520 };
  const a = varyFin(spec, mulberry32(5));
  const b = varyFin(spec, mulberry32(5));
  assert.deepEqual(a, b, 'deterministic for same seed');
  assert.ok(a.pts.length >= 4, 'has an outline');
  const bb = profileBBox(a);
  assert.ok(bb.h > spec.seatH && bb.h < spec.backH + spec.seatH, `height bounded (got ${bb.h})`);
  assert.ok(bb.w >= spec.seatD * 0.6 && bb.w <= spec.seatD * 1.8, `depth bounded (got ${bb.w})`);
});
test('varyFin varies with seed', () => {
  const spec = { seatH: 330, seatD: 520, backAngle: 112, backH: 520 };
  const set = new Set([1,2,3,4,5].map(s => JSON.stringify(varyFin(spec, mulberry32(s)))));
  assert.ok(set.size > 1, 'different seeds -> different silhouettes');
});
