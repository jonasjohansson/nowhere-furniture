# CNC Slot-Together Furniture Family — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a new catalog family of single-sheet, CNC-cut, slot-together plywood designs (profile parts joined by cross-laps/tabs/wedges, minimal hardware) — Slot-in Stool, Wedge Lounge Chair, Slab Trestle Bench, Oval Rocker.

**Architecture:** Extend the existing `PartSpec` contract _additively_ with optional `profile` (a 2-D outline of points + arcs) and `slots` (notches). Parts with a profile render/export as an extruded outline; parts without stay the current axis-aligned box, so all 21 existing designs are untouched. A new `profilePanel()` factory + outline/slot helpers in `engineering.js` give designs the new vocabulary; a new `src/designs/cnc_slot.js` module holds the four seed designs; `builder.js`, `bom.js`, `export.js` learn to handle profiles.

**Tech Stack:** Vanilla ES modules, Three.js (CDN importmap), no build step. Tests: Node's built-in `node --test` (Node ≥18) — pure-function tests only; the Three.js render layer is verified visually.

**Design basis:** `docs/plans/2026-06-24-cnc-slot-furniture-design.md` · **Inspiration/technique numbers:** `docs/research/2026-06-24-cnc-slot-inspiration.md`

**Conventions in this codebase (read before starting):**
- All authoring units are **millimetres**; the 3D scene multiplies by `MM` (0.001) to get metres. `pos` = centre in mm, `rot` = degrees, `y` is up, ground at `y=0`.
- Module imports carry a `?v=22` cache-busting query (e.g. `import {...} from '../engineering.js?v=22'`). **Keep the same suffix** on new imports for consistency. Node ESM resolves these (the query is ignored for file lookup).
- `build(p)` MUST be pure/deterministic (no `Date.now`/`Math.random`) — tests depend on this.
- Member factories (`panel`, `beam`, …) return `PartSpec`; designs compose those, never raw boxes (except where a dimension must escape the factory, as in `interlock.js`).

---

## Phase A — Foundation (contract, geometry, joinery)

### Task 0: Bootstrap the test harness

**Files:**
- Create: `test/smoke.test.js`
- Create: `test/README.md`

**Step 1: Write a smoke test that imports the contract**

```js
// test/smoke.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MM, SHEETS } from '../src/stock.js?v=22';

test('stock contract loads', () => {
  assert.equal(MM, 0.001);
  assert.equal(SHEETS.ply18.thickness, 18);
});
```

**Step 2: Run and verify it passes**

