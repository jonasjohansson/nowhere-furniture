# Nowhere Furniture Builder

A browser tool for designing and costing **burner-friendly outdoor furniture** for
a festival barrio (built for Nowhere). Two materials only — **plywood sheet** +
**reglar timber** — fastened with **Torx wood screws**. Pick a design from the
catalog, tune its parametrics, read off the full metric **bill of materials**, and
export cut sheets + shop drawings.

Inspired by the honest-plank lineage: **Enzo Mari's Autoprogettazione**, Rietveld's
crate furniture, Donald Judd's plywood volumes, Prouvé, Perriand, Van Bo.

## Run

Static site, no build step. Visit it on the local server:

<http://localhost/org/jonasjohansson/nowhere-furniture/>

(Pulls Three.js from a CDN, so it needs internet the first time.)

## What it does

- **Catalog** of 9 parametric designs (chairs, benches, lounges, stool, daybed)
- **3D builder** — orbit, select, move/rotate with a gizmo, grid-snap, live dimensions
- **Live BOM** — plywood sheets (2D-nested), reglar (cut-optimised into stock lengths),
  Torx screw schedule, rough SEK cost — recomputed on every edit
- **Exports** — print-ready BOM (HTML/print), BOM + cut-list CSV, sheet-nesting SVG,
  orthographic elevations SVG, and project save/load JSON

## Architecture

Modular ES modules against one pinned data contract (`PartSpec` / `Joint` / `Design`):

| File | Role |
|---|---|
| `src/stock.js` | Shared contract + metric stock tables (plywood, reglar, Torx screws) |
| `src/catalog.js` | The 9 parametric furniture designs (`CATALOG`, each with `build(params)`) |
| `src/bom.js` | `computeBOM()` — sheet nesting + timber cut-optimisation + screw schedule |
| `src/builder.js` | `Builder` class — Three.js scene, gizmo, selection, dimensions |
| `src/export.js` | CSV / print-HTML / cut-sheet SVG / elevations SVG / project JSON |
| `src/app.js` | Integration shell — wires catalog → builder → BOM → export |

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
| Duplicate / Delete | `D` / `Del` |
| Fit view | `F` |

## Stock (edit `src/stock.js` to match your supplier)

- **Plywood** — 2440×1220 sheets in 12 / 15 / 18 / 21 mm
- **Reglar** — 34×45, 45×45, 45×70, 45×95, 45×120 mm in 3.6–5.4 m lengths
- **Screws** — Torx 4.0×40 … 6.0×120

## Roadmap

- Real wedge / tab / lap **joinery geometry** (parts are still boxes)
- **DXF** export of panel outlines straight to the CNC
- Per-part **rotation/length editing** for custom timber from the inspector
- Wind/anchoring notes per design (Nowhere gusts)
