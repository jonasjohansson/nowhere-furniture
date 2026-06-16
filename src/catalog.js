// ============================================================================
// catalog.js — aggregates the per-category design modules into one CATALOG.
// Each module exports an array of Design objects (see engineering.js contract).
// ============================================================================
import { BENCHES } from './designs/benches.js?v=11';
import { MARI } from './designs/mari.js?v=11';
import { LOUNGE } from './designs/lounge.js?v=11';
import { STOOLS } from './designs/stools_tables.js?v=11';
import { CLASSICS } from './designs/classics.js?v=11';
import { MODULAR } from './designs/modular.js?v=11';
import { INTERLOCK } from './designs/interlock.js?v=11';
import { HORSE } from './designs/horse.js?v=11';

export const CATALOG = [...INTERLOCK, ...BENCHES, ...MARI, ...LOUNGE, ...STOOLS, ...CLASSICS, ...MODULAR, ...HORSE];
export default CATALOG;
