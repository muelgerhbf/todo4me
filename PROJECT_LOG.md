# Todo4Me: Project Log

What was built, in which order, which decisions were made and why, what went wrong and how it was fixed.
Written at the end of day 1 (2026-11-02) as the starting point for day 2: **building Todo4Me for iPad and MacBook.**

---

## Quick status

| | |
|---|---|
| Project folder | `C:\dev\todo4me` |
| Web app | Done. Runs in any browser by opening `index.html` |
| Windows desktop app | Done. Version **2.0.0** (day 2): `dist\Todo4Me-Setup-2.0.0.exe` (installer, auto-updates) and `dist\Todo4Me-2.0.0-portable.exe` |
| Document editor | Done on day 2 (see Part 4) |
| Automatic updates | Built in on day 2 (see Part 4). Needs the public repo `todo4me-releases` + a token once before the first `npm run release` |
| Reminders, tray, global hotkey | Built on `feature/reminders-calendar` (Step 24), not yet released or committed |
| Tests | 183 functional + 166 editor + 84 desktop checks + an end-to-end update test, all passing |
| Mac / iPad | Not started (see Part 3) |

**Tool versions used:** Node.js 24.20.0, npm 11.19.0, Electron 45.2.1, electron-builder 26.18.0, Windows 11, Google Chrome (for headless testing).

---

## Part 1: Building the web app

### Step 1: Inspect the project

The folder `C:\dev\todo4me` was empty, so everything was built from scratch.
Node.js and Chrome were available locally, which made automated browser testing possible.

### Step 2: Architecture decisions

| Decision | Why |
|---|---|
| **Vanilla JavaScript, HTML and CSS, with no framework and no build step** | Simple and maintainable, as requested. Nothing to compile. |
| **Classic `<script>` files sharing one `window.T4` namespace instead of ES modules** | Browsers block ES modules on `file://`. Classic scripts mean double-clicking `index.html` just works. |
| **LocalStorage, one JSON document under one key** | No backend needed. The data is small, and saving synchronously on every change is the most reliable option. |
| **Storage behind an adapter (`load` / `save` / `remove`)** | A server backend can replace LocalStorage later without touching the rest of the app. |
| **One store, with every change going through `commit()`** | Each change is validated, saved immediately, then the current view is redrawn. Simple one-way data flow. |
| **Hash router (`#/dashboard`, `#/tasks`, …)** | Works over `file://`, and the browser back button works. |
| **Event delegation via `data-action`, `data-form`, `data-input` and `data-change` attributes** | No per-element listeners to attach or clean up after every redraw. |
| **Native `<dialog>` for modals and confirmations** | Built-in focus trapping, Esc to close, and accessibility. |
| **Inline SVG icon sprite in `index.html`** | One consistent icon set, works offline, no icon font. |

### Step 3: Data model (JSON)

Stored under the LocalStorage key `todo4me.data.v1`:

```
{ version, tasks[], categories[], notes[], dailyPlans{date: plan}, settings, stats, meta }
```

- **Task:** id, title, description, notes, status (`todo` / `in_progress` / `done`), priority (`critical` / `high` / `medium` / `low` / null), categoryId, tags, dueDate, dueTime, estimate, subtasks, recurrence, inbox flag, nextOccurrenceId, createdAt, updatedAt, completedAt
- **Note:** id, title, body, weekOf, tags, pinned, timestamps
- **DailyPlan:** date, goal, top3 (task ids), notes, reflection
- **Settings:** userName, theme, accent, defaultSort, weekStart, pomodoro lengths
- **Stats:** `completions` (completed tasks per day) and `focusSessions` (per day). Kept as counters so history survives deleting completed tasks.

Other keys: `todo4me.backup.v1` (daily automatic backup), `todo4me.focus.v1` (focus timer state), `todo4me.corrupt.<timestamp>` (quarantined unreadable data).
Full field documentation is in `README.md` under "Data model".

### Step 4: Files written, in order

