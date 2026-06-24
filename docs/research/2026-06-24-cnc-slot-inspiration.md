# CNC Slot-Together Furniture — Inspiration & Technique Reference

_Compiled 2026-06-24 from five parallel research sweeps. Feeds the "CNC slot-together"
single-sheet design family (see `docs/plans/2026-06-24-cnc-slot-furniture-design.md`)._

The family: **one plywood sheet thickness, CNC-cut profile parts (straight + freeform),
joined by slots / cross-laps / tabs / wedges, minimal-to-no hardware.** The parts ARE
the structure.

---

## 0. The two paradigms

1. **Hardware-free press-fit cross-lap / notch** — the core model. Works for straight
   AND curved profiles. Precedents: Oval Rocker, SketchChair, Opendesk Valoví,
   Gregg Fleishman, AtFAB, WikiHouse. **This is what we build.**
2. **Curve-driven 2.5D lamination** — stacked contour slices glued (Jens Dyvik Layer
   Chair). Great generative *input* method, but glued not slotted. We borrow the
   profile-from-control-curves idea, not the glue.

> Every iconic "sculptural plywood" piece except Jasper Morrison's Ply-Chair gets its
> sculpture from *bending* (Eames, Aalto, Panton, Gehry). A flat slot/lap process can't
> bend — we approximate curves via **faceting, ribbed cross-sections, or curved profile
> outlines** (the Oval Rocker route).

---

## 1. Joinery & CNC tolerances (the engine numbers)

- **Sheet:** 2440 × 1220 mm (8×4). Default thickness **18 mm** for anything an adult
  sits on (12 mm only if heavily triangulated; 25 mm for long benches).
- **Ply thickness varies ±0.13 mm** sheet-to-sheet (sometimes >0.2). → **slot width must
  be a runtime parameter keyed to MEASURED thickness, never a constant.** This is the #1
  fit failure. (Etsy makers ship separate files per 17/18/19 mm.)
- **Press-fit clearance:** snug/structural **+0.1–0.2 mm** total (slot wider than tab);
  glued housing ~0.1; glue-gap tenon +0.3–0.4. Tune on a **test comb** (±0.025 mm steps)
  before committing a sheet.
- **Inside-corner relief is mandatory** — a square tab can't seat into a round bit's
  corner. **Dog-bone** (radius ≥1.1× tool radius, e.g. ≥3.5 mm for 6.35 mm bit) for
  structural/hidden corners; **T-bone** toward the hidden face on show surfaces.
  Alternative: round the mating tab edges to the bit radius (no dog-bone needed).
- **Cross-lap (half-lap):** each part notched 50% depth, slot width = mating thickness +
  fit. Self-squaring, self-locating, carries shear, resists racking — the stiffness engine.
- **Tab-and-slot through-tenon:** tab = thickness + a few mm proud if it takes a wedge.
- **Wedge / tusk tenon:** tab projects through a mortise, tapered (~5°) wedge driven
  through a slot in the tab clamps it — demountable, re-tightenable as wood moves. Best
  default for outdoor/festival (swelling + wind).
- **Web between slot-end and panel edge ≥ 1.5–2× thickness** or the tab shears out.
- **Grain along the load path** for spanning parts (seat, shelf: face grain across the
  span); vertical for tall fins. A hard nesting constraint, not cosmetic.
- **Bit:** 1/4" (6.35 mm) common; compression bit for clean ply faces. Chamfer leading
  edges of tabs ~45° so they start into slots.
- **Structural anchor:** WikiHouse 18 mm interlocking-ply joint tested ~7 kN tension /
  ~7.9 kN shear. Adult ≈ 1 kN — large margin. 18 mm press-fit genuinely load-bearing.

Sources: AtFAB *Design for CNC*; Make: CNC Panel Joinery Notebook; toolstoday.com;
whatmakeart.com; Carbide3D forum; WikiHouse joint test (PMC12566597); Fab Academy press-fit.

---

## 2. Parameters that matter (drive the generator)

Model the **side fin** as anchored control points — each a pure function of params —
then connect with straight segments (polyline) OR a spline. Same math → both tiers.

Anchors: front-foot · seat-front · seat-back/pivot · back-top · rear-foot.

