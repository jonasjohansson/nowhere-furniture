// ============================================================================
// wood.js — AUTHENTIC PROCEDURAL WOOD MATERIAL FACTORY
//
// Builds top-quality MeshStandardMaterial(s) for the box "parts" the furniture
// builder renders. Real-timber goals, all implemented below:
//   - grain runs ALONG the board's length axis
//   - soft growth-ring bands (earlywood lighter, latewood darker/redder)
//   - occasional knots + cathedral arches
//   - fine pores, warm color, subtle board-to-board variation
//   - END-GRAIN (concentric rings) on the two cut ends
//
// Public API (called once per part by the builder):
//   createWoodMaterial(THREE, opts) -> MeshStandardMaterial | Material[6]
//   disposeWoodCache()              -> free module-cached base textures
//
// Determinism: NO Math.random / Date.now anywhere. All variation flows from a
// seeded mulberry32 PRNG over a string hash of `seed`.
//
// Performance: heavy canvas synthesis is done ONCE per (tint, quantized-axis)
// and cached at module scope. Per call we CLONE the cheap GPU texture wrapper
// and set rotation / repeat / offset / colorSpace — so ~150 parts is a handful
// of canvas draws, not 150. The caller owns (and disposes) the clones + the
// material it receives; disposeWoodCache() frees the shared base textures.
//
// All dimensions are millimetres (mm). World/grain density is computed in mm so
// grain looks the same regardless of part size.
// ============================================================================

import { SHEETS, TIMBER } from './stock.js';

// ----------------------------------------------------------------------------
// Tunables
// ----------------------------------------------------------------------------
const TEX = 1024;               // base canvas resolution (square)
const END_TEX = 512;            // end-grain canvas resolution (square)
// The long-grain albedo spans the WHOLE board along its length (repeat = 1) so
// the grain runs end-to-end with no repeating motif and no seam. The canvas is
// built with full-length longitudinal striations + gentle low-frequency
// waviness, so even stretched onto a very long board it still reads as natural
// continuous grain. No GRAIN_PERIOD_MM tiling along the length anymore.
const CROSS_PERIOD_MM = 150;    // world length (mm) across the board per tile
const RING_PERIOD_MM = 7;       // growth-ring spacing target on end grain (mm)
const NORMAL_STRENGTH = 0.55;   // low-moderate; grooves catch raking light
const FALLBACK_COLOR = 0xc9a063;// warm pine if stockKey unknown / no color

// ----------------------------------------------------------------------------
// SPECIES + FINISH LIBRARY (opt-in via opts.style)
//
// `opts.style = { species, finish, paintColor? }` is FULLY OPTIONAL. When it is
// absent the legacy code path runs untouched (byte-identical output). When it is
// present, the species sets the wood's colour palette + grain character, and the
// finish modulates colour / roughness / sheen on top.
//
// A species descriptor overrides timberHsl()'s amber anchor with a hand-tuned
// {h,s,l} for the earlywood field, plus knobs the canvas builders read:
//   ew      : earlywood HSL anchor (the lighter "spring" wood between rings)
//   lwDark  : extra lightness drop for latewood (dark ring) bands
//   lwSat   : extra saturation in latewood
//   redden  : warm hue shift in latewood (overrides the per-board jitter)
//   ringMul : ring-band frequency multiplier (rings closer/farther apart)
//   ringBias: contrast/sharpness of the ring (1 = nominal; <1 fainter, >1 harder)
//   striMul : fine-striation darkness multiplier (grain "lines" visibility)
//   poreMul : pore speckle multiplier (open vs closed grain)
//   blotchMul: large-scale blotch/figure strength
//   roughBase: roughness-map base for this species before the finish adjusts it
//
// Hues are in turns (0..1). The amber/timber band sits ~0.06..0.11.
// ----------------------------------------------------------------------------
const SPECIES = {
  // PINE — pale warm golden softwood. Wide soft rings, visible but gentle.
  pine: {
    ew: { h: 0.095, s: 0.30, l: 0.70 },
    lwDark: 0.12, lwSat: 0.05, redden: 0.020,
    ringMul: 0.9, ringBias: 1.0, striMul: 1.0, poreMul: 0.7, blotchMul: 1.0,
    roughBase: 0.60,
  },
  // OAK — mid honey-brown hardwood. Stronger, harder rings + open pores.
  oak: {
    ew: { h: 0.082, s: 0.33, l: 0.60 },
    lwDark: 0.18, lwSat: 0.06, redden: 0.018,
    ringMul: 1.15, ringBias: 1.35, striMul: 1.15, poreMul: 1.5, blotchMul: 1.0,
    roughBase: 0.62,
  },
  // WALNUT — dark chocolate brown hardwood. Fine, tight, low-contrast grain.
  walnut: {
    ew: { h: 0.060, s: 0.34, l: 0.34 },
    lwDark: 0.10, lwSat: 0.04, redden: 0.012,
    ringMul: 1.5, ringBias: 0.8, striMul: 0.9, poreMul: 0.8, blotchMul: 1.3,
    roughBase: 0.55,
  },
  // BIRCH-PLY — very pale, near-cream. Faint, almost-straight grain (plywood).
  'birch-ply': {
    ew: { h: 0.105, s: 0.20, l: 0.78 },
    lwDark: 0.05, lwSat: 0.02, redden: 0.008,
    ringMul: 1.3, ringBias: 0.45, striMul: 0.6, poreMul: 0.3, blotchMul: 0.6,
    roughBase: 0.58,
  },
  // IROKO / TEAK — warm outdoor golden-brown hardwood. Rich, oily, even.
  iroko: {
    ew: { h: 0.075, s: 0.40, l: 0.50 },
    lwDark: 0.13, lwSat: 0.06, redden: 0.022,
    ringMul: 1.1, ringBias: 1.0, striMul: 1.0, poreMul: 1.1, blotchMul: 1.1,
    roughBase: 0.58,
  },
};
SPECIES.teak = SPECIES.iroko; // alias