| File | Contents |
|---|---|
| `index.html` | App shell, icon sprite, dialogs, a small inline script that applies the theme before the first paint |
| `assets/icons/favicon.svg` | Logo |
| `js/utils.js` | Date helpers (local `YYYY-MM-DD`), HTML escaping, DOM helpers |
| `js/storage.js` | Default data, validation and sanitizing, the storage adapter, daily backup, corruption recovery, export, import and merge |
| `js/store.js` | State, all mutations (including recurrence and the completion log), selectors (overdue, sorting, search, counts) |
| `js/ui.js` | Action registry, modal, confirm dialog, toasts, progress ring and bar |
| `js/tasks.js` | Task row, task editor, quick capture, quick-add parser (`!1` `#work` `@fri`); Inbox, My Tasks, Today and Upcoming views |
| `js/dashboard.js` | Dashboard and the Top 3 picker |
| `js/planner.js` | Weekly planner (with drag and drop) and the Daily Plan view (autosave) |
| `js/notes.js` | Weekly notes view and editor |
| `js/focus.js` | Focus mode and the Pomodoro timer (based on an end timestamp, so it survives a refresh) |
| `js/stats.js` | Statistics and charts (CSS bar charts with tooltips and a table view) |
| `js/settings.js` | Settings, theme and accent, categories, export and import, sample data, reset |
| `js/app.js` | Router, navigation counts, event delegation, keyboard shortcuts, boot |
| `css/styles.css` | Design tokens for light and dark themes, components, views, responsive layout |
| `README.md` | Usage, data model, architecture |

### Step 5: Features delivered

Dashboard (greeting, stats, Top 3, main goal, today's tasks, important tasks, week overview) · Inbox · My Tasks (search, five filters, five sort orders) · Today · Upcoming · tasks with every requested field, plus subtasks, recurrence and undo · Weekly Planner (week navigation, inline add, drag and drop, day details, the week's notes) · Daily Plan (goal, Top 3, notes, reflection) · Weekly Notes (grouped by week, pin, tags, search) · Focus Mode with Pomodoro · Statistics · Settings · light and dark mode · accent colors · responsive layout for desktop, tablet and phone · keyboard shortcuts (`N`, `Q`, `/`, `G` + letter, `Ctrl+Enter`, `Esc`).

**Reliability features:**
- Data is validated on load.
- A daily rolling backup is kept.
- Corrupted data is quarantined and the backup is restored.
- Open tabs stay in sync.
- Every destructive action asks for confirmation.
- A warning appears if saving fails.

### Step 6: Testing the web app

- Wrote a small test harness that drives headless Chrome over the DevTools protocol, using Node 24's built-in WebSocket and no npm packages.
- Wrote `test-functional.mjs`: 141 checks that click through every feature, then test persistence across a reload, corrupted-data recovery, and reset.
- The first run found 10 failures. All of them were bugs in the test script (wrong selector, stale elements, picking the wrong toast), not in the app.
- Final result: **141 passed, 0 console errors.**
- Took screenshots of every view in light and dark, at desktop, tablet and phone widths. That pass found and fixed four visual bugs:
  1. The sidebar close button showed on desktop (CSS specificity).
  2. The "Today's tasks" count didn't include overdue tasks.
  3. The heading in the focus picker was split apart.
  4. Date icons in the focus picker rendered as filled squares.

---

## Part 2: Packaging as a Windows app (Electron)

Goal: a real Windows 11 app with an installer and a portable version. **Rules:** don't rewrite the app, don't remove features, never overwrite user data.

### Step 7: Analysis

- The app already ran over `file://`, so Electron can load `index.html` unchanged with `loadFile`.
- Risks to data identified, and how each is handled:
  1. **Two app instances writing the same LocalStorage** → single-instance lock.
  2. **The data folder changing** (for example if the app name changes) → pin it to `%APPDATA%\Todo4Me`.
  3. **LocalStorage not yet flushed to disk on quit** → call `session.flushStorageData()` on close.
  4. **Migration from the browser:** Electron cannot read Chrome's or Edge's storage → use the existing Export/Import with Merge, which never overwrites anything.

### Step 8: Setup

1. Created `package.json` with the electron-builder config.
2. Ran `npm install --save-dev electron@45.2.1 electron-builder@26.18.0`.
3. **Gotcha:** npm 11 blocked Electron's install script, so the Electron program was missing. Fix: `node node_modules/electron/install.js`.
4. **Gotcha:** the VS Code environment sets `ELECTRON_RUN_AS_NODE=1`, which makes Electron behave like plain Node. Fix: `scripts/start.js` removes that variable before starting Electron (used by `npm start`).
5. Generated the app icon `build/icon.png` (512 px) by rendering `favicon.svg` with headless Chrome. A copy at `assets/icons/icon.png` is used as the window icon.

### Step 9: Files added (the existing web app files were not rewritten)

