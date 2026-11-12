# Editor extensions (`T4.edx`)

The contract between the editor core and the feature modules. A module **registers** what it adds (widgets, commands, shortcuts, menus, panels, importers, …) in `T4.edx` and never edits a core file. Source: `js/editor-registry.js`. Tests: `tests/editor-foundation.mjs` (every registry is exercised through the real UI).

Core files (do not edit from a module): `js/editor-registry.js`, `js/editor-sanitize.js`, `js/docstore.js`, `js/editor-widgets.js`, `js/editor-markdown.js`, `js/editor-core.js`, `js/editor.js`, `css/editor.css`, `index.html` outside your anchor, `tests/test-editor.mjs` outside your anchors. If a registry is missing something you need, ask the foundation owner instead of patching the core.

## 1. Module layout, anchors, load order

Every module owns exactly these files and anchors, so parallel work never touches the same lines:

| Module | Code | Texts | Styles | Tests | `index.html` anchor | `tests/test-editor.mjs` anchors |
|---|---|---|---|---|---|---|
| knowledge | `js/ed-knowledge.js` | `js/i18n/ed-knowledge.js` | `css/ed-knowledge.css` | `tests/editor-knowledge.mjs` | `<!-- ed-module:knowledge -->` … `<!-- /ed-module:knowledge -->` | `// ed-tests-import:knowledge` pair, `// ed-tests-run:knowledge` pair |
| writing, versions, io, layout, ux, qa | same pattern with the module name | | | | | |

* **index.html**: between your anchor pair (they sit after `js/editor.js`, before `js/app.js`) add, in this order: the i18n script, the stylesheet `<link rel="stylesheet" href="css/ed-<module>.css">`, your scripts. A `<link>` in the body is fine; CSP `style-src 'self'` allows it.
* **Load order**: `js/editor-registry.js` loads first of all editor files (right before `editor-sanitize.js`; it needs only `T4.util` and `T4.i18n`). Module scripts load after `editor.js`, before `app.js`, so `T4.edx.editor` is bound and the editor shell does not exist yet. Register at load time; do not touch the DOM of the editor shell directly (it is rebuilt on language change).
* **Tests**: your suite is `tests/editor-<module>.mjs`:
  ```js
  import { standalone } from './editor-helpers.mjs';
  export async function test(t) {            // t = { b, out, run(name, jsBody), PRELUDE }
    await t.run('my feature', `await newDoc('blank'); ok(!!T4.edx.widgets.has('foo'), 'registered');`);
  }
  export default standalone(test);           // CDP_PORT=9341 node tests/cdp.mjs tests/editor-<module>.mjs
  ```
  In `tests/test-editor.mjs` add `import { test as knowledgeTest } from './editor-knowledge.mjs';` between `// ed-tests-import:knowledge` lines and `['knowledge', knowledgeTest],` between the `// ed-tests-run:knowledge` lines. The suites run in the fixed order foundation, knowledge, writing, versions, io, layout, ux, qa, each starting from the editor start page. Page helpers in bodies: `$`, `$$`, `wait`, `ok(cond, msg)`, `D()` (document element), `C()` (`T4.edcore`), `W()`, `caretEnd()`, `selectNode(el)`, `tb(cmd)`, `menuItem(label)`, `stored()`, `newDoc(tpl)`. Registrations from a suite live until the page reloads; unregister (`remove`) or reload at the end. Use only `CDP_PORT=9341` (never 9333).

## 2. Rules

