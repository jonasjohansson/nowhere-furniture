// ============================================================================
// catalog.js — aggregates the per-category design modules into one CATALOG.
// Each module exports an array of Design objects (see engineering.js contract).
// ============================================================================
import { BENCHES } from './designs/benches.js';
import { MARI } from './designs/mari.js';
import { LOUNGE } from './designs/lounge.js';
import { STOOLS } from './designs/stools_tables.js';

export const CATALOG = [...BENCHES, ...MARI, ...LOUNGE, ...STOOLS];
export default CATALOG;
