import { snap } from './rng.js?v=23';

/** Randomize a design's params within their declared ranges (snapped to step,
 *  clamped to [min,max]) using the given seeded rng. Deterministic for a fixed
 *  rng sequence. Returns a {key: value} object build() accepts.
 *
 *  Lives in its own module (not vignette.js) so vignette_templates.js can import
 *  it without pulling in vignette.js — keeping the module graph acyclic:
 *  vignette.js -> vignette_templates.js -> sample_params.js -> rng.js. */
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
