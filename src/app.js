// ============================================================================
// app.js — integration shell. Wires catalog -> builder -> BOM -> export.
// ============================================================================
import { Builder } from './builder.js?v=8';
import { CATALOG } from './catalog.js?v=8';
import { computeBOM, bomSummaryLine } from './bom.js?v=8';
import { SHEETS, TIMBER } from './stock.js?v=8';
import { MATERIALS } from './materials.js?v=8';
import { t, tParam, getLang, setLang, applyStatic } from './i18n.js?v=8';
import {
  bomToCSV, partsToCSV, bomToHTML, buildCutSheetSVG, buildElevationsSVG,
  downloadFile, exportProjectJSON, readProjectJSON, printHTML,
} from './export.js?v=8';

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------------------
// state
// ---------------------------------------------------------------------------
const builder = new Builder($('canvas'));
let currentDesign = null;
let currentParams = {};
let currentJoints = [];   // joints from the active design template (drive screws)
let currentBuild = null;  // last {parts, joints, steps, notes} from build()
let lastParts = [];

// ---------------------------------------------------------------------------
// catalog list
// ---------------------------------------------------------------------------
function renderCatalog() {
  const wrap = $('catalog-list');
  wrap.innerHTML = '';
  for (const d of CATALOG) {
    const el = document.createElement('button');
    el.className = 'cat-item';
    el.dataset.id = d.id;
    el.innerHTML = `<b>${d.name}</b><small>${d.designer}${d.year ? ' · ' + d.year : ''}</small>`;
    el.onclick = () => selectDesign(d.id);
    wrap.appendChild(el);
  }
}

function markActiveCat(id) {
  for (const el of document.querySelectorAll('.cat-item'))
    el.classList.toggle('active', el.dataset.id === id);
}

// ---------------------------------------------------------------------------
// design + parametric controls
// ---------------------------------------------------------------------------
function selectDesign(id) {
  const d = CATALOG.find((x) => x.id === id);
  if (!d) return;
  currentDesign = d;
  currentParams = {};
  for (const p of d.params) currentParams[p.key] = p.default;
  markActiveCat(id);
  renderDesignHead();
  renderParams();
  rebuildFromParams();
}

function renderDesignHead() {
  const d = currentDesign;
  if (!d) { $('design-head').innerHTML = ''; return; }
  const badges = [d.difficulty ? t(d.difficulty) : null, d.buildTime].filter(Boolean)
    .map((b) => `<span class="badge">${b}</span>`).join('');
  $('design-head').innerHTML =
    `<b>${d.name}</b><div class="by">${d.designer}${d.year ? ' · ' + d.year : ''}</div>
     ${badges ? `<div class="badges">${badges}</div>` : ''}
     <div class="blurb">${d.blurb}</div>`;
}

function renderBuildInfo(build) {
  const el = $('buildinfo');
  if (!build) { el.innerHTML = ''; return; }
  let html = '';
  if (build.steps && build.steps.length) {
    html += `<details class="bi"><summary>${t('asmSteps')}</summary><ol>`;
    for (const s of build.steps) html += `<li>${s}</li>`;
    html += '</ol></details>';
  }
  if (build.notes && build.notes.length) {
    html += `<details class="bi"><summary>${t('engNotes')}</summary><ul>`;
    for (const n of build.notes) html += `<li>${n}</li>`;
    html += '</ul></details>';
  }
  el.innerHTML = html;
}

function renderParams() {
  const wrap = $('params');
  wrap.innerHTML = '';
  if (!currentDesign) return;
  for (const p of currentDesign.params) {
    const row = document.createElement('div');
    row.className = 'param';
    row.innerHTML = `
      <div class="top"><span>${tParam(p.label)}</span>
        <span class="val"><span data-val="${p.key}">${currentParams[p.key]}</span> ${p.unit || ''}</span></div>
      <input type="range" min="${p.min}" max="${p.max}" step="${p.step}" value="${currentParams[p.key]}" data-key="${p.key}" />`;
    const range = row.querySelector('input');
    range.addEventListener('input', () => {
      currentParams[p.key] = +range.value;
      row.querySelector(`[data-val="${p.key}"]`).textContent = range.value;
      rebuildFromParams();
    });
    wrap.appendChild(row);
  }
}

function rebuildFromParams() {
  if (!currentDesign) return;
  let out;
  try {
    out = currentDesign.build(currentParams);
  } catch (e) {
    console.error('build failed', e);
    toast('Design build error — see console');
    return;
  }
  currentBuild = out;
  currentJoints = out.joints || [];   // set BEFORE loadParts so BOM uses them
  builder.loadParts(out.parts || []); // emits 'change' -> recomputes BOM
  renderBuildInfo(out);
}