| File | Purpose |
|---|---|
| `electron/main.js` | Main process: window, fixed data folder `%APPDATA%\Todo4Me`, single-instance lock, flush on quit, menu, save dialog for exports, daily JSON backup file, security rules |
| `electron/preload.js` | Exposes only `window.todo4meDesktop` (`getInfo`, `writeBackup`, `openFolder`, `onMenuAction`, `isDesktop`, `platform`) via `contextBridge` |
| `js/desktop.js` | Connects menu commands to existing actions, writes the daily backup, shows a migration hint while the app is empty, adds a "Desktop app" card to Settings. **Does nothing in the browser.** |
| `scripts/start.js` | `npm start` / `npm run dev` |
| `scripts/build.js` | `npm run build` (see step 12) |
| `package.json`, `.gitignore`, `build/icon.png`, `assets/icons/icon.png` | Config and icons |

The only edits to existing files were in `index.html`: one `<script src="js/desktop.js">` tag and a Content-Security-Policy meta tag. The README also got a German "Desktop-App für Windows" section.

### Step 10: Security configuration

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`
- New windows are denied. Navigation away from `index.html` is blocked. `http(s)` links open in the default browser.
- All permission requests (camera, microphone, notifications, …) are denied. Webviews are blocked.
- **CSP in `index.html`:** only local files are allowed. The inline theme script is allowed by its SHA-256 hash (`RPQDyn7LvmKcb6p3OqD6gJWX3UcQVVzI9RNbB+cFK/U=`).
  **If that inline script is ever edited, the hash in the CSP must be recalculated**, otherwise the script is blocked.

### Step 11: Data safety in the desktop app

- Data lives in `%APPDATA%\Todo4Me`. The installed and portable versions share it. Uninstalling keeps it (`deleteAppDataOnUninstall: false`).
- A daily backup file is written to `%APPDATA%\Todo4Me\backups\todo4me-YYYY-MM-DD.json`. The last 14 are kept. The first snapshot of each day is never overwritten later that day. Files are written atomically (temp file, then rename).
- A `TODO4ME_USER_DATA` environment variable redirects the data folder. It is used only by the tests, so real data is never touched.

### Step 12: Building, and the VS Code lock problem

- **Targets:** NSIS installer (asks for the install folder, creates a desktop shortcut and a Start menu entry, per-user so no admin rights needed) and a portable exe.
- **Problem:** building directly into `dist/` failed with `EBUSY` / `EPERM`. Using the Windows Restart Manager API, I found the cause: **VS Code's extension host** (VS Code is itself an Electron app) opens new `.asar` files in the workspace and keeps them locked. A `files.watcherExclude` setting did *not* help, so I removed it again.
- **Fix:** `scripts/build.js` runs electron-builder in a temp folder outside the project, then copies only the finished `.exe` files into `dist/`.
- Leftover locked folders in `dist/` (`win-unpacked`, `win-unpacked.tmp`, `verify`) can be deleted after restarting VS Code.

### Step 13: Testing the desktop app

- **`test-electron.mjs`** (32 checks):
  - no Node.js access from the page, and the bridge exposes only its intended functions
  - `window.open` and navigation are blocked
  - menu commands are sent from the main process, as a real menu click would be
  - the Settings desktop card appears
  - importing a "browser export" with Merge keeps existing data and settings
  - **a real app restart**: data, daily plan, all LocalStorage keys and a running focus timer survive
  - the backup file is written and is importable
  - invalid backup payloads are rejected
  - the single-instance lock works
- Results, with 0 console errors everywhere:

  | Run against | Functional (141) | Desktop (32) |
  |---|---|---|
  | Electron from source | pass | pass |
  | Portable exe | pass | pass |
  | Installed app | pass | pass |

- **Installer check:** a silent install (`/S /D=<folder>`) created the desktop shortcut, the Start menu entry and the uninstall registry entry. A silent uninstall removed all three. Neither run touched `%APPDATA%\Todo4Me`.
- **Test gotchas:**
  - The portable exe takes several seconds to start because it unpacks itself first. The single-instance test needed a 45 s timeout.
  - Killing the portable launcher does not kill the real app process; use `taskkill /T` to kill the whole process tree.
  - In JavaScript string replacements, `$$` turns into `$`.

### Step 14: Commands

```bash
npm install                        # once; then run `node node_modules/electron/install.js` if Electron is missing
npm start                          # run the desktop app from source
npm run dev                        # same, with DevTools open
npm run build                      # installer + portable → dist/
npm run build:installer            # installer only
npm run build:portable             # portable only
npm run pack                       # unpacked app → dist/win-unpacked
```

Run the tests (they use an isolated data folder):

```bash
cd tests
node cdp.mjs test-functional.mjs                 # web app in headless Chrome
node cdp-electron.mjs test-functional.mjs        # same suite inside Electron (from source)
node cdp-electron.mjs test-electron.mjs          # desktop-specific checks
EXE="C:/dev/todo4me/dist/Todo4Me-1.0.0-portable.exe" node cdp-electron.mjs test-electron.mjs   # against a built exe
```

(Unset `ELECTRON_RUN_AS_NODE` first if your shell has it set. Paths to Chrome and the project are hard-coded at the top of the harness files.)

### Step 15: Installing and migrating (for the user)

1. Double-click `dist\Todo4Me-Setup-1.0.0.exe`. If SmartScreen warns, choose **More info → Run anyway** (the exe isn't code-signed).
2. Start the app from the desktop shortcut or the Start menu.
3. Bring over your existing data: in the browser version use **Settings → Export JSON**; in the desktop app use **Settings → Import JSON → Merge**.

---

## Part 3: Plan for day 2, iPad and MacBook

### MacBook (Electron, same approach as Windows)

**Prerequisite:** a Mac. macOS apps (`.dmg`) can only be built on macOS. An alternative is a GitHub Actions job on a `macos-latest` runner.

Changes needed. These are small, and the app's features and design stay the same:
1. **`electron/main.js`:** on macOS, add `{ role: 'appMenu' }` as the first menu (otherwise the File menu takes the app-name slot). Also keep the window-close behavior Mac-like; `activate` and `window-all-closed` are already handled.
2. **`package.json`:** add a `mac` section: targets `dmg` and `zip`, arch `universal` (or `arm64` + `x64`), `category: public.app-category.productivity`, and a 1024 px icon (render a larger `build/icon.png` from the SVG).
3. **`scripts/build.js`:** currently hard-codes `--win`; add a `--mac` mode.
4. **README:** Mac instructions, using Cmd instead of Ctrl.

Data on Mac would live in `~/Library/Application Support/Todo4Me`. Shortcuts already use `CmdOrCtrl`.

**Signing:** without an Apple Developer account ($99/year, needed for signing and notarization), macOS blocks the app on first launch. The workaround is System Settings → Privacy & Security → **Open Anyway** (once).

**Testing:** the test harness works on Mac too after changing the hard-coded paths (Chrome path, project path, Electron binary path `node_modules/electron/dist/Electron.app/Contents/MacOS/Electron`).

### iPad (Electron does NOT run on iPadOS)

Options to discuss tomorrow:

| Option | How it works | Needs | Pros / cons |
|---|---|---|---|
| **A. Progressive Web App (PWA)**, recommended first step | Add `manifest.json` and a service worker, host the folder online (for example GitHub Pages, free), open it in Safari, then **Share → Add to Home Screen** | Hosting (HTTPS). No Mac needed. | Full-screen app icon, works offline, smallest change. Data stays in Safari's storage on the iPad; keep regular Export backups. |
| **B. Native app with Capacitor** | Wrap the same web files in an iOS app project | A Mac with Xcode; an Apple ID (a free account works but the app expires after 7 days); $99/year for App Store / TestFlight | A real App Store-style app. More setup. |

**Important for iPad:**
- Opening `index.html` from the Files app does not work properly. The app has to be served over HTTPS (option A) or bundled (option B).
- The layout is already responsive and touch-friendly, but needs checks on a real iPad:
  - Planner drag and drop: HTML5 drag-and-drop on iPad Safari is limited, so a touch fallback may be needed.
  - Hover-only buttons: on a touch screen, task row actions should always be visible (a `(hover: none)` media query).
  - The on-screen keyboard: shortcuts don't apply without a hardware keyboard.
- **Moving data between devices:** Export JSON on one device, then Import JSON → Merge on the other. On the iPad, the file goes through the Files app or AirDrop. There is no automatic sync between devices (that would need a backend, which the storage adapter was designed to allow later).

### Suggested order for day 2

1. Decide between iPad options A and B.
2. **PWA:** add `manifest.json`, a service worker and the iOS meta tags. Make task actions always visible and add a touch fallback for drag and drop. Test with the existing suite using an iPad-sized viewport, then on a real iPad.
3. **Mac:** make the Electron changes above and build on a Mac (or set up GitHub Actions). Install it and test.
4. Update the README and this log.

**Editor notes for Mac/iPad (added with Part 4):** Calibri is not installed there; the bundled *Carlito* (same metrics) is used automatically.
Documents live in IndexedDB (Safari supports it; for a PWA ask for persistent storage with `navigator.storage.persist()`).
The PDF export uses Electron's `printToPDF` on Mac; in a PWA it falls back to the print dialog ("Save as PDF"), using the same CSS.
Drawing shapes use pointer events, so dragging/resizing works with touch; the context toolbars scroll horizontally on narrow screens.
For Mac auto-updates, electron-updater needs a **signed** app (Apple Developer account); without it, Mac users update by installing the new `.dmg`.

---

## Part 4: Day 2 (2026-11-03): document editor + automatic updates (version 2.0.0)

All work on the branch `feature/editor`; `main` stayed untouched until everything was tested.

### Step 16: Analysis

- Read every file again: router (`app.js`), storage (`storage.js`, LocalStorage `todo4me.data.v1`), design tokens (`styles.css`), Electron main/preload, `desktop.js`, tests.
- **Finding:** the brief said Todo4Me "already has an update function". It did not: there was no `electron-updater` and no update code, only the plan from day 1.
  So the update system was built once, as the only one (not a second, parallel system).
- Constraints that shaped the design: no build step and `file://` (classic scripts, `T4` namespace), strict CSP (no inline scripts, no `eval`), the app
  re-renders the whole view on every store change, LocalStorage has only a few MB, everything must work offline.

