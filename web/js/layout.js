// Automatic composition. Pure geometry: it only decides x / y / uniform scale / stacking order
// of existing components (no rotation by default, no distortion, nothing is drawn).
import { OBJECT_META } from './library.js';

export const LAYOUT_MODES = {
  assembled: { label: 'Assembled', region: [0.06, 0.08, 0.94, 0.92], hostProb: 0.85 },   // centred, tight cluster (cf. "Собранно")
  offset:    { label: 'Offset',    region: [0.26, 0.07, 0.98, 0.93], hostProb: 0.65 },   // shifted to one side (cf. "Со смещением")
  headline:  { label: 'Headline-safe', region: [0.46, 0.26, 0.97, 0.96], hostProb: 0.7 }, // leaves left/top free for a title (cf. "Под заголовок")
};

function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

const box = (cx, cy, w, h) => ({ x0: cx - w / 2, y0: cy - h / 2, x1: cx + w / 2, y1: cy + h / 2, w, h, cx, cy });
// objects are isometric with empty corners → use a slightly shrunk box for collision tests
const shrink = (b, f = 0.12) => ({ x0: b.x0 + b.w * f, y0: b.y0 + b.h * f, x1: b.x1 - b.w * f, y1: b.y1 - b.h * f });
function ovl(a, b) {
  const A = shrink(a), B = shrink(b);
  const w = Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0), h = Math.min(A.y1, B.y1) - Math.max(A.y0, B.y0);
  if (w <= 0 || h <= 0) return 0;
  return (w * h) / Math.min((A.x1 - A.x0) * (A.y1 - A.y0), (B.x1 - B.x0) * (B.y1 - B.y0));
}
function union(bs) {
  const x0 = Math.min(...bs.map(b => b.x0)), y0 = Math.min(...bs.map(b => b.y0)), x1 = Math.max(...bs.map(b => b.x1)), y1 = Math.max(...bs.map(b => b.y1));
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}
const ISO = [0, 30, 90, 150, 180, 210, 270, 330];
const isoPen = deg => { deg = ((deg % 360) + 360) % 360; return Math.min(...ISO.map(a => Math.min(Math.abs(deg - a), 360 - Math.abs(deg - a)))) / 30; };

/**
 * mains:  [{object, w, h}]   sizes of the main components (bbox in component units of the active size)
 * bg:     {object, w, h} | null     optional monochrome background object
 * returns [{object, role, x, y, scale, rot}] in z-order (first = bottom), plus 'scale' info.
 */