// FINISH — modulates the species. Each returns adjustments applied (a) per-texel
// in the canvas builders (colour/desaturation/char) and (b) on the material
// (roughness floor, clearcoat sheen, envMapIntensity).
//   satMul/lightAdd/warmAdd : multiply saturation / add lightness / add warmth
//                             to every texel (the "look" of the finish)
//   roughFloor/roughCeil    : clamp window for the roughness map (satin vs matte)
//   clearcoat/clearcoatRough: physical-ish sheen (we approximate on Standard via
//                             a lower effective roughness + stronger envMap)
//   envIntensity            : envMap reflection strength
//   limewash/char/paint     : special texel modes (see builders)
const FINISHES = {
  // RAW — sawn/planed, matte, true species colour.
  raw: {
    satMul: 1.0, lightAdd: 0.0, warmAdd: 0.0,
    roughFloor: 0.62, roughCeil: 0.82, clearcoat: 0.0, envIntensity: 0.5,
  },
  // OILED — hardwax/linseed: richer + warmer colour, lower roughness, soft sheen.
  oiled: {
    satMul: 1.18, lightAdd: -0.02, warmAdd: 0.004,
    roughFloor: 0.42, roughCeil: 0.60, clearcoat: 0.18, clearcoatRough: 0.35,
    envIntensity: 0.9,
  },
  // LIMEWASHED — white pigment lightens + desaturates; pigment sits IN the grain
  // grooves so latewood/pores read whiter (handled in builder via `limewash`).
  limewashed: {
    satMul: 0.45, lightAdd: 0.14, warmAdd: -0.004,
    roughFloor: 0.66, roughCeil: 0.86, clearcoat: 0.0, envIntensity: 0.4,
    limewash: 0.75,
  },
  // CHARRED — shou-sugi-ban: near-black, very low saturation, cracked-char
  // texture (handled in builder via `char`). Matte-to-satin.
  charred: {
    satMul: 0.30, lightAdd: -0.46, warmAdd: 0.0,
    roughFloor: 0.55, roughCeil: 0.80, clearcoat: 0.06, clearcoatRough: 0.5,
    envIntensity: 0.5, char: 0.85,
  },
  // PAINTED — solid pigment over wood; faint grain/texture telegraphs through.
  // `paint` blends every texel toward paintColor, keeping a little grain relief.
  painted: {
    satMul: 1.0, lightAdd: 0.0, warmAdd: 0.0,
    roughFloor: 0.50, roughCeil: 0.66, clearcoat: 0.10, clearcoatRough: 0.4,
    envIntensity: 0.6, paint: 0.86,
  },
};

/**
 * Normalize opts.style into a resolved descriptor, or null when absent/invalid.
 * Returns { species, finish, paintRgb, key } — key is the cache discriminator.
 * Backward-compatible: any falsy / unrecognised style yields null -> legacy path.
 */
function resolveStyle(style) {
  if (!style || typeof style !== 'object') return null;
  const spKey = String(style.species || '').toLowerCase();
  const fnKey = String(style.finish || '').toLowerCase();
  const species = SPECIES[spKey];
  const finish = FINISHES[fnKey];
  if (!species && !finish) return null; // nothing usable -> legacy path
  const sp = species || SPECIES.pine;
  const fn = finish || FINISHES.raw;
  // Paint colour only meaningful for painted finish; default barn-ish neutral.
  let paintRgb = null;
  if (fn.paint) {
    const pc = (typeof style.paintColor === 'number' && isFinite(style.paintColor))
      ? style.paintColor >>> 0 : 0x8a8d7f;
    paintRgb = hexToRgb(pc);
  }
  const key = `${spKey || 'pine'}|${fnKey || 'raw'}|${paintRgb ? (style.paintColor >>> 0) : 'np'}`;
  return { species: sp, finish: fn, paintRgb, key };
}

// ----------------------------------------------------------------------------
// Module cache: cacheKey -> { albedo, normal, rough, end:{albedo,normal,rough} }
// where each entry holds the raw HTMLCanvasElement-backed CanvasTextures we
// clone from. Keyed by quantized tint so similar boards share work.
// ----------------------------------------------------------------------------
const _cache = new Map();

// ----------------------------------------------------------------------------
// Deterministic helpers — pure, Node-checkable.
// ----------------------------------------------------------------------------

/** FNV-1a-ish 32-bit string hash. Stable, no randomness. */
function hashString(str) {
  const s = String(str);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** mulberry32 — small fast seeded PRNG. Returns a function -> [0,1). */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** clamp helper */
function clamp(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }

/** smoothstep */
function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0 || 1e-6), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Value noise in 1D with smooth interpolation. Deterministic given `seed`.
 * Used for grain waviness — cheap and tileable-ish for our purposes.
 */
function makeValueNoise1D(seed) {
  // 256 lattice points, hashed from seed.
  const N = 256;
  const tbl = new Float32Array(N);
  const r = mulberry32(seed);
  for (let i = 0; i < N; i++) tbl[i] = r();
  return function (x) {
    const xi = Math.floor(x);
    const f = x - xi;
    const a = tbl[((xi % N) + N) % N];
    const b = tbl[(((xi + 1) % N) + N) % N];
    return a + (b - a) * smoothstep(0, 1, f);
  };
}

/**
 * Fractal Brownian Motion over a 1D value-noise basis. Returns value in ~[-1,1].
 * Adds the "FBM jitter" the grain striations need so they're not ruler-straight.
 */
function makeFbm1D(seed, octaves = 4) {
  const noises = [];
  for (let o = 0; o < octaves; o++) noises.push(makeValueNoise1D(seed + o * 1013));
  return function (x) {
    let amp = 0.5, freq = 1, sum = 0, norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * (noises[o](x * freq) * 2 - 1);
      norm += amp;
      amp *= 0.5;
      freq *= 2.03;
    }
    return sum / (norm || 1);
  };
}

// ----------------------------------------------------------------------------
// Colour helpers (operate on plain {r,g,b} in 0..255, sRGB-ish authoring space)
// ----------------------------------------------------------------------------

