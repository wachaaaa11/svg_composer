import { loadLibrary, loadSize, compId, parsePaletteFile, paletteTemplateJSON, normHex } from './library.js';
import { interpretOffline, interpretWithLLM, parseNames } from './matcher.js';
import { autoLayout, LAYOUT_MODES } from './layout.js';
import { Editor } from './editor.js';

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const EXAMPLES = ['Teamwork is solving a puzzle together', 'Идея, которая освещает путь', 'Secure payments in a mobile app', 'Spring gift for mom', 'Слушай клиента: поддержка и обратная связь', 'Learning is a journey'];

const lib = await loadLibrary('');
await loadSize(lib, 'S');
const editor = new Editor({ svg: $('#canvas'), lib, onChange: kind => { if (kind !== 'drag') refreshUI(); else refreshProps(); } });
window.__app = { editor, lib };                       // handy for tests / debugging

const app = { palettes: [...lib.palettes], last: null, seed: 1, role: 'main', busy: false };
const objName = id => { const o = lib.objects.find(o => o.id === id); return o ? `${o.name_en}` : id; };

// ------------------------------------------------------------------ size handling (S / L)
const effectiveSize = () => {
  const m = $('#sizeMode').value; if (m !== 'auto') return m;
  const { w, h } = editor.state.canvas; return Math.max(w, h) >= 1600 ? 'L' : 'S';   // big output → detailed L assets
};
async function syncSize() {
  const s = effectiveSize();
  if (s !== editor.state.size) { await loadSize(lib, s); editor.switchSize(s); }
  $('#sizeBadge').textContent = editor.state.size;
  buildLibrary();
}

// ------------------------------------------------------------------ composing
function setReport(html) { $('#report').innerHTML = html; }
function sizeOf(object, role) { const c = lib.comps[compId(editor.state.size, role, object)]; return { object, w: c.bbox.w, h: c.bbox.h }; }

function layoutNow() {
  if (!app.last) return;
  const { objects, bg } = app.last;
  const mode = $('#layoutMode').value;
  const res = autoLayout({ mains: objects.map(o => sizeOf(o, 'main')), bg: bg ? sizeOf(bg, 'background') : null, canvas: editor.state.canvas, mode, seed: app.seed });
  editor.setItems(res.items);
  editor.setGuide(mode === 'headline' ? { x0: 0.04, y0: 0.08, x1: 0.44, y1: 0.55 } : null);
}

async function compose() {
  if (app.busy) return; app.busy = true; $('#compose').disabled = true;
  try {
    const tab = document.querySelector('#modeTabs .on').dataset.tab, max = +$('#maxObj').value;
    let objects, bg = null, html = '';
    if (tab === 'meta') {
      const text = $('#metaText').value.trim(); if (!text) { setReport('<span class="warn">Enter a metaphor or headline.</span>'); return; }
      let used = 'local lexicon', res = null, ai = null;
      if ($('#aiOn').checked && $('#aiKey').value.trim()) {
        try { ai = await interpretWithLLM(text, lib.objects, { key: $('#aiKey').value.trim() }); used = 'AI (ids validated against the library)'; }
        catch (e) { html += `<div class="warn">AI interpretation failed (${esc(e.message)}) – used the local lexicon instead.</div>`; }
      }
      res = interpretOffline(text, { max });
      if (ai) { objects = ai.objects.slice(0, max); }
      else objects = res.objects.slice(0, max);
      const bgMode = $('#bgMode').value;
      if (bgMode === 'auto') {
        if (ai) bg = ai.background;
        else if (objects.length >= 3) bg = res.ranked.map(r => r.object).find(o => !objects.includes(o)) || objects[0];
      }
      html = `<div>Interpreted with <b>${used}</b>.</div>` + html;
      html += '<ul>' + objects.map(o => `<li><b>${esc(objName(o))}</b> <span class="why">${ai ? '' : esc((res.why[o] || []).slice(0, 4).join(', '))}</span></li>`).join('') + '</ul>';
      if (bg) html += `<div>Background: <b>${esc(objName(bg))}</b> <span class="why">(monochrome)</span></div>`; else html += '<div class="why">No background object (not needed for this composition).</div>';
      if (ai?.reason) html += `<div class="why">${esc(ai.reason)}</div>`;
      if (!ai && res.note) html += `<div class="warn">${esc(res.note)}</div>`;
    } else {
      const text = $('#namesText').value.trim(); if (!text) { setReport('<span class="warn">Enter component names.</span>'); return; }
      const r = parseNames(text, lib.objects.map(o => o.id));
      objects = r.objects; bg = r.background[0] || $('#namesBg').value || null;
      if (!objects.length && bg) { objects = [bg]; bg = null; }
      html = '<ul>' + objects.map(o => `<li><b>${esc(objName(o))}</b></li>`).join('') + '</ul>';
      if (bg) html += `<div>Background: <b>${esc(objName(bg))}</b></div>`;
      if (r.missing.length) html += `<div class="warn">Not found in the library: ${r.missing.map(esc).join(', ')}.<br>Available: ${lib.objects.map(o => o.name_en).join(', ')}.</div>`;
      if (!objects.length) { setReport(html); return; }
    }
    await syncSize();
    app.last = { objects, bg }; app.seed = 1;
    layoutNow();
    setReport(html);
  } finally { app.busy = false; $('#compose').disabled = false; }
}