// ---------------------------------------------------------------------------
// builder events
// ---------------------------------------------------------------------------
builder.on('change', (parts) => {
  lastParts = parts;
  recomputeBOM();
});
builder.on('select', (spec) => renderInspector(spec));

// ---------------------------------------------------------------------------
// BOM panel
// ---------------------------------------------------------------------------
function currentBOM() {
  return computeBOM({ parts: lastParts, joints: currentJoints });
}

function fmtSEK(n) {
  return Math.round(n || 0).toLocaleString('sv-SE').replace(/ /g, ' ') + ' kr';
}

function localizedSummary(bom) {
  const sheets = bom.sheets.reduce((s, r) => s + r.sheetsNeeded, 0);
  const m = bom.totals.timberLengthM;
  const screws = bom.totals.screwCount;
  return `${sheets} ${t(sheets === 1 ? 'sSheet' : 'sSheets')} · ${m} m ${t('sReglar')} · ` +
         `${screws} ${t('sScrews')} · ~${fmtSEK(bom.totals.grandCost)}`;
}

function recomputeBOM() {
  const bom = currentBOM();
  $('bom-summary').textContent = localizedSummary(bom);
  const out = [];

  if (bom.sheets.length) {
    out.push(`<h3>${t('bPlywood')}</h3><table>`);
    for (const r of bom.sheets) {
      out.push(`<tr><td>${r.label} <span class="sub">×${r.sheetsNeeded} ${t(r.sheetsNeeded > 1 ? 'bSheets' : 'bSheet')}</span>
        <div class="sub">${r.partsCount} ${t('bParts')} · ${Math.round((r.utilisation || 0) * 100)}% ${t('bUsed')}</div></td>
        <td class="r">${fmtSEK(r.lineTotal)}</td></tr>`);
    }
    out.push('</table>');
  }
  if (bom.timber.length) {
    out.push(`<h3>${t('bReglar')}</h3><table>`);
    for (const r of bom.timber) {
      const sticks = (r.sticks || []).map((s) => `${s.count}×${s.length}`).join(', ');
      out.push(`<tr><td>${r.label} <span class="sub">${sticks}</span>
        <div class="sub">${r.totalLengthM} m ${t('bNeeded')}</div></td>
        <td class="r">${fmtSEK(r.lineTotal)}</td></tr>`);
    }
    out.push('</table>');
  }
  if (bom.screws.length) {
    out.push(`<h3>${t('bScrews')}</h3><table>`);
    for (const r of bom.screws) {
      out.push(`<tr><td>${r.label} <span class="sub">×${r.count} (${r.boxes} ${t(r.boxes > 1 ? 'bBoxes' : 'bBox')})</span></td>
        <td class="r">${fmtSEK(r.lineTotal)}</td></tr>`);
    }
    out.push('</table>');
  }

  out.push(`<div class="grand"><span>${t('bTotal')}</span><span>${fmtSEK(bom.totals.grandCost)}</span></div>`);
  if (bom.warnings && bom.warnings.length) {
    const w = bom.warnings.map((x) => x.startsWith('Prices are rough') ? t('wasteNote') : x);
    out.push(`<div class="warn">⚠ ${w.join('<br>⚠ ')}</div>`);
  }

  $('bom').innerHTML = out.join('');
}

// ---------------------------------------------------------------------------
// inspector
// ---------------------------------------------------------------------------
function buildMaterialSelect() {
  const sel = $('material-select');
  const cats = {};
  for (const m of MATERIALS) (cats[m.category] = cats[m.category] || []).push(m);
  let html = `<option value="">${t('matAuto')}</option>`;
  for (const [cat, list] of Object.entries(cats)) {
    html += `<optgroup label="${cat}">`;
    for (const m of list) html += `<option value="${m.id}">${m.name}</option>`;
    html += '</optgroup>';
  }
  sel.innerHTML = html;
  sel.addEventListener('change', () => builder.setMaterial(sel.value));
}

function buildStockSelect() {
  const sel = $('i-stock');
  const groups = [['Plywood', SHEETS], ['Reglar', TIMBER]];
  let html = '';
  for (const [label, tbl] of groups) {
    html += `<optgroup label="${label}">`;
    for (const [key, rec] of Object.entries(tbl)) html += `<option value="${key}">${rec.label}</option>`;
    html += '</optgroup>';
  }
  sel.innerHTML = html;
}