export function autoLayout({ mains, bg = null, canvas, mode = 'assembled', seed = 1 }) {
  const M = LAYOUT_MODES[mode] || LAYOUT_MODES.assembled;
  const rnd = rng(seed * 2654435761 + mains.length * 97);
  const W = canvas.w, H = canvas.h;
  const R = { x0: M.region[0] * W, y0: M.region[1] * H, x1: M.region[2] * W, y1: M.region[3] * H }; R.w = R.x1 - R.x0; R.h = R.y1 - R.y0;
  const aspectR = R.w / R.h;

  // ---- 1. arrange in abstract (component) space, largest first
  const order = mains.map((m, i) => ({ ...m, i, meta: OBJECT_META[m.object] || { cls: 'standing', layer: 2 } }))
    .sort((a, b) => b.w * b.h - a.w * a.h);
  const placed = [];
  for (const it of order) {
    if (!placed.length) { placed.push({ ...it, b: box(0, 0, it.w, it.h) }); continue; }
    let best = null;
    const consider = (cx, cy, extra = 0, hostObj = null) => {
      const snapped = !!hostObj;
      const b = box(cx, cy, it.w, it.h);
      let pen = 0;
      for (const p of placed) {
        const o = ovl(b, p.b);
        if (o > 0 && !(snapped && p === hostObj)) pen += o * o * 6 + (o > 0.35 ? 4 : 0);
      }
      const U = union([...placed.map(p => p.b), b]);
      const asp = Math.abs(Math.log((U.w / U.h) / aspectR));
      const sumA = placed.reduce((s, p) => s + p.w * p.h, 0) + it.w * it.h;
      const compact = (U.w * U.h) / sumA;
      const c = 2.4 * asp + 0.8 * compact + pen + extra + 0.35 * rnd();
      if (!best || c < best.c) best = { c, cx, cy, snapped, host: hostObj };
    };
    // (a) sit on a flat host (phone on the book, pen on the folder …)
    if (it.meta.cls === 'surface' && rnd() < M.hostProb) {
      for (const h of placed.filter(p => p.meta.cls === 'flat')) {
        if (it.w > 0.8 * h.w || it.h > 0.9 * h.h) continue;
        const onHost = placed.filter(p => p.host === h && p !== h);
        for (let k = 0; k < 6; k++) {
          const cx = h.b.cx + (rnd() - 0.5) * 0.3 * h.w, cy = h.b.cy - 0.04 * h.h + (rnd() - 0.5) * 0.12 * h.h;
          const b = box(cx, cy, it.w, it.h);
          if (onHost.some(p => ovl(b, p.b) > 0.15)) continue;
          consider(cx, cy, -1.2, h);
        }
      }
    }
    // (b) beside any placed object, along isometric-ish directions, touching with a little overlap
    for (const anc of placed) {
      for (let deg = 0; deg < 360; deg += 15) {
        const dx = Math.cos(deg * Math.PI / 180), dy = Math.sin(deg * Math.PI / 180);
        const allow = [0, 0.08, 0.2, 0.3][Math.floor(rnd() * 4)];
        let t = 0;
        for (; t < 4000; t += 10) {
          const b = box(anc.b.cx + dx * t, anc.b.cy + dy * t, it.w, it.h);
          if (placed.every(p => ovl(b, p.b) <= allow)) break;
        }
        consider(anc.b.cx + dx * t, anc.b.cy + dy * t, 0.25 * isoPen(deg));
      }
    }
    const host = best.snapped ? best.host : null;
    const b = box(best.cx, best.cy, it.w, it.h);
    placed.push({ ...it, b, host });
  }

  // ---- 2. fit cluster into the target region with one uniform scale (relative sizes are preserved)
  const U = union(placed.map(p => p.b));
  let s = Math.min(R.w / U.w, R.h / U.h) * 0.97;
  const maxW = Math.max(...placed.map(p => p.w)), maxH = Math.max(...placed.map(p => p.h));
  s = Math.min(s, (0.58 * W) / maxW, (0.82 * H) / maxH);           // a lone small object must not blow up
  const ox = (R.x0 + R.x1) / 2 - U.cx * s, oy = (R.y0 + R.y1) / 2 - U.cy * s;

  // ---- 3. stacking: standard classes, depth by lower edge; hosted items always above their host
  const z = placed.slice().sort((a, b) => (a.host ? 3 : a.meta.layer) - (b.host ? 3 : b.meta.layer)
    || (a.b.y1 - b.b.y1));
  const out = [];
  if (bg) {
    const fgW = U.w * s, fgH = U.h * s;
    let sb = s * Math.max(1.0, Math.min(1.7, (0.8 * H) / (bg.h * s)));
    if (bg.w * sb > 0.96 * W) sb = 0.96 * W / bg.w;
    const bound = mode !== 'assembled';                  // offset / headline: keep the backdrop inside the content region
    const minK = mains.some(m => m.object === bg.object) ? 1.5 : 1.0;   // an echo of a main object must read as a bigger backdrop
    if (bound) sb = Math.max(s * minK, Math.min(sb, R.w / bg.w, R.h / bg.h));
    else sb = Math.max(sb, s * minK);
    // sits behind the cluster, nudged to the lower-left like in the reference compositions
    let bx = (R.x0 + R.x1) / 2 - fgW * 0.10, by = (R.y0 + R.y1) / 2 + fgH * 0.04;
    const hw = bg.w * sb / 2, hh = bg.h * sb / 2;
    const lo = bound ? [R.x0, R.y0] : [0.01 * W, 0.01 * H], hi = bound ? [R.x1, R.y1] : [0.99 * W, 0.99 * H];
    bx = hi[0] - lo[0] < 2 * hw ? (lo[0] + hi[0]) / 2 : Math.min(Math.max(bx, lo[0] + hw), hi[0] - hw);
    by = hi[1] - lo[1] < 2 * hh ? (lo[1] + hi[1]) / 2 : Math.min(Math.max(by, lo[1] + hh), hi[1] - hh);
    out.push({ object: bg.object, role: 'background', x: bx, y: by, scale: sb, rot: 0 });
  }
  for (const p of z) out.push({ object: p.object, role: 'main', x: ox + p.b.cx * s, y: oy + p.b.cy * s, scale: s, rot: 0 });
  return { items: out, scale: s };
}
