# Todo4Me: Project Log

What was built, in which order, which decisions were made and why, what went wrong and how it was fixed.
Written at the end of day 1 (2026-11-02) as the starting point for day 2: **building Todo4Me for iPad and MacBook.**

---

## Quick status

| | |
|---|---|
| Project folder | `C:\dev\todo4me` |
| Web app | Done. Runs in any browser by opening `index.html` |
| Windows desktop app | Done. `dist\Todo4Me-Setup-1.0.0.exe` (installer) and `dist\Todo4Me-1.0.0-portable.exe` |
| Tests | 141 functional + 32 desktop checks, all passing in Chrome, Electron dev, the portable exe and the installed app |
| Mac / iPad | Not started; planned for day 2 (see the last section) |

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