function renderInspector(spec) {
  const has = !!spec;
  $('inspect-empty').hidden = has;
  $('inspect-body').hidden = !has;
  if (!has) return;
  $('i-name').value = spec.name || '';
  $('i-stock').value = spec.stock || '';
  $('i-w').value = Math.round(spec.size.w);
  $('i-h').value = Math.round(spec.size.h);
  $('i-d').value = Math.round(spec.size.d);
}

function patchSelected(patch) {
  if (builder.selectedId) builder.updatePart(builder.selectedId, patch);
}

$('i-name').addEventListener('input', () => patchSelected({ name: $('i-name').value }));
['i-w', 'i-h', 'i-d'].forEach((id) => $(id).addEventListener('input', () => {
  patchSelected({ size: {
    w: Math.max(1, +$('i-w').value || 1),
    h: Math.max(1, +$('i-h').value || 1),
    d: Math.max(1, +$('i-d').value || 1),
  } });
}));
$('i-stock').addEventListener('change', () => {
  const key = $('i-stock').value;
  const sel = builder.getSelected();
  if (!sel) return;
  const patch = { stock: key };
  if (SHEETS[key]) { patch.material = 'sheet'; patch.size = { ...sel.size, d: SHEETS[key].thickness }; }
  else if (TIMBER[key]) {
    patch.material = 'timber';
    patch.size = sizeForTimber(sel.size, TIMBER[key].section);
  }
  patchSelected(patch);
  renderInspector(builder.getSelected());
});

// keep the longest edge (length) and set the other two to the stock section
function sizeForTimber(size, section) {
  const axes = [['w', size.w], ['h', size.h], ['d', size.d]].sort((a, b) => b[1] - a[1]);
  const out = { ...size };
  out[axes[1][0]] = section.h;
  out[axes[2][0]] = section.w;
  return out;
}

// ---------------------------------------------------------------------------
// toolbar
// ---------------------------------------------------------------------------
function addCustomPart(material) {
  const spec = material === 'sheet'
    ? { ref: 'X', name: 'Custom panel', material: 'sheet', stock: 'ply18',
        size: { w: 600, h: 440, d: 18 }, pos: { x: 0, y: 220, z: 0 }, rot: { x: 0, y: 0, z: 0 } }
    : { ref: 'X', name: 'Custom reglar', material: 'timber', stock: 'reglar45x70',
        size: { w: 1200, h: 70, d: 45 }, pos: { x: 0, y: 35, z: 0 }, rot: { x: 0, y: 0, z: 0 } };
  builder.addPart(spec);
}

let dimsOn = false;
$('toolbar').addEventListener('click', (e) => {
  const btn = e.target.closest('button'); if (!btn) return;
  const act = btn.dataset.act;
  switch (act) {
    case 'move':   setMode('translate'); break;
    case 'rotate': setMode('rotate'); break;
    case 'snap':   { const on = !btn.classList.contains('active'); btn.classList.toggle('active', on); builder.setSnap(on); break; }
    case 'dims':   { dimsOn = !dimsOn; btn.classList.toggle('active', dimsOn); builder.toggleDimensions(dimsOn); break; }
    case 'add-sheet':  addCustomPart('sheet'); break;
    case 'add-timber': addCustomPart('timber'); break;
    case 'undo':       builder.undo(); break;
    case 'redo':       builder.redo(); break;
    case 'duplicate':  builder.duplicateSelected(); break;
    case 'delete':     builder.deleteSelected(); break;
    case 'frame':      builder.frameAll(); break;
  }
});

// enable/disable the undo/redo buttons as history changes
builder.on('history', ({ canUndo, canRedo }) => {
  document.querySelector('[data-act=undo]').disabled = !canUndo;
  document.querySelector('[data-act=redo]').disabled = !canRedo;
});

function setMode(mode) {
  builder.setMode(mode);
  document.querySelector('[data-act=move]').classList.toggle('active', mode === 'translate');
  document.querySelector('[data-act=rotate]').classList.toggle('active', mode === 'rotate');
}

