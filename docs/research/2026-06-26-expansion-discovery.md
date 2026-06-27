# Expansion Discovery — new pieces, new connections, new form-generation

_Compiled 2026-06-26 from five parallel discovery sweeps. Goal: break the "same kind of
designs" feeling in the CNC slot-together family (currently stool, lounge, bench, oval
rocker, table; joints = cross-lap, through-housing, wedge-tusk-tenon; profiles = polyline
+ circular arc; renderer extrudes profiles; vignette generator arranges pieces)._

Current engine touchpoints: `crossLapSlot(x,y,mateThk,depth,fit,angle)` (note: **already
carries an `angle` field**), `slotJoint`, `wedgeTenon`, `profilePanel({plane,pts,arcs,
slots})`, outline gens `rect/wedge/trapezoid/oval/fin`, `ERGO` presets, `beamMaxSpan`/
`panelSupportSpacing` structural rules, builder `ExtrudeGeometry`, `generateVignette`.

---

## TL;DR — highest-leverage moves (ranked)

1. **Oblique slot (`angle θ`)** — our `crossLapSlot` already has the field; wiring a non-90°
   angle through the builder/export unlocks splayed legs, X-trestles, A-frames, raked
   silhouettes, and (with an N-gon plate) faceted/polygonal bodies. Pure 2-axis, screwless.
   *Biggest variety-per-effort.* (connection)
2. **True spline outlines + biarc flattener** — author Bézier/NURBS, flatten to our existing
   arc+line primitives within tolerance. Instantly kills the "compass-drawn oval" look on
   parts we already ship. No fabrication risk. (form)
3. **Profile morphing + ergonomic-spine generator** — blend two existing designs at a seeded
   `t`, and/or fix ERGO anchors as a spine and vary the curve between them. The literal
   "generate a NEW design (not just arrangement)" feature — directly answers "same designs."
   Valid-by-construction; add a validity gate. (form/generative)
4. **Waffle-grid (N×M cross-lap) primitive** — generalizes our 1×1 cross-lap to a parametric
   grid; unlocks shade canopies, totems, plinths, and contour sculptures. Self-fixturing.
   (connection → many new pieces)
5. **Shared docking-slot / connector convention** — a standard male/female edge slot so a
   stool docks a bench docks a shelf; turns the catalog into a *system* and pairs with the
   vignette generator (arrangement → assembly). (connection/modular)

---

## A. New CONNECTIONS (joinery primitives)

Universal: ply varies ±0.13mm → tune clearance (~0.1 snug / 0.2–0.25 assemblable / 0.3–0.5
rotating); every square male edge in a routed slot needs a **dogbone/T-bone** relief
(fillet ≥1.1× tool radius); ~45° lead-in chamfers help.

- **Oblique / angled cross-lap (`angle θ`)** ★ — splayed/raked/X/A silhouettes + faceted
  N-gon bodies (oblique slots into a top/bottom registration plate). Slot length scales
  `t/sinθ`; triangulate below ~50–60°. *Our slot already has `angle` — cheapest change.*
- **Waffle-grid / egg-crate (N×M half-depth slots)** ★ — self-supporting lattice; canopies,
  totems, contour sculptures, lamps. slot=thk+kerf, notch depth = ½ rib, keep ≥2× thk web.
- **Pivot / round-tab cut from ply** — *motion*: folding flat-pack chairs, tilting backs,
  concertina dividers. ~0.3–0.5mm radial clearance; 18mm helps the pin bearing. New category.
- **Keyhole tab-and-slot** — hang-and-drop, gravity-loaded, reconfigurable (wall shelves).
  Router-friendly. **Cam / twist / quarter-turn lock** — separate disc rotates 90° to clamp;
  expressive visible detail, tool-free knock-down.
- **Edge-to-edge orthogonal panel notch** — two slotted panels meeting at 90° → self-standing
  screens/barrio walls, storage cubes, crates, playhouses (enclosures).
- **Stacking interlock notch** — top of one unit registers into the next → crates/cubes that
  stack into walls/seats.
- **Edge splines / loose-tenon splines** — tile sheets into surfaces **bigger than one sheet**
  (tabletops, walls); segmented splines follow curved edges. Separate spline part + groove.
- **Dovetail family** (sliding dovetail, dovetail key, bowtie key) — self-locking, slide-in
  assembly, contrasting-key accents. *Caveat: true undercuts need a dovetail bit / angled
  pass — not pure flat 2-axis.*
- **Through-tube / dowel peg** — joins spaced/stacked panels AND carries a fabric-shade
  surface (Chinchilla Solar Trees, 18mm). Cheap, very on-theme.
- **Radial multi-way half-lap at a hub** (3+ panels) — umbrella/valet stands, radial pot
  holders, globe-lamp hubs. **Hook-on-rail tab** — reconfigurable wall systems (Vitsœ logic).
- **Self-contained / captive wedge** (tusk wedge tethered or shaped not to fall out) —
  truly loss-proof flat-pack; tip-resistance for tall pieces; tension joints (hammock).
- **Blind tab-in-pocket (stopped slot)** + **hardware-free sliding-door track** — box
  carcasses (DJ booth, bar front, credenza).

Sources: Make: CNC Panel Joinery Notebook; CMU Flat-Pack Joinery; Fab Academy press-fit;
AtFAB/Opendesk remastered joinery; WikiHouse TIE (peg+wedge, 18mm, structural).

---

## B. New PIECE TYPES (by effort)

