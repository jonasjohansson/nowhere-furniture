# Generative Designs — Phase 1 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the app INVENT new slot-together furniture pieces from a seed (spine-variation), surfaced in a "Design Lab" mode and optionally fed into vignettes — directly fixing the "same kind of designs" feeling.

**Architecture:** A generated design IS a normal `Design` (`{id,name,params,build(p)}`), produced by `generateDesign(seed)` in a new `src/generate.js`. Spine-variation fixes the ERGO anchor spine of a side fin, then varies the curve between anchors from the seed; `build(p)` assembles two mirrored varied fins + cross-lapped seat/back, grounded per the placement convention. A `validateDesign` gate (self-intersection, min feature, centre-of-mass over footprint, seat span) re-rolls the seed until valid. Because it's a normal Design, the param sliders, vignette compose, BOM, and export all work unchanged.

**Tech Stack:** Vanilla ES modules, no build, mm, Three.js CDN, `node --test`. Imports use `?v=23`.

**Design basis:** `docs/plans/2026-06-27-generative-and-new-pieces-design.md`. **Discovery:** `docs/research/2026-06-26-expansion-discovery.md`.

**Conventions (read first):**
- Units mm; `pos` = part CENTRE; the builder centres a profile's bbox on `pos`; ground-standing vertical parts are placed at `pos.y = bboxHeight/2` (feet at y=0). Read the header of `src/designs/cnc_slot.js` (slot convention, placement convention) and the existing `cnc-slot-lounge` design — the generator emits the same shape of output.
- `build(p)` is PURE (no `Date.now`/`Math.random`). Determinism is the contract: everything seed-derived; `Math.random` only in UI buttons.
- Reuse: `src/rng.js?v=23` (`mulberry32`, `randInt`, `pick`, `snap`, `seedFrom`, `wrapDeg`); `src/engineering.js?v=23` (`ERGO`, `fin`, `profilePanel`, `crossLapSlot`, `slotJoint`, `profileBBox`, `beamMaxSpan`, `reviewBuild`); the exported test harness `assertDesignInvariants` + `partYRange` from `test/designs_cnc.test.js`.
- Generated designs must pass `assertDesignInvariants` AND be grounded (feet ≈ y=0) AND connected (seat meets fins), exactly like the catalog pieces.

---

### Task 1: Spine-variation outline — `varyFin()`

**Files:** Create `src/generate.js`. Test: `test/generate.test.js`.

**Step 1: failing test**
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../src/rng.js?v=23';
import { varyFin } from '../src/generate.js?v=23';
import { profileBBox } from '../src/engineering.js?v=23';

