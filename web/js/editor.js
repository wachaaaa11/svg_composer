// Canvas editor + exporter. Items are *references* to library components plus a transform
// (translate / rotate / uniform scale). Component geometry is never edited; the only change to
// component markup is the intended fill swap done by recolor().
import { recolor, compId } from './library.js';

const NS = 'http://www.w3.org/2000/svg';
const r3 = v => Math.round(v * 1000) / 1000;
const ACCENT = '#4f46e5';

export class Editor {
  constructor({ svg, lib, onChange = () => {} }) {
    this.svg = svg; this.lib = lib; this.onChange = onChange;
    this.palette = lib.base;
    this.state = { size: 'S', canvas: { w: 1200, h: 630, bg: 'bg0' }, items: [], selected: null, uid: 1 };
    this.undoStack = []; this.redoStack = []; this.cache = new Map(); this.guide = null; this.refScale = 0.5;
    svg.style.touchAction = 'none';
    svg.addEventListener('pointerdown', e => this.#down(e));
    svg.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
    svg.addEventListener('drop', e => {
      e.preventDefault(); const d = e.dataTransfer.getData('text/plain'); if (!d.startsWith('comp:')) return;
      const [, role, object] = d.split(':'); const p = this.#pt(e); this.addItem(object, role, { x: p.x, y: p.y });
    });
    document.addEventListener('keydown', e => this.#key(e));
    new ResizeObserver(() => this.#drawUI()).observe(svg);
    this.render();
  }

  // ------------------------------------------------------------ helpers
  comp(item) { return this.lib.comps[compId(this.state.size, item.role, item.object)]; }
  get items() { return this.state.items; }
  get sel() { return this.state.items.find(i => i.uid === this.state.selected) || null; }
  snapshot() { const s = this.state; return JSON.stringify({ size: s.size, canvas: s.canvas, items: s.items, selected: s.selected, uid: s.uid }); }
  #restore(js) { this.state = JSON.parse(js); this.render(); this.onChange('restore'); }
  #pushUndo(snap) { this.undoStack.push(snap || this.snapshot()); if (this.undoStack.length > 100) this.undoStack.shift(); this.redoStack = []; }
  undo() { if (!this.undoStack.length) return; this.redoStack.push(this.snapshot()); this.#restore(this.undoStack.pop()); }
  redo() { if (!this.redoStack.length) return; this.undoStack.push(this.snapshot()); this.#restore(this.redoStack.pop()); }
  /** run a discrete change as one undo step */
  change(fn, kind = 'edit') { this.#pushUndo(); fn(); this.render(); this.onChange(kind); }
  #pt(e) { const p = this.svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; return p.matrixTransform(this.svg.getScreenCTM().inverse()); }
  #unitPx() { const r = this.svg.getBoundingClientRect(); return r.width ? this.state.canvas.w / r.width : 1; }

  transformOf(it) {
    const c = this.comp(it), cx = c.bbox.x + c.bbox.w / 2, cy = c.bbox.y + c.bbox.h / 2;
    return `translate(${r3(it.x)} ${r3(it.y)}) rotate(${r3(it.rot)}) scale(${r3(it.scale)}) translate(${r3(-cx)} ${r3(-cy)})`;
  }
  markup(it, pal = this.palette) {
    const c = this.comp(it);
    const key = c.id + '|' + pal.id + '|' + [...pal.background, ...pal.objects, pal.black, pal.white].join();
    if (!this.cache.has(key)) this.cache.set(key, recolor(c.inner, it.role, pal, this.lib.base));
    return this.cache.get(key);
  }
  canvasFill(pal = this.palette) {
    const b = this.state.canvas.bg;
    return b === 'bg0' ? pal.background[0] : b === 'bg1' ? pal.background[1] : b === 'white' ? '#FFFFFF' : null;
  }
  /** axis-independent selection frame: centre + half extents + rotation */
  frame(it) { const c = this.comp(it); return { cx: it.x, cy: it.y, hw: c.bbox.w * it.scale / 2, hh: c.bbox.h * it.scale / 2, rot: it.rot }; }
  bounds(it) { // axis-aligned bounds on canvas
    const f = this.frame(it), a = f.rot * Math.PI / 180, co = Math.cos(a), si = Math.sin(a);
    const ex = Math.abs(f.hw * co) + Math.abs(f.hh * si), ey = Math.abs(f.hw * si) + Math.abs(f.hh * co);
    return { x0: it.x - ex, y0: it.y - ey, x1: it.x + ex, y1: it.y + ey };
  }

  // ------------------------------------------------------------ rendering
  render() {
    const { w, h } = this.state.canvas, svg = this.svg;
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    const fill = this.canvasFill();
    let html = fill ? `<rect id="canvas-bg" width="${w}" height="${h}" fill="${fill}"/>` :
      `<defs><pattern id="chk" width="24" height="24" patternUnits="userSpaceOnUse"><rect width="24" height="24" fill="#fff"/><rect width="12" height="12" fill="#eee"/><rect x="12" y="12" width="12" height="12" fill="#eee"/></pattern></defs><rect id="canvas-bg" width="${w}" height="${h}" fill="url(#chk)"/>`;
    html += '<g id="items">';
    for (const it of this.items) html += `<g class="item" data-uid="${it.uid}" transform="${this.transformOf(it)}">${this.markup(it)}</g>`;
    html += '</g><g id="ui"></g>';
    svg.innerHTML = html;
    this.#drawUI();
  }
  #drawUI() {
    const ui = this.svg.querySelector('#ui'); if (!ui) return;
    let h = '';
    const { w: W, h: H } = this.state.canvas;
    if (this.guide) { const g = this.guide; h += `<rect x="${g.x0 * W}" y="${g.y0 * H}" width="${(g.x1 - g.x0) * W}" height="${(g.y1 - g.y0) * H}" fill="none" stroke="#e11d48" stroke-width="${2 * this.#unitPx()}" stroke-dasharray="${8 * this.#unitPx()} ${6 * this.#unitPx()}" pointer-events="none"/><text x="${g.x0 * W + 8 * this.#unitPx()}" y="${g.y0 * H + 18 * this.#unitPx()}" font-size="${13 * this.#unitPx()}" fill="#e11d48" pointer-events="none" font-family="sans-serif">headline area (preview only, not exported)</text>`; }
    const it = this.sel;
    if (it) {
      const f = this.frame(it), u = this.#unitPx(), a = f.rot * Math.PI / 180, co = Math.cos(a), si = Math.sin(a);
      const P = (lx, ly) => [f.cx + lx * co - ly * si, f.cy + lx * si + ly * co];
      const cs = [[-f.hw, -f.hh], [f.hw, -f.hh], [f.hw, f.hh], [-f.hw, f.hh]].map(([x, y]) => P(x, y));
      h += `<polygon points="${cs.map(p => p.join(',')).join(' ')}" fill="none" stroke="${ACCENT}" stroke-width="${1.5 * u}" stroke-dasharray="${5 * u} ${4 * u}" pointer-events="none"/>`;
      const hs = 8 * u, names = ['nw', 'ne', 'se', 'sw'];
      cs.forEach((p, i) => h += `<rect data-handle="${names[i]}" x="${p[0] - hs / 2}" y="${p[1] - hs / 2}" width="${hs}" height="${hs}" fill="#fff" stroke="${ACCENT}" stroke-width="${1.5 * u}" style="cursor:nwse-resize"/>`);
      const top = P(0, -f.hh), rh = P(0, -f.hh - 26 * u);
      h += `<line x1="${top[0]}" y1="${top[1]}" x2="${rh[0]}" y2="${rh[1]}" stroke="${ACCENT}" stroke-width="${1.5 * u}" pointer-events="none"/><circle data-handle="rot" cx="${rh[0]}" cy="${rh[1]}" r="${5.5 * u}" fill="${ACCENT}" stroke="#fff" stroke-width="${1.5 * u}" style="cursor:grab"/>`;
    }
    ui.innerHTML = h;
  }

  // ------------------------------------------------------------ interactions
  #down(e) {
    if (e.button !== 0) return;
    const hdl = e.target.closest?.('[data-handle]')?.dataset.handle;
    const g = e.target.closest?.('.item');
    const p = this.#pt(e);
    const pending = this.snapshot();
    let mode = null, it = this.sel;
    if (hdl && it) {
      mode = hdl;
    } else if (g) {
      this.state.selected = +g.dataset.uid; it = this.sel; mode = 'move'; this.#drawUI(); this.onChange('select');
    } else { if (this.state.selected !== null) { this.state.selected = null; this.#drawUI(); this.onChange('select'); } return; }
    e.preventDefault();
    const start = { p, x: it.x, y: it.y, scale: it.scale, rot: it.rot, ang: Math.atan2(p.y - it.y, p.x - it.x), dist: Math.hypot(p.x - it.x, p.y - it.y) || 1 };
    const el = this.svg.querySelector(`.item[data-uid="${it.uid}"]`);
    let moved = false;
    const mv = ev => {
      const q = this.#pt(ev); moved = true;
      if (mode === 'move') { it.x = start.x + (q.x - start.p.x); it.y = start.y + (q.y - start.p.y); }
      else if (mode === 'rot') {
        let rot = start.rot + (Math.atan2(q.y - it.y, q.x - it.x) - start.ang) * 180 / Math.PI;
        if (ev.shiftKey) rot = Math.round(rot / 15) * 15;
        it.rot = ((rot % 360) + 540) % 360 - 180;
      } else { it.scale = Math.min(30, Math.max(0.01, start.scale * Math.hypot(q.x - it.x, q.y - it.y) / start.dist)); }
      el?.setAttribute('transform', this.transformOf(it)); this.#drawUI(); this.onChange('drag');
    };
    const up = () => {
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up);
      if (moved) { this.#pushUndo(pending); this.onChange('edit'); }
    };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  }
  #key(e) {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    const k = e.key, mod = e.metaKey || e.ctrlKey, it = this.sel;
    if (mod && k.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? this.redo() : this.undo(); return; }
    if (mod && k.toLowerCase() === 'y') { e.preventDefault(); this.redo(); return; }
    if (!it) return;
    if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); this.remove(); }
    else if (mod && k.toLowerCase() === 'd') { e.preventDefault(); this.duplicate(); }
    else if (k === ']') this.reorder(e.shiftKey ? 'front' : 'forward');
    else if (k === '[') this.reorder(e.shiftKey ? 'back' : 'backward');
    else if (k.startsWith('Arrow')) {
      e.preventDefault(); const d = e.shiftKey ? 10 : 1;
      this.change(() => { if (k === 'ArrowLeft') it.x -= d; if (k === 'ArrowRight') it.x += d; if (k === 'ArrowUp') it.y -= d; if (k === 'ArrowDown') it.y += d; });
    }
  }

  // ------------------------------------------------------------ operations
  select(uid) { this.state.selected = uid; this.#drawUI(); this.onChange('select'); }
  addItem(object, role, { x, y, scale } = {}) {
    this.change(() => {
      const it = { uid: this.state.uid++, object, role, x: x ?? this.state.canvas.w / 2, y: y ?? this.state.canvas.h / 2, rot: 0, scale: scale ?? this.defaultScale() * (role === 'background' ? 1.6 : 1) };
      if (role === 'background') this.items.unshift(it); else this.items.push(it);
      this.state.selected = it.uid;
    });
  }
  /** scale that matches the current composition (or sensible default) so new objects are in proportion */
  defaultScale() { const m = this.items.find(i => i.role === 'main'); if (m) return m.scale; const b = this.lib.comps[compId(this.state.size, 'main', 'open_book')]; return this.refScale * this.state.canvas.w / b.bbox.w; }
  duplicate() { const it = this.sel; if (!it) return; this.change(() => { const c = { ...it, uid: this.state.uid++, x: it.x + 24, y: it.y + 24 }; this.items.splice(this.items.indexOf(it) + 1, 0, c); this.state.selected = c.uid; }); }
  remove(uid = this.state.selected) { if (uid == null) return; this.change(() => { this.state.items = this.items.filter(i => i.uid !== uid); this.state.selected = null; }); }
  clear() { this.change(() => { this.state.items = []; this.state.selected = null; }); }
  reorder(dir, uid = this.state.selected) {
    const a = this.items, i = a.findIndex(x => x.uid === uid); if (i < 0) return;
    const j = dir === 'front' ? a.length - 1 : dir === 'back' ? 0 : dir === 'forward' ? Math.min(a.length - 1, i + 1) : Math.max(0, i - 1);
    if (j === i) return; this.change(() => { const [x] = a.splice(i, 1); a.splice(j, 0, x); });
  }
  setProp(prop, val) { const it = this.sel; if (!it || !isFinite(val)) return; this.change(() => { it[prop] = val; }); }
  /** replace the whole composition (used by the auto-composer) */
  setItems(list) {
    this.change(() => {
      this.state.items = list.map(l => ({ uid: this.state.uid++, rot: 0, ...l }));
      this.state.selected = null;
    }, 'compose');
  }
  setPalette(p) { this.palette = p; this.render(); this.onChange('palette'); }
  setCanvasBg(bg) { this.change(() => { this.state.canvas.bg = bg; }); }
  setGuide(g) { this.guide = g; this.#drawUI(); }
  /** change canvas size; the existing composition is scaled uniformly and re-centred (manual edits are kept) */
  setCanvasSize(w, h) {
    const o = this.state.canvas; if (w === o.w && h === o.h) return;
    this.change(() => {
      const k = Math.min(w / o.w, h / o.h);
      for (const it of this.items) { it.x = w / 2 + (it.x - o.w / 2) * k; it.y = h / 2 + (it.y - o.h / 2) * k; it.scale *= k; }
      o.w = w; o.h = h;
    });
  }
  /** switch S <-> L: every item swaps to the same object's other-size component, keeping its visual footprint */
  switchSize(size) {
    if (size === this.state.size) return;
    const olds = this.items.map(i => this.comp(i));
    this.change(() => {
      this.state.size = size;
      this.items.forEach((it, k) => { const n = this.comp(it); if (!n || !n.inner) throw new Error('size not loaded'); it.scale *= olds[k].bbox.w / n.bbox.w; });
    }, 'size');
  }

  // ------------------------------------------------------------ export
  /** Fully vector SVG: one <g> per placed component, original <path> children kept 1:1 (d untouched). */
  exportSVG() {
    const { w, h } = this.state.canvas, pal = this.palette, counts = {};
    let o = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="none" data-size="${this.state.size}" data-palette="${esc(pal.name)}">\n`;
    o += `<title>Composition (${this.state.size}, ${esc(pal.name)})</title>\n`;
    const fill = this.canvasFill(pal);
    if (fill) o += `<rect id="canvas-background" width="${w}" height="${h}" fill="${fill}"/>\n`;
    for (const it of this.items) {
      const base = it.object.replace(/_/g, '-') + (it.role === 'background' ? '-bg' : '');
      counts[base] = (counts[base] || 0) + 1;
      o += `<g id="${base}-${counts[base]}" data-component="${compId(this.state.size, it.role, it.object)}" data-role="${it.role}" transform="${this.transformOf(it)}">\n${this.markup(it, pal)}\n</g>\n`;
    }
    return o + '</svg>\n';
  }
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
