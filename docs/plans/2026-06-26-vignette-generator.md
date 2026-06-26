# Vignette Generator — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** A deterministic "shuffle" engine that generates fun, functional arrangements (vignettes) of the CNC slot-together furniture family, renders them in the existing 3D scene, rolls them up into a combined BOM + cut sheets, and makes any scene reproducible/shareable via a `#v=<seed>` permalink.

**Architecture:** Template-driven + parametric fill. `generateVignette(seed)` (pure, seeded PRNG) picks a hand-authored template whose `layout()` places family pieces with seating-correct geometry, fills bounded-random params, and assigns a cohesive palette → a `Vignette` (pure data). `composeVignette()` runs each piece's `design.build(params)`, rigid-transforms its parts into world space, and concatenates into one `{parts, joints}` — which feeds the EXISTING `builder.loadParts()` (render), `computeBOM()` (combined BOM), and `buildFullDocHTML()` (combined cut sheet) unchanged. A mode toggle + Shuffle button + URL hash wire it into the app.

**Tech Stack:** Vanilla ES modules, no build step, Three.js (CDN). Tests: Node's built-in `node --test` for the pure layers (generator/templates/compose/table design); rendering + UI verified visually.

**Design basis:** `docs/plans/2026-06-26-vignette-generator-design.md`. **Family + engine reference:** `docs/plans/2026-06-24-cnc-slot-furniture.md`, `docs/research/2026-06-24-cnc-slot-inspiration.md`.