test('varyFin: deterministic, in-bounds, valid outline from ergonomic anchors', () => {
  const spec = { seatH: 330, seatD: 520, backAngle: 112, backH: 520 };
  const a = varyFin(spec, mulberry32(5));
  const b = varyFin(spec, mulberry32(5));
  assert.deepEqual(a, b, 'deterministic for same seed');
  assert.ok(a.pts.length >= 4, 'has an outline');
  const bb = profileBBox(a);
  // bbox stays within sane bounds derived from the spec (no runaway control points)
  assert.ok(bb.h > spec.seatH && bb.h < spec.backH + spec.seatH, 'height bounded by anchors');
  assert.ok(bb.w >= spec.seatD * 0.6 && bb.w <= spec.seatD * 1.8, 'depth bounded');
});
test('varyFin varies with seed', () => {
  const spec = { seatH: 330, seatD: 520, backAngle: 112, backH: 520 };
  const set = new Set([1,2,3,4,5].map(s => JSON.stringify(varyFin(spec, mulberry32(s)))));
  assert.ok(set.size > 1, 'different seeds -> different silhouettes');
});
```

**Step 2: run, verify FAILS.**

**Step 3: implement** `varyFin(spec, rng)` in `src/generate.js`: compute the 5 anchor points (front-foot, seat-front, seat-back/pivot, back-top, rear-foot) as pure functions of `spec` (mirror the lounge's anchor math), then sample bounded control offsets from `rng` (back bulge, seat-front taper, leg/foot flare, waist) and emit `{pts, arcs}` connecting the anchors with those offsets — return a profile (reuse/extend `fin()` where helpful). Clamp every offset so the bbox stays within the asserted bounds (control points are perturbations of the anchor skeleton, never free). Pure.

**Step 4: run, verify PASSES** (`node --test test/generate.test.js`, then full suite).

**Step 5: commit** `feat(generate): spine-variation fin outline generator`.

---

### Task 2: `validateDesign()` gate

**Files:** Modify `src/generate.js`. Test: add to `test/generate.test.js`.

**Step 1: failing test** — assert `validateDesign(design)` returns `{ok:true}` for a hand-built valid design and `{ok:false, reason}` for: (a) a self-intersecting profile, (b) a part whose slot web < min feature (cutter dia + thickness), (c) a design whose centre-of-mass X–Z projection falls outside the convex hull of its ground-contact footprint, (d) a seat span beyond `beamMaxSpan`/sheet-span rule. Build minimal fixtures for each.

**Step 2: run, verify FAILS.**

**Step 3: implement** `validateDesign(design, p?)`: build the design, then run checks — `selfIntersects(pts)` (segment-segment test per profile), min-feature (slot web distance ≥ `RELIEF.bitDia + thickness`), CoM-in-footprint (centroid of part bboxes projected to X–Z inside the hull of parts touching y≈0), and span (`reviewBuild`/`beamMaxSpan`). Return `{ok, reason}`. Pure helpers.

**Step 4: run, verify PASSES.**

**Step 5: commit** `feat(generate): validity gate (self-intersection, min-feature, CoM, span)`.

---

### Task 3: `generateDesign(seed)` — a first-class Design

**Files:** Modify `src/generate.js`. Test: add to `test/generate.test.js` (import + reuse `assertDesignInvariants`/`partYRange` from `test/designs_cnc.test.js`).

**Step 1: failing test**
```js
import { generateDesign } from '../src/generate.js?v=23';
import { assertDesignInvariants, partYRange } from './designs_cnc.test.js';

test('generateDesign: deterministic first-class Design, valid + grounded', () => {
  const d = generateDesign(42), d2 = generateDesign(42);
  assert.equal(d.id, d2.id);
  assert.ok(d.id.startsWith('gen-') && Array.isArray(d.params) && typeof d.build === 'function');
  assertDesignInvariants(d);                      // pure build, valid parts, plane-aware bbox
  const p = Object.fromEntries(d.params.map(x => [x.key, x.default]));
  const out = d.build(p);
  const lo = Math.min(...out.parts.map(x => partYRange(x).lo ?? partYRange(x)[0]));
  assert.ok(Math.abs(lo) < 1, 'grounded (feet at y=0)');
  assert.ok(out.joints.some(j => j.type === 'slot-crosslap'), 'screwless');
});
test('different seeds yield different generated designs; all pass validity', () => {
  for (let s = 0; s < 30; s++) {
    const d = generateDesign(s);
    assert.ok(d.build(Object.fromEntries(d.params.map(x=>[x.key,x.default]))).parts.length > 0);
  }
});
```

**Step 2: run, verify FAILS.**

**Step 3: implement** `generateDesign(seed)`: `rng=mulberry32(seed)`; pick an ERGO preset (chair/lounge) by seed; `varyFin` the side silhouette; return a Design `{ id:'gen-'+seed.toString(36), name:'Generated '+..., designer:'Generative', params:[seatH,width,fit,...], build(p) }`. `build` assembles two mirrored varied fins (the frozen seed silhouette, scaled by `p`) + a cross-lapped seat + back, grounded (`pos.y=bbox.h/2`), screwless — mirror the lounge's assembly. Wrap in the validity gate: if `validateDesign` fails, derive a new attempt rng from the seed and re-vary (bounded attempts, deterministic), so `generateDesign(seed)` always returns a valid design and is stable for a given seed.

**Step 4: run, verify PASSES** (full `node --test`).

**Step 5: commit** `feat(generate): generateDesign(seed) as a first-class Design`.

---

### Task 4: Design Lab mode (app wiring)

**Files:** Modify `src/app.js`, `index.html`, `styles.css`.

**Step 1:** add a third mode segment **Lab** to `#mode-toggle` (Design · Vignette · Lab) and a `#lab-section` with a **Generate** button (hidden unless Lab).