function hexToRgb(hex) {
  const n = (hex | 0) >>> 0;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0; const l = (max + min) / 2;
  const d = max - min;
  if (d > 1e-6) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return { h, s, l };
}

function hue2rgb(p, q, t) {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

function hslToRgb(h, s, l) {
  h = ((h % 1) + 1) % 1;
  s = clamp(s, 0, 1); l = clamp(l, 0, 1);
  let r, g, b;
  if (s === 0) { r = g = b = l; }
  else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
}

/**
 * Push an arbitrary base colour toward a believable warm-timber hue: amber/
 * golden, never grey/neon. Returns the anchor {h,s,l} for the wood field.
 */
function timberHsl(baseColor) {
  const { r, g, b } = hexToRgb(baseColor);
  const hsl = rgbToHsl(r, g, b);
  // Pull hue firmly into the warm amber band (~0.06..0.11 of the wheel =
  // orange/gold). Keep a little source character so different stocks still
  // differ, but only when the source is already warm-ish — a cool/grey/neon
  // input must not produce green/blue "wood". We measure how warm the source
  // hue is (distance to the amber anchor on the wheel) and fade its influence.
  const amber = 0.085;
  let dh = hsl.h - amber;
  dh -= Math.round(dh); // wrap to [-0.5, 0.5]
  const warmth = Math.max(0, 1 - Math.abs(dh) / 0.12); // 1 near amber -> 0 far
  hsl.h = amber + dh * 0.3 * warmth;
  // Keep it a believable warm timber (golden pine / soft oak), NOT candy red.
  // Saturation is held low: real planed softwood/oak sits around 0.18..0.34 in
  // HSL, never neon. Lightness stays in a natural mid-warm band.
  hsl.s = clamp(hsl.s * 0.45 + 0.16, 0.16, 0.34);
  hsl.l = clamp(hsl.l * 0.85 + 0.20, 0.46, 0.72);
  return hsl;
}

// ----------------------------------------------------------------------------
// Stock lookup -> a base tint, robust on unknown keys.
// ----------------------------------------------------------------------------

function resolveTint(stockKey, baseColor) {
  if (typeof baseColor === 'number' && isFinite(baseColor)) return baseColor >>> 0;
  const rec = (SHEETS && SHEETS[stockKey]) || (TIMBER && TIMBER[stockKey]) || null;
  if (rec && typeof rec.color === 'number') return rec.color >>> 0;
  return FALLBACK_COLOR;
}

/** Quantize a hex colour to keep the cache small (similar boards share base). */
function quantizeTint(hex) {
  const { r, g, b } = hexToRgb(hex);
  const q = (v) => (v >> 4) << 4; // 16 levels per channel
  return ((q(r) << 16) | (q(g) << 8) | q(b)) >>> 0;
}

// ----------------------------------------------------------------------------
// Canvas synthesis — LONG GRAIN (albedo + height -> normal + roughness)
//
// Convention: U (canvas X) runs ALONG the grain (board length). V (canvas Y)
// runs ACROSS the board. The caller rotates the texture so U lands on the part's
// world long axis.
// ----------------------------------------------------------------------------

/**
 * Build the three long-grain canvases. Returns { albedo, normal, rough } as
 * HTMLCanvasElement. Pure-deterministic given (tintHex, seed).
 *
 * `style` (optional) is a resolved descriptor from resolveStyle(); when null the
 * legacy amber-timber look is produced unchanged.
 */
function buildLongGrainCanvases(tintHex, seed, style) {
  const W = TEX, H = TEX;
  const albedo = makeCanvas(W, H);
  const aCtx = albedo.getContext('2d');
  const aImg = aCtx.createImageData(W, H);
  const aData = aImg.data;

  // Height field captured alongside albedo so normal/rough derive from the SAME
  // grain — striations, rings, knots all push the surface consistently.
  const height = new Float32Array(W * H);

  // Anchor: legacy path derives an amber timber HSL from the tint. A styled
  // path uses the species' earlywood anchor instead (hand-tuned per wood).
  const sp = style ? style.species : null;
  const fn = style ? style.finish : null;
  const anchor = sp ? { h: sp.ew.h, s: sp.ew.s, l: sp.ew.l } : timberHsl(tintHex);

  // Per-species grain knobs (defaults reproduce the legacy character at 1.0).
  const ringMul = sp ? sp.ringMul : 1.0;
  const ringBias = sp ? sp.ringBias : 1.0;
  const striMul = sp ? sp.striMul : 1.0;
  const poreMul = sp ? sp.poreMul : 1.0;
  const blotchMul = sp ? sp.blotchMul : 1.0;
  const spLwDark = sp ? sp.lwDark : 0.12;
  const spLwSat = sp ? sp.lwSat : 0.05;
  // Char/limewash/paint finish modes read in the texel loop.
  const charAmt = fn && fn.char ? fn.char : 0;
  const limewashAmt = fn && fn.limewash ? fn.limewash : 0;
  const paintAmt = fn && fn.paint ? fn.paint : 0;
  const paintRgb = style ? style.paintRgb : null;
  const satMul = fn ? fn.satMul : 1.0;
  const lightAdd = fn ? fn.lightAdd : 0.0;
  const warmAdd = fn ? fn.warmAdd : 0.0;
  const roughBase = sp ? sp.roughBase : 0.58;
  const roughFloor = fn ? fn.roughFloor : 0.46;
  const roughCeil = fn ? fn.roughCeil : 0.72;

  const r = mulberry32(seed);
  // Per-board variation: hue/value shift, ring phase + frequency, grain offset.
  const hueShift = (r() - 0.5) * 0.02;
  const lightShift = (r() - 0.5) * 0.05;
  const ringPhase = r() * Math.PI * 2;
  const ringFreqJitter = 0.8 + r() * 0.5;     // 0.8..1.3 x nominal
  // Species override the latewood warm shift; else legacy per-board jitter.
  const redden = sp ? sp.redden : (0.015 + r() * 0.02);
  // Deterministic char-crack noise field (only used when charred).
  const charFbm = makeFbm1D(seed ^ 0x6c8e9cf5, 4);

  // FBM fields. The canvas U axis spans the WHOLE board length (repeat = 1), so
  // U=0..1 is the full board: every feature is full-length and continuous, and
  // nothing repeats down the length. We keep the U-frequencies LOW so a single
  // tile stretched onto a long board still reads as gentle, natural grain.
  const grainWave = makeFbm1D(seed ^ 0x9e3779b9, 4); // gentle waviness of fibre
  const ringFbm = makeFbm1D(seed ^ 0x85ebca6b, 3);   // ring band irregularity
  const blotchFbm = makeFbm1D(seed ^ 0xc2b2ae35, 2); // large-scale blotch (V)
  const blotchFbmU = makeFbm1D(seed ^ 0x27d4eb2f, 2);

  // Growth-ring band frequency: a few bands across the canvas height.
  const ringBands = (5 + Math.floor(r() * 4)) * ringFreqJitter * ringMul;

  // Fine striation frequency along V (each board-cross unit has many fibres).
  const striationFreq = 70 + Math.floor(r() * 60);

  // Knots are RARE on a planed board face: at most ONE, and only ~30% of boards.
  // Placed mid-board so it never sits on a tile seam (there is no seam now, but
  // keeping it central also avoids it reading as an edge feature).
  const knots = [];
  if (r() < 0.3) {
    knots.push({
      cx: 0.3 + r() * 0.4,        // central third of the length
      cy: 0.2 + r() * 0.6,
      rad: 0.012 + r() * 0.02,
      ramp: 0.04 + r() * 0.04,    // halo of swept grain around it
      dark: 0.22 + r() * 0.12,    // how dark the core is
    });
  }

  // No repeating cathedral arch. At most ONE very broad, low-frequency sweep of
  // the grain along the full board length (≤1 cycle over the whole board) so it
  // reads as a single gentle figure, not a motif that repeats every tile.
  const hasArch = r() < 0.5;
  const archCenterV = 0.2 + r() * 0.6;
  const archAmp = 0.05 + r() * 0.05;          // low amplitude
  const archCycles = 0.4 + r() * 0.6;         // <1 cycle across the whole board
  const archPhase = r() * Math.PI * 2;

  for (let y = 0; y < H; y++) {
    const v = y / H;             // across board, 0..1
    // Blotch is mostly a function of V with a little U drift -> long soft cloud.
    for (let x = 0; x < W; x++) {
      const u = x / W;           // along grain (full board length), 0..1

      // --- waviness: displace the V coordinate used for rings/striations so
      // grain isn't ruler-straight. ONE gentle low-frequency sweep across the
      // whole board + low-freq FBM jitter. Frequencies are deliberately low so
      // the grain stays mostly-straight and continuous end-to-end.
      const wave =
        Math.sin(u * Math.PI * 2 * 0.5 + ringPhase) * 0.010 +
        grainWave(u * 1.2) * 0.022;
      const vv = v + wave;

      // --- single broad sweep (replaces the repeating cathedral arch): bends
      // the ring coordinate near the board centre with <1 cycle over the length.
      let archBend = 0;
      if (hasArch) {
        const dz = (vv - archCenterV);
        archBend = Math.cos(u * Math.PI * 2 * archCycles + archPhase) * archAmp *
                   Math.exp(-(dz * dz) / 0.05);
      }
      const ringCoord = (vv + archBend) * ringBands + ringFbm(u * 0.7) * 0.35;

      // --- growth ring band: sharp-ish transition earlywood->latewood. Use a
      // skewed wave so latewood (dark band) is narrower than earlywood.
      const ringPhaseF = ringCoord * Math.PI * 2;
      let ring = Math.sin(ringPhaseF);
      // bias toward latewood being a thin dark line:
      ring = Math.sign(ring) * Math.pow(Math.abs(ring), 0.6);
      // ringBias sharpens (>1) or softens (<1) the earlywood->latewood edge.
      const lateRaw = smoothstep(0.2, 0.95, ring); // 0 earlywood .. 1 latewood
      const late = ringBias === 1.0 ? lateRaw
        : clamp(0.5 + (lateRaw - 0.5) * ringBias, 0, 1);

      // --- fine striations running the FULL length of the grain: many thin
      // darker fibre lines, continuous end-to-end (function of V, with only a
      // low-freq U jitter so they wander naturally without breaking up).
      const striY = vv * striationFreq + grainWave(u * 3.0) * 0.8;
      const stri = Math.abs(Math.sin(striY * Math.PI));
      const striMark = Math.pow(stri, 6) * 0.09 * striMul; // dark thin lines

      // --- pores: fine speckle, denser in latewood (open-grain look).
      const poreN = makeHashNoise(x, y, seed);
      const pore = (poreN > 0.93 ? (poreN - 0.93) / 0.07 : 0) * (0.4 + 0.6 * late);
      const poreMark = pore * 0.09 * poreMul;

      // --- large blotch: gentle lightness cloud.
      const blotch = (blotchFbm(v * 2.2) * 0.5 + blotchFbmU(u * 0.8) * 0.5) * 0.045 * blotchMul;

      // --- assemble HSL for this texel from the anchor.
      let hh = anchor.h + hueShift;
      let ss = anchor.s;
      let ll = anchor.l + lightShift + blotch;

      // Latewood: darker + a touch warmer. Keep saturation gain SMALL so the
      // dark bands stay believable golden/brown, never candy red. Species set
      // their own latewood depth/sat (defaults reproduce the legacy 0.12/0.05).
      ll -= late * spLwDark;
      ss += late * spLwSat;
      hh -= late * redden;       // a subtle warm shift, not a red jump

      // Striations + pores darken locally.
      ll -= striMark + poreMark;

      // --- knots: dark cores with a swirling, locally-darker halo.
      let knotHeight = 0;
      for (let ki = 0; ki < knots.length; ki++) {
        const kt = knots[ki];
        const du = u - kt.cx, dv = v - kt.cy;
        const dist = Math.sqrt(du * du + dv * dv);
        if (dist < kt.rad + kt.ramp) {
          const core = 1 - smoothstep(0, kt.rad, dist);
          const halo = 1 - smoothstep(kt.rad, kt.rad + kt.ramp, dist);
          // concentric darkening inside the knot
          const rings = 0.5 + 0.5 * Math.sin(dist / Math.max(kt.rad, 1e-4) * 18);
          ll -= core * kt.dark + halo * 0.05 * rings;
          ss += core * 0.06;
          hh -= core * 0.015;
          knotHeight -= core * 0.6 + halo * 0.1;
        }
      }

      // --- FINISH POST-PROCESS (only when styled). Applied after the natural
      // wood field is assembled so each finish reshapes the SAME grain.
      let charCrack = 0;
      if (style) {
        // Global finish recolour: desaturate/lighten/warm per finish table.
        ss *= satMul;
        ll += lightAdd;
        hh += warmAdd;
        // LIMEWASHED: white pigment collects in the grooves (latewood + pores),
        // so the grained areas read LIGHTER + more desaturated, not darker.
        if (limewashAmt > 0) {
          const inGrain = clamp(late * 0.7 + (poreMark / 0.09) * 0.5, 0, 1);
          ll += inGrain * limewashAmt * 0.18;
          ss *= 1 - inGrain * limewashAmt * 0.5;
        }
        // CHARRED: crush toward near-black; FBM-driven cracks reveal faint embers
        // and bite into the surface (height) for a cracked-char relief.
        if (charAmt > 0) {
          const crack = Math.pow(clamp(charFbm(u * 6.0 + v * 9.0) * 0.5 + 0.5, 0, 1), 3);
          charCrack = crack;
          ll = ll * (1 - charAmt * 0.85) + crack * 0.06; // cracks glow slightly
          ss *= 1 - charAmt * 0.6;
        }
      }

      let rgb = hslToRgb(hh, ss, ll);

      // PAINTED: blend the assembled wood toward the solid pigment, keeping a
      // little grain so texture telegraphs through the coat.
      if (paintAmt > 0 && paintRgb) {
        const grainKeep = clamp(0.10 + late * 0.10 + (striMark / 0.09) * 0.08, 0, 0.3);
        const m = paintAmt * (1 - grainKeep);
        rgb = {
          r: Math.round(rgb.r * (1 - m) + paintRgb.r * m),
          g: Math.round(rgb.g * (1 - m) + paintRgb.g * m),
          b: Math.round(rgb.b * (1 - m) + paintRgb.b * m),
        };
      }
      const idx = (y * W + x) * 4;
      aData[idx] = rgb.r;
      aData[idx + 1] = rgb.g;
      aData[idx + 2] = rgb.b;
      aData[idx + 3] = 255;

      // Height: latewood + striations + pores sit slightly LOWER (grooves);
      // knots pull down hard. Range roughly [-1, 0.2]. CHARRED adds cracked
      // relief so the surface reads alligatored under raking light.
      height[y * W + x] =
        -(late * 0.5) - striMark * 3.0 - poreMark * 2.0 + knotHeight
        - (charCrack > 0 ? (1 - charCrack) * charAmt * 0.6 : 0);
    }
  }
  aCtx.putImageData(aImg, 0, 0);

  // Derive normal + roughness from the SAME height field. Species/finish set the
  // roughness base + clamp window (legacy default 0.58 / 0.46..0.72 when null).
  const normal = heightToNormal(height, W, H, NORMAL_STRENGTH);
  const rough = heightToRoughness(height, W, H, style ? roughBase : 0.58,
    style ? roughFloor : 0.46, style ? roughCeil : 0.72);

  return { albedo, normal, rough };
}

// ----------------------------------------------------------------------------
// Canvas synthesis — END GRAIN (concentric growth rings on the cut ends)
// ----------------------------------------------------------------------------

function buildEndGrainCanvases(tintHex, seed, ringSpacingPx, style) {
  const W = END_TEX, H = END_TEX;
  const albedo = makeCanvas(W, H);
  const aCtx = albedo.getContext('2d');
  const aImg = aCtx.createImageData(W, H);
  const aData = aImg.data;
  const height = new Float32Array(W * H);

  const sp = style ? style.species : null;
  const fn = style ? style.finish : null;
  const anchor = sp ? { h: sp.ew.h, s: sp.ew.s, l: sp.ew.l } : timberHsl(tintHex);
  const spLwDark = sp ? sp.lwDark : 0.14; // legacy end-grain latewood drop was 0.14
  const charAmt = fn && fn.char ? fn.char : 0;
  const limewashAmt = fn && fn.limewash ? fn.limewash : 0;
  const paintAmt = fn && fn.paint ? fn.paint : 0;
  const paintRgb = style ? style.paintRgb : null;
  const satMul = fn ? fn.satMul : 1.0;
  const lightAdd = fn ? fn.lightAdd : 0.0;
  const warmAdd = fn ? fn.warmAdd : 0.0;
  const roughBase = sp ? sp.roughBase : 0.6;
  const roughFloor = fn ? fn.roughFloor : 0.46;
  const roughCeil = fn ? fn.roughCeil : 0.72;
  const r = mulberry32(seed ^ 0x51ed270b);
  const charFbm = makeFbm1D(seed ^ 0x2545f491, 4);

  // Pith (ring centre) is usually off-canvas (boards are sawn off-centre), so
  // rings read as broad arcs. Place it well outside with deterministic jitter.
  const pithX = (-0.4 + r() * 0.3) * W;        // left of canvas
  const pithY = (0.3 + r() * 0.4) * H;
  const hueShift = (r() - 0.5) * 0.02;
  const lightShift = (r() - 0.5) * 0.05;
  const ringPx = ringSpacingPx;                 // pixels per growth ring
  const ringFbm = makeFbm1D(seed ^ 0xa54ff53a, 3);
  const redden = sp ? sp.redden : (0.015 + r() * 0.02);

  // Faint radial ray fleck (medullary rays) emanating from the pith.
  const rayCount = 30 + Math.floor(r() * 30);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = x - pithX, dy = y - pithY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const ang = Math.atan2(dy, dx);

      // Rings: distance modulated by FBM so they wobble like real growth.
      const ringCoord = (dist + ringFbm(ang * 2.5 + dist * 0.01) * ringPx * 0.5) / ringPx;
      let ring = Math.sin(ringCoord * Math.PI * 2);
      ring = Math.sign(ring) * Math.pow(Math.abs(ring), 0.6);
      const late = smoothstep(0.2, 0.95, ring);

      // Radial rays: thin lighter spokes.
      const ray = Math.pow(Math.abs(Math.sin(ang * rayCount * 0.5)), 14) * 0.05;

      // Fine speckle.
      const spk = makeHashNoise(x, y, seed ^ 0x1234) > 0.95 ? 0.06 : 0;

      let hh = anchor.h + hueShift;
      let ss = anchor.s;
      let ll = anchor.l + lightShift + ray;
      ll -= late * spLwDark + spk;
      ss += late * 0.05;
      hh -= late * redden;

      // --- FINISH POST-PROCESS on the cut end (mirrors the long-grain logic so
      // the ends match the faces). Only runs when styled.
      let charCrack = 0;
      if (style) {
        ss *= satMul; ll += lightAdd; hh += warmAdd;
        if (limewashAmt > 0) {
          ll += late * limewashAmt * 0.18;
          ss *= 1 - late * limewashAmt * 0.5;
        }
        if (charAmt > 0) {
          const u2 = x / W, v2 = y / H;
          const crack = Math.pow(clamp(charFbm(u2 * 6.0 + v2 * 9.0) * 0.5 + 0.5, 0, 1), 3);
          charCrack = crack;
          ll = ll * (1 - charAmt * 0.85) + crack * 0.06;
          ss *= 1 - charAmt * 0.6;
        }
      }

      let rgb = hslToRgb(hh, ss, ll);
      if (paintAmt > 0 && paintRgb) {
        const grainKeep = clamp(0.10 + late * 0.10, 0, 0.3);
        const m = paintAmt * (1 - grainKeep);
        rgb = {
          r: Math.round(rgb.r * (1 - m) + paintRgb.r * m),
          g: Math.round(rgb.g * (1 - m) + paintRgb.g * m),
          b: Math.round(rgb.b * (1 - m) + paintRgb.b * m),
        };
      }
      const idx = (y * W + x) * 4;
      aData[idx] = rgb.r;
      aData[idx + 1] = rgb.g;
      aData[idx + 2] = rgb.b;
      aData[idx + 3] = 255;

      height[y * W + x] = -(late * 0.5) - spk * 2
        - (charCrack > 0 ? (1 - charCrack) * charAmt * 0.6 : 0);
    }
  }
  aCtx.putImageData(aImg, 0, 0);

  const normal = heightToNormal(height, W, H, NORMAL_STRENGTH * 0.8);
  const rough = heightToRoughness(height, W, H, style ? roughBase : 0.6,
    style ? roughFloor : null, style ? roughCeil : null);
  return { albedo, normal, rough };
}

