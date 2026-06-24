import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crossLapSlot, slotJoint, wedgeTenon } from '../src/engineering.js?v=22';
import { slotWidth } from '../src/stock.js?v=22';

test('crossLapSlot width keys off mating thickness + fit', () => {
  const s = crossLapSlot(100, 200, 18, 60, 'standard');
  assert.equal(s.w, slotWidth(18, 'standard'));
  assert.equal(s.depth, 60);
  assert.deepEqual([s.x, s.y], [100, 200]);
});
test('crossLapSlot defaults fit to standard and angle to 0', () => {
  const s = crossLapSlot(0, 0, 18, 60);
  assert.equal(s.w, slotWidth(18, 'standard'));
  assert.equal(s.angle, 0);
});
test('crossLapSlot accepts an explicit angle', () => {
  const s = crossLapSlot(0, 0, 18, 60, 'snug', 45);
  assert.equal(s.w, slotWidth(18, 'snug'));
  assert.equal(s.angle, 45);
});
test('slotJoint is screwless', () => {
  const j = slotJoint(8, 'eight cross-laps');
  assert.equal(j.type, 'slot-crosslap');
  assert.equal(j.count, 8);
  assert.equal(j.screw, undefined);
  assert.equal(j.note, 'eight cross-laps');
});
test('wedgeTenon records wedge count', () => {
  const j = wedgeTenon(18, 80, 2, 'tusk stretcher, 2 wedges');
  assert.equal(j.type, 'wedge-tenon');
  assert.equal(j.count, 2);
  assert.equal(j.screw, undefined);
  assert.equal(j.note, 'tusk stretcher, 2 wedges');
});
