// Smoke test — proves the harness loads the data contract and that Node's ESM
// loader resolves the project's `?v=24` cache-busting import suffix.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MM, SHEETS } from '../src/stock.js?v=24';

test('stock contract loads', () => {
  assert.equal(MM, 0.001);
  assert.equal(SHEETS.ply18.thickness, 18);
});
