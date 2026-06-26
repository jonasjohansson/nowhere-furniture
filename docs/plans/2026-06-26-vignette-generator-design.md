# Design — Vignette Generator (fun arrangements of slot-together furniture)

_2026-06-26. Approach approved: A (template-driven + parametric fill)._

## Problem

A single slot-together piece alone in the big desert scene reads as sparse/dull. We
want a tool that **auto-generates fun, functional arrangements** ("vignettes") of the
CNC slot-together family — usable hangout spots — that you shuffle until one clicks,
that roll up into a **buildable combined BOM + cut sheets**, and that are **reproducible
/ shareable via a seed permalink**.

## Concept

A deterministic **shuffle engine**: `seed → tasteful multi-piece vignette`. Taste comes
from a small library of hand-authored **templates** (which encode seating sense), with
**seed-driven variety** layered on (template choice, piece selection, bounded-random
params, cohesive palette, gentle jitter). Rejected: pure rule/constraint procedural
(hard to make reliably tasteful, needs collision/ergonomic solving — overkill for v1);
fixed curated combos (not generative, repetitive).

## 1. Data model (pure, deterministic from seed)

```
Vignette    = { seed, templateId, palette, pieces: PlacedPiece[] }
PlacedPiece = { designId, params, transform: { x, z, ry }, hue }
```
- `x, z` = ground position (mm); `ry` = yaw (degrees). `y` is always ground (pieces are
  grounded designs).
- Seeded PRNG: reuse the `mulberry32(seed)` + `hashString` already in `builder.js`
  (factor into a shared spot if needed). Same seed ⇒ byte-identical vignette.

## 2. Generator — `src/vignette.js`

`generateVignette(seed)`:
1. `rng = mulberry32(seed)`.
2. Pick a template (weighted) from `VIGNETTE_TEMPLATES`.
3. Pick a cohesive palette (base hue via golden-angle, harmonious set — reuse the HSL
   helper pattern from `interlock.js`; or a curated warm-desert palette list the seed
   indexes).
4. `template.layout(rng, palette)` → `PlacedPiece[]` (seating-correct transforms +
   bounded-random params + per-piece hue).
5. Return `{ seed, templateId, palette, pieces }`. **Pure** — no `Date`/`Math.random`.

Param bounding: for each filled design, sample each param within its own
`{min,max,step}` (snap to step) so generated pieces stay valid and buildable.

## 3. Templates — `src/vignette_templates.js`

Each: `{ id, name, weight, layout(rng, palette) -> PlacedPiece[] }`. Layout encodes
seating geometry (sitting distance ~ 450–700mm from a focal piece edge; loungers toed-in
~15–25°; bench + side-table offset; ring spacing = even angular split). v1 set:
- **Communal table** — `cnc-slot-table` + N (`rng` 3–6) stools ringed at sitting distance.
- **Lounge circle** — 2–3 lounge chairs + an oval rocker ar:ranged around a central
  low stool (as side table), all toed toward the centre.
- **Bench nook** — a bench + a side-table stool + an angled rocker.
- **Rocker pair** — two oval rockers flanking a stool.
- **Stool cluster** — 3–5 stools in a loose huddle (varied heights).

## 4. Supporting piece — `cnc-slot-table` (scope addition)

The family has stool/lounge/bench/rocker but **no table**; the marquee "table ringed by
stools" needs one. Add a small `cnc-slot-table` in `src/designs/cnc_slot.js`: two slab
ends + a cross-lapped top at table height (`ERGO.table.topH` ≈ 730mm) — same engine /
through-housing pattern as the bench, taller, wider top. Grounded (feet at y=0, per the
placement convention). Register in catalog (Tables). Gets the same design-invariants +
grounded/connection tests as the other four.

## 5. Rendering — reuse the builder (`src/builder.js`, `src/app.js`)

A vignette composes to ONE parts list. `composeVignette(vignette)`:
- For each piece: `parts/joints = CATALOG.find(designId).build(params)`.
- Transform each part into world space: rotate `(pos.x,pos.z)` about Y by `ry`, add
  `(x,z)`; set `part.rot.y += ry`; tint by the piece `hue` (respect each design's
  per-part shading — multiply/assign base hue).
- Concatenate all pieces → `{ parts, joints }`.
The builder already renders a parts array, so the vignette is just "more parts." Per-part
selection/gizmo is disabled in vignette mode (it's a generated scene, not hand-edited).

## 6. BOM + export — reuse unchanged

Composed `{parts, joints}` → existing `computeBOM(...)` (combined sheets/reglar/screws/
slots/SEK) → existing `buildFullDocHTML(bom, { parts })` (one cut-sheet doc for the whole
set). No BOM/export changes needed; aggregation is automatic.

## 7. Permalink + UI (`src/app.js`, `index.html`)

- **Mode toggle**: "Design" (current single-piece builder) ↔ "Vignette".
- **Vignette mode**: a **Shuffle** button (new random seed → regenerate → render),
  combined BOM panel, set export (PDF), and `#v=<seed>` written to `location.hash`.
- **Load**: on startup, if `#v=<seed>` present, generate + render that scene.
- **Shuffle** is the only `Math.random` (picking a fresh seed — a UI action, outside the
  deterministic pipeline). Seed is a uint (display as base36 for a short permalink).

## 8. Testing (`node --test`)

Pure layers unit-tested:
- `generateVignette(seed)` deterministic (same seed ⇒ deepEqual vignette).
- Every piece's params within its design's `{min,max}` and snapped to step.
- No piece-footprint overlap (simple bounding-circle/dist check using each design's
  `size` footprint).
- `composeVignette` part count = sum of pieces' parts; transforms applied (a known piece
  at known transform lands where expected).
- Each template yields ≥2 pieces with valid designIds from the family.
- `cnc-slot-table` passes the existing design-invariants + grounded/connection harness.
Rendering verified visually (live Three.js), as with the builder.

## Out of scope (v1, YAGNI)

Per-piece manual nudging (generate-then-tweak); collision *solving* (we only *check* and
re-roll on overlap); non-family pieces in vignettes; saving named vignette collections
(the seed permalink already makes any scene reproducible/shareable).
</content>