### Step 17: Decisions

| Question | Decision | Why |
|---|---|---|
| Editing engine | Own engine on `contenteditable` (`editor-core.js`), no editor framework | ProseMirror/Tiptap need a bundler; Quill can't do tables/shapes well. An own engine fits the no-build setup and stays small |
| Undo/redo | Own history of sanitized document snapshots + selection as character offsets | The browser's native undo breaks as soon as widgets/tables are changed via DOM; snapshots make *every* change undoable |
| Storage | IndexedDB database `todo4me-docs` (docs, bodies, assets), separate from `todo4me.data.v1` | Images and long documents would fill LocalStorage and could block saving tasks |
| Format | Sanitized HTML + JSON metadata; widgets store only source data in `data-p` | Lossless (colors, fonts, alignment, shapes, charts); Markdown is import/export (lossy for those) |
| Formulas | KaTeX 0.16.25 (MIT), loaded on demand | Fast, no `eval` (CSP-safe), works offline, excellent print quality |
| Code highlighting | Prism 1.30.0 (MIT), 10 languages, loaded on demand | Small (~50 KB), manual mode |
| Charts, shapes | Own SVG rendering | No dependency; vector output in the PDF |
| Fonts | Fira Code + Carlito bundled (SIL OFL); Calibri/Arial/Georgia/Times/Verdana from the system | Calibri is proprietary and can't be shipped; Carlito has identical metrics |
| PDF | The same page printed with print CSS: Electron `webContents.printToPDF`, browser `window.print()`; header/footer/page numbers via CSS `@page` margin boxes | Chromium's print engine embeds fonts, keeps vector graphics, makes bookmarks; one code path for both |
| Re-renders | The editor's DOM is created once and re-attached on every render | Typing, selection, undo history survive when e.g. a task is added elsewhere |
| Updates | `electron-updater` + public GitHub repo `todo4me-releases`, background download, "Restart now" | Free, standard, works with the existing NSIS installer; portable/dev builds report "unsupported" |

