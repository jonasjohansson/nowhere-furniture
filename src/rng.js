// Shared seeded PRNG + helpers for the vignette generator.
//
// `mulberry32` and `hashString` are copied faithfully from src/builder.js so the
// generator can depend on a stable, deterministic RNG without importing (and
// destabilising) the working builder. Everything here is pure: no Date, no
// Math.random — consumers seed `mulberry32` explicitly.

/** mulberry32 — tiny deterministic PRNG seeded from a uint. Returns a function
 *  producing floats in [0,1). Same seed -> same sequence. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 32-bit FNV-1a hash of a string -> unsigned int. Stable across runs. */
export function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Inclusive integer in [lo, hi]. */
export function randInt(rng, lo, hi) {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

/** Random element of an array. */
export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

/** Round v to the nearest multiple of step. step <= 0 returns v unchanged. */
export function snap(v, step) {
  if (step <= 0) return v;
  return Math.round(v / step) * step;
}

/** Turn a string or number into a uint seed. Numbers pass through as uint. */
export function seedFrom(x) {
  if (typeof x === 'number') return x >>> 0;
  return hashString(String(x));
}
