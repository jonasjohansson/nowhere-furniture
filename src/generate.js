// ============================================================================
// generate.js — INVENTS new slot-together furniture from a seed.
//
// This file grows over the generator tasks; for now it exposes only varyFin().
// Everything here is PURE: the only randomness is the caller-seeded rng (a
// mulberry32 function) — no Date, no Math.random.
// ============================================================================
import { fin } from './engineering.js?v=23';

/** Clamp v into [lo, hi]. */
function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
/** A bounded signed offset: rng()->[0,1) mapped to [-amp, +amp]. */
function signed(rng, amp) {
  return (rng() * 2 - 1) * amp;
}

/**
 * varyFin(spec, rng) — produce a side-fin profile (the side silhouette of a
 * chair / lounger) from ergonomic anchors plus seeded, BOUNDED variation.
 *
 * spec: { seatH, seatD, backAngle (deg, from seat), backH } — same fields the
 * cnc-slot-lounge design uses. Returns a profile { pts:[{x,y}...], arcs:[...] }
 * in LOCAL coords: local-x = front→back depth, local-y = height, foot on the
 * ground at y=0 (the house side-fin convention, mirrored from the lounge).
 *
 * The five ergonomic anchors are computed exactly as the lounge does
 * (front-foot → seat-front → seat-back/pivot → back-top → rear-foot). The rng
 * then PERTURBS that skeleton — control points never float free, every offset
 * is clamped to a fraction of the relevant dimension so profileBBox always
 * stays within sane bounds (height in (seatH, seatH+backH); depth roughly
 * 0.6–1.8 × seatD). Same seed -> identical profile.
 */
export function varyFin(spec, rng) {
  const seatH = spec.seatH;
  const seatD = spec.seatD;
  const backH = spec.backH;
  const rad = (spec.backAngle * Math.PI) / 180;

  // --- Ergonomic skeleton (mirrors the lounge anchor math) -----------------
  const backDX = -backH * Math.cos(rad);   // backAngle>90 => leans rearward (+x)
  const backDY = backH * Math.sin(rad);    // vertical rise of the back
  const seatFrontX = 0;
  const seatBackX = seatD;                  // pivot where seat meets back
  const backTopX = seatBackX + backDX;
  const backTopY = seatH + backDY;
  const rearFootX = backTopX;               // rear foot under the back-top

  // --- Bounded control offsets (PERTURB the skeleton, clamped) -------------
  // Clamps are deliberately conservative so the resulting bbox always lands
  // inside (seatH, seatH+backH) for height and ~[0.6,1.8]·seatD for depth.

  // Foot flare: push the two feet apart along x (front foot back -x, rear foot
  // forward/back) for a stance — clamped to a fraction of seatD.
  const frontFootFlare = clamp(signed(rng, seatD * 0.10), -seatD * 0.12, seatD * 0.12);
  const rearFootFlare = clamp(signed(rng, seatD * 0.12), -seatD * 0.14, seatD * 0.14);

  // Seat-front taper: lift / nudge the seat-front lip in x (toe room).
  const seatFrontTaper = clamp(signed(rng, seatD * 0.06), -seatD * 0.08, seatD * 0.08);

  // Back lean delta: extra rearward/forward shift of the back-top in x.
  const backLeanX = clamp(signed(rng, backH * 0.08), -backH * 0.10, backH * 0.10);
  // Back rise delta: DOWNWARD-biased, and the UPWARD allowance is capped to a
  // fraction of the actual headroom left under the seatH+backH ceiling. The
  // skeleton's backTopY can already sit a hair under that ceiling (when
  // sin(backAngle)≈1), so a fixed upward clamp would overshoot — gate it on the
  // remaining headroom instead so the bbox height stays strictly below the cap.
  const ceiling = seatH + backH;
  const headroom = Math.max(0, ceiling - backTopY); // skeleton gap to the ceiling
  const upCap = Math.min(backH * 0.04, headroom * 0.5);
  const backRiseRaw = rng() * (backH * 0.16) - backH * 0.12; // [-0.12, +0.04]·backH
  const backRiseY = clamp(backRiseRaw, -backH * 0.14, upCap);

  // Resolve the x extremes and clamp the RIGHTMOST extent against the depth cap.
  // A deeply reclined back already pushes the rear foot far back, so the rear
  // perturbations (backLeanX + rearFootFlare) must not push width past
  // 1.8·seatD. minX is the front foot (always ≤ 0); rightMax is the budget for
  // the rear edge given that left extent.
  const frontFootX = seatFrontX - frontFootFlare;   // ≤ 0
  const seatLipX = seatFrontX + seatFrontTaper;     // may be < 0 too
  const minX = Math.min(frontFootX, seatLipX, 0);   // true left extent of the hull
  const rightCap = minX + seatD * 1.8 - 1;          // -1mm so it stays strictly under
  const rearDesired = rearFootX + backLeanX + rearFootFlare;
  const rearActual = Math.min(rearDesired, rightCap);
  // Keep the back-top from poking past the rear foot's clamped x (so the bbox
  // right edge is exactly rearActual).
  const backTopXp = Math.min(backTopX + backLeanX, rearActual);

  // Build the perturbed anchors.
  const anchors = [
    { x: frontFootX, y: 0 },                                // front foot
    { x: seatLipX, y: seatH },                              // seat front lip
    { x: seatBackX, y: seatH },                             // seat back / pivot
    { x: backTopXp, y: backTopY + backRiseY },              // back top
    { x: rearActual, y: 0 },                                // rear foot
  ];

  // Straight-segment fin. We express the silhouette's character through the
  // bounded anchor perturbations above rather than fillet arcs: fin()'s 'curve'
  // mode bows whole segments OUTWARD (its arcs can balloon the bbox well past
  // the anchors), which would break the depth/height bounds. Keeping 'poly'
  // means the bbox is exactly the perturbed-anchor hull, which our clamps keep
  // inside (seatH, seatH+backH) tall and ~[0.6,1.8]·seatD deep.
  return fin(anchors, 'poly');
}