**Step 2:** in `app.js` import `generateDesign` from `./generate.js?v=23` + `seedFrom` from `./rng.js?v=23`. Add `function showLab(seed){ const d = generateDesign(seed); currentDesign = d; currentParams = defaults(d); markActiveCat(null); renderParams(); rebuildFromParams(); location.hash = 'g='+(seed>>>0).toString(36); }`. Because a generated design is a normal Design, `renderParams`/`rebuildFromParams`/BOM/export all work as-is. **Generate** button: `showLab((Math.random()*2**32)>>>0)` (a UI action — the only new `Math.random`). Extend `setAppMode` to handle `'lab'` (show `#lab-section`, hide catalog/vignette; switching away restores prior mode's view). The `select` handler should allow per-part inspect in Lab (it's a single editable piece) — gate only `vignette`.

**Step 3:** startup permalink: parse `#g=<base36>` → mode=lab + `showLab(seedFrom(parseInt(...,36)))`; keep `#v=` and the default.

**Step 4:** Verify visually (Playwright): Lab mode generates a piece; Generate re-rolls to clearly different valid pieces; sliders tune it; export works; `#g=<seed>` round-trips; Design + Vignette modes still work. (Coordinator does the visual pass if the implementer can't render.)

**Step 5:** commit `feat(app): Design Lab mode — generate, tune, export, #g permalink`.

---

### Task 5: Vignette feed — generated pieces in scenes

**Files:** Modify `src/vignette.js`. Test: add to `test/vignette.test.js`.

**Step 1: failing test** — `generateVignette(seed)` may include generated designs; assert: (a) for some seeds a piece's `designId` starts with `gen-`; (b) the vignette carries a `generated` map `{id: Design}` for any generated pieces; (c) `composeVignette` builds those via the map and the result is deterministic + part-count = sum; (d) a vignette with a generated piece still round-trips by seed (regenerates identically).

**Step 2: run, verify FAILS.**

**Step 3: implement:** in `generateVignette`, after layout, by seed (a `USE_GENERATED` probability per fillable slot) replace a catalog piece with a `generateDesign(seedDerived)` — store it in `vignette.generated[design.id]` and set the piece's `designId` to it. In `composeVignette`, resolve designs via `vignette.generated?.[piece.designId] || CNC_SLOT.find(...)` (update BOTH lookup sites). Keep everything seed-derived so the vignette permalink reproduces exactly.

**Step 4: run, verify PASSES** (full `node --test`).

**Step 5: commit** `feat(vignette): feed generated designs into scenes (seed-deterministic)`.

---

### Task 6: Docs + final verification

**Files:** `README.md`.

**Step 1:** document Design Lab (generate/tune/export, `#g=` permalink) + that vignettes now include generated pieces. **Step 2:** `node --test` all green; a visual sweep of Lab (several Generates) + Vignette (confirm some scenes show generated pieces, all grounded/valid). Bump `?v=23`→`?v=24` consistently if returning-visitor cache-busting is wanted (grep to confirm). **Step 3:** commit `docs: Design Lab + generative vignette feed`.

---

## Roadmap (follow-on plans, each its own pass)
- **Phase 2 — Morph method:** add `morph(parentA, parentB, t, rng)` for same-topology `morphable` designs; `generateDesign` picks spine-vs-morph by seed.
- **Phase 3 — Everyday pieces:** bar/counter stool, sun-lounger chaise (multi-slot recline), spine-rib daybed — profile-only, in `cnc_slot.js`, registered; enrich morph parents + vignette pool.
- **Phase 4 — Barrio statement pieces:** `waffleGrid()` primitive → shade-canopy/totem; cutout/`holes` profile support → mashrabiya screen (+ orthogonal panel-notch base).

## Notes for the executor
- **A generated design is a normal Design** — never add a parallel render/BOM/export path; everything flows through the existing pipeline.
- **Determinism is the contract** — seed-derived everywhere; `Math.random` only in the Generate button (Task 4). Validity re-rolls must be seed-deterministic.
- **Grounding + harness**: generated designs must pass `assertDesignInvariants` + grounded/connected, same as catalog pieces.
- Run the full suite after each task (59 existing tests must stay green).
</content>