Run: `node --test`
Expected: `pass 1`. (If Node can't resolve the `?v=22` query, fall back to importing `../src/stock.js` without the suffix in tests only — note this in `test/README.md`.)

**Step 3: Document the harness**

`test/README.md`: "Run `node --test` from the repo root. Tests cover the pure layers (stock, engineering geometry, design `build()` output, BOM, export SVG). The Three.js builder is verified visually via the app — see `/run`."

**Step 4: Commit**

```bash
git add test/ && git commit -m "test: bootstrap node --test harness"
```

---

### Task 1: Slot/fit/relief constants + `slotWidth()` helper (`stock.js`)

**Files:**
- Modify: `src/stock.js` (append after `SCREWS`, before the helpers block ~line 83)
- Test: `test/stock.test.js`

**Step 1: Write the failing test**

```js
// test/stock.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SLOT_FIT, RELIEF, slotWidth } from '../src/stock.js?v=22';

test('fit classes exist with sane clearances (mm, per side)', () => {
  assert.ok(SLOT_FIT.snug < SLOT_FIT.standard);
  assert.ok(SLOT_FIT.standard < SLOT_FIT.outdoor);
});

test('slotWidth = measured thickness + 2*fit', () => {
  assert.equal(slotWidth(18, 'snug'), 18 + 2 * SLOT_FIT.snug);
  assert.equal(slotWidth(18.2, 'standard'), 18.2 + 2 * SLOT_FIT.standard);
});

test('relief defaults to a real bit + dogbone', () => {
  assert.ok(RELIEF.bitDia > 0);
  assert.equal(RELIEF.kind, 'dogbone');
});
```

**Step 2: Run to verify it fails**

Run: `node --test test/stock.test.js`
Expected: FAIL — `SLOT_FIT` is not exported.

**Step 3: Implement**

```js
// --- CNC slot-together joinery constants -----------------------------------
// Press-fit clearance PER SIDE (mm). Ply thickness varies ±0.13mm, so slot
// width is keyed to MEASURED thickness + 2*fit. Numbers from the research brief.
export const SLOT_FIT = { snug: 0.10, standard: 0.25, outdoor: 0.35 };

// Inside-corner relief so a square tab seats against a round router bit.
// dogbone radius should be >= 1.1 * bit radius.
export const RELIEF = { bitDia: 6.35, kind: 'dogbone' }; // 'dogbone' | 'tbone'

/** slot width to receive a sheet edge of `thicknessMm`, for a fit class. */
export function slotWidth(thicknessMm, fit = 'standard') {
  const f = SLOT_FIT[fit] ?? SLOT_FIT.standard;
  return thicknessMm + 2 * f;
}

/** dogbone relief radius for the configured bit. */
export function reliefRadius() { return (RELIEF.bitDia / 2) * 1.1; }
```

Also extend the `Joint` JSDoc typedef comment to note the new screwless types: `'slot-crosslap'` and `'wedge-tenon'` (count = engagements / wedges; `screw` omitted).

**Step 4: Run to verify it passes**

Run: `node --test test/stock.test.js` → Expected: PASS.

**Step 5: Commit**

```bash
git add src/stock.js test/stock.test.js
git commit -m "feat(stock): slot fit classes, relief defaults, slotWidth helper"
```

---

### Task 2: Profile bounding box + `profilePanel()` factory (`engineering.js`)

**Files:**
- Modify: `src/engineering.js` (new section after the member factories, ~line 168)
- Test: `test/profile.test.js`

**Step 1: Write the failing test**

```js
// test/profile.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { profileBBox, profilePanel } from '../src/engineering.js?v=22';

test('bbox of a triangle profile', () => {
  const bb = profileBBox({ pts: [{x:0,y:0},{x:100,y:0},{x:0,y:60}] });
  assert.deepEqual(bb, { w: 100, h: 60 });
});

test('arc segment widens the bbox to the arc bulge', () => {
  // semicircle r=50 across the top edge bulges +50 in y
  const bb = profileBBox({ pts:[{x:-50,y:0},{x:50,y:0}], arcs:[{after:1,r:50}] });
  assert.ok(bb.w >= 100 && bb.h >= 50);
});

test('profilePanel writes bbox into size and keeps the profile', () => {
  const p = profilePanel('SIDE','Side fin','ply18',
    { plane:'xy', pts:[{x:0,y:0},{x:100,y:0},{x:0,y:60}] },
    { x:0, y:30, z:0 }, 'Sides');
  assert.equal(p.material, 'sheet');
  assert.equal(p.size.w, 100);          // bbox w on the in-plane x
  assert.equal(p.size.h, 60);           // bbox h on the in-plane y
  assert.equal(p.size.d, 18);           // thickness from ply18
  assert.ok(p.profile && p.profile.pts.length === 3);
});
```

**Step 2: Run to verify it fails** — `node --test test/profile.test.js` → FAIL (not exported).

**Step 3: Implement**

```js
/**
 * Bounding box {w,h} of a 2-D profile (points + optional arcs), mm.
 * Arcs are sampled so the bulge is included. Straight-only profiles use just pts.
 */
export function profileBBox(profile) {
  const xs = [], ys = [];
  const pts = profile.pts;
  for (const p of pts) { xs.push(p.x); ys.push(p.y); }
  for (const a of (profile.arcs || [])) {
    const i = a.after, j = (i + 1) % pts.length;
    const A = pts[i], B = pts[j];
    // sample the arc between A and B at radius a.r
    for (const s of sampleArc(A, B, a)) { xs.push(s.x); ys.push(s.y); }
  }
  return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

// sampleArc returns N points along a circular arc from A to B with signed radius r.
// (Implementation: compute centre from chord + r, walk the swept angle in ~12 steps.
// `large`/`sweep` flags follow SVG arc semantics. Keep it small + pure.)
export function sampleArc(A, B, { r, large = false, sweep = false }, n = 12) { /* … */ }

/**
 * A plywood part defined by a 2-D PROFILE (outline) instead of a box.
 * plane = which way the flat face points (same convention as panel()):
 *   'xy' faces +/-z, 'xz' lies flat (faces +/-y), 'zy' faces +/-x.
 * size is the profile bounding box (compat shim for BOM/dims/selection);
 * thickness comes from the sheet stock and lands on the out-of-plane axis.
 */
export function profilePanel(ref, name, stockKey, profile, pos, group) {
  const th = SHEETS[stockKey] ? SHEETS[stockKey].thickness : 18;
  const bb = profileBBox(profile);
  let size;
  if (profile.plane === 'xz')      size = { w: bb.w, h: th,  d: bb.h };
  else if (profile.plane === 'zy') size = { w: th,  h: bb.h, d: bb.w };
  else                             size = { w: bb.w, h: bb.h, d: th }; // 'xy'
  return {
    ref, name, material: 'sheet', stock: stockKey,
    size, pos: { ...pos }, rot: { x:0, y:0, z:0 }, group,
    profile: { plane: profile.plane || 'xy', pts: profile.pts, arcs: profile.arcs || [] },
    slots: profile.slots || [],
  };
}
```

**Step 4: Run to verify it passes** — `node --test test/profile.test.js` → PASS.

**Step 5: Commit**

```bash
git add src/engineering.js test/profile.test.js
git commit -m "feat(engineering): profile bbox + profilePanel factory"
```

---

### Task 3: Outline generators — `rect`, `wedge`, `trapezoid`, `oval`, `fin` (`engineering.js`)

**Files:**
- Modify: `src/engineering.js` (append to the profile section)
- Test: `test/outlines.test.js`

**Step 1: Write the failing test**

```js
// test/outlines.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rect, wedge, oval, fin } from '../src/engineering.js?v=22';

test('rect is 4 points of the given size', () => {
  const r = rect(100, 60);
  assert.equal(r.pts.length, 4);
});

test('oval has arcs and bbox ~ 2rx by 2ry', () => {
  const o = oval(500, 350);
  assert.ok(o.arcs && o.arcs.length >= 1);
});

test('fin: polyline fidelity connects anchors with straight segments', () => {
  const anchors = [{x:0,y:0},{x:0,y:440},{x:420,y:470},{x:480,y:820}];
  const poly = fin(anchors, 'poly');
  assert.equal(poly.arcs.length, 0);
  assert.equal(poly.pts.length, anchors.length);
});

test('fin: curve fidelity emits arcs from the same anchors', () => {
  const anchors = [{x:0,y:0},{x:0,y:440},{x:420,y:470},{x:480,y:820}];
  const curved = fin(anchors, 'curve');
  assert.ok(curved.arcs.length >= 1);
});
```

**Step 2: Run to verify it fails** — FAIL (not exported).

**Step 3: Implement** — pure outline generators returning `{pts, arcs}`:
- `rect(w,h)` — centred or origin-anchored rectangle (pick origin-anchored bottom-left at 0,0; document it).
- `wedge(w, h, topInset)` — trapezoid/triangle leg profile (wide base, narrower top).
- `trapezoid(bottomW, topW, h)`.
- `oval(rx, ry)` — 4-point box with 4 quarter-arcs (or 2 semicircle arcs); bbox `2rx × 2ry`.
- `fin(anchorPts, fidelity)` — connect ergonomic anchors as a polyline (`'poly'`, `arcs:[]`) or a smooth profile (`'curve'`, insert fillet arcs at interior anchors). Document the anchor order convention (front-foot → seat-front → seat-back/pivot → back-top → rear-foot).

**Step 4: Run to verify it passes** — PASS.

**Step 5: Commit**

```bash
git add src/engineering.js test/outlines.test.js
git commit -m "feat(engineering): outline generators (rect/wedge/trapezoid/oval/fin)"
```

---

### Task 4: Slot + joint helpers — `crossLapSlot`, `slotJoint`, `wedgeTenon` (`engineering.js`)

**Files:**
- Modify: `src/engineering.js`
- Test: `test/slots.test.js`

**Step 1: Write the failing test**

```js
// test/slots.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crossLapSlot, slotJoint, wedgeTenon } from '../src/engineering.js?v=22';
import { slotWidth } from '../src/stock.js?v=22';

test('crossLapSlot width keys off mating thickness + fit', () => {
  const s = crossLapSlot(100, 200, 18, 60, 'standard');
  assert.equal(s.w, slotWidth(18, 'standard'));
  assert.equal(s.depth, 60);
  assert.deepEqual([s.x, s.y], [100, 200]);
});

test('slotJoint is screwless', () => {
  const j = slotJoint(8, 'eight cross-laps');
  assert.equal(j.type, 'slot-crosslap');
  assert.equal(j.count, 8);
  assert.equal(j.screw, undefined);
});

test('wedgeTenon records wedge count', () => {
  const j = wedgeTenon(18, 80, 2, 'tusk stretcher, 2 wedges');
  assert.equal(j.type, 'wedge-tenon');
  assert.equal(j.count, 2);
});
```

**Step 2: Run to verify it fails** — FAIL.

**Step 3: Implement** — `crossLapSlot(x,y,mateThk,depth,fit)` returns `{x,y,w:slotWidth(mateThk,fit),depth,angle}`; `slotJoint(count,note)` → `{type:'slot-crosslap',count,note}`; `wedgeTenon(tabThk,len,count,note)` → `{type:'wedge-tenon',count,note}`. Import `slotWidth` from `stock.js`.

**Step 4: Run to verify it passes** — PASS.

**Step 5: Commit**

```bash
git add src/engineering.js test/slots.test.js
git commit -m "feat(engineering): cross-lap slot + slot/wedge joint helpers"
```

---

## Phase B — Seed designs (`src/designs/cnc_slot.js`)

Each design Task follows the same shape. **Shared test helper** first:

### Task 5: Design test harness + Slot-in Stool / Side Table

**Files:**
- Create: `src/designs/cnc_slot.js`
- Create: `test/designs_cnc.test.js`

**Step 1: Write the failing test (shared invariants + the stool)**

```js
// test/designs_cnc.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { profileBBox } from '../src/engineering.js?v=22';
import { CNC_SLOT } from '../src/designs/cnc_slot.js?v=22';

const byId = (id) => CNC_SLOT.find(d => d.id === id);

function assertDesignInvariants(d) {
  const p = Object.fromEntries(d.params.map(x => [x.key, x.default]));
  const a = d.build(p), b = d.build(p);
  assert.deepEqual(a, b, 'build() must be deterministic');             // purity
  assert.ok(a.parts.length > 0, 'has parts');
  for (const part of a.parts) {
    assert.ok(['sheet','timber'].includes(part.material));
    if (part.profile) {                                                // bbox matches size
      const bb = profileBBox(part.profile);
      assert.ok(Math.abs(bb.w - Math.max(part.size.w, part.size.d)) < 1e-6 ||
                Math.abs(bb.w - part.size.w) < 1e-6);
    }
  }
  assert.ok(Array.isArray(a.joints) && Array.isArray(a.steps));
}

test('slot-in stool: invariants + part count', () => {
  const d = byId('cnc-slot-stool');
  assert.ok(d, 'design registered');
  assertDesignInvariants(d);
  const out = d.build(Object.fromEntries(d.params.map(x => [x.key, x.default])));
  assert.ok(out.parts.some(p => p.slots && p.slots.length), 'has slotted parts');
});
```

**Step 2: Run to verify it fails** — FAIL (module/design missing).

**Step 3: Implement the stool** in `cnc_slot.js`. Two or three identical cross-lapped fins (vertical `'zy'`/`'xy'` profiles) meeting at a central cross-lap, plus a top panel (`'xz'`) with mating slots. Use `profilePanel`, `wedge`/`rect`, `crossLapSlot`, `slotJoint`. Params: `seatH` (default `ERGO.stool.seatH`), `topDia`/`topW`, `fit` (enum via min/max index or a string param — see note), `thickness` (sheet key). Return `{parts, joints, steps, notes}`.

> **Param note:** the params schema is numeric (`min/max/step`). For `fit` and `fidelity` (string choices), encode as a small integer index (0/1/2) with a `unit` label, and map to the string inside `build()`. Document the mapping in a comment.

**Step 4: Run to verify it passes** — `node --test test/designs_cnc.test.js` → PASS.

**Step 5: Commit**

```bash
git add src/designs/cnc_slot.js test/designs_cnc.test.js
git commit -m "feat(designs): CNC slot-in stool/side table + design invariants test"
```

---

### Task 6: Wedge Lounge Chair

**Files:** Modify `src/designs/cnc_slot.js`; add a test block to `test/designs_cnc.test.js`.

**Step 1:** Add `test('wedge lounge chair: invariants + recline', …)` — asserts the design `cnc-slot-lounge` exists, passes `assertDesignInvariants`, has exactly two mirrored side fins (same bbox), and the seat-front anchor sits at the param seat height.

**Step 2:** Run → FAIL.

**Step 3:** Implement. Two mirrored side fins from `fin(anchors, fidelity)` where anchors derive from `seatH` (lounge default ~360–420), `seatD`, `backAngle` (`ERGO.lounge`), `seatTilt`. Seat + back panels cross-lap through slots in the fins (`crossLapSlot` on the fins, mating slots on the panels). `slotJoint` for the engagements. Honour `fidelity` (poly vs curve) and `fit`.

**Step 4:** Run → PASS.

**Step 5:** Commit `feat(designs): CNC wedge lounge chair`.

---

### Task 7: Slab Trestle Bench

**Files:** Modify `src/designs/cnc_slot.js`; add test block.

**Step 1:** Add `test('slab trestle bench: invariants + span guard + wedge', …)` — design `cnc-slot-bench` exists; two angled slab ends; a seat panel; at least one `wedge-tenon` joint; and if seat clear span > 700 mm the `notes` mention a spine/bearer (ties to Task 13's guardrail).

**Step 2:** Run → FAIL.

**Step 3:** Implement. Two angled slab ends (`trapezoid`/`wedge`), a seat panel dropping through cross-lap slots, and a stretcher tying the feet with a tusk **`wedgeTenon`** (tab through a slot in each end, locked by a flat wedge part cut from the same sheet — emit the wedge as its own small `profilePanel`). Params: `len`, `seatH` (`ERGO.bench`), `fit`, `thickness`, optional `spine` toggle for long spans.

**Step 4:** Run → PASS.

**Step 5:** Commit `feat(designs): CNC slab trestle bench with wedged tusk tenon`.

---

### Task 8: Oval Rocker

**Files:** Modify `src/designs/cnc_slot.js`; add test block.

**Step 1:** Add `test('oval rocker: 4 identical ovals, varied slots', …)` — design `cnc-slot-oval-rocker` exists; produces 4 parts whose **outlines are identical** (same `profileBBox`, same `pts` length) but whose **`slots` differ**; all `slot-crosslap` joints, zero screws.

**Step 2:** Run → FAIL.

**Step 3:** Implement following the Oval Rocker primitive: one `oval(rx, ry)` outline instanced 4×; two stand vertically (their bottom arc = the rocker curve), two lie across as seat + back; each copy gets a different `slots` map via `crossLapSlot` so they cross-lap into a self-bracing cage. Params: `scale`/`width`, `seatH`, `fit`, `thickness` (default `ply18`; note retail uses ~36 mm laminated — out of scope, single sheet here). This is the freeform/spline showcase — `fidelity` is effectively `'curve'`.

**Step 4:** Run → PASS. (Exact slot positions will be tuned against the 3-D view in Task 10; the test only pins the structural invariants.)

**Step 5:** Commit `feat(designs): CNC oval rocker (4 identical ovals, cross-lap cage)`.

---

### Task 9: Register the module in the catalog

**Files:**
- Modify: `src/catalog.js:5-14` (import + spread) and `:21-33` (category map)
- Test: `test/catalog.test.js`

**Step 1: Write the failing test**

```js
// test/catalog.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG, CATEGORY_ORDER } from '../src/catalog.js?v=22';

test('CNC slot designs are in the catalog with categories', () => {
  const ids = ['cnc-slot-stool','cnc-slot-lounge','cnc-slot-bench','cnc-slot-oval-rocker'];
  for (const id of ids) {
    const d = CATALOG.find(x => x.id === id);
    assert.ok(d, `${id} present`);
    assert.ok(CATEGORY_ORDER.includes(d.category), `${id} has a known category`);
  }
});
```

**Step 2:** Run → FAIL.

**Step 3:** Implement — `import { CNC_SLOT } from './designs/cnc_slot.js?v=22';`, add `...CNC_SLOT` to `RAW`, and add the four ids to `CATEGORY_BY_ID` (`cnc-slot-stool`→Stools, `cnc-slot-lounge`→Loungers, `cnc-slot-bench`→Benches, `cnc-slot-oval-rocker`→Chairs or Loungers). Optionally tag a sub-family label for UI grouping later.

**Step 4:** Run → PASS. Also run the **full suite**: `node --test` → all green.

**Step 5:** Commit `feat(catalog): register CNC slot-together family`.

---

## Phase C — Rendering (visual verification, not unit-tested)

### Task 10: Extrude profiles + cut slots in the builder (`builder.js`)

**Files:**
- Modify: `src/builder.js` (the part-mesh creation path — locate where a `PartSpec` becomes a `BoxGeometry`)

**Step 1: Find the geometry factory.** Search `builder.js` for `BoxGeometry` / where `part.size` becomes a mesh. That's the branch point.

**Step 2: Add a profile branch.** If `part.profile`:
- Build a Three.js `Shape` from `profile.pts` (use `shape.moveTo/lineTo`; for arcs use `shape.absarc`/`quadraticCurveTo` per the arc spec).
- For each `slot`, cut a notch: either subtract a `Path` hole pushed to `shape.holes`, or open the boundary for an edge notch (edge cross-laps are boundary notches, not interior holes — handle both; start with interior `Path` holes for through-slots).
- Apply corner relief (dogbone circles of `reliefRadius()`) at interior slot corners.
- `new THREE.ExtrudeGeometry(shape, { depth: thickness*MM, bevelEnabled:false })`, then translate so the extrusion is centred on thickness, and rotate to match `profile.plane` (xy faces ±z = no extra rotation; xz lies flat = rotate −90° about x; zy faces ±x = rotate 90° about y). Then apply `part.rot`.
- Reuse the existing wood material + shadow setup so profiles match the rest of the scene.
- Else: existing `BoxGeometry` path, unchanged.

**Step 3: Verify visually.** Use the `/run` skill (or open the site on the local server) and select each of the four new designs. Confirm: profiles render as the right silhouettes, slots are visible, parts interlock, dimensions/gizmo/selection still work on the bbox.

**Step 4: Commit** `feat(builder): extrude profile parts and cut slots`.

> No unit test — Three.js needs WebGL/DOM. The Task-5–9 tests already pin the geometry data; this task only renders it.

---

## Phase D — BOM & export

### Task 11: BOM accounts for slot/wedge joints + nests profiles by bbox (`bom.js`)

**Files:**
- Modify: `src/bom.js`
- Test: `test/bom.test.js`

**Step 1: Write the failing test** — build the oval rocker, run `computeBOM`, assert: (a) profile parts are counted as sheet parts and nested using their `size` bbox (no crash on missing rectangular assumptions), (b) the screw schedule does NOT count `slot-crosslap`/`wedge-tenon` joints, and (c) a new summary line reports total slot engagements + wedges.

**Step 2:** Run → FAIL.

**Step 3: Implement** — in the joint-tallying code, branch on `joint.type`: `torx-*` → screw schedule (unchanged); `slot-crosslap` → add to a `slotEngagements` counter; `wedge-tenon` → add to `wedges` (and a wedge is also a cut sheet part already emitted by the design). Sheet nesting already uses `size.{w,h}`; profiles supply a bbox `size`, so nesting works — just confirm no code assumes a part fills its bbox.

**Step 4:** Run → PASS.

**Step 5:** Commit `feat(bom): slot/wedge joint accounting + profile bbox nesting`.

---

### Task 12: Cut-sheet SVG draws true outlines + slots (`export.js`)

**Files:**
- Modify: `src/export.js`
- Test: `test/export.test.js`

**Step 1: Write the failing test** — build the wedge lounge chair, generate the cut-sheet SVG, assert the SVG string contains a `<path` (the true outline) for profile parts rather than only `<rect`, and contains slot geometry. Keep assertions structural (substring/path-count), not pixel-exact.

**Step 2:** Run → FAIL.

**Step 3: Implement** — where the cut-sheet/nesting SVG emits a `<rect>` per sheet part, branch: if `part.profile`, emit a `<path>` built from `pts`+`arcs` (SVG `A` arc commands), then subtract/draw the `slots` and dogbone relief. Box parts keep emitting `<rect>`. This is the README's "DXF export of panel outlines" groundwork — keep the path-building factored so a DXF writer can reuse it later.

**Step 4:** Run → PASS.

**Step 5:** Commit `feat(export): true profile outlines + slots in cut-sheet SVG`.

---

### Task 13: Structural guardrails in `reviewBuild` (`engineering.js`)

**Files:**
- Modify: `src/engineering.js` (`reviewBuild`, ~line 214)
- Test: `test/review.test.js`

**Step 1: Write the failing test** — calling `reviewBuild` with an 18 mm unsupported seat span of 900 mm returns a warning mentioning the ~600–750 mm limit / "spine"; a 600 mm span returns none.

**Step 2:** Run → FAIL.

**Step 3: Implement** — extend `reviewBuild` to accept an optional `{ sheetSpan, sheetThicknessMm }` and push a warning when `sheetSpan > 41.7 * thickness` (≈750 at 18 mm) recommending a spine/bearer; also warn if a slot's web-to-edge margin < 1.5× thickness if that data is passed. Wire the bench design (Task 7) to surface this in its `notes`.

**Step 4:** Run → PASS, then full suite `node --test` → all green.

**Step 5:** Commit `feat(engineering): plywood span + slot-margin guardrails`.

---

## Final verification

1. `node --test` — entire suite green.
2. `/run` the app: each of the four new designs renders, interlocks, and shows a live BOM with slot/wedge lines and a profile-aware cut sheet; tweak params (seat height, fit class, fidelity, multiplicity) and confirm live recompute.
3. Bump the `?v=` cache-buster if the project convention requires it for changed modules (currently `v=22` across imports + `index.html` — grep and bump consistently if needed).
4. Update `README.md` catalog count (12 → current) and the roadmap (tab/lap joinery + outline export now partially shipped).

## Notes for the executor
- **Don't break the box path.** Every change is additive; run the full suite after each task to confirm the 21 existing designs still build.
- **Tune geometry against the 3-D view**, not the tests. Tests pin invariants (purity, part counts, bbox/size agreement, joint types, screwless-ness); exact slot coordinates are dialled in visually in Task 10.
- **One thickness, one slot module** per the design doc — reuse `slotWidth`/`crossLapSlot` everywhere so the family stays coherent and a `fit` change propagates.
</content>