**Zero new joinery — new profile only (fastest wins):** counter/bar stool, sun-lounger
chaise (multi-slot recline), spine-and-rib daybed, tree coat rack, bike stand, shoe rack,
2-part plant stand, animal step-stool, animal rocker, rib-stack floor-lamp totem, DJ
booth / bar-front box, serving counter.

**One new joint, high barrio payoff:** waffle-grid shade canopy / totem (waffle-grid);
Playatech-style barrio wall / screen (orthogonal panel notch); stacking crate (stacking
notch); mashrabiya/lattice screen (interior cutout generator + panel-notch base).

**Most visibly different from chairs/benches:** mashrabiya screen, honeycomb/hex cube
shelving, waffle totem, contour-slice animal (deer), pyramid planter, glowing floor-lamp
totem, rib/wave divider wall.

**Festival-specific white space (no canonical screwless ply design exists — we'd own it):**
**DJ booth / serving station** and **lectern** (both = our table/bench profiles in a taller
box on a blind-slot carcass).

**Lighting** needs a **thin-stock override** (3–4mm, finer tabs/kerf) + openwork profile:
polyhedral tab-slot lamp, radial rib-and-ring pendant, tea-light lantern, floor-lamp totem.

Notable references: Playatech (Burning Man slot furniture, 18mm); Gregg Fleishman Otic
Oasis / Space Cubes (panel-puzzle pods + node joints); Zomadic Zome (parametric ZomeBuilder
— direct app precedent); Chinchilla Solar Trees (18mm + fabric shade); Opendesk Fin lockers;
parametric spine-and-rib bench/daybed; Obrary Alex Chair (living-hinge lounger).

---

## C. New FORM-GENERATION (the "same designs" fix)

Core insight (Umetani SIGGRAPH'12, SketchChair, arXiv 2104.05052): **don't sample shapes
and reject bad ones — sample a constrained space where every point is valid.**

1. **Ergonomic-spine + control-point families** (do first) — fix ERGO anchors (seat front/
   back, back-top, feet) as the profile spine; vary Bézier/arc control points *between*
   them (bulge/taper/waist/cutout). New silhouettes, valid by construction. Reuses `fin()`.
2. **Physical-validity envelope** (Umetani) — gate samples on CoM-inside-support-polygon +
   our existing span/deflection rules → sample boldly without tippy/weak output.
3. **Profile morphing between archetypes** — resample two designs to equal point count,
   interpolate at seed `t`. Fastest *visible* novelty; almost free. Re-derive slots at the
   blended intersections.
4. **Connection-graph grammar** (arXiv planar-pieces) — sample a typed graph of roles
   (fin/seat/back/stretcher) + connection rules (fin↔seat=housing, fin↔fin=half-lap) →
   *topological* variety (2-fin vs 3-fin, X-base vs A-base), not just silhouette.
5. **Superformula / symmetry ops** — cheap organic curves for *decorative* (non-load)
   regions (back cutouts, aprons, feet).
6. **Always-on validity guard** — no self-intersection; min feature ≥ cutter dia + thk;
   slots only at true plane intersections; ergonomic clearance box. Reject→reseed.

**Curved/sculptural techniques** (break "flat slab + oval"):
- **True splines + biarc flatten** (cheapest visual win — see TL;DR #2).
- **Rib/waffle contour** (= waffle-grid primitive applied to a sliced surface).
- **Polar array + hub** (globe/sunburst lamps, twisted helical stacks).
- **Kerf-bending (partial-depth)** for true curved seats/backs — 18mm needs a 3-axis depth
  pass (~¼" bit, ~9.5mm spacing, ~2.4mm skin) + usually a captive curved spine. Highest cost.
- **Stacked-contour topography** (terraced stools/lamps) — glue or core-registered.
- **Faceted unfold** (origami shells) — needs real 3-D unfolding; defer.

Sources: Umetani Guided Exploration (SIGGRAPH'12); SketchChair (Diatom, open source);
Jens Dyvik Layer Chair (one definition → a family); arXiv:2104.05052 fabrication-aware
planar pieces; WoodWeb kerf-bending; Gielis superformula.

---

## D. Modularity / making it a SYSTEM (pairs with the vignette generator)

- **One universal connector cut from the same sheet** (PLY90 / USM logic) — a single docking
  part with discrete angle/direction variants → catalog becomes a graph of panels.
- **Shared docking-slot convention across pieces** (WikiHouse/Mari) — stool↔bench↔shelf grow.
- **Module-grid param** (WikiHouse 600 / GRID 400 / Vitsœ rail) — everything snaps + tiles.
- **Hex/tri tile-adjacency seating** (Streetlife Hex Podium / Gus*) — give tiles dock-edges
  and the vignette generator's *arrangement* becomes *assembly*. Strong synergy.
- **Expose the grammar, Dyvik-style** — one parametric definition + rules → the whole family.

Sources: PLY90, PlayWood, USM Haller, Vitsœ 606, WikiHouse, Enzo Mari Autoprogettazione,
GRID, Streetlife Hex Podium, Gus* Podium, Jens Dyvik / OpenNest.

---

## Suggested first build (a coherent, high-impact slice)

A "**Generate a new design**" capability + the cheap geometry that makes it look fresh:
- **Oblique-slot support** (wire `angle θ` through builder + export) → raked/faceted forms.
- **Profile morphing + ergonomic-spine generator** with the validity gate → a Shuffle that
  invents *new* pieces, not just rearranges 5. (Directly answers "same kind of designs.")
- **True spline outlines + biarc** → organic silhouettes on existing + generated parts.
Stretch / next slices: **waffle-grid primitive** (canopies/totems/sculptures) and the
**shared docking-slot** (pieces that combine — extends the vignette generator).
</content>