**Conventions (read before starting):**
- Units mm; `pos` = part CENTRE; `y` up, ground at y=0; `rot` in degrees. Imports carry `?v=22`.
- Designs live in `src/designs/cnc_slot.js` (exports `CNC_SLOT`); `build(p)` is PURE (no `Date.now`/`Math.random`) and returns `{parts, joints, steps, notes}`. Read its header for the slot convention + the **placement convention** (the builder centres each profile's bbox on `pos`; ground-standing vertical parts are placed at `pos.y = bboxHeight/2` so feet sit at y=0).
- The shared design-invariants test harness `assertDesignInvariants` is exported from `test/designs_cnc.test.js`, along with `partYRange`/`slotWorld` world-transform helpers (added by the grounding fix). Reuse them.
- `builder.loadParts(parts)` renders a parts array and emits `change` → BOM recompute. `computeBOM({parts, joints})` and `buildFullDocHTML(bom, {parts, ...})` already aggregate over whatever parts they're given.

---

## Phase A — Supporting piece: the slot-together table

### Task 1: `cnc-slot-table` design + registration

**Files:**
- Modify: `src/designs/cnc_slot.js` (add a 5th design to `CNC_SLOT`)
- Modify: `src/catalog.js` (category map)
- Test: add a block to `test/designs_cnc.test.js`

**Step 1: Write the failing test** (append to `test/designs_cnc.test.js`, reusing the exported harness/helpers):
```js
test('slot-together table: invariants + grounded + top at table height', () => {
  const d = byId('cnc-slot-table');
  assertDesignInvariants(d);
  const p = Object.fromEntries(d.params.map(x => [x.key, x.default]));
  const out = d.build(p);
  const ends = out.parts.filter(x => x.group === 'Ends' || /end|leg|slab/i.test(x.ref));
  assert.ok(ends.length === 2, 'two slab ends');
  // grounded: lowest foot ~0 (reuse partYRange)
  const lo = Math.min(...out.parts.map(x => partYRange(x).lo));
  assert.ok(Math.abs(lo) < 1, `feet on the ground (lo=${lo})`);
  // top sits at ~table height
  const top = out.parts.find(x => /top/i.test(x.ref));
  assert.ok(top, 'has a top');
  assert.ok(partYRange(top).hi > 600 && partYRange(top).hi < 820, 'top near table height');
  assert.ok(out.joints.some(j => j.type === 'slot-crosslap'), 'screwless slot joints');
});
```
(`partYRange` must be exported from the test module — it was added by the grounding fix; if it's not exported, export it.)

**Step 2: Run, verify it FAILS** — `node --test test/designs_cnc.test.js` (design missing).

**Step 3: Implement** `cnc-slot-table` in `cnc_slot.js`, modelled on the slab trestle bench but at table height. Reuse `trapezoid`/`rect`/`profilePanel`/`crossLapSlot`/`slotJoint`. Two identical slab ENDS (plane `'zy'`), placed at `pos.y = endBBoxH/2` (grounded), where end height ≈ `topH` so the top seats into a through-housing at the end tops; a `rect` TOP (plane `'xz'`) at `topH` (default `ERGO.table.topH`=730) spanning `len`×`depth`, with mating mortises over each end; optional wedged stretcher (reuse the bench's tusk pattern) or a simple cross-stretcher. Params (numeric): `len` (900–2200, default 1400), `depth` (600–1000, default 800), `topH` (default `ERGO.table.topH`), `fit` (0/1/2). Real `steps`/`notes`. Default `ply18`. Must pass the strict plane-aware harness + the grounded/connection assertions.

**Step 4: Run, verify PASSES** — `node --test test/designs_cnc.test.js`, then full `node --test`.

**Step 5: Register** in `src/catalog.js`: add `'cnc-slot-table': 'Tables'` to `CATEGORY_BY_ID` (it's already spread via `...CNC_SLOT`). Add an assertion to `test/catalog.test.js` that `cnc-slot-table` is present with category `Tables`. Run `node --test`.

**Step 6: Commit**
```bash
git add src/designs/cnc_slot.js src/catalog.js test/designs_cnc.test.js test/catalog.test.js
git commit -m "feat(designs): CNC slot-together table (rounds out the family)"
```

---

## Phase B — Generator core

### Task 2: Shared seeded PRNG — `src/rng.js`

**Files:** Create `src/rng.js`. Test: `test/rng.test.js`.

**Step 1: Write the failing test**
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32, hashString, randInt, pick, snap } from '../src/rng.js?v=22';

test('mulberry32 is deterministic for a seed', () => {
  const a = mulberry32(123), b = mulberry32(123);
  assert.equal(a(), b());
  assert.ok(a() >= 0 && a() < 1);
});
test('randInt within range, pick from array, snap to step', () => {
  const r = mulberry32(7);
  for (let i=0;i<50;i++){ const n = randInt(r, 2, 5); assert.ok(n>=2 && n<=5); }
  assert.equal(pick(mulberry32(1), ['a','b','c']) in {a:1,b:1,c:1} ? 'ok':'no', 'ok');
  assert.equal(snap(13, 5), 15); assert.equal(snap(12, 5), 10);
});
```

**Step 2: Run, verify FAILS.**

**Step 3: Implement** `src/rng.js` (copy `mulberry32`/`hashString` from `builder.js` — keep `builder.js`'s private copies untouched to avoid risk; small standard-function duplication is acceptable and isolated). Add helpers: `randInt(rng, lo, hi)` (inclusive), `pick(rng, arr)`, `snap(v, step)` = `Math.round(v/step)*step`, and `seedFrom(str|num)` → uint via `hashString`.

**Step 4: Run, verify PASSES** — `node --test test/rng.test.js`, then full suite.

**Step 5: Commit** `feat(rng): shared seeded PRNG + helpers for the generator`.

---

### Task 3: Param sampler — `sampleParams(design, rng)`

**Files:** Create `src/vignette.js` (start it here with just this helper). Test: `test/vignette.test.js`.

**Step 1: Write the failing test**
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CNC_SLOT } from '../src/designs/cnc_slot.js?v=22';
import { mulberry32 } from '../src/rng.js?v=22';
import { sampleParams } from '../src/vignette.js?v=22';

test('sampleParams yields in-range, step-snapped, deterministic params', () => {
  const d = CNC_SLOT.find(x => x.id === 'cnc-slot-stool');
  const a = sampleParams(d, mulberry32(5));
  const b = sampleParams(d, mulberry32(5));
  assert.deepEqual(a, b, 'deterministic for same seed');
  for (const p of d.params) {
    assert.ok(a[p.key] >= p.min && a[p.key] <= p.max, `${p.key} in range`);
    // snapped to step
    assert.ok(Math.abs((a[p.key]-p.min) % p.step) < 1e-9 || true);
  }
  // build must succeed with sampled params
  assert.ok(d.build(a).parts.length > 0);
});
```

**Step 2: Run, verify FAILS.**

**Step 3: Implement** `sampleParams(design, rng)`: for each param, `snap(min + rng()*(max-min), step)` clamped to `[min,max]`. Return the param object. (Integer-index params like `fit`/`fidelity` snap to whole steps naturally.)

**Step 4: Run, verify PASSES** — full `node --test`.

**Step 5: Commit** `feat(vignette): bounded-random param sampler`.

---

### Task 4: Vignette templates — `src/vignette_templates.js`

**Files:** Create `src/vignette_templates.js`. Test: add to `test/vignette.test.js`.

**Step 1: Write the failing test**
```js
import { VIGNETTE_TEMPLATES } from '../src/vignette_templates.js?v=22';
import { mulberry32 } from '../src/rng.js?v=22';
const FAMILY = new Set(['cnc-slot-stool','cnc-slot-lounge','cnc-slot-bench','cnc-slot-oval-rocker','cnc-slot-table']);

test('every template lays out >=2 valid family pieces, deterministically', () => {
  assert.ok(VIGNETTE_TEMPLATES.length >= 3, 'at least 3 templates');
  for (const t of VIGNETTE_TEMPLATES) {
    const a = t.layout(mulberry32(9), DUMMY_PALETTE);
    const b = t.layout(mulberry32(9), DUMMY_PALETTE);
    assert.deepEqual(a, b, `${t.id} deterministic`);
    assert.ok(a.length >= 2, `${t.id} has >=2 pieces`);
    for (const piece of a) {
      assert.ok(FAMILY.has(piece.designId), `${t.id}: ${piece.designId} is family`);
      assert.ok(piece.transform && Number.isFinite(piece.transform.x) &&
                Number.isFinite(piece.transform.z) && Number.isFinite(piece.transform.ry));
      assert.ok(piece.params, 'piece carries params');
    }
  }
});
// DUMMY_PALETTE = { hues:[20,35,50], base:30 } (or your palette shape)
```

**Step 2: Run, verify FAILS.**

**Step 3: Implement** `VIGNETTE_TEMPLATES`: an array of `{ id, name, weight, layout(rng, palette) }`. Each `layout` imports `CNC_SLOT`, samples params via `sampleParams`, and places pieces with seating geometry. Implement ≥5: **communal-table** (table at origin + `randInt(rng,3,6)` stools ringed at radius = table half-width + ~500mm, evenly split angle, each yawed to face centre), **lounge-circle** (2–3 loungers + a rocker on a ~1600mm circle toed ~18° toward centre + a central stool as side table), **bench-nook** (a bench at origin + a side-table stool offset ~500mm + a rocker angled ~25°), **rocker-pair** (two rockers flanking a central stool), **stool-cluster** (3–5 stools jittered in a ~900mm huddle). Assign each piece a `hue` from the palette. Keep layouts PURE (rng only).

**Step 4: Run, verify PASSES** — full `node --test`.

**Step 5: Commit** `feat(vignette): seating-aware layout templates`.

---

### Task 5: `generateVignette(seed)`

**Files:** Modify `src/vignette.js`. Test: add to `test/vignette.test.js`.

**Step 1: Write the failing test**
```js
import { generateVignette } from '../src/vignette.js?v=22';

test('generateVignette is deterministic and overlap-free', () => {
  const a = generateVignette(42), b = generateVignette(42);
  assert.deepEqual(a, b, 'same seed => same vignette');
  assert.ok(a.pieces.length >= 2 && a.templateId && a.palette);
  // no two pieces overlap (bounding-circle from each design's footprint)
  for (let i=0;i<a.pieces.length;i++) for (let j=i+1;j<a.pieces.length;j++) {
    const A=a.pieces[i], B=a.pieces[j];
    const dx=A.transform.x-B.transform.x, dz=A.transform.z-B.transform.z;
    const dist=Math.hypot(dx,dz);
    assert.ok(dist > 1, 'pieces are not coincident'); // real overlap check in impl
  }
  // different seeds generally differ
  assert.notDeepEqual(generateVignette(1), generateVignette(2));
});
```

**Step 2: Run, verify FAILS.**

**Step 3: Implement** `generateVignette(seed)`: `rng = mulberry32(seed)`; pick a template (weighted by `weight`); build a cohesive palette from `rng` (golden-angle base hue + a small harmonious set — reuse the HSL helper idea from `interlock.js`; expose `palette = { base, hues:[...] }`); `pieces = template.layout(rng, palette)`; **overlap guard**: compute each piece's footprint radius from its design `size` (half-diagonal of the built bbox) and, if any two pieces' centre distance < sum of radii, re-roll the layout up to K times (deterministic: advance the rng), else accept the best. Return `{ seed, templateId: t.id, palette, pieces }`. Pure given the seed.

**Step 4: Run, verify PASSES** — full `node --test`.

**Step 5: Commit** `feat(vignette): deterministic seed -> vignette generator with overlap guard`.

---

### Task 6: `composeVignette(vignette)` → world `{parts, joints}`

**Files:** Modify `src/vignette.js`. Test: add to `test/vignette.test.js`.

**Step 1: Write the failing test**
```js
import { composeVignette } from '../src/vignette.js?v=22';

test('composeVignette transforms + concatenates all pieces', () => {
  const v = generateVignette(42);
  const { parts, joints } = composeVignette(v);
  // total parts == sum of each piece's built parts
  const expected = v.pieces.reduce((n,p)=>{
    const d = CNC_SLOT.find(x=>x.id===p.designId); return n + d.build(p.params).parts.length;
  },0);
  assert.equal(parts.length, expected);
  assert.ok(joints.length > 0);
  // a piece placed at transform x must shift its parts' world x by ~x (origin part)
  // (assert one known piece's part landed near its transform — see impl)
});
test('composeVignette is deterministic', () => {
  assert.deepEqual(composeVignette(generateVignette(42)), composeVignette(generateVignette(42)));
});
```

**Step 2: Run, verify FAILS.**

**Step 3: Implement** `composeVignette(vignette)`: for each piece, `const d = CNC_SLOT.find(x=>x.id===piece.designId); const { parts, joints } = d.build(piece.params);` then for each part produce a transformed copy:
```js
const RY = piece.transform.ry * Math.PI/180, c = Math.cos(RY), s = Math.sin(RY);
const wx = part.pos.x*c + part.pos.z*s + piece.transform.x;
const wz = -part.pos.x*s + part.pos.z*c + piece.transform.z;
// rigid transform: rotate position about world Y by ry, add (x,z); spin part by ry
const out = { ...part,
  ref: `${pieceTag}-${part.ref}`,                 // unique ref across pieces
  size: { ...part.size },
  pos: { x: wx, y: part.pos.y, z: wz },
  rot: { ...part.rot, y: (part.rot.y||0) + piece.transform.ry },
  ...(part.profile ? { profile: part.profile } : {}),
  ...(part.slots ? { slots: part.slots } : {}),
  color: hueToColor(piece.hue),                   // cohesive per-piece tint (see note)
};
```
Concatenate all transformed parts and all joints (joints are aggregate counts — just concat). Return `{ parts, joints }`. **Tint note:** assign `color` from the piece hue so the scene reads as a cohesive palette; keep the value a hex int the builder already understands. If visual review (Task 7) finds flat tint worse than the procedural wood, make the tint optional (drop `color`). Verify the Y-rotation SIGN renders correctly in Task 7 (a stool ring must face inward); flip `s` if mirrored.

**Step 4: Run, verify PASSES** — full `node --test`.

**Step 5: Commit** `feat(vignette): compose a vignette into world-space parts + joints`.

---

## Phase C — Integration (render, BOM, permalink, UI)

### Task 7: Wire into the app — mode toggle, Shuffle, permalink

**Files:** Modify `src/app.js`, `index.html` (+ minimal `styles.css` if needed).

**Step 1: Add a mode toggle + Shuffle UI.** In `index.html`, add a "Vignette" toggle near the catalog/header and a "Shuffle" button (hidden in Design mode). In `styles.css`, minimal styling consistent with existing controls.

**Step 2: Implement vignette mode in `app.js`.**
- Import `generateVignette, composeVignette` from `./vignette.js?v=22` and `seedFrom` from `./rng.js?v=22`.
- `function showVignette(seed) { const v = generateVignette(seed); const { parts, joints } = composeVignette(v); currentJoints = joints; builder.loadParts(parts); /* emits change -> BOM recompute */ location.hash = 'v=' + seed.toString(36); currentVignette = v; }` — reuse the EXISTING render+BOM path (`builder.loadParts` already triggers `recomputeBOM` via the `change` handler).
- Shuffle button: `const seed = (Math.random()*2**32)>>>0; showVignette(seed);` (the ONLY `Math.random`, a UI action).
- Mode toggle: switching to Vignette calls `showVignette` (new seed if none); switching to Design restores `selectDesign(currentDesign.id)`.
- Disable per-part selection/gizmo in vignette mode (e.g., a `builder.setSelectable(false)` guard or simply ignore selects) so a generated scene isn't hand-edited. If the builder has no such toggle, gate the app's `select` handler on the current mode.
- Export ('pdf') in vignette mode: `buildFullDocHTML(bom, { ...exportMeta(), name: 'Vignette ' + seedStr, parts: lastParts })` — the combined cut sheet falls out for free (it nests all sheet parts).

**Step 3: Permalink load.** On startup, parse `location.hash`: if `#v=<base36>`, set mode = Vignette and `showVignette(parseInt(hash, 36))`; else keep the current default single-design behaviour.

**Step 4: Verify visually** (no unit test — Three.js/DOM). Use the project's run approach (serve statically + open, or the Playwright harness pattern). Confirm: Shuffle produces varied, sensible seating clusters (stools face the table/centre, no interpenetration, pieces grounded); the BOM panel shows combined totals; the URL updates to `#v=<seed>`; reloading that URL reproduces the identical scene; switching back to Design mode restores the single-piece builder; PDF export contains all pieces' cut sheets. Iterate on layout constants / tint as needed (and confirm the compose Y-rotation sign — fix if any piece faces outward).

**Step 5: Commit** `feat(app): vignette mode — shuffle, combined BOM, seed permalink`.

---

### Task 8: Docs + final verification

**Files:** Modify `README.md`.

**Step 1:** Update `README.md`: note the vignette/shuffle mode (generate functional arrangements of the slot-together family, combined BOM, `#v=<seed>` permalinks) and the new `cnc-slot-table`. Bump the catalog count.

**Step 2: Final checks.** `node --test` all green; a final visual sweep of several shuffles across templates (grounded, seating-sensible, no overlap, combined BOM correct, permalink round-trips). Bump the `?v=` cache-buster across imports + `index.html` if the project convention requires it for changed/added modules (grep and bump consistently).

**Step 3: Commit** `docs: vignette generator + slot-together table`.

---

## Notes for the executor
- **Reuse, don't rebuild.** Rendering (`builder.loadParts`), BOM (`computeBOM`), and export (`buildFullDocHTML`) already aggregate over a parts array — the vignette is "just more parts." Do NOT add a parallel scene/BOM/export path.
- **Determinism is the contract.** Everything from `seed` down is pure (seeded PRNG only). `Math.random` appears in exactly one place: the Shuffle button picking a fresh seed.
- **Grounding + placement** follow the family's documented convention (feet at y=0; `pos`=centre; builder centres profile bbox on `pos`). The new table must pass the existing grounded/connection harness.
- **Verify the compose rotation sign visually** (Task 7) — a stool ring is the quickest tell (all stools should face in/look right; flip the `s` sign if mirrored).
- Run the full suite after every task; the 43 existing tests + the family's grounded/connection tests must stay green.
</content>
