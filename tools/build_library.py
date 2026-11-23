#!/usr/bin/env python3
"""
Extract real, independent components from the flat Figma sheets 'Размер S.svg' / 'Размер L.svg'.

The provided S/ L/ folders only crop the *whole* sheet with a viewBox (and several crops are wrong),
so we go back to the originals: parse every <path>, cluster paths into objects, and write each object
as its own SVG containing ONLY its own original <path> elements (d / fill untouched, original order).
Also extracts colour schemes from the swatch rects.
"""
import sys, re, json, os, collections
from lxml import etree
from svgelements import Path

SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "source")
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "web", "library")
SVGNS = "http://www.w3.org/2000/svg"

# Object identity by position on the sheet (same layout in both sheets): (row-ish order by x,y)
# Verified visually against the rendered sheets.
NAMES = {  # key = approximate (x_center/ sheet, y_center) bucket assigned below by matching known features
}

def fmt(v): 
    s = f"{v:.3f}".rstrip("0").rstrip("."); return s or "0"

def load_paths(fn):
    root = etree.parse(fn).getroot()
    paths = []
    for el in root.iter():
        if etree.QName(el).localname != "path": continue
        if any(etree.QName(a).localname == "defs" for a in el.iterancestors()): continue
        d = el.get("d")
        paths.append(dict(i=len(paths), d=d, fill=el.get("fill"), attrs={k: v for k, v in el.attrib.items()},
                          bbox=Path(d).bbox()))
    return root, paths

def merge_clusters(items, pad=2):
    cl = [[*q["bbox"], [q["i"]]] for q in items]
    changed = True
    while changed:
        changed = False; out = []
        for b in cl:
            for o in out:
                if b[0] <= o[2]+pad and b[2] >= o[0]-pad and b[1] <= o[3]+pad and b[3] >= o[1]-pad:
                    o[0]=min(o[0],b[0]); o[1]=min(o[1],b[1]); o[2]=max(o[2],b[2]); o[3]=max(o[3],b[3]); o[4]+=b[4]; changed=True; break
            else: out.append(b)
        cl = out
    return cl

def palettes_from_sheet(root):
    """Swatch grids: 2 columns x 4 rows per scheme, read from <rect> fills (sheet S: 250px wide, L: 500px)."""
    rects = []
    for el in root.iter():
        if etree.QName(el).localname == "rect" and el.get("x") and float(el.get("width", 0)) in (250.0, 500.0):
            rects.append((float(el.get("x")), float(el.get("y")), float(el.get("width")), el.get("fill")))
    lefts = sorted({round(r[0], 1) for r in rects if r[3] != "#F9ECB0" or True})
    schemes = []
    seen = set()
    for r0 in sorted(rects):
        lx, w = r0[0], r0[2]
        # a 'left' column has a partner column exactly w to the right
        if not any(abs(o[0] - (lx + w)) < 2 and abs(o[1] - r0[1]) < 2 for o in rects): continue
        if round(lx) in seen: continue
        seen.add(round(lx))
        col_a = sorted([r for r in rects if abs(r[0]-lx) < 2], key=lambda r: r[1])
        col_b = sorted([r for r in rects if abs(r[0]-(lx+w)) < 2], key=lambda r: r[1])
        schemes.append(dict(
            background=[c[3].upper() for c in col_a[:3]],
            objects=[c[3].upper() for c in col_b[:3]],
            black=col_a[3][3].upper(), white="#FFFFFF"))
    return schemes

# name, ru name, tags (used by the semantic matcher), by sheet position
IDENT = [  # filled by position order below
]


OBJECTS = [  # reading order on the sheet: row1 x4, row2 x4, row3 x2   (verified visually)
    ("open_book",  "Открытая книга",   "Open book"),
    ("smartphone", "Смартфон",         "Smartphone"),
    ("puzzle",     "Детали пазла",     "Puzzle pieces"),
    ("coin",       "Монета",           "Coin"),
    ("headphones", "Наушники",         "Headphones"),
    ("desk_lamp",  "Настольная лампа", "Desk lamp"),
    ("tulips",     "Тюльпаны в вазе",  "Tulips in a vase"),
    ("wallet",     "Кошелёк",          "Wallet"),
    ("folder",     "Папка",            "Folder"),
    ("pen",        "Ручка",            "Pen"),
]

def inter(a, b, pad=0):
    return a[0] <= b[2]+pad and a[2] >= b[0]-pad and a[1] <= b[3]+pad and a[3] >= b[1]-pad

def area(b): return (b[2]-b[0])*(b[3]-b[1])

def segment(paths):
    """Walk paths in z-order; a path that doesn't touch the running bbox starts a new segment."""
    segs = []; cur = None
    for p in paths:
        bb = p["bbox"]
        if cur and not inter(bb, cur["bb"], 2): segs.append(cur); cur = None
        if cur is None: cur = dict(bb=list(bb), idx=[p["i"]])
        else:
            c = cur["bb"]; c[0]=min(c[0],bb[0]); c[1]=min(c[1],bb[1]); c[2]=max(c[2],bb[2]); c[3]=max(c[3],bb[3]); cur["idx"].append(p["i"])
    segs.append(cur)
    return segs

