// ============================================================================
// catalog.js — aggregates the per-category design modules into one CATALOG.
// Each module exports an array of Design objects (see engineering.js contract).
// ============================================================================
import { BENCHES } from './designs/benches.js?v=22';
import { MARI } from './designs/mari.js?v=22';
import { LOUNGE } from './designs/lounge.js?v=22';
import { STOOLS } from './designs/stools_tables.js?v=22';
import { CLASSICS } from './designs/classics.js?v=22';
import { MODULAR } from './designs/modular.js?v=22';
import { INTERLOCK } from './designs/interlock.js?v=22';
import { HORSE } from './designs/horse.js?v=22';

const RAW = [...INTERLOCK, ...BENCHES, ...MARI, ...LOUNGE, ...STOOLS, ...CLASSICS, ...MODULAR, ...HORSE];

// ----------------------------------------------------------------------------
// Categories — group the catalog by furniture TYPE so it reads as an organised
// list instead of one long roll. Order here is the display order of the groups;
// within a group, designs keep their RAW order (Board Stool stays first).
// ----------------------------------------------------------------------------
export const CATEGORY_ORDER = ['Stools', 'Benches', 'Chairs', 'Tables', 'Loungers', 'Modular'];

const CATEGORY_BY_ID = {
  'board-stool': 'Stools', 'berlin-hocker': 'Stools', 'aalto-stacking-stool': 'Stools', 'wooden-horse': 'Stools',
  'barrio-communal-bench': 'Benches', 'prouve-settle': 'Benches', 'plank-bench': 'Benches',
  'mari-panca': 'Benches', 'judd-bench': 'Benches', 'nakashima-plank-bench': 'Benches',
  'mari-sedia': 'Chairs', 'judd-plywood-chair': 'Chairs',
  'mari-tavolo': 'Tables', 'barrio-communal-table': 'Tables', 'barrio-picnic-trestle': 'Tables',
  'rietveld-crate-lounge': 'Loungers', 'perriand-plank-lounger': 'Loungers', 'barrio-daybed-podium': 'Loungers',
  'modular-box': 'Modular',
};

for (const d of RAW) d.category = CATEGORY_BY_ID[d.id] || 'Modular';

export const CATALOG = RAW;
export default CATALOG;
