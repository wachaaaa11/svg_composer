# SVG Composer — automatic composition from the original illustration components

A static, dependency-free web app (vanilla JS + SVG) that composes illustrations **only from the original 20 illustrations** (10 objects × sizes S and L, each in a colour *main* and a monochrome *background* variant = 40 components). It never draws, generates or redraws anything: it selects components, places them (translate / rotate / uniform scale), recolours them by palette role, and exports editable SVG.

## Run

The app is a static site, so it must be opened through an HTTP server (opening `web/index.html` directly is not supported). Python 3 is required; no build step or npm dependencies are needed.

### Windows (PowerShell)

Open PowerShell in the project folder and run:

```powershell
py -3 -m http.server 8765 --directory web
```

Or, if `py` is not available, use:

```powershell
python -m http.server 8765 --directory web
```

### Windows (Command Prompt)

```bat
cd /d "путь\к\svg-composer"
py -3 -m http.server 8765 --directory web
```

### macOS / Linux

```bash
./serve.sh
```

`serve.sh` runs the equivalent command:

```bash
cd web && python3 -m http.server 8765
```

After the server starts, open:

http://localhost:8765

Keep the terminal open while using the app. Press `Ctrl+C` in that terminal to stop the server.

You can also serve the `web/` directory with any static host, for example GitHub Pages.

Demo video: `docs/demo.webm`. Example outputs: `examples/*.svg`.

## Important finding about the supplied assets

The supplied `S/ L/ main/ background/` files are **not** independent components: each one is a full copy of the whole 3490×11051 sheet (~750 KB) with only the `viewBox` changed — and the crops are wrong for several objects (e.g. `S/main/folder.svg` shows a purple background book and half a phone, `coin_badge` and `notebook` are 15 px / 70 px wide crops, i.e. blank). Names are also misleading (`notebook` is a wallet, `coin_badge` is a coin).

So the app does **not** use those files. `tools/build_library.py` goes back to the two source sheets (`source/Размер S.svg`, `Размер L.svg`), parses every `<path>`, and rebuilds the library (details below). The original path data is copied verbatim.

## Architecture

### 1. Storing / extracting / organising components (`tools/build_library.py` → `web/library/`)
* The sheets are flat: ~1500 `<path fill=…>` (no groups/names), plus swatch `<rect>`s.
* Extraction: paths are walked in z-order; a path that doesn't touch the running bbox starts a new segment (bbox geometry via `svgelements`). Specks are attached to the nearest z-neighbour and overlapping small segments (the coin's parts) merged. Objects are identified by sheet position; the Main / Background sections are split at the two section headings. The script asserts 10 + 10 objects per size.
* Output: one SVG per component `library/{S|L}/{main|background}/{object}.svg`, tight `viewBox`, containing **only that object's own `<path d fill>` elements, `d` and order unchanged**, wrapped in `<g id="object">`. `library/index.json` has id, RU/EN names, bbox, path count and colour usage; plus the three colour schemes read from the swatch rects.
* Rebuild: `python3 tools/build_library.py` (needs `lxml`, `svgelements`). Output is reproducible.
* Not extracted as components (stated explicitly, nothing silently dropped): the 3 square backdrop panels with decorative lines/dots and the swatch grids (used as palette data). The canvas fill uses the scheme's flat background colour, as in the reference compositions.

### 2. Selecting components
* **Workflow B (names)** — `parseNames`: splits on `, ; + and и`, matches RU/EN names, the manifest's working names (`notebook`, `coin_badge`, `smartphone_puzzle`…), `2x coin`, `фон:`/`bg:` prefix for a background object, tolerant to typos (Levenshtein). Unknown names are reported, never silently dropped.
* **Workflow A (metaphor)** — `interpretOffline`: a curated RU/EN concept lexicon per object (core 3 / strong 2 / weak 1 weights, stem matching with exact-token guards against false hits like *ready→read*). Ranked objects are returned with the matched words shown in the UI ("why"). A single-concept hit gets a thematically fitting companion; no hit → neutral default set + visible warning. Background object (monochrome) is added automatically only for ≥3 objects (or by explicit choice).
* **Optional AI** (`interpretWithLLM`): the model gets only the list of existing object ids and answers with ids; anything not in the library is discarded. It cannot return visuals. See limitations.

### 3. Automatic composition (`web/js/layout.js`)
Pure geometry, seeded (so *Shuffle* gives alternatives). 1) Largest object first; each next object is tried at many candidate positions around placed objects along isometric directions, plus "sit on a flat host" snaps (phone on the book, pen on the folder, as in the reference compositions). Cost = target-region aspect fit + compactness + overlap penalty + isometric-axis bonus + noise. 2) One uniform scale fits the cluster to the style region (relative object sizes are preserved; a lone small object is capped). 3) Stacking: background → flat hosts → standing → small surface items, hosted items always above their host, ties by lower edge. 4) Background object: larger uniform scale behind the cluster (echoes get ≥1.5×). Styles mirror the original example files: *Assembled*, *Offset*, *Headline-safe* (keeps a title area free; shown as a dashed preview-only guide).

