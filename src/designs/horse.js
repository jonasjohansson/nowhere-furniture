// ============================================================================
// designs/horse.js — WOODEN HORSE (stackable sawhorse stool)
// ----------------------------------------------------------------------------
// After Jungmo Seunyeon's "Wooden Horse" (2016), built in the Enzo Mari
// autoprogettazione spirit: rough reglar, honest butt joints, Torx screws driven
// from the OUTSIDE faces where the driver actually reaches. Nothing hidden.
//
// The piece is a little trestle/sawhorse you can SIT on at stool height, or pile
// objects on, or — the whole point — STACK. Each end is an inverted-V A-frame of
// two legs that splay outward both along the length (z) and across the width (x).
// Because every leg leans out, the footprint is wider than the top beam, so an
// upper horse drops DOWN over the one below and nests, its legs straddling the
// lower beam. Stacking pitch is therefore small (a little over a beam-depth),
// not a full seat height — that is the modular trick.
//
// Everything is METRIC, millimetres, y up, ground at y=0. The whole stack is
// centred on x=0, z=0. Members come from the shared engineering.js vocabulary
// (plank/beam/leg/buttJoint/faceJoint) so the BOM, 3D builder and export all
// read one language. Builds are PURE: deterministic from params, no Date.now /
// Math.random.
//
// FLOAT NOTE: the float audit skips ROTATED parts, and the legs ARE rotated
// (that is the splay). So support is reasoned by construction, not by the audit:
// each leg is positioned so its TOP end sits up under the top beam (they touch)
// and its FOOT end lands on the ground (y≈0). The non-rotated parts — the top
// beam and the two stretchers — each rest on / are tied into members they touch,
// so the audit sees zero floats at stack=1.
// ============================================================================

import {
  ERGO, beam, plank, leg, buttJoint, faceJoint, SHEETS, TIMBER,
} from '../engineering.js?v=8';

const SEC = (key) => TIMBER[key].section;
const D2R = (d) => (d * Math.PI) / 180;

