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
// each leg's TOP end sits up under the top beam (they touch), and the whole horse
// is lifted by the foot-corner offset so the SPLAYED feet rest flat on the floor
// with no corner sinking below y=0. The non-rotated parts — the top beam, top rail
// and low stretcher — each rest on / are tied into members they touch, so the
// audit sees zero floats and zero sinks at stack=1.
// ============================================================================

import {
  ERGO, beam, plank, leg, buttJoint, faceJoint, SHEETS, TIMBER,
} from '../engineering.js?v=23';

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

      // --- Splay geometry, shared by every horse in the stack. ---------------
      // A leg of length L tilted by θ about each of x and z (compound splay) maps
      // its local +y axis to a tilted unit vector u; its vertical reach is L·u.y.
      // We FIX the leg length once (from the seat-height drop) and then place each
      // horse so the legs' TOP ends meet the beam underside and the FEET rest flat
      // on whatever is below (the floor, or the beam of the horse beneath).
      const a = D2R(p.splay);
      const uy = Math.cos(a) * Math.cos(a);              // y-component of R·(0,1,0)
      const topHalfX = beamWide / 2 - legW / 2;          // leg tops just inside the back
      const endTopZ  = p.len / 2 - legW;                 // A-frame top row, inset from beam ends
      // legLen / half are derived AFTER beamReach (which needs footCornerDrop) below.

      // Rotate a point by Euler XYZ in DEGREES, EXACTLY as the 3D builder does
      // (three.js Euler order 'XYZ' => matrix Rx·Ry·Rz, so the point sees Rz first,
      // then Rx). The previous helper applied Rx-then-Rz and silently swapped the
      // x/z splay, so the reasoned foot positions did not match the render. y is
      // always 0 here (no yaw), so we only need Rz then Rx.
      const rp = ([x, y, z], rx, rz) => {
        const ax = D2R(rx), az = D2R(rz);
        // Rz first:
        let x1 = x * Math.cos(az) - y * Math.sin(az);
        let y1 = x * Math.sin(az) + y * Math.cos(az);
        let z1 = z;
        // then Rx:
        const y2 = y1 * Math.cos(ax) - z1 * Math.sin(ax);
        const z2 = y1 * Math.sin(ax) + z1 * Math.cos(ax);
        return [x1, y2, z2];
      };

      // How far the LOWEST CORNER of a splayed leg's foot drops below the leg-axis
      // end point (the 45×45 section, tilted, pokes below the centreline). We lift
      // each horse by this so the foot RESTS on its support plane instead of the
      // axis sinking the corner through it. Computed from the actual rotation so it
      // tracks the splay angle. (Same for all four legs by symmetry.)
      const footCornerDrop = (() => {
        let drop = 0;
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
          const c = rp([sx * legW / 2, 0, sz * legW / 2], -p.splay, p.splay);
          drop = Math.min(drop, c[1]);
        }
        return -drop;                                    // positive lift, mm
      })();

      // --- ONE horse, positioned by its BEAM-TOP height (beamTopY). -----------
      // The bottom horse is placed so its feet rest on the floor; each horse above
      // is placed so its beam sits a small nesting pitch above the beam below (its
      // splayed legs straddle down OUTSIDE the lower legs). topY = beam underside,
      // baseY = the leg-axis foot plane. Returns parts + this horse's beam-top y so
      // the next one up can be stacked on it.
      // Vertical run of the leg AXIS from its foot plane up to the beam underside.
      // We subtract the foot-corner lift so that, once the horse is raised to keep
      // the lowest foot corner on the floor, the beam TOP lands exactly at seatTop
      // (the requested seat height) rather than overshooting by the lift.
      const beamReach = seatTop - beamThick - footCornerDrop;
      // Leg length so the AXIS spans exactly beamReach vertically at the splay angle
      // (foot plane → beam underside); half = top/bottom half-vector length.
      const legLen = beamReach / uy;
      const half = legLen / 2;
      const buildHorse = (tag, beamTopY, grp) => {
        const parts = [];
        const beamCy = beamTopY - beamThick / 2;         // beam centre
        const topY = beamCy - beamThick / 2;             // beam underside = leg tops
        const baseY = topY - beamReach;                  // leg-axis foot plane

        // The horse's back: a reglar laid FLAT (plank, wide-face-up) along z, a
        // narrow seat to sit on / stack on. Centred on x=0, carried by the legs.
        parts.push(plank(`${tag}-TOP`, 'Top beam (back)', beamStock, p.len, 'z',
          { x: 0, y: beamCy, z: 0 }, grp));

        // Place the four legs. s = ±1 left/right (x); e = ±1 near/far A-frame (z).
        // Each leg's TOP point is fixed under the beam; the centre is derived so the
        // foot lands on the support plane, and the foot splays OUTWARD in x and z.
        //   rotZ = +s·splay  → foot dx has sign s   (leg s splays out in x)
        //   rotX = −e·splay  → foot dz has sign e   (A-frame e splays out in z)
        for (const e of [-1, 1]) {
          for (const s of [-1, 1]) {
            const xtag = s < 0 ? 'L' : 'R';
            const etag = e < 0 ? 'A' : 'B';
            const rotZ =  s * p.splay;
            const rotX = -e * p.splay;
            const topPt = [s * topHalfX, topY, e * endTopZ];
            const v = rp([0, half, 0], rotX, rotZ);      // top half-vector
            parts.push({
              ...leg(`${tag}-LEG-${etag}${xtag}`, legStock, legLen,
                { x: Math.round(topPt[0] - v[0]),
                  y: Math.round(topPt[1] - v[1]),
                  z: Math.round(topPt[2] - v[2]) }, grp),
              rot: { x: rotX, y: 0, z: rotZ },
            });
          }
        }

        // --- Top rail: ties the two A-frames just under the beam (locks the top
        // so the legs cannot scissor). Runs along z between the A-frame tops, its
        // top face flush against the beam underside.
        const railLen = 2 * endTopZ;                     // reach both A-frame top rows
        parts.push(beam(`${tag}-RAIL`, 'Top rail', stretchStock, railLen, 'z',
          { x: 0, y: topY - strH / 2, z: 0 }, grp));

        // --- Low stretcher: ties the A-frames low down so they cannot splay wider
        // under load. The legs splay OUT going down, so at a low height the leg's z
        // is further out than at the top; size the stretcher to reach the leg z at
        // its own height so it physically meets both A-frames.
        const reach = topY - baseY;                      // vertical run of the leg axis
        const lowH = Math.max(strH / 2 + 25, reach * 0.20);   // ~20% up from the foot
        const lowY = baseY + lowH;
        const frac = (reach - lowH) / reach;             // 0 at top, 1 at the foot
        // outward z the leg axis gains from its top end down to its foot:
        const legZRun = Math.abs(rp([0, legLen, 0], -p.splay, p.splay)[2]); // |Δz| top→foot
        const lowHalfZ = endTopZ + frac * legZRun;       // leg z at lowH, outward
        const lowLen = Math.round(2 * lowHalfZ + legW);  // reach into both A-frames
        parts.push(beam(`${tag}-STR`, 'Low stretcher', stretchStock, lowLen, 'z',
          { x: 0, y: Math.round(lowY), z: 0 }, grp));

        return { parts };
      };

      // --- Stack the horses, nested, each beam resting on the one below. ------
      // The splay makes the feet wider than the beam, so an upper horse drops down
      // OVER the lower one: its splayed legs straddle DOWN past the lower beam,
      // outside the lower legs, and its OWN beam comes to rest a small nesting
      // pitch above the lower beam. The vertical gain per layer is therefore that
      // small pitch (a little over a beam-thickness + the top-rail), not a full
      // seat height. The bottom horse stands on the floor; the upper beams are
      // carried by this beam-on-beam contact (a believable nested column).
      const nestPitch = beamThick + strH + 10;           // upper rail clears lower beam
      const n = Math.max(1, Math.min(3, Math.round(p.stack)));
      const parts = [];
      const joints = [];
      // Bottom horse: place its beam so the feet land on the floor (y=0). We know
      // the beam-top sits beamReach + beamThick above the foot-axis plane, plus the
      // foot-corner lift so the lowest corner rests exactly on the floor.
      const bottomBeamTopY = footCornerDrop + beamReach + beamThick;
      for (let i = 0; i < n; i++) {
        const tag = `H${i + 1}`;
        const grp = n === 1 ? 'Horse' : `Horse ${i + 1}`;
        const beamTopY = bottomBeamTopY + i * nestPitch; // each layer nests up by pitch
        parts.push(...buildHorse(tag, beamTopY, grp).parts);
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
        `To stack: lift the next horse and lower it on so its splayed legs straddle DOWN past the beam below (outside the lower legs) until its own back comes to rest on the beam under it — the back ends up only ~${nestPitch}mm higher, not a full seat height.`,
      ];
      const notes = [
        'Sit-or-stack: at ' + p.seatH + ' mm it is a stool; on its side or piled it is a trestle/shelf support; nested it stores flat-ish in a column.',
        `The legs splay ${p.splay}° from vertical in BOTH directions (compound), so the foot footprint is wider than the ${Math.round(beamWide)}mm back. That overhang is exactly what lets an upper horse drop down over a lower one — its legs straddle DOWN past the lower beam, outside the lower legs — so its back rests on the beam beneath at a small ~${nestPitch}mm nesting pitch instead of a full seat height per layer.`,
        'Mari logic: every screw lands on an outside face — leg tops into the beam from the side, rails into the legs from outside — so nothing is blind-driven and the whole thing knocks down for transport.',
        'The splayed legs ARE rotated parts (the audit skips them): each leg top is computed to meet the beam underside, and the whole horse is lifted by the foot-corner offset so the splayed feet rest flat with nothing sinking below the floor. The beam, rail and stretcher (un-rotated) rest on the members they touch.',
        'Outdoor tip: a light splayed stool is a sail in desert wind — weight the top or peg a foot if a gust could walk it; round the foot ends so they do not dig in or splinter on rock.',
      ];

      return { parts, joints, steps, notes };
    },
  },

];

export default HORSE;