### Step 18: Files

New: `js/editor-sanitize.js`, `js/docstore.js`, `js/editor-widgets.js`, `js/editor-markdown.js`, `js/editor-core.js`, `js/editor.js`,
`css/editor.css`, `electron/updater.js`, `scripts/vendor.js`, `vendor/` (KaTeX, Prism, fonts + licenses), `tests/test-editor.mjs`.

Changed (additions only, nothing removed):
- `index.html`: editor stylesheet, ~55 icons, 6 script tags; CSP `img-src` also allows `blob:` (images from IndexedDB).
- `js/app.js`: one navigation entry ("Write → Editor") and `G E`.
- `js/desktop.js`: Go → Editor, new menu commands, save-before-close, daily documents backup, update notifications + Settings section, Ctrl+I/E/N belong to the editor while typing.
- `electron/main.js`: close handshake (page saves, then the window closes), PDF export IPC, `backup:write-docs`, `.md` save dialog, menu items, updater, optional `todo4meDataFolder` for test/beta builds.
- `electron/preload.js`: new bridge functions (PDF, open exported file, documents backup, before-close, updates).
- `package.json`: version 2.0.0, `electron-updater` dependency, `vendor/**` in the build, `publish` (GitHub `muelgerhbf/todo4me-releases`, draft), scripts `release` and `vendor`.
- `scripts/build.js`: `--publish` mode; also copies `latest.yml` + `.blockmap` to `dist/`.
- Tests: nav link count 11 → 12, bridge API list, settings card count, version from `package.json`.

