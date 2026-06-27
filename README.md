# Nowhere Furniture Builder

A browser tool for designing and costing **burner-friendly outdoor furniture** for
a festival barrio (built for Nowhere). Two materials only — **plywood sheet** +
**reglar timber** — fastened with **Torx wood screws**. Pick a design from the
catalog, tune its parametrics, read off the full metric **bill of materials**, and
export cut sheets + shop drawings. Or flip to **Vignette mode** and let the Shuffle
arrange the slot-together family into a functional hangout scene with one combined
build sheet. Or open the **Design Lab** and let a seed *invent* a brand-new
slot-together piece you can then tune, cost, and build like any catalog design.

Inspired by the honest-plank lineage: **Enzo Mari's Autoprogettazione**, Rietveld's
crate furniture, Donald Judd's plywood volumes, Prouvé, Perriand, Van Bo.

## Run

Static site, no build step. Visit it on the local server:

<http://localhost/org/jonasjohansson/nowhere-furniture/>

(Pulls Three.js from a CDN, so it needs internet the first time.)

## What it does

- **Catalog** of 24 parametric designs across benches, Mari pieces, lounges,
  stools, communal tables and a CNC **slot-together** family (now 5 designs:
  stool, lounge chair, bench, oval rocker, table) — each with engineered joinery,
  assembly steps, and a difficulty/build-time badge
- **Design Lab / Generate mode** — feed it a seed and it **invents a new
  slot-together piece** (a seeded spine-variation chair/lounger), then tune it with
  the normal sliders, read its **live BOM**, and export its build sheet. A generated
  piece is a **first-class design** — it works with the BOM and every export exactly
  like a catalog piece. A **validity gate** (no self-intersection, honest minimum
  features, centre-of-mass over the footprint, span within deflection limits) means
  every piece it offers is buildable, grounded, and stable. Reproduce or share any
  invention via `#g=<seed>` permalinks
- **Vignette / Shuffle mode** — a deterministic Shuffle arranges the slot-together
  family into fun, functional hangout scenes, then rolls up a **combined BOM** and a
  **profile-aware cut sheet** for the whole set. Shuffled scenes now **mix in
  generated pieces** alongside the fixed catalog, so a hangout can feature invented
  forms too. Every scene is reproducible and shareable via `#v=<seed>` permalinks
- **3D builder** — orbit, select, move/rotate gizmo, grid-snap, live dimensions,
  **undo/redo** (⌘Z / ⌘⇧Z), procedural warm-wood materials + soft shadows
- **Live BOM** — plywood sheets (2D-nested), reglar (cut-optimised into stock lengths),
  Torx screw schedule, rough SEK cost — recomputed on every edit
- **Exports** — print-ready BOM (HTML/print), BOM + cut-list CSV, sheet-nesting SVG,
  orthographic elevations SVG, and project save/load JSON

## Architecture

Modular ES modules against one pinned data contract (`PartSpec` / `Joint` / `Design`):

| File | Role |
|---|---|
| `src/stock.js` | Shared contract + metric stock tables (plywood, reglar, Torx screws) |
| `src/engineering.js` | Structural vocabulary — ergonomics, span/deflection rules, joinery + member factories every design builds from |
| `src/designs/*.js` | The designs by category (benches, mari, lounge, stools_tables) |
| `src/catalog.js` | Aggregates the design modules into one `CATALOG` |
| `src/bom.js` | `computeBOM()` — sheet nesting + timber cut-optimisation + screw schedule |
| `src/builder.js` | `Builder` class — Three.js scene, gizmo, selection, dimensions, undo/redo, wood graphics |
| `src/export.js` | CSV / print-HTML / cut-sheet SVG / elevations SVG / project JSON |
| `src/rng.js` | Tiny deterministic seeded PRNG — the basis of reproducible Shuffles |
| `src/sample_params.js` | Seeded sampling of each design's parametrics within engineered bounds |
| `src/generate.js` | `generateDesign(seed)` — *invents* a first-class slot-together design via seeded spine-variation (`varyFin`), gated by `validateDesign` (self-intersection / min-feature / centre-of-mass / span). Deterministic |
| `src/vignette_templates.js` | Scene templates — which slot-together pieces go where in a hangout |
| `src/vignette.js` | Builds a vignette from a seed: places the family, rolls up a combined BOM + cut sheet |
| `src/app.js` | Integration shell — wires catalog → builder → BOM → export, plus the Design · Vignette · **Lab** mode toggle (Generate button, slider tuning, PDF export, `#g=<seed>` permalink) |

All dimensions are **metric, authored in millimetres**. The 3D scene works in metres
internally; everything else stays in mm. Prices are rough SEK builder's-merchant
estimates for ballparking, not quotes.

## Controls

| Action | How |
|---|---|
| Select part | click · `Esc` deselect |
| Orbit / zoom | drag / scroll |
| Move / Rotate gizmo | `W` / `E` |
| Snap (50 mm / 15°) | `S` |
| Dimensions on selected | `M` |
| Add custom sheet / reglar | toolbar |
| Undo / Redo | `⌘Z` / `⌘⇧Z` (or toolbar) |
| Duplicate / Delete | `D` / `Del` |
| Fit view | `F` |

## Stock (edit `src/stock.js` to match your supplier)

- **Plywood** — 2440×1220 sheets in 12 / 15 / 18 / 21 mm
- **Reglar** — 34×45, 45×45, 45×70, 45×95, 45×120 mm in 3.6–5.4 m lengths
- **Screws** — Torx 4.0×40 … 6.0×120

## Roadmap

- ✅ A CNC **slot-together family** (stool, lounge chair, bench, oval rocker, table)
- ✅ **Vignette / Shuffle** arrangements — reproducible hangout scenes with a combined
  BOM + cut sheet, shareable via `#v=<seed>` permalinks
- ✅ **Generative phase 1** — the Design Lab *invents* validity-gated, first-class
  slot-together pieces from a seed (spine-variation), tunable and exportable, shareable
  via `#g=<seed>`; generated pieces now also appear in shuffled vignettes
- **Generative phase 2** — *morph*: blend/interpolate between two seeds or designs
- **Generative phases 3–4** — new generated piece *types* beyond the chair/lounger spine
- **DXF** export of panel outlines straight to the CNC
- Screw-position markers + assembly-step playback in 3D
- Per-design wind/anchoring detail (Nowhere gusts)