export const HORSE = [

  // ==========================================================================
  // WOODEN HORSE — stackable stool / trestle.
  // --------------------------------------------------------------------------
  // Construction logic: a top beam (the horse's "back", a reglar laid flat like
  // a narrow plank) runs the length at seat height. At each end, two legs lean
  // out from just under the beam down to a splayed footprint: an A-frame. The
  // two A-frames are tied by a low stretcher near the feet (stops them splaying
  // wider under load) and a high rail right under the beam (locks the top). The
  // legs are placed by computing, from the splay angle, the leg CENTRE such that
  // after the splay rotation the top end meets the beam underside and the foot
  // touches y=0 — no floating, no guesswork. The same horse is then optionally
  // repeated UP the y axis at a small nesting pitch so units read as a believable
  // stack, each one's splayed legs straddling the beam of the one below.
  // ==========================================================================
  {
    id: 'wooden-horse',
    name: 'Wooden Horse (stackable stool)',
    designer: 'after Jungmo Seunyeon',
    year: 2016,
    blurb:
      'A little sawhorse stool you sit on, stack objects on, or — the point — ' +
      'nest into its twin. A top beam at stool height carried by two A-frames ' +
      'of outward-splayed legs, tied by a low stretcher and a top rail. The ' +
      'splay makes the feet wider than the back, so each horse drops down over ' +
      'the one below and the legs straddle it: a modular, stackable family. ' +
      'Built Enzo Mari autoprogettazione style — reglar, butt joints, Torx ' +
      'screws driven from the outside.',
    difficulty: 'Easy',
    buildTime: '2-3 h',
    params: [
      { key: 'stack', label: 'Stack (nested)', min: 1, max: 3, step: 1, default: 2, unit: '' },
      { key: 'len',   label: 'Length',         min: 520, max: 700, step: 20, default: 600, unit: 'mm' },
      { key: 'seatH', label: 'Seat height',    min: 400, max: 480, step: 10, default: ERGO.stool.seatH, unit: 'mm' },
      { key: 'splay', label: 'Leg splay',      min: 10, max: 14, step: 1, default: 12, unit: 'deg' },
    ],
    build(p) {
      const beamStock     = 'reglar45x95'; // the "back" — laid flat as a narrow plank
      const legStock      = 'reglar45x45'; // the four splayed legs
      const stretchStock  = 'reglar34x45'; // low stretcher + top rail tying the A-frames

      const beamSec  = SEC(beamStock);                 // {w:45, h:95}
      const beamThick = Math.min(beamSec.w, beamSec.h); // 45 — vertical thickness laid flat
      const beamWide  = Math.max(beamSec.w, beamSec.h); // 95 — across the back
      const legW   = SEC(legStock).w;                  // 45
      const strH   = SEC(stretchStock).h;              // 45

      const seatTop  = p.seatH;
      const beamUnder = seatTop - beamThick;           // underside of the top beam

      // --- ONE horse, built around its own origin, then lifted to baseY. -----
      // Returns parts so we can instance it up the stack with unique refs.
      const buildHorse = (tag, baseY, grp) => {
        const parts = [];

        // The horse's back: a reglar laid FLAT (plank, wide-face-up) along z, a
        // narrow seat to sit on / stack on. Centred on x=0.
        parts.push(plank(`${tag}-TOP`, 'Top beam (back)', beamStock, p.len, 'z',
          { x: 0, y: baseY + seatTop - beamThick / 2, z: 0 }, grp));

        // --- Legs: two A-frames, one at each end (±z). Each A-frame is two legs
        // leaning out in x; the whole frame also leans out in z (compound splay).
        // Geometry: a leg of length L, splayed by angle θ about its TOP end,
        // moves its foot out by L*sinθ and its top stays put. We place the leg by
        // its CENTRE: after rotation the centre sits half-way along the leaning
        // stick. We solve for the leg length so the foot lands exactly on y=0
        // while the top tucks just under the beam.
        const a = D2R(p.splay);
        // Vertical drop available from beam underside to the floor:
        const vDrop = baseY + beamUnder - baseY * 0;     // = baseY + beamUnder (top is at baseY+beamUnder)
        const topY = baseY + beamUnder;                  // leg top meets beam underside
        // A leg leaning by θ from vertical covers (L*cosθ) of vertical drop.
        // A leg leaning by θ on each of two axes (compound) shortens its vertical
        // reach. The rotation maps the +y axis to a tilted unit vector u; the leg
        // covers (legLen * u.y) of vertical drop. Solve legLen so the top end sits
        // at topY and the foot at the floor (the cos terms below = u.y).
        const uy = Math.cos(a) * Math.cos(a);            // y-component of R·(0,1,0)
        const legLen = topY / uy;
        const topHalfX = beamWide / 2 - legW / 2;        // leg tops just inside the back
        const endTopZ  = p.len / 2 - legW;               // A-frame top row, inset from beam ends

        // Geometry (rotation about the CENTRE, Euler XYZ in degrees):
        //   top  = centre + R·(0,+legLen/2,0)
        //   foot = centre + R·(0,-legLen/2,0)  = top − 2·R·(0,legLen/2,0)
        // So once we fix the TOP point and the rotation, the centre is just
        //   centre = top − R·(0,legLen/2,0),
        // and the foot lands wherever the lean throws it. Signs are chosen (see
        // below) so the foot swings OUTWARD in both x and z and down to y≈0:
        //   rotZ = +s·splay  → foot dx has sign s   (leg s splays out in x)
        //   rotX = −e·splay  → foot dz has sign e   (A-frame e splays out in z)
        const half = legLen / 2;
        const rp = ([x, y, z], rx, rz) => {            // rotate (Euler XYZ, no y)
          const ax = D2R(rx), az = D2R(rz);
          let y1 = y * Math.cos(ax) - z * Math.sin(ax), z1 = y * Math.sin(ax) + z * Math.cos(ax);
          y = y1; z = z1;                              // Rx
          let x2 = x * Math.cos(az) - y * Math.sin(az), y2 = x * Math.sin(az) + y * Math.cos(az);
          return [x2, y2, z];                          // Rz
        };

        // Place the four legs. s = ±1 left/right (x); e = ±1 near/far A-frame (z).
        for (const e of [-1, 1]) {
          for (const s of [-1, 1]) {
            const xtag = s < 0 ? 'L' : 'R';
            const etag = e < 0 ? 'A' : 'B';
            const rotZ =  s * p.splay;                  // foot splays out in x
            const rotX = -e * p.splay;                  // foot splays out in z
            // desired TOP point: tucked just inside the back, under the beam.
            const topX = s * topHalfX;
            const topZ = e * endTopZ;
            const topPt = [topX, baseY + topY, topZ];
            // centre = top − R·(0,half,0)
            const v = rp([0, half, 0], rotX, rotZ);
            const cx = topPt[0] - v[0];
            const cy = topPt[1] - v[1];
            const cz = topPt[2] - v[2];
            parts.push({
              ...leg(`${tag}-LEG-${etag}${xtag}`, legStock, legLen,
                { x: Math.round(cx), y: Math.round(cy), z: Math.round(cz) }, grp),
              rot: { x: rotX, y: 0, z: rotZ },
            });
          }
        }

        // --- Top rail: ties the two A-frames just under the beam (locks the top
        // so the legs cannot scissor). Runs along z between the A-frame tops.
        const railLen = 2 * endTopZ;                     // reach both A-frame top rows
        parts.push(beam(`${tag}-RAIL`, 'Top rail', stretchStock, railLen, 'z',
          { x: 0, y: baseY + beamUnder - strH / 2, z: 0 }, grp));

        // --- Low stretcher: ties the A-frames low down so they cannot splay
        // wider under load. The legs splay OUT going down, so at a low height the
        // A-frame's z is further out than at the top; size the stretcher to reach
        // the leg z at its own height so it physically meets both A-frames. A
        // leg's z at height y above the floor: linear from topZ (at topY) toward
        // footZ (at 0). foot z = topZ + e·legLen·sin(splay·z-component); we just
        // read the modelled foot below via the same lean used for the legs.
        const lowH = Math.max(strH / 2 + 25, topY * 0.20); // ~20% up the leg
        const lowY = baseY + lowH;
        // z of an A-frame's leg at height lowH (fraction down from the top):
        const frac = (topY - lowH) / topY;               // 0 at top, 1 at floor
        // foot z magnitude from the lean (matches the leg block: dz outward by e):
        const footDz = legLen * Math.sin(D2R(p.splay)) * Math.cos(D2R(p.splay));
        const lowHalfZ = endTopZ + frac * footDz;        // leg z at lowH, outward
        const lowLen = Math.round(2 * lowHalfZ + legW);  // reach into both A-frames
        parts.push(beam(`${tag}-STR`, 'Low stretcher', stretchStock, lowLen, 'z',
          { x: 0, y: Math.round(lowY), z: 0 }, grp));

        return parts;
      };

      // --- Stack the horses, nested, centred on the origin in y. -------------
      // Nesting pitch: an upper horse drops down OVER the one below — its splayed
      // legs straddle the lower beam — so the vertical gain between stacked tops
      // is small, a little over a beam thickness. Tie it to the splay so steeper
      // legs nest tighter.
      const nestPitch = Math.round(beamThick + 70 - (p.splay - 12) * 6); // ~115mm @12°
      const n = Math.max(1, Math.min(3, Math.round(p.stack)));
      // Centre the stack: total height of tops spans (n-1)*nestPitch; offset so
      // the middle of that span sits at a neutral place (we keep the bottom horse
      // on the ground and lift the rest — the audit checks stack=1 on the ground).
      const parts = [];
      const joints = [];
      for (let i = 0; i < n; i++) {
        const tag = `H${i + 1}`;
        const grp = n === 1 ? 'Horse' : `Horse ${i + 1}`;
        const baseY = i * nestPitch;                     // each unit nests up by pitch
        parts.push(...buildHorse(tag, baseY, grp));
      }

      // --- Joinery (per horse; multiplied by the stack count). ---------------
      // Each leg butt-jointed up into the beam/top rail (2 Torx each), each
      // stretcher/rail into the leg pairs at its ends (2 per end).
      joints.push(buttJoint(legStock, 8 * n, `4 legs per horse up into beam + top rail, 2 each (×${n})`));
      joints.push(buttJoint(stretchStock, 4 * n, `top rail into both A-frames, 2 per end (×${n})`));
      joints.push(buttJoint(stretchStock, 4 * n, `low stretcher into both A-frames, 2 per end (×${n})`));
      joints.push(faceJoint(beamThick, 4 * n, `beam down onto the four leg tops, 1 each (×${n})`));

      const steps = [
        'Cut list (one horse): 1 top beam (reglar laid flat), 4 legs, 1 top rail, 1 low stretcher. Multiply by the stack count for more.',
        'Build the two A-frames: for each end, set two legs leaning out at the splay angle and screw a low cross between them later; first just hold the angle.',
        'Lay the top beam flat and screw each leg top up into its underside (2 Torx each), tops tucked just inside the back line so the feet splay out wider than the beam.',
        'Screw the top rail along the spine between the two A-frame tops to lock them, then the low stretcher near the feet so the legs cannot splay wider under load.',
        'Stand it up, sit on it, find any rock; add a screw wherever it still moves. Drive every screw from the outside face.',
        'To stack: lift the next horse and drop it on so its splayed legs straddle the beam below and nest down — the back sits a little over a beam-thickness higher.',
      ];
      const notes = [
        'Sit-or-stack: at ' + p.seatH + ' mm it is a stool; on its side or piled it is a trestle/shelf support; nested it stores flat-ish in a column.',
        `The legs splay ${p.splay}° from vertical in BOTH directions (compound), so the foot footprint is wider than the ${Math.round(beamWide)}mm back. That overhang is exactly what lets an upper horse drop down over a lower one — the upper legs straddle the lower beam — giving a small ~${nestPitch}mm nesting pitch instead of a full seat height per layer.`,
        'Mari logic: every screw lands on an outside face — leg tops into the beam from the side, rails into the legs from outside — so nothing is blind-driven and the whole thing knocks down for transport.',
        'The splayed legs ARE rotated parts (the audit skips them): each leg top is computed to meet the beam underside and each foot to land on the floor, so none float by construction; the beam, rail and stretcher (un-rotated) rest on the members they touch.',
        'Outdoor tip: a light splayed stool is a sail in desert wind — weight the top or peg a foot if a gust could walk it; round the foot ends so they do not dig in or splinter on rock.',
      ];

      return { parts, joints, steps, notes };
    },
  },

];

export default HORSE;