// ------------------------------------------------------------------ library panel
function buildLibrary() {
  const grid = $('#libGrid'); grid.innerHTML = '';
  $('#libInfo').textContent = `· size ${editor.state.size}`;
  for (const o of lib.objects) {
    const c = lib.comps[compId(editor.state.size, app.role, o.id)]; if (!c?.inner) continue;
    const d = document.createElement('div'); d.className = 'libitem'; d.draggable = true; d.title = `${o.name_en} / ${o.name_ru}`;
    d.innerHTML = `<svg viewBox="${c.bbox.x} ${c.bbox.y} ${c.bbox.w} ${c.bbox.h}" preserveAspectRatio="xMidYMid meet">${editor.markup({ object: o.id, role: app.role })}</svg><span>${esc(o.name_en)}</span>`;
    d.addEventListener('click', () => editor.addItem(o.id, app.role));
    d.addEventListener('dragstart', e => e.dataTransfer.setData('text/plain', `comp:${app.role}:${o.id}`));
    grid.appendChild(d);
  }
}
document.querySelectorAll('#libTabs button').forEach(b => b.onclick = () => {
  document.querySelectorAll('#libTabs button').forEach(x => x.classList.toggle('on', x === b)); app.role = b.dataset.role; buildLibrary();
});

// ------------------------------------------------------------------ properties + layers
function refreshProps() {
  const it = editor.sel, box = $('#props'); box.hidden = !it;
  if (!it) return;
  $('#selName').textContent = `${objName(it.object)} (${it.role === 'main' ? 'main' : 'background'})`;
  if (document.activeElement !== $('#pRot')) $('#pRot').value = Math.round(it.rot * 10) / 10;
  if (document.activeElement !== $('#pScale')) $('#pScale').value = Math.round(it.scale / editor.defaultScale() * 1000) / 10;
}
function refreshLayers() {
  const ol = $('#layers'); ol.innerHTML = '';
  [...editor.items].reverse().forEach(it => {
    const li = document.createElement('li'); if (it.uid === editor.state.selected) li.className = 'on';
    li.innerHTML = `<span class="nm">${esc(objName(it.object))}</span><span class="tag">${it.role === 'main' ? 'main' : 'bg'}</span><button title="Forward">▲</button><button title="Backward">▼</button>`;
    li.onclick = () => editor.select(it.uid);
    const [up, dn] = li.querySelectorAll('button');
    up.onclick = e => { e.stopPropagation(); editor.reorder('forward', it.uid); };
    dn.onclick = e => { e.stopPropagation(); editor.reorder('backward', it.uid); };
    ol.appendChild(li);
  });
  if (!editor.items.length) ol.innerHTML = '<li style="cursor:default;color:var(--muted)">empty canvas</li>';
}
function refreshUI() {
  refreshProps(); refreshLayers();
  $('#undo').disabled = !editor.undoStack.length; $('#redo').disabled = !editor.redoStack.length;
  fit();
}
$('#pRot').onchange = e => editor.setProp('rot', +e.target.value);
$('#pScale').onchange = e => editor.setProp('scale', editor.defaultScale() * (+e.target.value) / 100);
$('#bDup').onclick = () => editor.duplicate(); $('#bDel').onclick = () => editor.remove();
$('#bFront').onclick = () => editor.reorder('front'); $('#bBack').onclick = () => editor.reorder('back');
$('#bFwd').onclick = () => editor.reorder('forward'); $('#bBwd').onclick = () => editor.reorder('backward');
$('#undo').onclick = () => editor.undo(); $('#redo').onclick = () => editor.redo();
$('#clear').onclick = () => { app.last = null; editor.clear(); setReport(''); };