- **Seat height:** dining 440–480 (440 default); lounge/festival 360–420.
- **Seat depth:** dining 410–460; lounge 560–660 (deep seat needs reclined back).
- **Back angle (included):** dining 95–105°; lounge 105–120°.
- **Seat tilt:** 3–5° dining, up to ~10° lounge (tilt + back angle stop sliding out).
- **Back height above seat:** 350–400 mm support is enough; taller = more wind sail.
- **Width / span:** the parameter that triggers structural limits (§3).
- **Multiplicity:** number of identical fins/slats as a parameter (Oval Rocker = 4
  identical). Derived: armrests (lounge only), table/bar heights as offsets of seat grid.

Expose as choices: **fit class** (snug ~0.1 / standard ~0.25 / outdoor-loose+wedged
+0.3–0.4) and **profile fidelity** (polyline = jigsaw-able anywhere / spline = CNC-only).

---

## 3. Structural rules of thumb

- Plywood is a **plate**, not a beam: deflection ∝ span⁴ / thickness³.
- **18 mm unsupported seat/shelf span limit ≈ 600–750 mm** before objectionable sag
  (~800 only with a stiffening lip). Double span → ~8× sag.
- **Stiffness comes from depth, not thickness** → a vertical fin/apron/spine in the load
  plane beats a thicker sheet. Bench seat > ~700 mm clear needs a spine or intermediate
  support.
- **Cross-laps triangulate the box** in two planes — the cheapest rigidity.
- Add a second panel/spine when: clear span > ~600 mm, seat cantilevers off fins, or it's
  a single broad plate (table top → torsion box via perimeter apron/central spine).

---

## 4. Material efficiency

- **Design in identical parts** (one geometry, cut N×): dense rotational nesting, one cut
  file, one QA check, interchangeable spares. Make multiplicity a parameter.
- **Rotation-limited nesting:** allow 0°/180°/mirror, lock out 90° on grain-critical parts.
- **Curves cost yield** — concave/freeform leaves unrecoverable pockets; reserve curve
  budget for where it earns comfort/signature. Straight/single-radius packs tighter.
- **One thickness across the catalog** (one SKU, one slot module) so offcuts feed each other.
- **"Two-up / one-up per 8×4 sheet"** is both a marketing hook and a generative bound
  (Valoví, AtFAB, Scissor Chair).

---

## 5. Family / aesthetic coherence — share modules, not silhouettes

- **One slot module:** one slot width (= thickness), one cross-lap depth (50%), one relief
  radius, one tab length → anyone who builds one piece can build all.
- **One signature motif:** a recurring curve/foot/corner-radius reused across chair, bench,
  stool, table, rocker (role changes, curve family stays).
- **Shared height grid** (seat height locked; table/bar derived as offsets) so a chair and
  its table visibly belong together.
- **Coherence falls out of shared code:** one base-profile function + type presets + one
  joinery library generates the whole catalog.

