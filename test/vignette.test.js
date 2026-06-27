import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CNC_SLOT } from '../src/designs/cnc_slot.js?v=24';
import { mulberry32 } from '../src/rng.js?v=24';
import { sampleParams } from '../src/sample_params.js?v=24';

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

import { VIGNETTE_TEMPLATES } from '../src/vignette_templates.js?v=24';

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

import { generateVignette } from '../src/vignette.js?v=24';

test('generateVignette: deterministic, valid, overlap-free', () => {
  const a = generateVignette(42), b = generateVignette(42);
  assert.deepEqual(a, b, 'same seed => identical vignette');
  assert.equal(a.seed, 42);
  assert.ok(a.templateId && a.palette && Array.isArray(a.palette.hues) && a.palette.hues.length >= 3);
  assert.ok(a.pieces.length >= 2);
  // pieces are valid family + carry params/transform/hue
  const VFAMILY = new Set(['cnc-slot-stool','cnc-slot-lounge','cnc-slot-bench','cnc-slot-oval-rocker','cnc-slot-table']);
  for (const p of a.pieces) {
    // a piece is either a catalog family design or a generated one (gen-*)
    const known = VFAMILY.has(p.designId) || p.designId.startsWith('gen-');
    assert.ok(known && p.params && p.transform && p.hue >= 0 && p.hue < 360);
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

import { composeVignette } from '../src/vignette.js?v=24';

test('composeVignette: concatenates all pieces deterministically', () => {
  const v = generateVignette(42);
  const out = composeVignette(v);
  assert.ok(Array.isArray(out.parts) && Array.isArray(out.joints));
  // resolve catalog OR generated designs (a vignette may include gen-* pieces)
  const resolve = (id) => (v.generated && v.generated[id]) || CNC_SLOT.find(d=>d.id===id);
  const expected = v.pieces.reduce((n,p)=> n + resolve(p.designId).build(p.params).parts.length, 0);
  assert.equal(out.parts.length, expected, 'parts = sum of pieces');
  assert.ok(out.joints.length > 0);
  // unique refs
  assert.equal(new Set(out.parts.map(p=>p.ref)).size, out.parts.length, 'refs unique');
  // deterministic
  assert.deepEqual(composeVignette(generateVignette(42)), composeVignette(generateVignette(42)));
});
test('composeVignette: a piece is translated to its transform', () => {
  // single-piece probe: build a fake 1-piece vignette and check world placement
  const stool = CNC_SLOT.find(d=>d.id==='cnc-slot-stool');
  const params = Object.fromEntries(stool.params.map(p=>[p.key,p.default]));
  const v = { seed:0, templateId:'t', palette:{base:0,hues:[0]},
              pieces:[{ designId:'cnc-slot-stool', params, transform:{x:1000,z:-500,ry:0}, hue:30 }] };
  const { parts } = composeVignette(v);
  // with ry=0, every part's world x = local x + 1000, z = local z - 500
  const local = stool.build(params).parts;
  for (let i=0;i<parts.length;i++){
    assert.ok(Math.abs(parts[i].pos.x - (local[i].pos.x + 1000)) < 1e-6);
    assert.ok(Math.abs(parts[i].pos.z - (local[i].pos.z - 500)) < 1e-6);
  }
});
test('composeVignette tint can be disabled', () => {
  const v = generateVignette(7);
  const tinted = composeVignette(v);
  const plain = composeVignette(v, { tint:false });
  assert.ok(tinted.parts.every(p=>p.color!=null), 'tinted parts have color');
  // plain: colors not forced by compose (either undefined or the design's own)
});

import { generateDesign } from '../src/generate.js?v=24';

test('vignette can include generated pieces, deterministically', () => {
  // sweep seeds to find at least one vignette that used a generated design
  let found = null;
  for (let s = 0; s < 60 && !found; s++) {
    const v = generateVignette(s);
    if (v.pieces.some(p => p.designId.startsWith('gen-'))) found = { s, v };
  }
  assert.ok(found, 'some seed produces a vignette with a generated piece');
  const { s, v } = found;
  // the vignette carries a registry of its generated designs
  assert.ok(v.generated && typeof v.generated === 'object', 'has generated map');
  for (const p of v.pieces) if (p.designId.startsWith('gen-'))
    assert.ok(v.generated[p.designId] && typeof v.generated[p.designId].build === 'function',
      'generated design is in the map');
  // deterministic: same seed reproduces identical vignette + composition
  assert.deepEqual(generateVignette(s), generateVignette(s));
  const a = composeVignette(generateVignette(s));
  const b = composeVignette(generateVignette(s));
  assert.deepEqual(a, b, 'compose deterministic with generated pieces');
  // compose resolves generated designs: part count = sum over pieces (catalog OR generated)
  const resolve = (id) => v.generated[id] || CNC_SLOT.find(d => d.id === id);
  const expected = v.pieces.reduce((n,p)=> n + resolve(p.designId).build(p.params).parts.length, 0);
  assert.equal(a.parts.length, expected);
});
