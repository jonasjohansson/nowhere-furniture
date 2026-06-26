import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32, hashString, randInt, pick, snap, seedFrom } from '../src/rng.js?v=23';

test('mulberry32 is deterministic for a seed and in [0,1)', () => {
  const a = mulberry32(123), b = mulberry32(123);
  assert.equal(a(), b());                 // same seed -> same sequence
  const x = mulberry32(1)();
  assert.ok(x >= 0 && x < 1);
});
test('hashString is a stable uint', () => {
  assert.equal(hashString('abc'), hashString('abc'));
  assert.ok(Number.isInteger(hashString('abc')) && hashString('abc') >= 0);
});
test('randInt is inclusive and in range', () => {
  const r = mulberry32(7);
  for (let i = 0; i < 200; i++) { const n = randInt(r, 2, 5); assert.ok(n >= 2 && n <= 5 && Number.isInteger(n)); }
});
test('pick returns an element of the array', () => {
  const arr = ['a','b','c'];
  for (let i = 0; i < 50; i++) assert.ok(arr.includes(pick(mulberry32(i), arr)));
});
test('snap rounds to the nearest step', () => {
  assert.equal(snap(13, 5), 15);
  assert.equal(snap(12, 5), 10);
  assert.equal(snap(7.4, 1), 7);
});
test('seedFrom turns a string or number into a uint seed', () => {
  assert.equal(seedFrom('hello'), seedFrom('hello'));
  assert.ok(Number.isInteger(seedFrom('hello')) && seedFrom('hello') >= 0);
  assert.equal(seedFrom(42) >>> 0, seedFrom(42)); // numbers pass through as uint
});