### 4. Colour palettes (`web/js/library.js`)
The sheets' swatch grids define 8 **roles** per scheme: 3 "background colours" (left column), 3 "object colours" (right column), black, white. Components are authored in the first (Lavender) scheme; recolouring maps *role → role* of the target scheme (exactly how the reference examples go purple → teal/peach). Only `fill="…"` values are rewritten.
* Rule "background colours may be used in objects": main objects map all roles.
* Rule "object colours never in backgrounds": background components can only receive the target's `background` column (enforced in code, and checked by the validator on every export).
* Built-in: Lavender, Peach, Aqua (read from the sheet). Custom: upload JSON / SVG swatch sheet (2×4 rects like the original) / any text with hex codes in role order, or edit the 8 colour pickers. New schemes need no code change.

### 5. Editor & export (`web/js/editor.js`)
Scene = list of references `{object, role, x, y, rot, uniform scale}`; drag, rotate/scale handles (Shift = 15° snap), numeric fields, duplicate, delete, forward/backward/front/back, layers list, undo/redo, keyboard shortcuts, drag-from-library, canvas presets/custom size, S/L/Auto detail (switching swaps every item to the same object's other-size component keeping its footprint; Auto = L when the long side ≥ 1600).
**Export** writes plain SVG: optional `<rect id="canvas-background">`, then one `<g id="open-book-1" data-component="S/main/open_book" data-role="main" transform="translate() rotate() scale() translate()">` per placed object containing the original `<path>` elements. No raster, no `<image>`, no flattening, no path merging — each object is an editable group (imports as separate layers in Figma/Illustrator/Inkscape).

## Tests
```bash
./serve.sh &                                   # terminal 1
cd tests && NODE_PATH=$(npm root -g) node e2e.js   # 27 UI checks (needs playwright)
python3 -I validate_export.py                  # 262 checks on 9 exported SVGs
```
`validate_export.py` verifies against the library files: every exported path's `d` is identical and in the same order, fills equal the palette-role mapping, background objects contain only background-column colours, transforms are translate/rotate/uniform-scale only, no raster content.

## Limitations (honest list)
* **Uniform scaling and rotation are applied** to components (needed to compose); no non-uniform scale, skew, mirror or any edit of the shapes.
* Components are as clean as the sheets allow: grouping is derived geometrically, and names are descriptive (the sheets carry no layer names). One extra tiny degenerate path belongs to the S coin and is kept.
* Hit-testing selects on filled shapes, so click on the object itself (not empty space inside its bounding box); use the Layers list otherwise.
* The local lexicon covers 10 objects with curated RU/EN terms; unusual metaphors fall back to a default set (and say so). 
* **AI mode is untested**: it was not exercised here (no API key/network). It needs a user key, is sent straight from the browser, and any failure falls back to the local lexicon. Offline mode is the tested path.
* Collision uses shrunk bounding boxes, not true silhouettes, so occasional overlaps are by design / approximate; use *Shuffle* or edit manually.
* Exported SVGs were checked by the validator and by rendering in Chromium; they were not opened in Figma/Illustrator in this environment.
* Layout style names (Assembled / Offset / Headline-safe) are inspired by the three reference file names; the exact reference placement rules aren't recoverable from flat exports.

## AI tools used
* **Claude (Anthropic) via Claude Code** — inspected the assets, found the broken crops, wrote the extraction pipeline, the app, the matcher lexicon, the layout algorithm, the e2e tests and validator, and this documentation. All visuals come from the supplied sheets; Claude generated no illustrations.
* **Optional in-app LLM interpretation** (Anthropic API, user-supplied key) — only maps text → existing component ids. Not used for any of the example compositions.
* Playwright/Chromium (not AI) — UI tests, rendering previews and the demo recording.

## Example compositions (`examples/`)
Produced by the real app UI and its Export button, then checked by `validate_export.py`:
1. `example1-learning-aqua-S.svg` — Workflow A, "Learning is a journey: books, a good idea and a plan", Aqua, S, assembled.
2. `example2-listening-peach-L.svg` — Workflow B, "headphones, smartphone, desk lamp, pen, фон: наушники", Peach, L, offset.
3. `example3-secure-payments-lavender-S.svg` — Workflow A, "Secure payments in a mobile app", Lavender, S, headline-safe.
`custom-palette.json` is a sample uploadable palette.
