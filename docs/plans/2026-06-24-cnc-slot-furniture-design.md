# Design — CNC Slot-Together Furniture Family

_2026-06-24. Approach approved (Approach 1, extend `PartSpec`). Inspiration + technique
basis in `docs/research/2026-06-24-cnc-slot-inspiration.md`._

## Concept

A new catalog family defined by a **method, not a piece type**:

> One plywood sheet thickness, CNC-cut **profile** parts (straight edges AND freeform
> curves), assembled by **slots / cross-laps / tabs / wedges** — minimal-to-no hardware.
> The parts ARE the structure.

This sits beside the existing "boxes + reglar + Torx" line, and delivers the README
roadmap items: real tab/lap joinery geometry, and DXF-to-CNC of panel outlines.

## Approach (chosen)

Extend the existing `PartSpec` contract additively. A part may carry an optional 2-D
**profile** and **slots**; if present, it renders/exports as an extruded outline, if
absent it stays the current box. **Zero change to the 21 existing designs.** Rejected:
a separate parallel subsystem (forks the "one shape everywhere" contract, duplicates
BOM/builder/export); polygon-only v1 (under-delivers the curved pieces the user wants).

## Section 1 — Data contract (`stock.js`)

`PartSpec` gains two optional fields:

```js
profile: {
  plane: 'xy'|'xz'|'zy',          // flat-face orientation, same convention as panel()
  pts:   [ {x,y}, ... ],          // ordered boundary in the part's local plane (mm)
  arcs?: [ {after:i, r, large?, sweep?}, ... ]  // turn segment after pt i into an arc
}
slots: [ { x, y, w, depth, angle? } ]  // cross-lap/tab notches cut INTO the profile
```

- `profile` absent → box from `size` (current behaviour, untouched).
- `profile` present → `size` holds the profile's **bounding box** (compatibility shim so
  BOM, dimensions, selection, gizmo keep working with zero edits); the outline is the
  source of truth for render + cut export.
- `arcs` riding alongside `pts` (point+arc, not an SVG-path string) keeps the outline
  trivial to nest, measure, and emit to DXF — and lets one representation cover straight
  wedges and the Oval Rocker's curves.

New joint type (screwless), alongside `torx-*`:

```js
{ type: 'slot-crosslap', count, note }   // count = slot engagements; no screw
{ type: 'wedge-tenon',  count, note }    // tab + driven wedge
```

New stock/fit constants:

```js
SLOT_FIT = { snug: 0.10, standard: 0.25, outdoor: 0.35 }  // per-side clearance (mm)
RELIEF   = { bitDia: 6.35, kind: 'dogbone'|'tbone' }       // corner relief defaults
```

Rationale from research: ply thickness varies ±0.13 mm, so **slot width = measured
thickness + 2·fit**, fit chosen by class; a square tab cannot seat into a round bit's
inside corner without dog-bone/T-bone relief.

## Section 2 — Geometry, profiles & slots (`engineering.js`)

New factory + helpers beside `panel()`:

```js
profilePanel(ref, name, stockKey, {plane, pts, arcs}, pos, group)  // bbox → size auto
// outline generators → {pts, arcs}:
rect(w,h)  wedge(w,h,topInset)  trapezoid(...)  oval(rx,ry)  fin(anchorPts, fidelity)
// joinery:
crossLapSlot(x, y, mateThk, depth, angle?)   // width = mateThk + 2·fit
slotJoint(count, note)   wedgeTenon(tabThk, len, note)
```

`fin(anchors, fidelity)` is the key generator: takes the ergonomic anchor points
(front-foot, seat-front, seat-back/pivot, back-top, rear-foot — each a pure function of
the design's params) and connects them as a **polyline** (`fidelity:'poly'`,
jigsaw-able) or a **spline** (`fidelity:'curve'`, CNC-only). Same anchors → both tiers.

`profilePanel` computes the bounding box from pts/arcs into `size`; slots are stored on
the part and subtracted from the render/export outline. Corner relief is applied at
export/render time from `RELIEF`, not authored by designs.

## Section 3 — Seed designs (`src/designs/cnc_slot.js`)

Four pieces, one ply thickness each (default 18 mm), spanning the full range. Shared
slot module + shared fin motif so they read as one family.

1. **Slot-in Stool / Side Table** — _Easy._ 2–3 identical cross-lapped fins (X or central
   spine) + a top panel. Minimum exercise of the shared slot module. Straight profiles.
2. **Wedge Lounge Chair** — _Moderate._ Two mirrored triangular side fins (recline set by
   the fin curve) + seat/back panels cross-lapping through slots. Straight (poly) with
   optional eased back (curve). Proves cross-lap + the anchor-point fin generator.
3. **Slab Trestle Bench** — _Moderate._ Two angled slab ends + a seat panel through
   cross-lap slots + a wedged tusk-tenon stretcher tying the feet (outdoor/wind). The
   festival workhorse; shows the `wedge-tenon` joint and the spine-for-span rule.
4. **Oval Rocker** — _Involved._ Four **identical** oval profiles (arcs), slot-map varies
   per copy, cross-lapping into a self-bracing rocking cage. Headline freeform piece;
   proves spline profiles + the slot solver + identical-part nesting. `units`-style
   multiplicity parameter.

Each `build(p)` returns the existing `{parts, joints, steps, notes}` shape. Catalog
aggregates the new module into `CATALOG` (no change to the aggregation contract).

## Section 4 — Builder rendering (`builder.js`)

When a part has `profile`: build a Three.js `Shape` from `pts` (+`arcs`), punch `slots`
as boundary notches / `Path` holes, apply corner relief, `ExtrudeGeometry` to sheet
thickness, orient by `plane` + `rot`. No `profile` → existing box path. Selection, gizmo,
dimensions already key off `size` (the bbox) → unchanged.

## Section 5 — BOM & export

- **BOM (`bom.js`):** profiles nest by **bounding box** in v1 (honest, slightly
  conservative on yield — flag waste rather than fake tight curve-nesting). `slot-crosslap`
  / `wedge-tenon` joints render as a "slot engagements / wedges" line instead of screws.
- **Export (`export.js`):** cut-sheet SVG draws the **true outline + slots + relief** (not
  a rectangle). Lays the exact groundwork for the README's DXF-to-CNC item. Stretch:
  emit a **test-comb** cut file for fit calibration.

## Parameters exposed (per design, beyond piece-specific)

- **fit class** — snug / standard / outdoor-loose+wedged.
- **profile fidelity** — polyline (cut anywhere) / spline (CNC-only).
- **measured sheet thickness** — drives every slot width.
- **multiplicity** — number of identical fins (where the design supports it).

## Structural guardrails (wire into `reviewBuild`)

- 18 mm unsupported seat span > ~600–750 mm → warn "add a spine/bearer."
- Web between slot-end and panel edge ≥ 1.5–2× thickness.
- Grain along the load path for spanning parts (nesting constraint).

## Out of scope for v1 (YAGNI)

True curve-aware (true-shape) nesting; live-hinge kerf-flex generator; DXF export (SVG
first, DXF is the next roadmap step); hardware-fastener cut-file holes (the wedge tenon is
the outdoor answer for now).
</content>
