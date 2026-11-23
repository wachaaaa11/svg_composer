// Library loading + palette handling (recolouring). No geometry is ever touched here:
// only fill="…" attribute values are swapped, as the intended palette change.

export const ROLES = ['bg0', 'bg1', 'bg2', 'obj0', 'obj1', 'obj2', 'black', 'white'];
const PALETTE_NAMES = ['Lavender', 'Peach', 'Aqua'];

export const OBJECT_META = {
  // cls: flat = can host small things on top, surface = small item that can sit on a flat host,
  // standing = free-standing object.  layer = default stacking class.
  open_book:  { cls: 'flat',     layer: 1 },
  folder:     { cls: 'flat',     layer: 1 },
  headphones: { cls: 'standing', layer: 2 },
  desk_lamp:  { cls: 'standing', layer: 2 },
  tulips:     { cls: 'standing', layer: 2 },
  wallet:     { cls: 'surface',  layer: 2 },
  smartphone: { cls: 'surface',  layer: 3 },
  puzzle:     { cls: 'surface',  layer: 3 },
  coin:       { cls: 'surface',  layer: 3 },
  pen:        { cls: 'surface',  layer: 3 },
};

export async function loadLibrary(base = '') {
  const index = await (await fetch(base + 'library/index.json')).json();
  const palettes = index.palettes.map((p, i) => ({ id: 'scheme' + (i + 1), name: PALETTE_NAMES[i] || 'Scheme ' + (i + 1), ...p, builtin: true }));
  const objects = [];
  for (const c of index.components) if (!objects.find(o => o.id === c.object)) objects.push({ id: c.object, name_ru: c.name_ru, name_en: c.name_en });
  const comps = {};
  for (const c of index.components) comps[c.id] = { ...c, bbox: { x: c.bbox[0], y: c.bbox[1], w: c.bbox[2], h: c.bbox[3] }, inner: null };
  return { index, palettes, base: palettes[0], objects, comps, base_url: base };
}

const loading = {};
/** Lazily load every component of one size (S or L) – the "auto-load the matching assets" step. */
export async function loadSize(lib, size) {
  const todo = Object.values(lib.comps).filter(c => c.size === size && !c.inner);
  await Promise.all(todo.map(c => loading[c.id] ||= fetch(lib.base_url + c.file).then(r => r.text()).then(t => {
    const m = t.match(/<g id="[^"]*">([\s\S]*)<\/g>\s*<\/svg>/);
    if (!m) throw new Error('Unexpected component format: ' + c.file);
    c.inner = m[1].trim();
  })));
}

export const compId = (size, role, object) => `${size}/${role}/${object}`;

// ---------------------------------------------------------------- recolouring
const normHex = v => {
  if (!v) return null; v = v.trim();
  if (v.toLowerCase() === 'white') return '#FFFFFF';
  if (v.toLowerCase() === 'black') return '#000000';
  let m = v.match(/^#([0-9a-f]{3})$/i); if (m) return '#' + m[1].split('').map(x => x + x).join('').toUpperCase();
  m = v.match(/^#([0-9a-f]{6})$/i); return m ? '#' + m[1].toUpperCase() : null;
};
export { normHex };

export const paletteColors = p => [...p.background, ...p.objects, p.black, p.white];

const mapCache = new Map();
function roleMap(base, target, onlyBackground) {
  const key = base.id + '>' + paletteColors(target).join() + (onlyBackground ? '|bg' : '');
  if (mapCache.has(key)) return mapCache.get(key);
  const b = paletteColors(base), t = paletteColors(target), m = new Map();
  ROLES.forEach((r, i) => {
    if (onlyBackground && !r.startsWith('bg')) return;      // monochrome objects: ONLY background-column colours
    if (b[i] !== t[i]) m.set(b[i], t[i]);
  });
  mapCache.set(key, m); return m;
}

/**
 * Recolour a component's markup from the base scheme to `target`, by palette role (swatch position),
 * exactly like the original swatch grids define it.  Rules (from the brief / intro sheet):
 *  - background-column colours may appear in main objects   (bg roles -> target.background)
 *  - object-column colours never appear in background objects (bg comps only ever receive target.background)
 */
export function recolor(inner, role, target, base) {
  const m = roleMap(base, target, role === 'background');
  if (!m.size) return inner;
  return inner.replace(/fill="([^"]+)"/g, (all, v) => {
    const k = normHex(v); const r = k && m.get(k);
    return r ? `fill="${r}"` : all;
  });
}

// ---------------------------------------------------------------- custom palettes
/** Accepts: JSON ({name, background[3], objects[3], black?, white?} | flat array of 6-8 hex),
 *  SVG swatch sheet (2 columns x 4 rows of <rect>, same as the original sheets) or any text containing hex codes
 *  in role order: bg0 bg1 bg2 obj0 obj1 obj2 [black] [white].                                                    */
export function parsePaletteFile(text, filename = 'Custom') {
  const name = filename.replace(/\.[^.]+$/, '') || 'Custom';
  let colors = null, pname = name;
  const t = text.trim();
  if (t.startsWith('{') || t.startsWith('[')) {
    const j = JSON.parse(t);
    if (Array.isArray(j)) colors = j.map(normHex);
    else {
      pname = j.name || name;
      const bg = j.background || j.bg, ob = j.objects || j.obj;
      if (!bg || !ob) throw new Error('JSON needs "background" and "objects" arrays');
      colors = [...bg, ...ob, j.black || '#181817', j.white || '#FFFFFF'].map(normHex);
    }
  } else if (/<svg[\s>]/i.test(t)) {
    const doc = new DOMParser().parseFromString(t, 'image/svg+xml');
    const rects = [...doc.querySelectorAll('rect')].filter(r => normHex(r.getAttribute('fill')));
    const pos = rects.map(r => {
      let x = parseFloat(r.getAttribute('x') || 0), y = parseFloat(r.getAttribute('y') || 0);
      const tr = (r.getAttribute('transform') || '').match(/translate\(([-\d.]+)[ ,]+([-\d.]+)\)/); if (tr) { x += +tr[1]; y += +tr[2]; }
      return { x, y, c: normHex(r.getAttribute('fill')) };
    });
    const xs = [...new Set(pos.map(p => Math.round(p.x)))].sort((a, b) => a - b);
    if (xs.length === 2 && pos.length === 8) {
      const col = x => pos.filter(p => Math.round(p.x) === x).sort((a, b) => a.y - b.y).map(p => p.c);
      const L = col(xs[0]), R = col(xs[1]);
      colors = [L[0], L[1], L[2], R[0], R[1], R[2], L[3], R[3]];
    } else colors = (t.match(/#[0-9a-f]{6}\b/gi) || []).map(normHex);
  } else colors = (t.match(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/gi) || []).map(normHex);
  colors = (colors || []).filter(Boolean);
  if (colors.length < 6) throw new Error('Need at least 6 colours (3 background + 3 object); found ' + colors.length);
  if (colors.length === 6) colors.push('#181817');
  if (colors.length === 7) colors.push('#FFFFFF');
  const [b0, b1, b2, o0, o1, o2, black, white] = colors;
  return { id: 'custom-' + Date.now().toString(36), name: pname, background: [b0, b1, b2], objects: [o0, o1, o2], black, white, builtin: false };
}

export function paletteTemplateJSON(p) {
  return JSON.stringify({ name: 'My palette', background: p.background, objects: p.objects, black: p.black, white: p.white }, null, 2);
}
