import { snap } from './rng.js?v=22';

/** Randomize a design's params within their declared ranges (snapped to step,
 *  clamped to [min,max]) using the given seeded rng. Deterministic for a fixed
 *  rng sequence. Returns a {key: value} object build() accepts. */
export function sampleParams(design, rng) {
  const out = {};
  for (const p of design.params) {
    const raw = p.min + rng() * (p.max - p.min);
    let v = snap(raw, p.step);
    if (v < p.min) v = p.min;
    if (v > p.max) v = p.max;
    out[p.key] = v;
  }
  return out;
}