// ---------------------------------------------------------------------------
// keyboard
// ---------------------------------------------------------------------------
window.addEventListener('keydown', (e) => {
  if (e.target.matches('input, select, textarea')) return;
  // Undo / redo (⌘Z / Ctrl+Z, ⌘⇧Z / Ctrl+Y) — handle before the plain-key switch.
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    if (e.shiftKey) builder.redo(); else builder.undo();
    return;
  }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
    e.preventDefault(); builder.redo(); return;
  }
  if (e.metaKey || e.ctrlKey) return; // don't hijack other shortcuts
  switch (e.key.toLowerCase()) {
    case 'w': setMode('translate'); break;
    case 'e': setMode('rotate'); break;
    case 's': { const b = document.querySelector('[data-act=snap]'); const on = !b.classList.contains('active'); b.classList.toggle('active', on); builder.setSnap(on); break; }
    case 'm': { const b = document.querySelector('[data-act=dims]'); dimsOn = !dimsOn; b.classList.toggle('active', dimsOn); builder.toggleDimensions(dimsOn); break; }
    case 'f': builder.frameAll(); break;
    case 'd': if (builder.selectedId) { e.preventDefault(); builder.duplicateSelected(); } break;
    case 'delete': case 'backspace': builder.deleteSelected(); break;
    case 'escape': builder.select(null); break;
  }
});

// ---------------------------------------------------------------------------
// export
// ---------------------------------------------------------------------------
function today() { return new Date().toISOString().slice(0, 10); }

function pieceSummary() {
  const m = new Map();
  for (const p of lastParts) m.set(p.name, (m.get(p.name) || 0) + 1);
  return [...m].map(([name, qty]) => ({ name, qty }));
}

function exportMeta() {
  return {
    projectName: currentDesign ? currentDesign.name : 'Nowhere build',
    designer: currentDesign ? currentDesign.designer : '',
    date: today(),
    parts: lastParts,
    pieces: pieceSummary(),
  };
}

$('right').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-exp]'); if (!btn) return;
  const bom = currentBOM();
  switch (btn.dataset.exp) {
    case 'print':      printHTML(bomToHTML(bom, exportMeta())); break;
    case 'bom-csv':    downloadFile('nowhere-bom.csv', bomToCSV(bom), 'text/csv'); break;
    case 'parts-csv':  downloadFile('nowhere-cutlist.csv', partsToCSV(lastParts), 'text/csv'); break;
    case 'cutsheet':   downloadFile('nowhere-cutsheets.svg', buildCutSheetSVG(bom), 'image/svg+xml'); break;
    case 'elevations': downloadFile('nowhere-elevations.svg', buildElevationsSVG(lastParts), 'image/svg+xml'); break;
    case 'save':       exportProjectJSON({ design: currentDesign?.id, params: currentParams, parts: lastParts }, 'nowhere-project.json'); break;
    case 'load':       $('file-input').click(); break;
  }
});

$('file-input').addEventListener('change', async (e) => {
  const file = e.target.files[0]; if (!file) return;
  try {
    const state = await readProjectJSON(file);
    if (state.design && CATALOG.find((d) => d.id === state.design)) {
      currentDesign = CATALOG.find((d) => d.id === state.design);
      currentParams = { ...{}, ...state.params };
      // fill any missing params with defaults
      for (const p of currentDesign.params) if (currentParams[p.key] == null) currentParams[p.key] = p.default;
      markActiveCat(currentDesign.id);
      renderDesignHead(); renderParams(); rebuildFromParams();
    } else {
      currentDesign = null; currentJoints = [];
      renderDesignHead(); renderParams();
      builder.loadParts(state.parts || []);
    }
    toast('Project loaded');
  } catch (err) { console.error(err); toast('Could not load file'); }
  e.target.value = '';
});

// ---------------------------------------------------------------------------
// toast
// ---------------------------------------------------------------------------
let toastTimer;
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 1700);
}

// ---------------------------------------------------------------------------
// boot
// ---------------------------------------------------------------------------
buildStockSelect();
buildMaterialSelect();
renderCatalog();
selectDesign('board-stool'); // the featured design, pinned to the top of the catalog

// --- language (English / Catalan) ------------------------------------------
function refreshLang() {
  applyStatic();
  $('lang-toggle').textContent = getLang() === 'en' ? 'CA' : 'EN';
  const autoOpt = $('material-select').querySelector('option[value=""]');
  if (autoOpt) autoOpt.textContent = t('matAuto');
  if (currentDesign) { renderDesignHead(); renderParams(); renderBuildInfo(currentBuild); }
  recomputeBOM();
  renderInspector(builder.getSelected());
}
$('lang-toggle').addEventListener('click', () => {
  setLang(getLang() === 'en' ? 'ca' : 'en');
  refreshLang();
});
applyStatic();
$('lang-toggle').textContent = getLang() === 'en' ? 'CA' : 'EN';