### Step 19: Bugs found by the tests and fixed

1. **Undo restored slightly different markup** (e.g. `<strike>` vs `<s>`): `serialize()` now always returns the sanitized, canonical HTML, so storage, undo and redo are identical.
2. **`- ` after a heading turned the heading into a list:** deleting the typed `- ` left an empty text node; Chrome then moved the caret into the previous block. Fixed by cleaning the node and placing the caret explicitly.
3. **Toggling a table's header row lost the cursor** (the cells are replaced): the selection is restored by character offset.
4. **New documents from templates were not searchable** until first edited: search text is now computed when a document is created/imported.
5. **CSP warnings when pasting HTML with `onclick=`:** Chrome reports them while parsing; attributes are now renamed before parsing (quote-aware, values untouched). Nothing ever executed.
6. **Slash menu opened far above the caret** when there was little space below: placement + max height fixed.
7. Update E2E risk spotted before running it: after an update the installer restarts the app via Explorer (environment variables are lost), so a test build could have opened the real data folder. Fixed with `todo4meDataFolder` (test builds use `%APPDATA%\Todo4MeUpdateTest`). The real `%APPDATA%\Todo4Me` was backed up and verified unchanged by hash.

### Step 20: Tests

| Suite | Result |
|---|---|
| Original functional suite (Chrome) | 141/141 |
| Original functional suite (Electron) | 141/141 |
| Editor suite (Chrome, real typing/mouse via CDP, PDF text checked with pdf.js) | 155/155 |
| Desktop suite (Electron): security, menus, restart, backups, PDF export via IPC, close-save, documents backup, updates state | 52/52 |
| End-to-end update (build 2.0.0 + 2.0.1 → install → detect → download → install → verify data) | see Step 21 |

### Step 21: End-to-end update test

Isolated test identity (`Todo4MeUpdateTest`, own appId, own data folder via `todo4meDataFolder`, no shortcuts, installed to a temp folder,
uninstalled afterwards). Result **18/19**: 2.0.0 installs; the app finds 2.0.1 on a local feed after ~7 s, downloads it in the background,
shows "ready" + *Restart & install*; the installer replaces the app with 2.0.1; tasks, weekly notes and documents are all kept;
"Check for updates" then reports *latest*; with the feed offline the user gets "No connection to the update server…".
**Open point:** after the silent install the app was not restarted automatically in this (agent) environment, neither by the
installer (`ExecShellAsUser`) nor by the added PowerShell relaunch watcher. Data and version are correct; the user may have to start
Todo4Me once by hand after an update. To verify on a normal desktop session with the first real update (2.0.0 → 2.0.1).

### Step 22: Releasing 2.0.0 to colleagues

1. One-time: create the public repo `todo4me-releases`, create the token, set `GH_TOKEN` (README → *Ein Update veröffentlichen*).
2. Colleagues on 1.0.0 install `Todo4Me-Setup-2.0.0.exe` once (over the old version; data is kept).
3. From then on: raise the version, `npm run release`, publish the draft on GitHub.

### Step 23: Editor fixes from the user's feedback (2026-11-03, after pushing 2.0.0 to `main`)

Each problem was reproduced first in an isolated app instance (`TODO4ME_USER_DATA`, PDFs measured and rendered with pdf.js), then fixed and re-tested.

| Problem | Cause | Fix |
|---|---|---|
| PDF: text looks "right at the edge", unlike the editor | Not the margin itself (measured 25.4 mm, correct): `printToPDF` paints the page margins in the window's `backgroundColor` (#f6f6f8), so only the text area was white and the white box ended at the text. The text cursor was printed too, and header/footer sat 4 mm from the text instead of halfway into the margin as in the editor | `main.js` switches the window background to white while printing; print CSS paints `html` and `@page` white; header/footer/page numbers `vertical-align: middle` (like the editor page); focus and selection are removed during the export and restored afterwards |
| Ctrl + mouse wheel should zoom | Not implemented | `wheel` listener on the page area (non-passive, only with Ctrl; touchpad pinch included), zoom range 25–300 %, the point under the mouse stays put (also for the −/+ buttons, around the middle of the view) |
| Outline width slider could not be dragged | Every `input` event redrew the drawing and the context bar was rebuilt via `innerHTML`, which replaced the slider in the middle of the drag (the value jumped to 1 and stayed there) | No rebuild while a slider in the bar has focus; added −/+ buttons and a "N px" label; range 0–20 px (lines 1–20), matching the widget's sanitizer |

Tests: 141 functional + **166** editor (+ zoom, slider drag, −/+ and white paper) + 141 functional in Electron + **53** desktop, all passing.

