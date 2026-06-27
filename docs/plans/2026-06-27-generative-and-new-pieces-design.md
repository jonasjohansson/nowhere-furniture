# Design — Generative Designs + New Piece Types

_2026-06-27. Approved: Approach A (phased, generative-first). Discovery basis:
`docs/research/2026-06-26-expansion-discovery.md`._

## Problem

The slot-together family + vignette generator "look like the same kind of designs." Fix it
two ways: (1) make the generator **invent new individual pieces** (not just rearrange the
fixed 5), surfaced in a **Design Lab** and fed into **vignettes**; (2) add **new piece
types** that look visibly different — everyday seating/lounging + barrio statement pieces.

## Core architecture: a generated design IS a `Design`

A catalog design is `{ id, name, designer, year, blurb, difficulty, buildTime, params[],
build(p) }` with a PURE `build` → `{parts, joints, steps, notes}`. The generator returns the
SAME contract:

```
generateDesign(seed) -> { id:'gen-'+seedStr, name, params, build(p), _gen:{method, parents, seedStr} }
```

Because it's a normal Design, it works everywhere with zero new plumbing: the param sliders
tune it, `composeVignette`/`computeBOM`/`buildFullDocHTML` consume it, and the Design Lab
just renders `build(defaults)`. Deterministic from the seed (seeded PRNG from `src/rng.js`).

### Methods (both, behind a shared validity gate)
- **Spine-variation** (primary): take an ERGO preset (seat height/depth/back-angle), place
  the fin's anchor spine (front-foot, seat-front, seat-back/pivot, back-top, rear-foot) as
  pure functions of those, then vary the curve *between* anchors via seeded control points
  (bulge, taper, waist, foot flare). Emits `fin(anchors, fidelity)`-style `{pts,arcs}` +
  cross-lapped seat/back, grounded per the placement convention. Produces principled,
  brand-new silhouettes that stay ergonomically valid.
- **Morph** (secondary, constrained): blend two SAME-TOPOLOGY catalog designs (e.g. two
  fin-based seats) — resample each parent's fin profile to equal point count, correspond by
  labeled anchor, interpolate at seeded `t`; reuse a parent's slot layout, re-place slots at
  the blended crossings. Only morphs compatible parents (a `morphable` tag on designs);
  cross-archetype morph is out of scope.
- **Validity gate** (`validateDesign`): reject + reseed on self-intersecting outline, min
  feature < cutter dia + thickness, CoM projection outside the support footprint (Umetani),
  or seat span beyond `beamMaxSpan`/sheet-span rule. Bounded re-rolls (deterministic, like
  the vignette overlap guard).

## Phasing (each phase ships independently)

### Phase 1 — Generative core + Design Lab + vignette feed  ← headline fix
- `src/generate.js`: `generateDesign(seed)` (spine-variation method) + `validateDesign`.
- New module reuses `rng.js`, `engineering.js` (`fin/ERGO/crossLapSlot/profilePanel`,
  span rules), the slot convention, and the grounding convention.
- **Design Lab**: a third app mode (Design ↔ Vignette ↔ **Lab**). Lab shows ONE generated
  piece; a **Generate** button re-rolls the seed; the normal param sliders tune it; export
  (PDF/cut-sheet) and "save to session catalog" work via the existing paths; `#g=<seed>`
  permalink (mirrors `#v=`).
- **Vignette feed**: `generateVignette` templates may, by seed, substitute a *generated*
  design for a catalog one in a slot (a `useGenerated` probability), so scenes get fresh
  forms. Deterministic; the vignette permalink still reproduces exactly (the generated
  piece's seed derives from the vignette seed).
- Tests: `generateDesign(seed)` deterministic + always passes `validateDesign` +
  passes the existing design-invariants/grounded harness; validity gate rejects known-bad.

### Phase 2 — Morph method
- Add `morph` to `generate.js`; tag `morphable` designs; `generateDesign` picks
  spine-vs-morph by seed. Tests: morph of two parents is deterministic, valid, grounded;
  morphed profile point count + bbox sane.

### Phase 3 — Everyday pieces (profile-only, reuse joinery)
- In `src/designs/cnc_slot.js`: **bar/counter stool** (tall stool, `topH`→bar height),
  **sun-lounger chaise** (lounge fin + multi-slot recline positions), **spine-rib daybed**
  (bench seat lengthened + rib field on a spine). All grounded, screwless, pass the harness.
  Register in catalog. These also enrich morph parents + the vignette pool.

### Phase 4 — Barrio statement pieces (new primitives)
- **Waffle-grid primitive** in `engineering.js`: `waffleGrid({nx, nz, ...})` → two
  interlocking fin sets with auto half-depth (50%) cross-slots at every crossing; validates
  depth = ½ rib and web ≥ 2× thickness. → **waffle shade-canopy / totem** design.
- **Cutout-pattern generator**: interior lattice/mashrabiya holes punched into a panel
  profile (the builder already supports `Path` holes; extend the profile model with an
  optional `holes` array, rendered + drawn in export). → **mashrabiya/lattice screen** design
  (tall panels + an orthogonal panel-notch base so it self-stands).

## Rendering / BOM / export
- Generated + new designs are normal Designs → existing builder (`loadParts`), BOM, and
  cut-sheet/PDF all work unchanged. Phase-4 `holes` need: builder punches them as extra
  `Path` holes (it already does this for slots); export draws them in the cut sheet.

## UI
- Mode toggle grows to three: **Design · Vignette · Lab**. Lab = single generated piece
  with Generate (re-roll), sliders, export, `#g=<seed>`. New pieces appear in the normal
  catalog (Phase 3/4). Keep Design + Vignette modes exactly as they are.

## Testing
- Pure layers via `node --test`: `generateDesign`/`morph` determinism + validity + harness;
  `validateDesign` rejects self-intersection/min-feature/CoM/span; waffleGrid notch math;
  cutout `holes` present + inside the panel. Rendering + Lab UI verified visually (Playwright),
  as before. Determinism contract: everything seed-derived; `Math.random` only in the
  Generate/Shuffle buttons.

## Out of scope (YAGNI)
- Cross-archetype morphing; persistent server-side saved designs (session + permalink only);
  kerf-bending/true-spline outlines (separate future slice — not chosen now); oblique-slot
  faceted bodies (not chosen now). Lighting/thin-stock pieces deferred.
</content>