def consolidate(segs):
    """1) attach specks (<3000 px^2 bbox) to the nearest z-adjacent segment  2) merge overlapping small segments (coin parts)."""
    def dist(a, b):
        dx = max(a[0]-b[2], b[0]-a[2], 0); dy = max(a[1]-b[3], b[1]-a[3], 0); return (dx*dx+dy*dy) ** .5
    def absorb(dst, src):
        d = dst["bb"]; s_ = src["bb"]
        d[0]=min(d[0],s_[0]); d[1]=min(d[1],s_[1]); d[2]=max(d[2],s_[2]); d[3]=max(d[3],s_[3]); dst["idx"] = sorted(dst["idx"]+src["idx"])
    changed = True
    while changed:
        changed = False
        for k, sg in enumerate(segs):
            if area(sg["bb"]) < 3000 and len(segs) > 1:
                cands = [j for j in (k-1, k+1) if 0 <= j < len(segs)]
                j = min(cands, key=lambda j: dist(sg["bb"], segs[j]["bb"]))
                absorb(segs[j], sg); segs.pop(k); changed = True; break
        if changed: continue
        for k in range(len(segs)-1):
            a, b = segs[k], segs[k+1]
            if area(a["bb"]) < 60000 and area(b["bb"]) < 60000 and inter(a["bb"], b["bb"], 15):
                absorb(a, b); segs.pop(k+1); changed = True; break
    return segs

def fmt(v):
    s = f"{v:.3f}".rstrip("0").rstrip("."); return s or "0"

def build():
    os.makedirs(OUT, exist_ok=True)
    index = dict(version=1, source="Размер S.svg / Размер L.svg", palettes=None, components=[])
    palettes = None
    for size in ("S", "L"):
        root, paths = load_paths(os.path.join(SRC, f"Размер {size}.svg"))
        pals = palettes_from_sheet(root)
        if palettes is None: palettes = pals
        else: assert pals == palettes, "palettes differ between S and L"
        heads = [p for p in paths if p["fill"] == "black" and p["i"] > 1 and p["bbox"][2]-p["bbox"][0] > 500]
        assert len(heads) == 2
        y_main, y_bg = heads[0]["bbox"][3], heads[1]["bbox"][3]
        objs = [p for p in paths if p["i"] > 1 and p["fill"] != "black" and p["bbox"][1] > y_main - 1]
        for role, sel in (("main", [p for p in objs if p["bbox"][1] < y_bg]), ("background", [p for p in objs if p["bbox"][1] >= y_bg])):
            segs = consolidate(segment(sel))
            assert len(segs) == 10, (size, role, len(segs), [[round(x) for x in s["bb"]] for s in segs])
            segs.sort(key=lambda s: (s["bb"][1]+s["bb"][3])/2)
            rows = [segs[0:4], segs[4:8], segs[8:10]]
            ordered = [s for r in rows for s in sorted(r, key=lambda s: s["bb"][0])]
            for (oid, ru, en), sg in zip(OBJECTS, ordered):
                ps = [paths[i] for i in sg["idx"]]
                x0 = min(p["bbox"][0] for p in ps); y0 = min(p["bbox"][1] for p in ps)
                x1 = max(p["bbox"][2] for p in ps); y1 = max(p["bbox"][3] for p in ps)
                w, h = x1-x0, y1-y0
                body = "\n".join('<path d="%s" fill="%s"/>' % (p["d"], p["fill"]) for p in ps)
                cid = f"{size}/{role}/{oid}"
                svg = (f'<svg xmlns="{SVGNS}" width="{fmt(w)}" height="{fmt(h)}" viewBox="{fmt(x0)} {fmt(y0)} {fmt(w)} {fmt(h)}" fill="none">\n'
                       f'<title>{en} — {size} — {role}</title>\n<g id="{oid}">\n{body}\n</g>\n</svg>\n')
                os.makedirs(os.path.join(OUT, size, role), exist_ok=True)
                fn = f"{size}/{role}/{oid}.svg"
                open(os.path.join(OUT, fn), "w", encoding="utf8").write(svg)
                fills = collections.Counter(p["fill"].upper() if p["fill"] else None for p in ps)
                index["components"].append(dict(id=cid, object=oid, name_ru=ru, name_en=en, size=size, role=role, file="library/"+fn,
                    bbox=[round(x0,3), round(y0,3), round(w,3), round(h,3)], paths=len(ps), colors=dict(fills)))
    index["palettes"] = palettes
    return index

if __name__ == "__main__":
    idx = build()
    json.dump(idx, open(os.path.join(OUT, "index.json"), "w", encoding="utf8"), ensure_ascii=False, indent=1)
    print("components:", len(idx["components"]))
    print(json.dumps(idx["palettes"]))
    for c in idx["components"]:
        print(c["id"].ljust(26), [round(v) for v in c["bbox"]], c["paths"], c["colors"])