---

## Part 5: Phase 1a (2026-11-04): the app reaches out on its own

Branch `feature/reminders-calendar`. Nothing committed, no version bump, no installer built: the changes are left in the working tree for review.

### Step 24: Reminders, tray, close to tray, start with Windows, global quick-capture hotkey

**What was built**

1. **Reminders.** New task field `reminder` (minutes before due; 0 = at due time; null = none) with a *Reminder* select in the task editor
   (at due time, 5/15/30 min, 1 hour, 1 day before) and a live hint ("Reminds you Nov 5, 1:30 PM"). Date-only tasks use the new setting
   `reminderTime` (default 09:00, *Settings → Tasks & planning*). A bell chip marks tasks with a reminder. The scheduler (`js/reminders.js`) runs in
   the page in both the browser and the desktop app.
2. **Notifications.** Desktop: Windows notification from the main process (`Notification`, with a *Snooze 10 min* button), click → window to the
   front + task editor opens. Browser: Web Notification API if the user allowed it (asked when a reminder is saved or via *Allow notifications*), otherwise
   nothing. In both, an in-app toast with *Open* / *Snooze 10 min* is always shown, so a reminder never depends on the OS notification appearing.
3. **Tray + close to tray.** Tray icon (click = open; menu *Open Todo4Me, Quick capture, New task, Quit Todo4Me*). Closing the window hides it;
   a one-time Windows notification explains this. Settings → Desktop app: *Keep running in the tray…* (default on), *Start Todo4Me when Windows starts*
   (default off, `app.setLoginItemSettings` with `--hidden`, starts hidden in the tray).
4. **System-wide hotkey** `Ctrl+Alt+Space` (globalShortcut) → window + Quick capture. Can be switched off or changed to one of four presets.
   If another program owns the shortcut, Settings shows "…is already used by another program". Unregistered on quit.

**Files**

New: `electron/background.js` (tray, close-to-tray decision, login item, hotkey, notifications, `desktop-settings.json`), `js/reminders.js`.
Changed: `electron/main.js` (quit vs. hide, session-end, `showWindow`, AppUserModelID via `background.init`), `electron/preload.js` (4 functions),
`js/storage.js` (task fields + `reminderTime`, sanitizing), `js/store.js` (recurring clone resets reminder bookkeeping), `js/tasks.js` (editor field, bell chip),
`js/settings.js` (reminder time + notification status/test), `js/desktop.js` (settings UI, tray/hotkey actions, notification clicks), `js/ui.js`
(toasts may have several buttons, `reminder` type), `index.html` (bell icon, script tag; the inline head script and its CSP hash are unchanged),
`css/styles.css`, tests, README.

**Decisions**

