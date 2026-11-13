# Ink module contract (`T4.ink`)

Digital inking for the document editor: handwriting, highlighter, eraser, lasso, shapes, layers, annotations over text. Built as an editor module (see `docs/EDITOR-EXTENSIONS.md`, all its rules apply). Three owners work in parallel on disjoint files; this file is the interface between them. If the contract is missing something, add the smallest thing that works on your side and report it in your handoff; do not edit another owner's files.

## 1. Owners and files

| Owner | Files | Test suite | CDP port |
|---|---|---|---|
| **model** | `js/ed-ink-model.js`, `js/ed-io-common.js` / `js/ed-io-docx-export.js` / `js/ed-io-html.js` (ink in Word/HTML/text export), `electron/main.js` `DOWNLOAD_TYPES` + `electron/i18n.js` (svg, png save filters) | `tests/editor-ink-model.mjs` | 9341 |
| **engine** | `js/ed-ink.js` (+ further `js/ed-ink-*.js` files of its own, e.g. `ed-ink-tools.js`, `ed-ink-overlay.js`) | `tests/editor-ink.mjs` | 9342 |
| **ui** | `js/ed-ink-ui.js`, `css/ed-ink.css` (all ink styles, including the widget's), `js/i18n/ed-ink.js` (all ink texts, prefix `edx.ink.`, 4 languages) | `tests/editor-ink-ui.mjs` | 9343 |

`index.html` and `tests/test-editor.mjs` are already wired (anchor `ink`): load order is `i18n/ed-ink.js`, `css/ed-ink.css`, `ed-ink-model.js`, `ed-ink.js`, `ed-ink-ui.js`. Only the lead edits the anchors: if you add a script file, say so in the handoff. Stub files exist so the page loads while the others are unfinished: code defensively against a missing/unfinished sibling during development (`T4.ink && T4.ink.model`), and write your tests so they pass once all three parts are present.

Run only your own suite, on your own port: `CDP_PORT=<port> node tests/cdp.mjs tests/editor-<suite>.mjs`. Never use port 9333, never run the full suites (the lead does). No git writes.

Texts: the engine and model need strings too (command labels, widget names, toasts). Use `edx.t('edx.ink.<key>', 'English fallback')` everywhere and list the keys + English text you used in the handoff; the ui owner defines the keys listed in section 6 up front, the lead adds late ones.

## 2. Stored data (widget `ink`, block widget)

`<figure class="t4-w" data-w="ink" data-p="{json}">`. Units are logical: 1000 units = the full width of the text column. Rendered as inline **SVG** with `viewBox="0 0 w h"` (vector on screen, in print/PDF, no quality loss when scaling).

```js
{ v: 1,
  id: 'k…',                // stable id (uid) so the engine re-finds the widget after undo/redo replaced the DOM
  w: 1000,                 // 200…1000; display width = w/10 % of the text column
  h: 300,                  // 60…20000
  al: 'center',            // 'left' | 'center' | 'right' (when w < 1000)
  bg: 'none',              // 'none' (transparent) | 'dots' | 'lines' | 'grid'
  overlay: false,          // true = annotation layer floating over the following document content (section 4)
  layers: [{ id: 'l1', name: '', hidden: false, locked: false }],   // 1…8, bottom → top; name ≤ 40 chars, '' = "Layer n"
  items: [ … ] }           // ≤ 5000, drawing order inside a layer = array order
```

Items (every item is independently editable):

```js
// stroke
{ id, l: 'l1', k: 'pen' | 'hl', c: '#rrggbb', o: 1 /* opacity 0.05…1 */, s: 3 /* size 0.5…60 units */,
  pr: 0 | 1,               // 1 = points carry pressure
  p: [ints] }              // points, see below; ≤ 5000 points
// shape
{ id, l, k: 'line' | 'arrow' | 'rect' | 'ellipse', c, o, s, f: 'none' | '#rrggbb', x1, y1, x2, y2 }   // endpoints (line/arrow) or box corners; 1 decimal
{ id, l, k: 'poly', c, o, s, f, pts: [x, y, x, y, …] }   // closed polygon, 3…12 vertices (triangles, recognised right-angled shapes)
```

Point encoding `p`: flat integer array in tenths of a unit, delta-encoded after the first point. `pr: 0` → `[x0, y0, dx1, dy1, …]`; `pr: 1` → `[x0, y0, p0, dx1, dy1, dp1, …]` with pressure 0…100. Only `model.encodePoints` / `model.decodePoints` touch this format. The highlighter (`hl`) has constant width and default opacity 0.35. Items are drawn in plain array order; highlighter strokes get `mix-blend-mode: multiply` so text and ink stay readable under them.

Limits live in `model.LIMITS`; the registry caps props at 2 MB JSON. When a canvas is close to the limit the engine refuses further strokes with a toast instead of losing data.

## 3. `T4.ink.model` (owner: model) — pure functions, no editor state, no DOM except where noted

`js/ed-ink-model.js` creates `window.T4.ink = { model }`. Points are `{ x, y, p }` (units; `p` 0…1, 0.5 when unknown).

| Function | Result |
|---|---|
| `LIMITS`, `TOOLS_DEFAULT` | limits; default tool settings `{ pen: { c, s, o, pressure }, hl: { c, s, o }, eraser: { mode: 'stroke'\|'area', s }, shape: { kind, c, s, o, f } }` |
| `empty(opts)` | fresh props (`opts`: `w h bg overlay al`), with id and one layer |
| `validate(props)` | cleaned props or `null`. Fast (runs in the sanitizer on every load/paste/undo), never throws, drops broken items, clamps everything, guarantees ≥ 1 layer, unique ids, items referencing existing layers |
| `uid()` | new item/layer/widget id |
| `encodePoints(pts, withPressure)` / `decodePoints(item)` | codec |
| `simplify(pts, tol)` | Ramer–Douglas–Peucker (default tol 0.35), keeps pressure |
| `makeStroke(pts, style)` | stroke item from raw points: simplifies, encodes; `style = { k, c, o, s, pressure, l }` |
| `makeShape(kind, x1, y1, x2, y2, style, mods)` | shape item; `kind`: `line arrow rect ellipse tri`(→ `poly`); `mods.constrain` (Shift): 15° angle steps / square / circle |
| `outline(pts, { size, pressure })` | `[[x, y], …]` closed outline polygon of a variable-width stroke (smooth, round caps); used for wet ink on canvas and for the stored SVG path |
| `itemPath(item)` | SVG path `d` |
| `itemSVG(item)` | SVG markup of one item: `<path …>`/`<g>` with `data-id="<id>"`. Pen = filled outline; hl = stroked centre line, round joins; shapes = stroked (arrow with head) |
| `backgroundSVG(bg, w, h)` | markup for dots / lines / grid ('' for none); colours via `currentColor` + opacity so it follows the theme |
| `drawItem(ctx2d, item)` | paints one item on a canvas 2D context (same look as the SVG) |
| `bbox(item)` / `bboxOf(items)` | `{ x, y, w, h }` including stroke width |
| `hit(item, x, y, r)` | does a circle of radius `r` touch the item |
| `eraseArea(item, x, y, r)` | `null` = untouched, else array of replacement items (0…n fragments with new ids, same style). Shapes: `[]` when touched |
| `inLasso(item, polygon)` | item mostly (≥ 60 % of its points) inside the polygon `[[x, y], …]`; `inRect(item, rect)` likewise |
| `transform(item, { dx, dy, sx, sy, ox, oy })` | new item moved/scaled about origin `ox, oy` (stroke size scales with `min(sx, sy)` magnitude) |
| `recognize(pts)` | `null` or `{ kind, x1, y1, x2, y2 }` / `{ kind: 'poly', pts }` for a hand-drawn line, arrow, rectangle, ellipse/circle, triangle; near-horizontal/vertical lines and near-right angles are snapped. Conservative: handwriting must return `null` |
| `toSVG(props, { background: true, crop: false, items: null })` | standalone SVG document string (xmlns, width/height, hidden layers left out; `items` = only these ids; `crop` = viewBox shrunk to the content) |
| `toPNG(props, { scale: 2, background: '#ffffff' \| null, crop, items })` | `Promise<Blob>` (canvas + `drawItem`; no `fetch(blob:)`, no worker) |

The model owner also makes the existing exporters treat `ink` like `draw` (image in Word/HTML export, description in text/RTF) and registers nothing in `T4.edx` itself.

## 4. `T4.ink` engine (owner: engine)

Registers the widget `ink` (`validate` = `model.validate`; `render` builds the SVG from props: `<div class="ink-box cw-input">` → `<svg class="ink-svg">` with one `<g data-layer>` per layer; `textOf` → `''`; `toMarkdown` → PNG data-URL image like the built-in drawing), slash entry, Insert-menu entry, commands, shortcuts, `edx.exporters` are **not** used for single drawings (export is a canvas action, section below), print CSS.

**Input.** Pointer Events on the canvas surface (class `cw-input` keeps the core from stealing the event), `setPointerCapture`, `getCoalescedEvents()`, `pointerrawupdate` where available, `getPredictedEvents()` for the wet tip, pressure from `e.pressure` for `pointerType === 'pen'` (mouse/touch: constant, optional speed-based width), `touch-action: none` while inking. Wet ink is painted on a `<canvas>` laid over the SVG (`desynchronized: true`); on pointer-up the stroke becomes one SVG node appended to its layer (no full re-render) and the canvas is cleared. Palm rejection: once a pen was seen, touch scrolls/pans instead of drawing unless `fingerDraw` is on; the pen's eraser end / barrel button (`e.buttons & 32`, `button === 5`) erases.

**Commit and undo.** Every finished action (stroke, erase gesture, move, …) is one `edx.editor.run(…)` that writes the new props to `data-p` → one step in the editor's own undo history, autosave, versions, all for free. Undo/redo = `T4.edcore.undo()/redo()` (works while the pen bar has focus). After undo/redo or any re-render the engine re-binds to the widget by `props.id`. Do not rebuild the whole SVG for a single new stroke; a full rebuild only when the widget is rendered by the core.

**Pen mode.** `mode` on: the document is inked instead of edited. Pointer-down on a canvas draws there. Pointer-down on ordinary document content draws into an **overlay** ink widget (`overlay: true`): a zero-height figure inserted before the top-level block under the pointer, whose SVG is absolutely positioned over the following content (full column width, height `h`, grows as needed, `pointer-events: none` outside pen mode, so text below stays editable). An existing overlay covering the point is reused; an overlay left without items is removed. This is how arrows, marks and highlighter go onto text, formulas and (later) circuit diagrams. In text mode a pen pointer on a canvas draws directly when `autoPen` is on; a mouse click selects the widget (context bar: Draw, background, export SVG/PNG, delete).

**Canvas.** Resize handles (width, height, corner) on the active canvas; automatic growth by 200 units when a stroke ends within 40 units of the bottom edge (not beyond `LIMITS`); zoom (Ctrl+wheel, pinch) and pan (pan tool, Space-drag, two fingers, wheel) as a view transform that is not stored; `scale(f)` scales content with the canvas.

### API (stable, used by ui and tests)

```js
T4.ink.get()   // snapshot, cheap:
// { mode, tool: 'pen'|'hl'|'eraser'|'lasso'|'shape'|'pan',
//   tools: { pen: { c, s, o, pressure }, hl: { c, s, o }, eraser: { mode, s }, shape: { kind, c, s, o, f } },
//   options: { recognize, fingerDraw, autoPen },
//   active: null | { id, w, h, al, bg, overlay, zoom, layer /* active layer id */, layers: [{ id, name, hidden, locked, count }], count },
//   selection: { count, bbox }, canUndo, canRedo, penSeen }
T4.ink.on(fn)                       // fn(reason) → returns off(); reasons: 'mode' 'tool' 'tools' 'options' 'active' 'selection' 'history' 'view' 'content'
T4.ink.setMode(bool); T4.ink.toggleMode();
T4.ink.setTool(name);
T4.ink.setToolOptions(tool, patch); // clamped; persisted by the engine in edx.db.kv 'ink.state' together with tool + options
T4.ink.setOption(name, bool);       // 'recognize' | 'fingerDraw' | 'autoPen'
T4.ink.undo(); T4.ink.redo();
T4.ink.canvas = { insert({ w, h, bg }) /* block canvas at the caret, becomes active, enters pen mode */, activate(id), setBackground(bg), setSize({ w, h }), setAlign(al), scale(f),
                  zoomTo(z), zoomBy(f), resetView(), clear(), remove(),
                  exportSVG({ selectionOnly }), exportPNG({ selectionOnly, scale }) /* → edx.download */,
                  layers: { add(name), remove(id), rename(id, name), setHidden(id, b), setLocked(id, b), move(id, +1|-1), setActive(id) } };
T4.ink.selection = { clear(), all(), delete(), copy(), cut(), paste(), duplicate(), setStyle({ c, o, s }), toFront(), toBack(), toLayer(id) };   // lasso selection; move/scale by dragging the selection box / its handles
// for tests: synthesise input without real pointer events
T4.ink.test = { stroke(points /* [{x,y,p?}] in units */, { pointerType, id /* canvas id, default active */ }), widgetEl(id), props(id) };
```

Tools: **pen** (pressure, sizes, colours, opacity), **hl** highlighter, **eraser** (`stroke` = whole strokes by brushing over them, `area` = only the brushed part, adjustable size), **lasso** (free-hand selection; move, scale, copy/paste, delete, restyle), **shape** (line, arrow, rect, ellipse, tri; Shift constrains), **pan**. With `options.recognize` a finished pen stroke is passed to `model.recognize` and replaced by the clean shape (one undo step back to the raw stroke). Locked/hidden layers are not drawn on, erased or selected. Keyboard while a canvas is active in pen mode: `Ctrl+Z/Y`, `Delete`, `Ctrl+C/X/V/D/A`, `Esc` (clear selection, then leave pen mode), `P H E L S` tool keys only while the pen bar or canvas has focus (never while typing).

## 5. UI (owner: ui)

A compact, touch-friendly pen bar (floating, appended to `document.body`, visible while pen mode is on and a document is open; draggable, position remembered) built only on `T4.ink.get/on/…`: tool buttons with fast switching, per-tool popovers (size, colour palette + custom colour, opacity, pressure toggle; eraser mode + size; shape kind + fill), **pen profiles** (saved pens/highlighters: add current, apply with one tap, rename, delete, reorder; stored in `edx.db.kv` `ink.profiles`), customisable bar (show/hide tools and profile slots, compact/large size; `ink.ui`), undo/redo, canvas menu (insert canvas, background none/dots/lines/grid, size, alignment, zoom, export SVG/PNG, clear), layers popover (add, rename, show/hide, lock, reorder, pick active, delete), selection actions when a lasso selection exists, toggles for shape recognition / draw with finger / auto pen. Plus the entry point: an editor toolbar button (`edx.toolbar.add`, group `ink`) that toggles pen mode. All themes, light and dark (design tokens from `css/styles.css` / `css/themes.css`), targets ≥ 40 px in the bar on coarse pointers, usable at 360 px width. Every visible control must work; no placeholders. Also owns the CSS for the widget (`.t4-w[data-w="ink"]`, `.ink-box`, `.ink-svg`, overlay positioning, handles, selection box, backgrounds, print rules via stylesheet `@media print`) — class names for these are fixed in section 7.

## 6. Text keys (`edx.ink.*`, defined by ui, used by engine)

`name` (Handwriting), `insert` (Handwriting canvas), `mode` (Pen mode), `draw` (Draw), `bgNone/bgDots/bgLines/bgGrid`, `exportSvg`, `exportPng`, `delete` (Delete drawing), `clear` (Clear drawing), `full` (This drawing is full. Add another canvas.), `layerLocked` (This layer is locked.), `layerN` (Layer {n}), `annotation` (Annotation), `pasteEmpty` (Nothing to paste.), `drawingAlt` (Handwritten drawing). The engine may use more keys with English fallbacks and reports them.

## 7. Shared DOM / class names

```html
<figure class="t4-w" data-w="ink" data-p="…" [data-al="left|center|right"] [data-overlay]>
  <div class="ink-box cw-input" [data-bg="dots|lines|grid"]>           <!-- sized by the engine: width %, aspect ratio -->
    <svg class="ink-svg" viewBox="0 0 w h"> <g class="ink-bg">…</g> <g class="ink-layer" data-layer="l1">items…</g> … </svg>
    <canvas class="ink-wet ed-ui"></canvas>                              <!-- only while active -->
    <div class="ink-sel ed-ui"> <span class="ink-sel-h" data-h="nw|ne|sw|se"></span> </div>   <!-- lasso selection box -->
    <span class="ink-rs ed-ui" data-rs="e|s|se"></span>                  <!-- canvas resize handles -->
  </div>
</figure>
```
State classes on the figure: `is-ink-active` (bound canvas), `is-ink-empty`; on `body`: `ink-mode` while pen mode is on, `ink-tool-<tool>`. Elements with class `ed-ui` are editor chrome and are never stored. The engine sets geometry inline (width, height, transforms); the ui owner styles everything else.

## 8. Not in this version (documented, no UI for it)

Handwriting → LaTeX recognition and recognition of hand-drawn electrical symbols (no offline recogniser that fits the CSP: no network, no workers, no WASM eval). Original ink is always kept, so a recogniser can be added later on top of `model` without a data migration.