1. **DOM changes inside the document go through `edx.editor.run(fn)`** (`core.run`). It records the undo step (whole-document snapshots), tidies the structure, marks the document dirty and fires the events. Changing the document DOM outside `run()` breaks undo and autosave. Widgets change their props with `setProps` inside `run`.
2. **The sanitizer is the security boundary.** All HTML that enters a document (load, paste, import, undo, `setHtml`, `insertHTML`, importers' HTML) is sanitized. Rules registered with `edx.sanitizer.allow` are validated per element and attribute; unknown things are still dropped.
3. **Meta field names** are `<module>_<name>` (`knowledge_tags`, `versions_pinned`); `module` is 2–12 lowercase letters/digits.
4. **Texts**: every user-visible string in all four languages (en, de, tr, es) in `js/i18n/ed-<module>.js`; never edit `js/i18n/app-*.js`. Use `edx.t`.
5. **Styles** only in `css/ed-<module>.css`; class names prefixed `ed-<module>-` (or the widget's own prefix). No inline `<style>` apart from `widgets.register({ css })`.
6. **No eval, no network, no `fetch(blob:)`**. The CSP is `default-src 'none'; script-src 'self'; connect-src 'none'; frame-src 'none'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'` (no `worker-src`):
   * `fetch(blob:…)` is blocked by `connect-src 'none'` → read a Blob with `await blob.arrayBuffer()` / `blob.text()`; read data URLs with `T4.docstore.dataURLToBlob`.
   * `blob:` Web Workers are blocked (no `worker-src`) → compute on the main thread (chunk long work with `await` / `setTimeout`).
   * No iframes (`frame-src 'none'`); no `<object>/<embed>`; no remote images or fonts. Images are `data:`/`blob:` or stored assets.
   * No inline event-handler attributes in markup you create (`onclick=…`): attach listeners with `addEventListener`.
7. **Cheap hooks.** `content-change` fires on every keystroke and `selection-change` once per frame. Do nothing heavy there; use `edx.events.on(name, fn, { debounce: ms })` or `doc-saved` (about 700 ms after the last edit).
8. **Re-creatable UI.** The editor shell is thrown away and rebuilt on language change. Panels/toolbar/menus registered in `T4.edx` are re-rendered automatically; do not keep references to shell DOM elements.
9. **Read-only (trashed) documents**: commands, toolbar items and shortcuts are refused unless the registration says `readonlyOk: true`. Check `edx.editor.readonly()` in your own UI.
10. **Errors in your callbacks** are caught and logged (`console.error`) so one module cannot break the editor, but registration mistakes (bad ids, forbidden attributes, duplicates) **throw** at registration time. Soft problems (refused shortcut) return `false` and are appended to `edx.problems`.
11. Ids: `^[a-z][a-z0-9_.:-]{1,63}$`, namespaced by module (`knowledge.backlinks`). Registering an id twice throws.

Labels: wherever a spec has `label`, you can instead give `labelKey: 'edx.knowledge.x'` (+ `label` as English fallback), or `label: () => string`. `title`/`titleKey`, `group`/`groupKey`, `heading`/`headingKey` work the same way. Resolve text yourself with `edx.text(spec, field)`.

## 3. API reference

All of it hangs off `T4.edx`.

### 3.1 Sanitizer — `edx.sanitizer`

```js
const undo = edx.sanitizer.allow({
  tags:   ['TIME'],                         // inline: TIME DATA BDI BDO RUBY RT RP WBR OUTPUT
          // or { SUMMARY: 'block', DETAILS: 'container' }   (block: SUMMARY ADDRESS DT DD HGROUP)
  attrs:  { TIME: { datetime: /^\d{4}-\d{2}-\d{2}$/ },            // RegExp | fn(value, el) → string | true | falsy
            SPAN: { 'data-x-wiki': /^[\w \-]{1,80}$/, class: /^ed-kn-[a-z]+$/ },
            P:    { id: /^[\w-]+$/ } },
  styles: { SPAN: { 'letter-spacing': (v) => /^\d(\.\d)?px$/.test(v) ? v : null } },
});                                          // undo() removes the rules again
edx.sanitizer.blockContainer('DETAILS');                                  // blocks inside a block (like blockquote)
edx.sanitizer.blockContainer('DIV', { match: (el) => el.classList.contains('ed-wr-callout') });
```

* Rules are **per element and per attribute**; there is no wholesale allow. A validator that is not a RegExp/function throws.
* Allowed attribute names: `class id title lang dir colspan rowspan start open aria-label role datetime value` and `data-x-<name>` (the `x` namespace keeps document markup away from the editor's own `data-cmd`, `data-open`, … handlers). Everything else throws: `on*`, `style` (use `styles`), `href`/`src`/`srcset`/`srcdoc`/`action`, `name`, plain `data-*`.
* Always-on guards that no validator can lift: value ≤ 1000 chars without control characters; `class` tokens must be simple names and never `t4-w`, `t4-doc`, `t4-table`, `ed-ui`, `ed-menu`, `is-*`, `cw-*`, `iw-*`, `dw-*`; `id` must be a simple name that does **not** already exist on `Object.prototype`, `document` or `window` and may not start with `__` (DOM clobbering: `__proto__`, `constructor`, `T4`, `location`, … are refused); style values containing `url(`, `;`, `{}`, `\`, `expression`, `@import`, `<>` are refused.
* Tags: only from a fixed safe list; scripts, frames, forms and other dropped elements can never be registered. Registered inline tags behave like `span` (inline style rules for colour/background/font apply); `block` like a paragraph; `container` holds blocks (loose inline content is wrapped in `<p>`, an empty container gets `<p><br></p>`). `blockContainer` accepts `DETAILS ASIDE SECTION ARTICLE DIV DL NAV HEADER FOOTER MAIN FIGURE FIELDSET`; for generic tags (`DIV`, `SECTION`) always pass `match` so ordinary pasted divs keep being flattened. Containers need `attrs` rules for the attributes you want to keep (e.g. `open` on `DETAILS`).
* Widgets are allowed by `edx.widgets.register`, not here.

### 3.2 Widgets — `edx.widgets`

Stored form: `<figure|span class="t4-w" data-w="TYPE" data-p="{json}">`. The inside is **always rebuilt from `data-p`** and never stored or trusted.

```js
edx.widgets.register('callout-x', {
  inline: false,                                   // true → <span>, lives inside a paragraph
  validate(props) { return typeof props.text === 'string' ? { text: props.text.slice(0, 500), tone: ['info','warn'].includes(props.tone) ? props.tone : 'info' } : null; },
  render(el, props) { el.innerHTML = ''; /* build DOM safely: textContent, createElement — el is emptied before every call */ },
  textOf(props, el) { return props.text; },        // search text, word count
  toMarkdown(props, ctx) { return '> ' + props.text; },   // sync or async; ctx.inline for inline widgets
  ctxBar: {                                        // bar shown above the selected widget
    label: 'Callout',                              // (+ labelKey)
    items: [ { action: 'tone', icon: 'flag', label: 'Warn', on: false }, { sep: true },
             { builtin: 'delete', icon: 'trash', label: 'Delete' },          // built-in actions: 'delete', 'edit'
             { hint: 'Double-click to edit' } ],   // or a function (el, props) → items
    // html(el, props) → string   (instead of items; buttons need data-ctx="x:<action>")
    onAction(action, { el, props, btn, setProps(patch), remove(), edit() }) { if (action === 'tone') setProps({ tone: 'warn' }); },
  },
  edit(el, props) { /* double-click / Enter / ctx "edit" */ },
  insert(opts) { /* optional custom insertion; default creates the widget at the caret */ },
  defaults: { text: '' },                          // props for the default insert
  css: '.my-widget { … }',                         // static CSS, injected once (prefer css/ed-<module>.css)
});
edx.widgets.insert('callout-x', { props: { text: 'Hi' } });   // at the caret, selected, one undo step
edx.widgets.has(type); edx.widgets.list(); edx.widgets.remove(type); edx.widgets.validate(type, props);
```

* Built-in types (`img draw chart math code pagebreak`) cannot be re-registered. Type: `^[a-z][a-z0-9-]{1,30}$`.
* `validate` must return a plain object (≤ 2 MB as JSON) or `null` (widget dropped). It runs inside the sanitizer for every load/paste/undo: keep it fast, never throw (a throw drops the widget).
* Interactive controls inside a widget: give inputs the class `cw-input` so the editor does not steal focus or treat clicks as selection changes; changes must go through `edx.editor.run(() => edw.setProps(el, props))`.
* The built-in sanitizer, `edw.validate/create/render`, `core.textOf`, the Markdown exporter, the context bar and double-click editing all fall back to this registry.

### 3.3 Commands and shortcuts — `edx.commands`, `edx.shortcuts`

```js
edx.commands.register('knowledge.search', {
  label: 'Search in document', /* or labelKey */ icon: 'search', group: 'Knowledge', order: 100,
  when() { return !!edx.editor.current(); },       // enabled?
  readonlyOk: false,                               // allowed in a trashed (read-only) document?
  global: false,                                   // allowed with no document open (palette items)
  run(ctx) { /* ctx = { editor, edx, source: 'api'|'shortcut'|'menu'|…, args, event? } */ },
});
edx.shortcuts.add('mod-f', 'knowledge.search');    // → true | false (refused, see edx.problems)
edx.commands.run('knowledge.search', args);        // result (maybe a Promise) | false when unknown/disabled
edx.commands.list();                               // [{ id, label, icon, kbd, group, enabled }] for a command palette
edx.shortcuts.list(); edx.shortcuts.remove(combo); edx.shortcuts.labelFor(id); edx.shortcuts.reserved();
```

* **One combo format**, normalised by `edx.shortcuts.normalize`: `mod-alt-shift-<key>`, lower case, `mod` = Ctrl (Windows/Linux) or ⌘ (macOS). `'Ctrl+Shift+H'`, `'cmd-shift-h'` and `'mod-shift-h'` are the same. Keys: letters, digits, `f1`–`f12`, `esc up down left right space tab enter backspace del home end pageup pagedown` and `, . + - / \ [ ] = ; ' \``. Letters and digits are matched by physical key (`e.code`), so Shift/layout do not matter.
* A combo needs `mod` or `alt` (or be an F-key); plain and Shift-only keys are refused (typing). AltGr (Ctrl+Alt on many layouts) never triggers a shortcut. Avoid `mod-alt-<letter>`.
* Dispatch: from the editor core's `keydown` (document text) **before** the built-in switch (so `mod-shift-p` is not mistaken for the built-in `mod-p`; registered combos can never equal a built-in one) and from a shell-level listener for keys pressed in the title field, widget inputs or panels. Not in dialogs. Handled keys get `preventDefault`/`stopPropagation`.
* **Reserved (refused)**: editor built-ins `Ctrl+Z/Shift+Z/Y, B, I, U, E, K, M, S, P, C, X, V, A, D, Shift+V/X/7/8/L/E/R/J, \ . , ] [ Enter, Alt+0…6, Tab, Shift+Tab, Enter, Shift+Enter, Esc, Backspace, Delete, Space, arrows, Home/End/PageUp/PageDown, Shift+F10`; desktop-app/browser keys `Ctrl+N, Ctrl+Shift+N, Ctrl+Alt+N, Ctrl+Shift+Space, Ctrl+1…9, Ctrl+0, Ctrl++/=/−, Ctrl+Shift+D, Ctrl+R, Ctrl+Shift+R, Ctrl+Shift+I, Ctrl+Q, Ctrl+W, Ctrl+T, Ctrl+Tab, F5, F11, F12, Alt+F4, Alt+←/→/Home`. `edx.shortcuts.reserved()` returns the exact lists.
* **Free and known to work in browser and desktop app**: `Ctrl+F`, `Ctrl+H`, `Ctrl+G`, `Ctrl+Shift+P`, `Ctrl+Shift+O`, `Ctrl+Shift+F`, `Ctrl+Shift+H`, `F3`, `Ctrl+Alt+Shift+<letter>`. In the desktop app the Electron menu accelerator only fires for keys the page did not handle; a registered shortcut calls `preventDefault`, so `js/desktop.js` (`EDITOR_KEYS`) needs no change. The browser's own handling (Ctrl+F find, Ctrl+H history, …) is cancelled the same way.
* `kbd` shown in menus/tooltips: pass `kbd` to menu/toolbar specs; `commands.list()` fills it from `shortcuts.labelFor`.

### 3.4 Slash menu — `edx.slash`

```js
edx.slash.add({ id: 'knowledge.callout', label: 'Callout', /* labelKey */ keywords: ['note', 'info'], icon: 'flag', group: 'Knowledge', order: 10,
                run({ editor, edx }) { edx.widgets.insert('callout-x', { props: { text: '' } }); } });
```
Typing `/` on an empty line opens the menu; your entries are appended after the built-ins (sorted by `order`), filtered by label and keywords. Built-in entries are grouped (**Basic**, **Media**, **Advanced**; ids `builtin.<label-slug>`, e.g. `builtin.heading-1`); entries without `group` appear under **More**.
```js
edx.slash.setRanker((items, q) => items.filter(…).sort(…));   // items: [{ id, label, keywords, icon, group, builtin }] (the same objects must be returned); returns the previous ranker
edx.slash.onPick((id) => {});                                  // after an entry was chosen (recently-used lists)
```
Without a ranker the menu does a plain substring match in registration order; `q` is the text after `/` (lower case, may be empty — return `items` unchanged for the default grouped order). One ranker at a time (the UX module installs fuzzy matching + recently used). When `run` is called the typed `/…` text has been removed. `group` adds a heading above the first entry of that group.

### 3.5 Menus, toolbar — `edx.menus`, `edx.toolbar`

```js
edx.menus.add('file', { label: 'Print preview…', icon: 'page', kbd: 'Ctrl+Alt+P', order: 10, run(ctx) {} });
edx.menus.add('insert', (ctx) => [{ label: 'Callout', run: (c) => c.editor.… }, { sep: true }]);   // provider: array or single spec, evaluated each time the menu opens
// where: 'file' | 'insert' | 'more' | 'doc' | 'context'
```
Item: `{ label|labelKey, icon, kbd, run(ctx), checked, disabled, danger, order, when(ctx), items: [subitems] }`, `{ sep: true }`, `{ heading }`, `{ html, mount(menuEl) }`. `checked`/`disabled` may be functions of `ctx`.
`ctx = { where, editor, doc: { id, meta } | null, readonly }` plus: `doc` menu (the "…" button in the document list): `docId`, `docMeta`; `context`: `target` (clicked element), `widget`, `link`, `hasSelection`, `selectedText`. Registered `file` items sit before "Close document"; `doc` items before "Move to trash"; `insert`/`more` at the end. Registered exporters appear in an **"Export as…" submenu** in the File menu and the document "…" menu.

**Context menu (right click).** The desktop app has no native context menu, so a right click in the document opens ours. In the browser the native menu stays (spell-check suggestions, translate, …) except over widgets and horizontal lines; `Shift+F10` / the menu key open ours everywhere (also in the browser). It contains Cut, Copy, Paste, Paste as plain text (clipboard read can be refused by the browser/desktop permission policy → toast "Use Ctrl+V"), Select all, then your `context` items.

```js
edx.toolbar.add({ id: 'knowledge.pin', group: 'knowledge', icon: 'pin', label: 'Pin', kbd: 'mod-shift-j', order: 1,
                  run({ editor, edx }) {}, isActive() { return false; }, readonlyOk: false });
```
Rendered in a reserved toolbar group at the end of the formatting toolbar, one visual group per distinct `group`. `isActive` is polled on selection changes (once per frame): keep it cheap. Available icons: the sprite in `index.html`; add your own with `edx.icons.add(name, svgShapes)` (24×24 stroke icon, shapes `path circle rect line polyline polygon ellipse g` only, validated).

Built-in actions that are scriptable as commands (so palettes need not click menus): `editor.page-setup`, `editor.export-markdown`, `editor.export-json`, `editor.import`. Other built-in actions are reachable through the toolbar/menus of the shell.

### 3.6 Panels — `edx.panels`

```js
edx.panels.register({ id: 'knowledge.outline', side: 'right', title: 'Outline', /* titleKey */ icon: 'list', order: 10,
  render(host, api) { /* host: empty <div>; api = { id, host, edx, editor, close() } — called once per shell, when first opened */ },
  onDocChange(doc) { /* doc = { id, meta } | null: when a document opens/closes and after every autosave */ },
  onOpen() {}, onClose() {} });
edx.panels.open(id); edx.panels.close(side = 'right'); edx.panels.toggle(id); edx.panels.active(side); edx.panels.isRendered(id);
```
* **Right** panels form a third column (320 px) next to the document, with a tab strip when there are several and a toggle button in the editor bar (only shown when a right panel exists). Below 1100 px the column becomes an overlay drawer with a scrim; on mobile it is closed by default and opened with the button. The open panel is stored in the editor UI prefs (`todo4me.editor.ui`: `panel`, `lpanel`, `lastPanel`); drawers opened on small screens are not remembered. A right panel is visible only while a document is open.
* **Left** panels become extra tabs next to "Documents" at the top of the document list sidebar; the document list stays unchanged. The core shows and hides the left panel host (`#ed-side-panelhost`) together with `onOpen`/`onClose`; a panel must not toggle it itself.
* The shell (and so every host) is rebuilt on language change: your `render` is called again when the panel is next shown, and `onClose` is called first. Keep state in your module, not in the host.
* Build DOM in `render` with the app's design tokens (CSS variables); inputs inside panels may use any `data-*` except `data-cmd`/`data-open`/`data-view` (panel bodies are excluded from the editor's delegated click handling anyway).

### 3.7 Document list — `edx.docList`

```js
edx.docList.registerView({ id: 'knowledge.tagged', label: 'Tagged', /* labelKey */ icon: 'tag', order: 1, filter: (meta) => meta.knowledge_tags.length > 0,
                           sort: (a, b) => …, empty: 'No tagged documents.' });   // extra button next to All / Pinned / Trash
edx.docList.decorate((meta) => meta.knowledge_tags.length ? '<span class="ed-kn-badge" title="Tagged">#</span>' : '');   // badges after the title
edx.docList.removeView(id);
```
```js
edx.docList.filter((meta, { view, q }) => !meta.kn_archived || view === 'knowledge.archive', { empty: 'Only archived documents match.', emptyKey: 'edx.knowledge.onlyArchived' });   // → remove()
```
`filter` hides documents from every list view (return `false` to hide); `empty` is shown when the filter removed everything that otherwise matched. Applied after the search; a throwing filter never hides documents.
`decorate` HTML is reduced to `span b i em strong small kbd mark br svg use` with `class` (simple names), `title`, `aria-label`; escape text yourself. `registerGroup` is not provided.

### 3.8 Events — `edx.events`

`on(name, fn, { debounce: ms })` → `off()`, `off(name, fn)`, `once(name, fn)`, `emit(name, data)`. Custom events: `<module>:<name>`.

| Event | Payload | When |
|---|---|---|
| `shell-built` | `{ root }` | the editor shell was (re)built |
| `doc-open` | `{ id, meta }` | a document finished opening |
| `doc-close` | `{ id }` | a document is left (other document, start page, trash, language change) |
| `doc-saved` | `{ id, meta, html }` | autosave stored the document (≈ 700 ms after the last edit; `html` is the sanitized content) |
| `content-change` | `{ history? }` | every change of the document (each keystroke; **keep handlers cheap**) |
| `selection-change` | `{}` | selection moved (once per frame) |
| `before-export` / `after-export` | `{ format, id }` / `{ format, id, ok? }` | PDF (`pdf`), Markdown (`md`), JSON (`json`) and registered exporters (their id) |
| `before-bulk-change` | `{ reason, count? }` | emitted by modules (not the core) right before a destructive bulk edit such as replace-all; the versions module saves a snapshot first |
| `docs-changed` | `{ docs }` | the document list was reloaded (create, delete, rename, meta change, import) |
| `doc-meta` | `{ id, meta, patch }` | after `edx.docs.updateMeta` |

### 3.9 Document metadata — `edx.meta`, `edx.docs`

```js
edx.meta.extend({ knowledge_tags: { default: [], clean: (v) => Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 20) : [], dup: 'copy' } });
await edx.docs.updateMeta(id, { knowledge_tags: ['a'] });   // docstore.touch (validated by cleanMeta); does not change updatedAt; emits doc-meta
edx.docs.list(); edx.docs.get(id);                           // Promises
```
Fields are validated by `clean` in `docstore.cleanMeta`, so `create`, `save(patch)`, `touch`, `duplicate` (`dup: 'reset'` resets to the default), `exportBundle`/`importBundle` (round trip; `clean` also sanitizes imported values) all honour them. `clean` must return a JSON-able value; if it throws the default is used. Register the fields at load time, before the first document is read. `edx.docs.updateMeta` on the open document flushes pending edits first and keeps `edx.editor.current().meta` in sync.

### 3.10 Database — `edx.db`

IndexedDB `todo4me-docs`, **version 2** (migration scaffold in `docstore.js`: `MIGRATIONS[n - 1]` upgrades n−1 → n; never edit an old step, append one and bump `DB_VERSION`; only the foundation owner changes the schema). Stores: `docs`, `bodies`, `assets` (v1) and, new in v2, `versions` and `kv`. Without IndexedDB (private modes) everything runs in memory.

```js
const V = edx.db.versions;       // record { id, docId, createdAt, title, words, html, reason }; indexes docId, createdAt
await V.add({ docId, html, title, words, reason: 'auto' });    // → record (id generated); reason: [\w .:-]{0,40}
await V.list(docId, { html: false });   // newest first; html only when asked
await V.get(id); await V.remove(id); await V.count(docId);
await V.prune(docId, keep, { protect: (rec) => rec.reason === 'manual' });   // keep newest `keep` + protected; → removed count
const K = edx.db.kv;             // small module state, key /^[\w.:-]{1,100}$/ (prefix with your module: 'knowledge.state')
await K.get(key); await K.set(key, jsonLikeValue); await K.remove(key); await K.keys(prefix);
```
* **Versions are not part of the export bundle** (`exportBundle`/`importBundle` and the daily backup file) — they stay on this device. Deleting a document (permanently or by emptying the trash) deletes its versions.
* **Asset garbage collection** (`docstore.collectGarbage`) counts images referenced by version HTML as used, so an old version never loses its images. Prune versions to free them.
* Downgrading to an app version without database v2 makes IndexedDB refuse to open (the old app falls back to in-memory mode); upgrading is one-way.

### 3.11 Import / export — `edx.exporters`, `edx.importers`, `edx.download`, `edx.report`

```js
edx.exporters.register({ id: 'io.docx', label: 'Word document', ext: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', icon: 'doc',
  async run(doc) { /* doc = { id, meta, html } (stored, sanitized) */ return blob; } });   // Blob | string | ArrayBuffer | typed array → downloaded as "<title>.<ext>"; { handled: true } / undefined → nothing downloaded (you did it yourself)
edx.exporters.export(id, docId?);  // programmatic; flushes pending edits, fires before/after-export, toasts errors

edx.importers.register({ id: 'io.docx', exts: ['docx'], accept: '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  async run(file) { return { title, html, meta: { knowledge_tags: [] }, report: [{ level: 'warn', text: 'Dropped a macro' }] }; } });
```
* Importer output is sanitized like every import; `data:` images become stored assets. `meta` accepts only registered `<module>_<name>` fields (plus `page`); id, timestamps, `pinned` and `deletedAt` are ignored. `report` entries (`string` or `{ level: 'info'|'warn'|'error', text }`) are shown in a dialog after the import — **never drop content silently, report it**. Built-in extensions (`md markdown txt html htm json`) cannot be taken over. A throwing importer shows an error toast with file name and reason. Files over 200 MB are rejected before your importer runs.
* `edx.download(data, filename, mime)` saves a Blob/string/ArrayBuffer/typed array (browser: anchor download; desktop app: the same, the session's `will-download` handler shows the native save dialog). File-name characters `\ / : * ? " < > |` are replaced. Desktop save-dialog filters exist for **`.md`, `.json`, `.docx`, `.html`, `.txt`, `.rtf`** (localized names); any other extension gets an "All files" filter. Ask the foundation owner (electron/main.js `DOWNLOAD_TYPES`, electron/i18n.js) to add an extension; the list is a strict allowlist.
* `edx.report(title, items)` → Promise; shows a modal with the notes (`{ heading }` entries group by file); resolves when closed; resolves `false` without a dialog when `items` is empty. Dialogs are closed by route changes: show them after navigation has finished.

### 3.12 Search — `edx.search`

```js
edx.search.register({ id: 'knowledge.tags', order: 10, async query(q, { docs }) { return [{ id: docId, score: 5, snippet: 'plain text' }]; } });
await edx.search.query('text');   // merged [{ id, score, snippet, provider }] over all providers incl. the built-in title/text search ('builtin')
```
The document list always shows the built-in matches immediately; extra providers run asynchronously and their matches (OR) are added when they arrive. `snippet` is plain text (escaped when shown). Keep providers fast (they run on every search-box change after a 120 ms debounce).

### 3.13 Print / PDF — `edx.print`

```js
edx.print.addCSS((meta) => '.ed-kn-fold { display: block !important }');   // appended to the generated print stylesheet
edx.print.before(async ({ meta, root }) => { /* expand collapsed sections */ });
edx.print.after(async ({ meta, root }) => { /* restore */ });
```
Order: `before-export`{pdf} → `print.before` hooks → print stylesheet applied → print → stylesheet removed → `print.after` hooks → `after-export`. Page setup (`edx.page.extend`) is deliberately **not** provided: stored page settings are the fixed, validated set in `docstore.cleanPage`. Keep per-document layout options in your own meta fields and print CSS.

### 3.14 Editor facade — `edx.editor`

Stable access for modules (bound by `js/editor.js`; calling before it loads throws):

| Member | Description |
|---|---|
| `current()` | `{ id, meta }` of the open document or `null` |
| `root()` | the `contenteditable` element (`#ed-doc`) or `null` |
| `readonly()` | open document is trashed |
| `run(fn, opts)` | **all DOM changes go through this** (`core.run`: one undo step, structure fix, dirty flag, events). `opts.keepFocus`, `opts.coalesce` |
| `insertBlock(el, { select })`, `insertInlineWidget(el)` | insert a block / inline widget element at the caret |
| `insertHTML(html)`, `insertText(text)` | sanitized HTML / text like typing, at the selection |
| `getSel()`, `setSel(sel)`, `rememberSelection()`, `restore()` | selection as character offsets, independent of node identity; `restore()` refocuses the document |
| `selectedText()`, `textOf(node?)`, `snapshot()` | selected text; plain text of a node/the document; `{ html, text, words, chars }` |
| `setHtml(html)` | replace the whole content as one undo step (sanitized) |
| `headings()` | `[{ level, text, el, index }]` |
| `scrollToBlock(el, { block, flash, caret })` | scroll into view and flash (class `ed-flash`); `false` if detached |
| `openDoc(id, { reload })` | open and resolve `true` once open. Works when the hash already points at the document (opens it directly); `{ reload: true }` re-reads an already open document (after its stored content was replaced) |
| `banner(id, text \| Node, { icon, role, html, cls, actions: [{ id, label, primary, ghost, run }] })`, `clearBanner(id?)` | module banner in a reserved stack above the toolbar (not `#ed-banner`, which belongs to the core's trash notice). Same `id` replaces; plain text unless `html: true` (reduced like `safeHTML`); buttons carry `data-banner-action="<id>"`; the banner root is `[data-banner="<id>"]`. All banners disappear when another document opens or the document closes |
| `newDocument({ title, html, meta })` | create (html sanitized, `meta`: registered fields, `page`, `pinned`), open it, resolve its meta |
| `flush()` | save pending edits now (await before reading the stored document) |
| `toast(msg, kind, ms, action)`, `confirm(opts)`, `openModal(opts)`, `closeModal(silent)` | the app's UI (`T4.ui`) |
| `openMenu(anchor, items, { at: {x, y}, focusFirst })`, `closeMenu()` | the editor's menus (items as in 3.5) |
| `ready()`, `cachedDocs()` | wait until the document list is loaded; the loaded metas |
| `t(key, fallback, params)` | = `edx.t` |

### 3.15 Texts and helpers

* `edx.t(key, fallback, params)` — translation or the English fallback with `{name}` params. `edx.text(spec, field)` resolves `labelKey`/`label`/function.
* `edx.i18n.add('edx.<module>.', { en: {…}, de: {…}, tr: {…}, es: {…} })` in `js/i18n/ed-<module>.js` — keys must start with the prefix; all four languages should define every key (`edx.i18n.missing()` lists gaps; your suite should assert it is empty for your prefix). The editor core's own strings use `ed.<English text>` keys; do not add to that namespace.
* `edx.util` = `{ esc, icon, uid, debounce }`; `edx.safeHTML(html)`; `edx.icons.add/has`; `edx.problems` (array of soft registration problems).

## 3.16 Markdown mapping (core, `js/editor-markdown.js`)

| Document | Markdown |
|---|---|
| checklist `ul.t4-check > li[data-x-check]` | `- [ ] text` / `- [x] text` (nested lists indented) |
| callout `blockquote.t4-callout--<type>` (first paragraph = `<strong>Title</strong>`) | Obsidian `> [!type] Title` followed by the quoted body |
| footnote widget | `^[text]` (Pandoc inline note; `]` escaped as `\]`) |

Import (only while the layout module is loaded; otherwise the old behaviour: `☐`/`☑` characters, bold-prefixed quote, literal `^[…]`): a bullet list whose items are **all** tasks becomes a checklist (mixed lists keep the characters; ordered lists never become checklists); Obsidian callout types map to `note tip info warning danger` (`abstract summary tldr quote cite`→note, `hint important success check done`→tip, `todo question help faq example`→info, `caution attention`→warning, `error failure fail missing bug`→danger, unknown→note); a callout without a title gets the type name; fold markers (`-`/`+`) are ignored; `^[text]` becomes a footnote widget.

## 4. Not provided (by design)

`edx.page.extend`; `docList.registerGroup`; Markdown *import* hooks; direct access to the shell DOM; a command palette UI (use `edx.commands.list()`).
