#!/usr/bin/env python3
"""Validate exported SVGs against the library: geometry untouched, only role-based fill changes, mono rule, no raster."""
import sys, re, json, glob, os
from lxml import etree
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LIB = os.path.join(ROOT, "web")
idx = json.load(open(os.path.join(LIB, "library/index.json")))
ROLES = lambda p: p["background"] + p["objects"] + [p["black"], p["white"]]
base = idx["palettes"][0]
PAL = {"lavender": idx["palettes"][0], "peach": idx["palettes"][1], "aqua": idx["palettes"][2],
       "custom": dict(json.load(open(os.path.join(ROOT, "examples/custom-palette.json"))))}
def norm(v): v = v.strip(); return "#FFFFFF" if v.lower() == "white" else v.upper()
def lib_paths(cid):
    t = etree.parse(os.path.join(LIB, "library", cid + ".svg")).getroot()
    return [(p.get("d"), norm(p.get("fill"))) for p in t.iter("{http://www.w3.org/2000/svg}path")]
bad = 0
def check(c, m):
    global bad
    print(("  ok   " if c else "  FAIL ") + m); bad += (not c)
files = sorted(glob.glob(os.path.join(ROOT, "tests/out/*.svg")) + glob.glob(os.path.join(ROOT, "examples/example*.svg")))
for f in files:
    print(f"\n{os.path.basename(f)}")
    r = etree.parse(f).getroot(); ns = "{http://www.w3.org/2000/svg}"
    name = os.path.basename(f).lower()
    key = next((k for k in PAL if k in name), "lavender"); target = PAL[key]
    tcols = [norm(c) for c in ROLES(target)]; bcols = [norm(c) for c in ROLES(base)]
    exp = dict(zip(bcols, tcols))
    check(r.tag == ns + "svg" and r.get("viewBox"), "root <svg> with viewBox")
    check(not list(r.iter(ns + "image")) and not list(r.iter(ns + "foreignObject")), "no <image>/raster content")
    groups = [g for g in r.iter(ns + "g") if g.get("data-component")]
    check(len(groups) > 0, f"{len(groups)} component groups")
    ids = [g.get("id") for g in groups]; check(len(ids) == len(set(ids)), "unique ids per placed object: " + ",".join(ids))
    for g in groups:
        cid, role = g.get("data-component"), g.get("data-role")
        orig = lib_paths(cid); got = [(p.get("d"), norm(p.get("fill"))) for p in g.iter(ns + "path")]
        check([d for d, _ in orig] == [d for d, _ in got], f"{g.get('id')}: {len(got)} paths, 'd' identical to library (geometry untouched, same order)")
        # every fill = role-mapped fill (only background-column colours for bg objects)
        want = []
        for d, fl in orig:
            if role == "background":
                allowed = set(bcols[:3])
                want.append(exp[fl] if fl in allowed else fl)
            else: want.append(exp[fl] if fl in exp else fl)
        check([fl for _, fl in got] == want, f"{g.get('id')}: fills == palette role mapping")
        if role == "background":
            check({fl for _, fl in got} <= set(tcols[:3]), f"{g.get('id')}: monochrome object uses ONLY background-column colours {sorted({fl for _, fl in got})}")
        check(re.fullmatch(r"translate\([-\d. e]+\) rotate\([-\d. e]+\) scale\([-\d. e]+\) translate\([-\d. e]+\)", g.get("transform", "")) is not None, f"{g.get('id')}: transform = translate/rotate/uniform scale only")
        check(g.get("data-component").split("/")[0] == r.get("data-size"), f"{g.get('id')}: component size matches document size {r.get('data-size')}")
print("\n" + ("ALL VALID" if not bad else f"{bad} PROBLEMS"), f"({len(files)} files)"); sys.exit(1 if bad else 0)
