// ============================================================================
// i18n.js — English / Catalan UI strings + a tiny translation helper.
// The buyers sourcing the timber are Catalan, so the chrome + bill of materials
// can switch language with one button. (Design names/blurbs/steps stay as
// authored — they're content; only the interface + BOM terms are translated.)
// ============================================================================

const STRINGS = {
  en: {
    tagline: "Enzo Mari & the honest-plank school · metric · Torx",
    catalog: "Catalog", about: "About",
    aboutText: "Burner-friendly outdoor furniture from two materials only — plywood sheet + reglar timber — screwed together with Torx. Pick a design, tune it, read off the full bill of materials, export the cut sheets.",
    tbMove: "↔ Move", tbRotate: "⟳ Rotate", tbSnap: "⊞ Snap", tbDims: "⊹ Dims",
    tbSheet: "+ Sheet", tbReglar: "+ Reglar", tbUndo: "↺ Undo", tbRedo: "↻ Redo",
    tbDuplicate: "⧉ Duplicate", tbDelete: "🗑 Delete", tbFit: "⤢ Fit",
    design: "Design", material: "Material",
    selectedPart: "Selected part", clickPart: "Click a part to edit it.",
    fName: "Name", fStock: "Stock", fWidth: "Width", fHeight: "Height", fDepth: "Depth",
    bom: "Bill of materials", export: "Export",
    expPrint: "🖨 Print BOM", expBomCsv: "BOM .csv", expCutCsv: "Cut list .csv",
    expCutSheet: "Cut sheets .svg", expElev: "Elevations .svg", expExploded: "Pieces + steps .svg", expSave: "Save .json", expLoad: "Load .json",
    matAuto: "Auto (by stock)",
    bPlywood: "Plywood", bReglar: "Reglar (timber)", bScrews: "Torx screws", bTotal: "Total",
    bParts: "parts", bUsed: "used", bSheet: "sheet", bSheets: "sheets",
    bNeeded: "needed", bBox: "box", bBoxes: "boxes",
    sSheet: "sheet", sSheets: "sheets", sScrews: "screws", sReglar: "reglar",
    Easy: "Easy", Moderate: "Moderate", Involved: "Involved",
    asmSteps: "Assembly steps", engNotes: "Engineering notes",
    wasteNote: "Prices are rough SEK estimates — add ~10% for waste, breakage and offcuts you can't reuse.",
  },
  ca: {
    tagline: "Enzo Mari i l'escola del tauler honest · mètric · Torx",
    catalog: "Catàleg", about: "Sobre",
    aboutText: "Mobiliari d'exterior fet amb només dos materials — tauler de contraxapat + llistó de fusta — cargolat amb Torx. Tria un disseny, ajusta'l, consulta la llista completa de materials i exporta els plafons de tall.",
    tbMove: "↔ Mou", tbRotate: "⟳ Gira", tbSnap: "⊞ Ajusta", tbDims: "⊹ Cotes",
    tbSheet: "+ Tauler", tbReglar: "+ Llistó", tbUndo: "↺ Desfés", tbRedo: "↻ Refés",
    tbDuplicate: "⧉ Duplica", tbDelete: "🗑 Elimina", tbFit: "⤢ Enquadra",
    design: "Disseny", material: "Material",
    selectedPart: "Peça seleccionada", clickPart: "Fes clic a una peça per editar-la.",
    fName: "Nom", fStock: "Material", fWidth: "Amplada", fHeight: "Alçada", fDepth: "Fondària",
    bom: "Llista de materials", export: "Exporta",
    expPrint: "🖨 Imprimeix", expBomCsv: "Materials .csv", expCutCsv: "Llista de tall .csv",
    expCutSheet: "Plafons .svg", expElev: "Alçats .svg", expExploded: "Peces + passos .svg", expSave: "Desa .json", expLoad: "Obre .json",
    matAuto: "Automàtic (per material)",
    bPlywood: "Contraxapat", bReglar: "Llistó (fusta)", bScrews: "Cargols Torx", bTotal: "Total",
    bParts: "peces", bUsed: "aprofitat", bSheet: "tauler", bSheets: "taulers",
    bNeeded: "necessaris", bBox: "caixa", bBoxes: "caixes",
    sSheet: "tauler", sSheets: "taulers", sScrews: "cargols", sReglar: "llistó",
    Easy: "Fàcil", Moderate: "Moderat", Involved: "Laboriós",
    asmSteps: "Passos de muntatge", engNotes: "Notes d'enginyeria",
    wasteNote: "Els preus són estimacions aproximades en SEK — afegeix-hi un ~10% per a malbarataments, trencaments i retalls no reaprofitables.",
  },
};

let _lang = (typeof localStorage !== 'undefined' && localStorage.getItem('nf-lang')) || 'en';
if (!STRINGS[_lang]) _lang = 'en';

export function getLang() { return _lang; }
export function setLang(l) {
  if (!STRINGS[l]) return;
  _lang = l;
  try { localStorage.setItem('nf-lang', l); } catch { /* ignore */ }
}
/** Translate a key for the current language (falls back to English, then key). */
export function t(key) {
  return (STRINGS[_lang] && STRINGS[_lang][key]) ?? STRINGS.en[key] ?? key;
}
// Parametric-control labels (across all designs) → Catalan. Unmapped labels fall
// back to the authored English.
const PARAM_LABELS_CA = {
  'Seat height': 'Alçada del seient',
  'Top width (tabs = ¼)': 'Amplada del tauler (pestanyes = ¼)',
  'Top width': 'Amplada del tauler', 'Top length': 'Llargada del tauler', 'Top depth': 'Fondària del tauler',
  'Tab width': 'Amplada de la pestanya', 'Tab depth': 'Fondària de la pestanya',
  'Units (side-by-side, rotated)': 'Unitats (de costat, girades)', 'Units': 'Unitats',
  'Gap between units': 'Separació entre unitats', 'Cross-rail height': 'Alçada de la travessa',
  'Length': 'Llargada', 'Width': 'Amplada', 'Depth': 'Fondària', 'Height': 'Alçada',
  'Seat depth': 'Fondària del seient', 'Seat width': 'Amplada del seient', 'Seat size': 'Mida del seient',
  'Back height': 'Alçada del respatller', 'Back rake': 'Inclinació del respatller', 'Back angle': 'Angle del respatller',
  'Slat gap': 'Separació dels llistons', 'Leg overhang': 'Voladís de la pota', 'Leg width': 'Amplada de la pota',
  'Recline': 'Reclinació', 'Stack': 'Apilament', 'Splay': 'Obertura',
};
/** Translate a design's parametric-control label for the current language. */
export function tParam(label) {
  return (_lang === 'ca' && PARAM_LABELS_CA[label]) || label;
}

/** Set textContent on every [data-i18n] element (and title on [data-i18n-title]). */
export function applyStatic(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
}
