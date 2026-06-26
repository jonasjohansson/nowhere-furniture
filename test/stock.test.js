import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SLOT_FIT, RELIEF, slotWidth, reliefRadius } from '../src/stock.js?v=23';

test('fit classes exist with sane clearances (mm, per side)', () => {
  assert.ok(SLOT_FIT.snug < SLOT_FIT.standard);
  assert.ok(SLOT_FIT.standard < SLOT_FIT.outdoor);
});
test('slotWidth = measured thickness + 2*fit', () => {
  assert.equal(slotWidth(18, 'snug'), 18 + 2 * SLOT_FIT.snug);
  assert.equal(slotWidth(18.2, 'standard'), 18.2 + 2 * SLOT_FIT.standard);
});
test('relief defaults to a real bit + dogbone', () => {
  assert.ok(RELIEF.bitDia > 0);
  assert.equal(RELIEF.kind, 'dogbone');
});
test('reliefRadius = 1.1 * bit radius', () => {
  assert.equal(reliefRadius(), (RELIEF.bitDia / 2) * 1.1);
});
