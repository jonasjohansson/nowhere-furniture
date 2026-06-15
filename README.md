# Nowhere Furniture Builder

A tiny browser sandbox for prototyping flat-pack barrio furniture out of two
materials: **sheet wood** (CNC plywood) and **reglar** (timber beams). Drag parts
together, size them in millimetres, and read off a live cut list.

Built for the Nowhere festival barrio build (10 people, knock-down / pack-flat,
CNC-cut at home + hand-assembled on site).

## Run

It's a static page — no build step. Either:

- Open `index.html` directly, or
- Visit it on the local server: <http://localhost/org/jonasjohansson/nowhere-furniture/>

(Needs internet the first time to pull Three.js from the CDN.)

## Controls

| Action | How |
|---|---|
| Select part | click it |
| Orbit / zoom | drag / scroll |
| Move gizmo | `W` |
| Rotate gizmo | `E` |
| Toggle snap (50 mm / 15°) | `S` |
| Duplicate | `D` |
| Delete | `Del` |
| Deselect | `Esc` |

## Parts

- **Sheet** — plywood panel (default 600 × 440 × 18 mm)
- **Reglar** — beam (default 1800 × 70 × 45 mm)
- **Seat slat** — thin beam for slatted seats
- **Leg** — square post

Edit any dimension in the inspector; geometry rebuilds live and the part stays
resting on the ground. The cut list groups identical parts and totals plywood
area + reglar length.

## Save / load

- **Save** stores the layout in your browser (localStorage)
- **Export JSON** downloads the layout; **Import** reloads one

## Roadmap ideas

- Wedge / tab joinery primitives (not just boxes)
- Sheet-nesting view (lay panels on a 2440 × 1220 sheet, count sheets)
- Dimensioned 2D shop drawings export
- DXF export of panel outlines for the CNC
