import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG, CATEGORY_ORDER } from '../src/catalog.js?v=22';

test('CNC slot designs are in the catalog with known categories', () => {
  const ids = ['cnc-slot-stool','cnc-slot-lounge','cnc-slot-bench','cnc-slot-oval-rocker'];
  for (const id of ids) {
    const d = CATALOG.find(x => x.id === id);
    assert.ok(d, `${id} present in CATALOG`);
    assert.ok(CATEGORY_ORDER.includes(d.category), `${id} has a known category (${d.category})`);
  }
});
test('existing designs are untouched (board-stool still present)', () => {
  assert.ok(CATALOG.find(x => x.id === 'board-stool'), 'board-stool still in catalog');
});