// ----------------------------------------------------------------------------
// Height -> normal / roughness derivation (shared)
// ----------------------------------------------------------------------------

/** Sobel-ish height -> tangent-space normal map canvas. */
function heightToNormal(height, W, H, strength) {
  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(W, H);
  const d = img.data;
  const at = (x, y) => height[((y + H) % H) * W + ((x + W) % W)];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const hl = at(x - 1, y), hr = at(x + 1, y);
      const hu = at(x, y - 1), hd = at(x, y + 1);
      // gradient -> normal. Scale by strength.
      let nx = (hl - hr) * strength * 4;
      let ny = (hu - hd) * strength * 4;
      let nz = 1.0;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      nx /= len; ny /= len; nz /= len;
      const idx = (y * W + x) * 4;
      d[idx] = Math.round((nx * 0.5 + 0.5) * 255);
      d[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      d[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      d[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/**
 * Height -> roughness map. Oiled-wood semi-matte: grooves (lower height =
 * latewood/grain/pores) read slightly ROUGHER than the smoother earlywood.
 */
function heightToRoughness(height, W, H, base, floor, ceil) {
  // Default clamp window matches the legacy behaviour exactly (0.46..0.72).
  const lo = (floor == null) ? 0.46 : floor;
  const hi = (ceil == null) ? 0.72 : ceil;
  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(W, H);
  const d = img.data;
  for (let i = 0; i < W * H; i++) {
    // height roughly [-2, 0.2]; lower -> rougher. Map within the finish window.
    const hgt = clamp(height[i], -1.2, 0.2);
    const rough = clamp(base + (-hgt) * 0.12, lo, hi);
    const g = Math.round(rough * 255);
    const idx = i * 4;
    d[idx] = g; d[idx + 1] = g; d[idx + 2] = g; d[idx + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

// ----------------------------------------------------------------------------
// Tiny utilities
// ----------------------------------------------------------------------------

/** Hash-based white-ish noise in [0,1) from integer pixel coords. Deterministic. */
function makeHashNoise(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 2654435761) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return (h >>> 0) / 4294967296;
}

/** Create a canvas in browser or a stub in non-DOM (Node) so module parses. */
function makeCanvas(w, h) {
  if (typeof document !== 'undefined' && document.createElement) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  // Headless fallback (e.g. OffscreenCanvas) — never hit in Node --check.
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  throw new Error('wood.js: no canvas available in this environment');
}

// ----------------------------------------------------------------------------
// Texture wrapping for THREE — turn a base canvas into a configured clone.
// ----------------------------------------------------------------------------

function makeBaseTexture(THREE, canvas, colorSpace) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = colorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Get (and cache) the base textures for a tint. We build the CanvasTextures
 * once; per-part we clone them and stamp rotation/repeat/offset. Returns:
 *   { long: {albedo,normal,rough}, end: {albedo,normal,rough} }
 */
function getBaseTextures(THREE, tintHex, seed, style) {
  const qTint = quantizeTint(tintHex);
  // Style is part of the cache key so a styled board never collides with the
  // legacy (no-style) base or with a differently-styled one.
  const styleKey = style ? style.key : 'legacy';
  const key = `${qTint}|${styleKey}`;
  let entry = _cache.get(key);
  if (entry) return entry;

  // Use a tint+style-derived seed so the cached base is stable per look (per-board
  // jitter is applied later via clone transforms + material.color, not here —
  // so two boards of the same stock+style can share this expensive base).
  const baseSeed = hashString(`wood|${qTint}|${styleKey}`);

  const lg = buildLongGrainCanvases(tintHex, baseSeed, style);
  const ringSpacingPx = clamp(
    (RING_PERIOD_MM / CROSS_PERIOD_MM) * END_TEX, 6, END_TEX / 4
  );
  const eg = buildEndGrainCanvases(tintHex, baseSeed, ringSpacingPx, style);

  entry = {
    long: {
      albedo: makeBaseTexture(THREE, lg.albedo, THREE.SRGBColorSpace),
      normal: makeBaseTexture(THREE, lg.normal, THREE.LinearSRGBColorSpace),
      rough: makeBaseTexture(THREE, lg.rough, THREE.LinearSRGBColorSpace),
    },
    end: {
      albedo: makeBaseTexture(THREE, eg.albedo, THREE.SRGBColorSpace),
      normal: makeBaseTexture(THREE, eg.normal, THREE.LinearSRGBColorSpace),
      rough: makeBaseTexture(THREE, eg.rough, THREE.LinearSRGBColorSpace),
    },
  };
  _cache.set(key, entry);
  return entry;
}

// ----------------------------------------------------------------------------
// Per-part configuration of cloned textures.
// ----------------------------------------------------------------------------

/**
 * Clone a base texture and stamp colorSpace/wrap + a transform. `rot` is the
 * rotation (radians) so texture-U lands along the desired world axis; repU/repV
 * the world-space-constant repeats; off the per-board offset.
 */
function cloneTex(base, rot, repU, repV, offU, offV) {
  const t = base.clone();
  t.wrapS = base.wrapS;
  t.wrapT = base.wrapT;
  t.colorSpace = base.colorSpace;
  t.anisotropy = base.anisotropy;
  t.center.set(0.5, 0.5);
  t.rotation = rot;
  t.repeat.set(repU, repV);
  t.offset.set(offU, offV);
  t.needsUpdate = true;
  return t;
}

/**
 * Build ONE MeshStandardMaterial for a given face role.
 *   role 'long'  -> long-grain face. `rot` orients U along the board length.
 *   role 'end'   -> end-grain face (concentric rings).
 */
function makeFaceMaterial(THREE, base, role, cfg) {
  const set = role === 'end' ? base.end : base.long;
  const map = cloneTex(set.albedo, cfg.rot, cfg.repU, cfg.repV, cfg.offU, cfg.offV);
  const normalMap = cloneTex(set.normal, cfg.rot, cfg.repU, cfg.repV, cfg.offU, cfg.offV);
  const roughnessMap = cloneTex(set.rough, cfg.rot, cfg.repU, cfg.repV, cfg.offU, cfg.offV);

  // Finish-level material knobs. Legacy (no style) keeps the original numbers.
  const fm = cfg.finishMat;
  const envIntensity = fm ? fm.envIntensity : 0.7;
  // MeshStandardMaterial has no clearcoat lobe (that's Physical). We approximate
  // a finish's sheen by scaling the roughness map down (smoother => glossier) and
  // boosting envMap reflection — cheap, and keeps the array all-Standard.
  const roughScale = fm && fm.clearcoat ? (1 - fm.clearcoat * 0.5) : 1.0;

  const m = new THREE.MeshStandardMaterial({
    map,
    normalMap,
    roughnessMap,
    color: cfg.tint,
    roughness: roughScale,   // modulated by roughnessMap (greyscale ~0.4..0.86)
    metalness: 0.0,
    envMap: cfg.environment || null,
    envMapIntensity: envIntensity,
  });
  if (m.normalScale && m.normalScale.set) {
    // Charred/painted surfaces relieve less; oiled a touch more. Subtle.
    const ns = fm && fm.char ? 1.05 : 0.8;
    m.normalScale.set(ns, ns);
  }
  return m;
}

// ----------------------------------------------------------------------------
// PUBLIC API
// ----------------------------------------------------------------------------

/**
 * Create wood material(s) for one part.
 *
 * @param {object} THREE  the three.js module (r160)
 * @param {object} opts   see file header / task spec
 * @returns {THREE.MeshStandardMaterial | THREE.Material[]}  a 6-length array for
 *          BoxGeometry (preferred — end grain on the cut ends) keyed in
 *          BoxGeometry group order [+x,-x,+y,-y,+z,-z]; or a single material as
 *          a robust fallback.
 */
export function createWoodMaterial(THREE, opts) {
  const o = opts || {};
  const tint = resolveTint(o.stockKey, o.baseColor);
  const style = resolveStyle(o.style); // null => legacy path (unchanged output)
  const seedStr = (o.seed == null ? 'wood' : String(o.seed));
  const seed = hashString(seedStr);
  const rnd = mulberry32(seed);

  // --- per-board variation (deterministic) -------------------------------
  // Small warm hue/value shift expressed as a multiplicative material.color so
  // identical parts read as individual boards on top of the shared base texture.
  const vH = (rnd() - 0.5) * 0.012;            // tiny hue wobble
  const vL = 0.94 + (rnd() - 0.5) * 0.10;      // lightness multiplier on white
  const vS = (rnd() - 0.5) * 0.03;
  const tintColor = new THREE.Color();
  {
    // anchor near white so it tints rather than recolours the texture
    const hsl = rgbToHsl(255, 255, 255);
    // Painted/charred bases already carry their final colour in the texture, so
    // the per-board material.color must stay near-neutral (a faint, almost-grey
    // board-to-board value wobble) instead of pushing an amber tint over paint.
    const neutralTint = style && (style.finish.paint || style.finish.char);
    const rgb = neutralTint
      ? hslToRgb(0, 0, clamp(vL, 0.85, 1))           // near-white, just value wobble
      : hslToRgb(0.085 + vH, clamp(0.04 + vS, 0, 0.12), clamp(vL, 0.7, 1));
    tintColor.setRGB(rgb.r / 255, rgb.g / 255, rgb.b / 255);
    void hsl;
  }
  const finishMat = style ? style.finish : null;
  const offU = rnd();   // grain slice offset
  const offV = rnd();

  // --- size + axis -> repeats & rotation ---------------------------------
  const size = o.sizeMM || {};
  const w = Math.max(1, +size.w || 1);
  const h = Math.max(1, +size.h || 1);
  const d = Math.max(1, +size.d || 1);
  let longAxis = o.longAxis;
  if (longAxis !== 'x' && longAxis !== 'y' && longAxis !== 'z') {
    // Fallback: infer from the largest dimension.
    longAxis = (w >= h && w >= d) ? 'x' : (h >= d ? 'y' : 'z');
  }
  const lenMM = longAxis === 'x' ? w : longAxis === 'y' ? h : d;

  const base = getBaseTextures(THREE, tint, seed, style);

  // ALONG the grain we use a single continuous field that spans the WHOLE board
  // (repeat = 1): the grain runs end-to-end with no repeating motif and no seam.
  // A little stretch on very long boards is fine and natural — the canvas is
  // built with full-length striations + gentle low-freq waviness so it holds up.
  const repAlong = () => 1;
  // ACROSS the board we still tile by world width (V axis is unconstrained — the
  // visible-tiling bug was only ever along the length).
  const repAcross = (axisLenMM) => clamp(axisLenMM / CROSS_PERIOD_MM, 0.25, 12);

  // For BoxGeometry, each face's local UV: U follows the face's first in-plane
  // axis, V the second. We orient each long-grain face so its U runs along the
  // world long axis by choosing rotation in 90° steps; and set repeats from the
  // two in-plane dims of that face.
  //
  // Face -> (in-plane axes) for BoxGeometry:
  //   +x,-x : plane (z, y)   normal x
  //   +y,-y : plane (x, z)   normal y
  //   +z,-z : plane (x, y)   normal z
  // On a face, default texture U maps to the FIRST listed axis, V to the second.
  const facePlane = {
    px: ['z', 'y'], nx: ['z', 'y'],
    py: ['x', 'z'], ny: ['x', 'z'],
    pz: ['x', 'y'], nz: ['x', 'y'],
  };
  const dimOf = { x: w, y: h, z: d };

  // For a long-grain face we want texture-U along `longAxis`. If the face's
  // first in-plane axis IS longAxis -> rot 0. If the second is -> rot 90°.
  function longCfg(faceKey) {
    const [a0, a1] = facePlane[faceKey];
    let rot, alongAxis, acrossAxis;
    if (a0 === longAxis) { rot = 0; alongAxis = a0; acrossAxis = a1; }
    else { rot = Math.PI / 2; alongAxis = a1; acrossAxis = a0; }
    const repU = repAlong(dimOf[alongAxis]);
    const repV = repAcross(dimOf[acrossAxis]);
    // U offset MUST be 0 along the grain: repU is 1 and the canvas is not
    // tileable on U, so any non-zero U offset would wrap and produce a visible
    // seam mid-board. The single continuous field is shown start-to-end. Board
    // variation comes from the V offset + per-board material.color tint instead.
    return { rot, repU, repV, offU: 0, offV, tint: tintColor, environment: o.environment, finishMat };
  }

  // End-grain face: square-ish ring texture, repeats from the two cross dims.
  function endCfg(faceKey) {
    const [a0, a1] = facePlane[faceKey];
    const repU = repAcross(dimOf[a0]);
    const repV = repAcross(dimOf[a1]);
    return { rot: 0, repU, repV, offU, offV, tint: tintColor, environment: o.environment, finishMat };
  }

  // Which two faces are the cut ends? The faces whose NORMAL is the long axis.
  // +x,-x normal x ; +y,-y normal y ; +z,-z normal z.
  const endByAxis = { x: ['px', 'nx'], y: ['py', 'ny'], z: ['pz', 'nz'] };
  const endFaces = endByAxis[longAxis];

  // Build the 6-material array in BoxGeometry group order: +x,-x,+y,-y,+z,-z.
  const order = ['px', 'nx', 'py', 'ny', 'pz', 'nz'];
  try {
    const mats = order.map((faceKey) => {
      const isEnd = endFaces.indexOf(faceKey) !== -1;
      return isEnd
        ? makeFaceMaterial(THREE, base, 'end', endCfg(faceKey))
        : makeFaceMaterial(THREE, base, 'long', longCfg(faceKey));
    });
    return mats;
  } catch (err) {
    // Robust fallback: a single long-grain material if anything degenerate.
    void err;
    return makeFaceMaterial(THREE, base, 'long', {
      rot: 0,
      repU: repAlong(lenMM),
      repV: repAcross(Math.min(w, h, d)),
      offU: 0, offV, tint: tintColor, environment: o.environment, finishMat,
    });
  }
}

/**
 * Dispose all module-cached base textures. Call on teardown / hot-reload. The
 * caller is responsible for disposing the per-part cloned textures + materials
 * it received from createWoodMaterial.
 */
export function disposeWoodCache() {
  for (const entry of _cache.values()) {
    for (const group of [entry.long, entry.end]) {
      if (!group) continue;
      for (const k of ['albedo', 'normal', 'rough']) {
        const t = group[k];
        if (t && typeof t.dispose === 'function') t.dispose();
      }
    }
  }
  _cache.clear();
}
