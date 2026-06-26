import { test } from 'node:test';
import assert from 'node:assert/strict';
import { profileBBox, profilePanel, sampleArc } from '../src/engineering.js?v=23';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

test('bbox of a triangle profile', () => {
  const bb = profileBBox({ pts: [{x:0,y:0},{x:100,y:0},{x:0,y:60}] });
  assert.deepEqual(bb, { w: 100, h: 60 });
});
test('arc segment widens the bbox to the arc bulge', () => {
  // semicircle r=50 across the top edge bulges +50 in y
  const bb = profileBBox({ pts:[{x:-50,y:0},{x:50,y:0}], arcs:[{after:1,r:50}] });
  assert.ok(bb.w >= 100 && bb.h >= 50);
});
test('sampleArc endpoints land exactly on A and B', () => {
  const A = {x:-50,y:0}, B = {x:50,y:0};
  const s = sampleArc(A, B, { r: 80 });
  assert.ok(near(s[0].x, A.x) && near(s[0].y, A.y));
  assert.ok(near(s[s.length-1].x, B.x) && near(s[s.length-1].y, B.y));
});
test('sampleArc minor vs major arc selected by large flag', () => {
  const A = {x:-50,y:0}, B = {x:50,y:0}, r = 80;
  const peak = (s) => Math.max(...s.map(p => Math.abs(p.y)));
  const minor = peak(sampleArc(A, B, { r, large:false, sweep:false }));
  const major = peak(sampleArc(A, B, { r, large:true,  sweep:false }));
  assert.ok(minor < major);            // major arc bulges much further
  assert.ok(near(minor, 80 - Math.sqrt(80*80 - 50*50), 1e-3)); // r - h
  assert.ok(near(major, 80 + Math.sqrt(80*80 - 50*50), 1e-3)); // r + h
});
test('profileBBox of empty pts is zero, not -Infinity', () => {
  assert.deepEqual(profileBBox({ pts: [] }), { w: 0, h: 0 });
});
test('profilePanel writes bbox into size and keeps the profile', () => {
  const p = profilePanel('SIDE','Side fin','ply18',
    { plane:'xy', pts:[{x:0,y:0},{x:100,y:0},{x:0,y:60}] },
    { x:0, y:30, z:0 }, 'Sides');
  assert.equal(p.material, 'sheet');
  assert.equal(p.size.w, 100);
  assert.equal(p.size.h, 60);
  assert.equal(p.size.d, 18);
  assert.ok(p.profile && p.profile.pts.length === 3);
});
