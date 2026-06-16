// ============================================================================
// catalog.js — aggregates the per-category design modules into one CATALOG.
// Each module exports an array of Design objects (see engineering.js contract).
// ============================================================================
import { BENCHES } from './designs/benches.js';
import { MARI } from './designs/mari.js';
import { LOUNGE } from './designs/lounge.js';
import { STOOLS } from './designs/stools_tables.js';
import { CLASSICS } from './designs/classics.js';
import { MODULAR } from './designs/modular.js';
import { INTERLOCK } from './designs/interlock.js';
import { HORSE } from './designs/horse.js';

export const CATALOG = [...BENCHES, ...MARI, ...LOUNGE, ...STOOLS, ...CLASSICS, ...MODULAR, ...INTERLOCK, ...HORSE];
export default CATALOG;