// ------------------------------------------------------------------ palettes
const sig = p => [...p.background, ...p.objects, p.black, p.white].join();
function drawPalettes() {
  const box = $('#palettes'); box.innerHTML = '';
  for (const p of app.palettes) {
    const b = document.createElement('button'); b.className = 'pal' + (p.id === editor.palette.id ? ' on' : '');
    const cols = [p.background[0], p.objects[0], p.background[1], p.objects[1], p.background[2], p.objects[2], p.black, p.white];
    b.innerHTML = `<div class="sw">${cols.map(c => `<i style="background:${c};display:block"></i>`).join('')}</div><span>${esc(p.name)}</span>`;
    b.onclick = () => setPalette(p); box.appendChild(b);
  }
  const pk = $('#picker'); pk.innerHTML = '';
  const pal = editor.palette, entries = [['bg 1 (light)', 'background', 0], ['obj 1', 'objects', 0], ['bg 2', 'background', 1], ['obj 2', 'objects', 1], ['bg 3 (dark)', 'background', 2], ['obj 3', 'objects', 2], ['black', 'black'], ['white', 'white']];
  for (const [lab, key, i] of entries) {
    const l = document.createElement('label'), inp = document.createElement('input'); inp.type = 'color';
    inp.value = (i === undefined ? pal[key] : pal[key][i]).toLowerCase();
    inp.oninput = () => editCustom(key, i, inp.value);
    l.append(inp, lab); pk.appendChild(l);
  }
}
function setPalette(p) { editor.setPalette(p); drawPalettes(); buildLibrary(); }
function editCustom(key, i, val) {
  let p = editor.palette;
  if (p.builtin || !p.id.startsWith('custom')) {
    p = { id: 'custom-edit-' + Date.now().toString(36), name: 'Custom (edited)', background: [...p.background], objects: [...p.objects], black: p.black, white: p.white, builtin: false };
    app.palettes.push(p);
  }
  const v = normHex(val).toUpperCase();
  if (i === undefined) p[key] = v; else p[key][i] = v;
  editor.palette = p; editor.render(); buildLibrary(); editor.onChange('palette');
  clearTimeout(editCustom.t); editCustom.t = setTimeout(drawPalettes, 400);
}
$('#palFile').onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  try { const p = parsePaletteFile(await f.text(), f.name); app.palettes.push(p); setPalette(p); $('#palMsg').textContent = `Loaded “${p.name}”.`; }
  catch (err) { $('#palMsg').innerHTML = `<span class="warn">${esc(err.message)}</span>`; }
  e.target.value = '';
};
$('#palTpl').onclick = () => download('palette-template.json', paletteTemplateJSON(editor.palette), 'application/json');

// ------------------------------------------------------------------ output settings
$('#preset').onchange = async e => {
  const v = e.target.value; $('#customSize').hidden = v !== 'custom'; if (v === 'custom') return;
  const [w, h] = v.split('x').map(Number); await applySize(w, h);
};
$('#applySize').onclick = () => applySize(Math.max(100, Math.min(8000, +$('#cw').value || 1200)), Math.max(100, Math.min(8000, +$('#ch').value || 630)));
async function applySize(w, h) { editor.setCanvasSize(w, h); await syncSize(); fit(); }
$('#sizeMode').onchange = syncSize;
$('#canvasBg').onchange = e => editor.setCanvasBg(e.target.value);
$('#layoutMode').onchange = () => { app.seed = 1; layoutNow(); if (!app.last) editor.setGuide($('#layoutMode').value === 'headline' ? { x0: 0.04, y0: 0.08, x1: 0.44, y1: 0.55 } : null); };
$('#shuffle').onclick = () => { if (!app.last) return; app.seed++; layoutNow(); };

// ------------------------------------------------------------------ compose tabs / examples
document.querySelectorAll('#modeTabs button').forEach(b => b.onclick = () => {
  document.querySelectorAll('#modeTabs button').forEach(x => x.classList.toggle('on', x === b));
  $('#tab-meta').hidden = b.dataset.tab !== 'meta'; $('#tab-names').hidden = b.dataset.tab !== 'names';
});
for (const ex of EXAMPLES) { const b = document.createElement('button'); b.textContent = ex; b.onclick = () => { $('#metaText').value = ex; }; $('#examples').appendChild(b); }
for (const o of lib.objects) { const op = document.createElement('option'); op.value = o.id; op.textContent = o.name_en; $('#namesBg').appendChild(op); }
$('#compose').onclick = compose;
$('#metaText').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) compose(); });

// ------------------------------------------------------------------ export + canvas fitting
function download(name, text, type = 'image/svg+xml') {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
$('#export').onclick = () => { if (!editor.items.length) { $('#status').textContent = 'Nothing to export – the canvas is empty.'; return; } const { w, h } = editor.state.canvas; download(`composition-${editor.state.size}-${w}x${h}.svg`, editor.exportSVG()); };
function fit() {
  const st = $('#stage'), { w, h } = editor.state.canvas, k = Math.min((st.clientWidth - 2) / w, (st.clientHeight - 2) / h);
  const c = $('#canvas'); c.style.width = Math.floor(w * k) + 'px'; c.style.height = Math.floor(h * k) + 'px';
}
new ResizeObserver(fit).observe($('#stage'));

drawPalettes(); buildLibrary(); refreshUI(); fit();