### What makes flat parts read "intentional / friendly" (not crafty)
1. Silhouette carries it — the side profile must read in pure outline.
2. One profile, instanced (mirror/repeat, only slots vary).
3. Curvature = one editable spline (rocker arc, seat sweep).
4. Big radii everywhere, no raw 90° outer corners (also the safety cue).
5. Honest, exposed joinery — slots read as construction-toy language.
6. Thickness drives everything; auto-generate per-thickness variants.
7. Relief only where hidden; clean show faces.
8. Self-bracing friction/wedge locks (Opendesk's four fit classes; WikiHouse wedge-and-peg).
9. Plump > spindly — chunky legs, low CG, flared base.
10. Nest in one sheet — discipline that makes the part count look resolved.

---

## 6. Reference pieces (by type)

### Rockers
- **Oval Rocker — Andrew Doxtater (2022) ★ the seed.** 19 mm birch, **4 identical oval
  profiles, only slot positions differ**, pure cross-lap, no hardware, ~100×100×74 cm,
  one 8×4 sheet. Bottom edge of the oval = the rocker arc. The cleanest parametric case:
  one spline + a slot-placement table generates the whole piece.
  andrewdoxtater.com/work/ovalrockerdiy
- Parametric Rocking Chair (Etsy, 15 mm, slot/tab, no glue/screws).
- Children's rocking animals (18 mm, ~6 flat parts: 2 curved rockers + stretchers + silhouette).
- Instructables CNC / Curvy rockers — round slat edges to bit radius for slip-fit.

### Lounge / easy chairs
- **AtFAB 90-Minute Lounge** — 18 mm, mirrored side ribs + identical slats, slot+cross-lap,
  parametric to thickness.
- **Gregg Fleishman (Lumbarest / European Cutout)** — 19 mm birch, slot/notch interlock,
  no glue/fasteners, kerf-cut spring flex, MoMA collection.
- P9L Lounge (rounded pocket ends, no dog-bones). Live-hinge curved lounger (Inventables)
  — dense kerf field bends flat sheet into smooth curve.

### Dining / side chairs
- **AtFAB 5-to-30-Minute Chair** — 18 mm, 10 pieces (incl. mirror pairs), self-jigging
  slot+tab, two chairs per 8×4 sheet.
- **Opendesk Valoví Chair (Denis Fuzii, 2014) ★ closest open analog** — 15 mm birch, 20
  parts, **36 friction cross-lap joints, no hardware**, one rear beam cut 10 mm oversized
  to lock the structure, two per sheet, CC-licensed free DXF + PDF.
- CNC Scissor Chair — one 8×4 sheet of 1/2" ply, friction-fit only, no hardware/glue.

### Stools & side tables
- **AtFAB Beside Table** — 18 mm, 11 interlocking parts, notched fins + cross-lap,
  450×450×405 mm, two per sheet.
- **Opendesk Edie Stool** — circular seat + 3 slot-in legs, "Lego-style" glue-free,
  **four fit classes** (mallet-tight / press-fit / push-fit / slide-fit) at 0.1 mm tol.
- Cross-Lock Stool (free DXF, central-spine cross-lock). 3-way lap-joint tripod stool.
  3Barchi / Furnishapes DXF sets (18 mm default, vertical leg fins + ring/top).

### Cross-lap X/+ bases & plant stands
- Interlocking Plant Stand (CC BY 3.0) — **2-part center half-lap**, the minimum viable.
- WikiHouse fin-and-slot + wedge-and-peg — the generalizable primitive; an X/+ base is one
  special case of a notched-fin engine.

### Benches (full brief in §7)
- **Donald Judd "Slip Together" Plywood Bench 76 (1990)** — birch ply, 50×100×200 cm,
  panels slot together, zero fasteners. The literal reductivist model.
- **Tusk/wedge through-tenon benches** (Zeugmatic, Stilwell Shaper, Woodworker's Journal)
  — stretcher tab through leg slot, locked by a flat wedge cut from the same sheet.
- UNFNSHED Modern Bench (US birch, 4 parts, 60-sec tool-free). Klo Lab mallet-assembly.
- e15 Bigfoot; Plank+Beam Verso; Shaker meeting-house bench (seat ~440 mm confirmed);
  Nakashima Conoid (butterfly/bowtie key = flush slot-together motif); Enzo Mari
  Autoprogettazione bench (philosophy anchor — swap nails for slots).

---

## 7. Parametric peer group (prior art to study)
- **SketchChair (Diatom Studio, open source, GitHub)** — our direct ancestor: draw a 2D
  side profile → auto-generate slotted ribs + spines, slots auto-inserted at every plane
  intersection, ragdoll ergonomic test, thickness-driven. **Read its slot-insertion code.**
- **AtFAB / Filson & Rohrbacher** — parametric thickness + slot size, book *Design for CNC*.
- **Opendesk** — cross-lap "wooden fin" vocabulary, distributed local fabrication model.
- **WikiHouse** — wedge-and-peg, validated structural numbers.
- **Jens Dyvik Layer Chair** — control-curve → contour slices (glued; borrow the input idea).

---

## 8. Export target (recurring across sources)
Per-part DXF + nested 8×4 sheet layout + PDF assembly; optional 1:1 printable templates;
SVG/DWG. 18 mm Baltic birch is the de-facto default. Emit a **test-comb cut file** for
fit calibration.
</content>
</invoke>