| Question | Decision | Why |
|---|---|---|
| Reminder model | Relative offset `reminder` (minutes before due), not an absolute `remindAt` | The reminder follows the task when it is rescheduled (editor, planner drag & drop, "move all to today") and recurring tasks need no extra logic: the next occurrence inherits the offset. An absolute time would go stale with every date change |
| "Never twice" | `reminderFired` = occurrence key `"dueDate dueTime|offset"` stored on the task, set *before* the notification is shown | Survives restarts, export/import, merge and syncs across tabs. A new due date or offset is a new key → a new reminder; the same occurrence can never fire again |
| Snooze | `reminderSnooze` (ISO time) on the task; Snooze button on the Windows toast (Electron 45 supports toast actions on Windows) **and** in the in-app toast | Toast buttons in unsigned apps only work while the app runs (it does: tray), and Windows can suppress toasts (Do not disturb), so the in-app button is the reliable path |
| Where the scheduler runs | In the page (`js/reminders.js`), exact `setTimeout` to the next reminder + a 30 s safety tick + a check when the page becomes visible | Same code for browser and desktop, has the data, testable with an injected clock (`check({ now })`, `setClock`, `setNotifier`). The window still exists when hidden in the tray, so the page keeps running. Hidden pages are throttled to ~1 timer/minute → accuracy about a minute |
| Notification mechanism (desktop) | Main-process `Notification` via a narrow bridge (`notify({id,title,body,snooze})`, validated: id pattern, length limits, control characters removed) | The renderer's `Notification` would need the session's permission handler loosened (all permissions are denied). Main-process notifications work while the window is hidden and report `show`/`failed`; objects are kept referenced so clicks are not lost |
| AppUserModelID | `app.setAppUserModelId(build.appId)` in the packaged app, `process.execPath` in dev | Windows attributes toasts to the Start-menu shortcut with that id; electron-builder's NSIS installer stamps `com.todo4me.app` on its shortcuts (`WinShell::SetLnkAUMI`) |
| Missed reminders | First check after start groups everything due: 2+ → one notification "N reminders missed"; more than 3 at once while running → one summary too | No flood after a weekend or after the PC wakes up |
| Hide vs. quit | `quitting` flag: set in `before-quit` (tray → Quit, File → Exit, `autoUpdater.quitAndInstall` all call `app.quit()`) and on the window's `query-session-end`/`session-end` (Windows shutdown/logoff, where `before-quit` is not emitted). The `close` handler hides only if `!quitting && closeToTray && tray exists`; otherwise the unchanged save-before-close handshake runs. The updater's `allowClose` path is untouched | One explicit rule; every real quit still flushes the editor and LocalStorage. If the tray icon can't be created, closing quits as before, so the app can never become unreachable |
| Desktop settings storage | `<userData>/desktop-settings.json`, read by the main process | Needed before the page loads (start hidden, register hotkey); per machine, so not in exports/imports |
| Start with Windows | Only in the installed app; not in the portable build (temp folder), dev runs or test runs (`TODO4ME_USER_DATA`) | Tests must never write the user's real Run registry key; the test stubs the call and checks its arguments |
| Hotkey presets | Ctrl+Alt+Space (default), Ctrl+Shift+Alt+Space, Ctrl+Alt+T, Ctrl+Shift+Alt+T; validated in main | `AltGr` = `Ctrl+Alt` on German keyboards: e.g. Ctrl+Alt+Q (@), +E (€), +M (µ) would break typing system-wide. Ctrl+Shift+Space and Ctrl+Alt+N are already used inside the app |
| Hotkey/tray while a dialog is open | Don't replace the dialog; focus Quick capture if it is already open, otherwise show a hint toast | Opening a modal closes the current one silently — a global hotkey must never throw away a half-typed task |

**Found while testing**

1. A page-side `window.close()` destroys the window without a cancellable `close` event, so the old test helper never exercised "close"
   like a user does. The tests now close via `BrowserWindow.close()` (= the X button) and quit via `app.quit()`, the tray menu or a simulated
   Windows session end. `restartGracefully(how)` in `tests/cdp-electron.mjs` returns whether the app really exited.
2. A reminder set for a time that had already passed only fired on the 30 s safety tick: `schedule()` looked only at future times. It now re-checks
   immediately when something is already due.
3. `process.mainModule` in the main-process inspector is Electron's bootstrap, so the tests reach `background.js` through the module cache.

**Tests** (exact results at the end of this step, `PDFTEXT` set)

| Suite | Before | Now |
|---|---|---|
| Functional (Chrome) | 141 | **183** (+ old data loads unchanged, sanitizing, export/import/merge keep reminders, scheduler with injected clock: due → once, snooze, reschedule, date-only, completed never, recurring, missed summary, burst summary, click opens task, live scheduler, editor/row/settings UI, browser without permission) |
| Editor (Chrome) | 166 | **166** |
| Functional (Electron) | 141 | **183** |
| Desktop (Electron) | 53 | **84** (+ bridge API, defaults, hotkey registered/re-registered/off, tray + menu, settings UI, validation, close hides + process alive, one-time hint, hotkey/tray open Quick capture/New task without replacing dialogs, login item stubbed, `--hidden`, real notification shown + click + Snooze action, missed summary after restart, settings persist, tray → Quit / File → Exit / Windows session end really quit and save the editor) |

All with 0 page errors.

**Not verified / open points**

- Real Windows toasts were shown (`show` event) from the dev build. Clicking a toast or its *Snooze* button by hand, the toast's appearance in the
  **installed** app (AppUserModelID `com.todo4me.app`) and the portable build (no shortcut with that id) were not tested by hand — the tests emit
  `click`/`action` on the notification object. If Windows does not show the toast, the in-app toast still appears.
- Start with Windows was tested with the registry call stubbed only; the real Run entry (`"…\Todo4Me.exe" --hidden`) needs one check on the installed app.
  Uninstalling does not remove the entry (turn the option off before uninstalling).
- A real Windows shutdown/logoff was simulated by emitting `query-session-end`/`session-end`, not performed.
- Pinned taskbar icons: setting the AppUserModelID explicitly makes the running window match the installer's shortcuts (`com.todo4me.app`);
  worth a glance after the next installed update.
- Browser: two open tabs could both show the same reminder if their checks run within the same moment (the second normally sees the first one's
  `reminderFired` through the storage event first).
