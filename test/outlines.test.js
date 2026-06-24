import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rect, wedge, oval, fin, profileBBox } from '../src/engineering.js?v=22';

test('rect is 4 points of the given size', () => {
  const r = rect(100, 60);
  assert.equal(r.pts.length, 4);
});
test('rect bbox matches given size and is origin-anchored', () => {
  assert.deepEqual(profileBBox(rect(100, 60)), { w: 100, h: 60 });
  // bottom-left corner at (0,0)
  assert.deepEqual(rect(100, 60).pts[0], { x: 0, y: 0 });
});
test('oval has arcs and bbox ~ 2rx by 2ry', () => {
  const o = oval(500, 350);
  assert.ok(o.arcs && o.arcs.length >= 1);
  const bb = profileBBox(o);
  assert.ok(Math.abs(bb.w - 1000) < 2, `bbox.w ${bb.w} ~ 1000`);
  assert.ok(Math.abs(bb.h - 700) < 2, `bbox.h ${bb.h} ~ 700`);
});
test('fin: polyline fidelity connects anchors with straight segments', () => {
  const anchors = [{x:0,y:0},{x:0,y:440},{x:420,y:470},{x:480,y:820}];
  const poly = fin(anchors, 'poly');
  assert.equal(poly.arcs.length, 0);
  assert.equal(poly.pts.length, anchors.length);
});
test('fin: curve fidelity emits arcs from the same anchors', () => {
  const anchors = [{x:0,y:0},{x:0,y:440},{x:420,y:470},{x:480,y:820}];
  const curved = fin(anchors, 'curve');
  assert.ok(curved.arcs.length >= 1);
});
