# Changelog

All notable changes to Todo4Me (Windows and Linux desktop apps and web app) are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versioning follows [Semantic Versioning](https://semver.org/).
Release tags use the prefix `v` (versions up to 2.3.0 use the former prefix `windows-v`).

## [2.8.0] - 2026-11-12

### Added
- **The document editor is now a document and knowledge workspace.** Everything below works offline in the browser and in the desktop app.
- **Knowledge:** `[[wiki links]]` with autocomplete (`Ctrl/Cmd+click` opens the target), a **backlinks panel** with linked and unlinked mentions (`Ctrl+Shift+B`), tags and properties per document, nested **folders** with drag and drop in the new **Library** panel, archive and recent views, **daily notes** (`Ctrl+Alt+D`), a **graph view** of all documents and links, and search filters `tag:`, `folder:`, `is:archived`, `links:`.
- **Writing:** find and replace (`Ctrl+F` / `Ctrl+H`; case, whole word, regular expressions), an **outline panel** (`Ctrl+Shift+O`), a live **table of contents**, **statistics** (words, characters, reading and speaking time, readability estimate for English and German), a writing goal and **focus mode** (`Ctrl+Shift+F`) with dimming, typewriter scrolling and full screen.
- **Versions:** automatic and named versions (`Ctrl+Alt+S`), a **history panel** (`Ctrl+Shift+H`) with preview, **restore** (undoable), **restore as copy**, a **word-level compare** (side by side or inline), and **crash recovery** of unsaved changes.
- **Import and export:** **Word `.docx` export and import** (styles, lists, tables, images, real Word equations, footnotes, headers and footers, page setup) with a **conversion report** (nothing is dropped silently), plus HTML, TXT and RTF export. Markdown now round-trips checklists, Obsidian callouts and footnotes.
- **Layout:** A3 and custom page sizes and margins in mm, header and footer with left, center and right slots, page colour and a page preview, **checklists** (`[ ]` shortcut, *Create task from item*), **callouts** (note, tip, info, warning, danger) and **footnotes** (printed as endnotes).
- **Interaction:** floating selection toolbar (`Alt+F10`), **command palette** (`Ctrl+Shift+P`), context menu (right-click in the desktop app, `Shift+F10`), grouped fuzzy slash menu, block drag handle and `Alt+Shift+Up/Down` to move blocks, a keyboard shortcuts dialog (`Ctrl+/`) and a keyboard-navigable toolbar.
- Developer: editor extension API `T4.edx` (`js/editor-registry.js`) and feature modules `js/ed-*.js`, documented in `docs/EDITOR-EXTENSIONS.md`; one test suite per module (`tests/editor-*.mjs`), all run by `tests/test-editor.mjs`.

### Changed
- README: new section "Documents & knowledge workspace" with new screenshots; refreshed editor screenshots.
- The editor test suite (`tests/test-editor.mjs`) now runs all module suites including the QA suite and takes noticeably longer.

### Notes
- **The document database is upgraded to version 2 automatically** on first start (new stores for versions and small module state). Existing documents stay unchanged. Versions stay on this device and are not part of document exports or the daily backup.
- **Downgrading:** after the upgrade, Todo4Me 2.7.0 or older cannot open the document database any more (it falls back to a temporary in-memory mode). Keep 2.8.0 or newer. Tasks and notes are not affected.
- **Known limits:** footnotes print as endnotes (no footnotes at the bottom of each page), no multi-column layout and no per-section page formats, no real-time collaboration or cloud sync (Todo4Me is offline by design), and the table of contents in a PDF has no page numbers.

## [2.7.0] - 2026-11-11

### Added
- **Simple and Advanced mode.** Todo4Me now has two interface modes, switchable at any time at the top of *Settings*, instantly and without data loss (a mode only hides or shows parts of the interface; your data is never changed). *Simple* shows a sidebar with Today (start page), Upcoming, Inbox, My Tasks, Weekly Planner, Weekly Notes and Settings, plus a "More features? Switch to Advanced" link (with Undo). The task form shows title, date/time, priority and reminder, the rest under "More options" (opened automatically when a task already uses those fields). The Weekly Planner shows the day lists only (the calendar view is Advanced). Hidden pages stay reachable through keyboard shortcuts, the desktop menu and links. *Advanced* is everything as before. Names: Einfach/Erweitert (DE), Basit/Gelişmiş (TR), Simple/Avanzado (ES).
- **First start:** new users choose the mode (Simple recommended). Existing users stay in Advanced after the update.
- **Quick add:** the input shows an example of the quick-add syntax and has a "?" button with a short help, in both modes.
- New test suite `tests/functional-modes.mjs` (78 checks) and `tests/functional-modes-ui.mjs`; the test harnesses seed the mode via `window.__T4_FIRST_RUN_MODE` (opt-out: `sessionStorage['t4.test.noSeed'] = '1'`).

### Changed
- README: new section "Simple and Advanced mode", updated screenshots.

## [2.6.1] - 2026-11-11

### Fixed
- **Weekly Planner calendar at large text size:** at a text size of 125 % the hour labels slid out of the calendar on the left. The time column now grows with the text size, so the labels stay inside and aligned. The day columns keep a minimum width and the calendar scrolls sideways (the time column stays visible) instead of squeezing the days. The "To schedule" panel now moves below the calendar up to a window width of 1280 px (before 1100 px), which gives the calendar more room.
- **Desktop app zoom:** `Ctrl++` (also `Ctrl+=` and numpad `+`) now zooms in on all keyboard layouts; before, only `Ctrl+-` worked (on German keyboards, for example). `Ctrl+-` zooms out and `Ctrl+0` resets. The steps are 50 to 300 % like in Chrome, and the View menu uses the same steps. The zoom level is remembered across restarts (stored in `desktop-settings.json` in the app's data folder, not in your task data).

## [2.6.0] - 2026-11-09

### Changed
- **New "Tangram" logo and app icon:** a square cut into five pieces whose gaps write a "4" (Todo4Me). The app icon is a purple tile with the mark; size-specific artwork for 16, 24, 32, 48, 64, 128, 256, 512 and 1024 px (thinner cuts at small sizes keep it readable), matching tray icons, a new favicon and the new brand mark at the top of the in-app sidebar.
- The README header and screenshots show the new logo.
- Note: Windows and Linux may keep showing the old icon for a while (taskbar, shortcuts, launcher) until the icon cache refreshes; restart the app or log out and in again.

### Added
- `scripts/build-icons.mjs`: generates all icons (`build/icon.ico`, `build/icons/`, `build/icon.png`, tray icons `assets/icons/tray-*.png`) and the brand images from `build/brand/`.
- `docs/brand/`: logo lockups for light and dark backgrounds, GitHub social preview image and the mark as SVG.

## [2.5.0] - 2026-11-08

### Added
- **Linux deb and rpm update themselves in the app**, like Windows: Todo4Me checks shortly after start and every 4 hours, downloads the new `.deb`/`.rpm` in the background (no password needed) and verifies its SHA-512 against `latest-linux.yml`. On *Restart & install* the standard polkit dialog (`pkexec`) asks for the system password, the package is installed with apt-get/dpkg (deb) or dnf/zypper/rpm (rpm), and Todo4Me restarts into the new version.
- Developer: `node scripts/build.js deb --test-variant --version 2.5.0-test.1` builds a side-by-side test package `todo4me-test` (own `/opt` folder, own data folder `Todo4Me-Test`, own desktop entry) for end-to-end update tests with a local feed (`TODO4ME_UPDATE_URL`).

### Changed
- On Linux there is no silent install at quit (it would surprise with a password prompt); the update is installed only when you click *Restart & install*.
- Cancelling the password dialog shows "not installed, try again later" and does not prompt again. If `pkexec` is missing (minimal systems), Todo4Me shows a hint to download the package from the releases page.
- tar.gz is unchanged (hint to download manually); the AppImage still updates itself.
- **One-time step:** users of the 2.4.0 deb/rpm must install 2.5.0 once manually (2.4.0 had no deb/rpm self-update). From 2.5.0 on, updates are automatic.

### Security
- The file's SHA-512 is checked again right before the elevated install.
- The packages are not GPG-signed. Integrity relies on the SHA-512 from the GitHub release feed over HTTPS (same trust as the unsigned Windows installer, but the Linux install runs as root).

## [2.4.0] - 2026-11-08

### Added
- **Linux version:** `Todo4Me-<version>-x86_64.AppImage`, `Todo4Me-<version>-amd64.deb`, `Todo4Me-<version>-x86_64.rpm` and `Todo4Me-<version>-x64.tar.gz`. The AppImage updates itself (`latest-linux.yml`); deb, rpm and tar.gz show a hint to download the new version from the releases page.
- Linux specifics: data in `~/.config/Todo4Me`; tray icon and global quick-capture hotkey are off by default (GNOME needs the AppIndicator extension, Wayland usually blocks global shortcuts); *Start at login* uses `~/.config/autostart/todo4me.desktop`. deb and rpm install an AppArmor profile (Ubuntu 23.10+); the AppImage starts with `--no-sandbox` automatically where Ubuntu restricts unprivileged user namespaces.
- GitHub Actions workflow that builds the Windows and Linux files when a tag `v*` is pushed and creates a draft release.

### Changed
- Release tags now use the prefix `v` (e.g. `v2.4.0`) instead of `windows-v`; older tags keep their names. Windows auto-update is not affected: it reads the latest release and `latest.yml`, not the tag name.
- The test harness runs on Linux and Windows.

## [2.3.0] - 2026-11-06

### Added
- **Designs:** 6 new looks besides Classic, each with its own character – Tokio, Development, Office, Aubergine, Fjord and Paper (palette, font, corners, sidebar style; all text pairs at least 4.5:1 contrast).
- **Settings → Appearance & customization:** design gallery with previews, mode, accent (design, presets or any color), font, corners, density, text size 85–125 %, sidebar editor, language, and reset with Undo.
- **Customizable sidebar:** hide views and change their order within each group; Dashboard and Settings always stay. Hidden views remain reachable by link and shortcut.
- **Languages:** Deutsch, Türkçe and Español besides English, including dates, plurals, the document editor and the desktop menu, tray and notifications. *Automatic* follows the system language.

### Changed
- Colors, fonts, corners and spacing are design tokens now; the Classic look is unchanged.

## [2.2.0] - 2026-11-06

### Added
- **Flexible recurrence:** every n days, weeks, months or years; every weekday; specific weekdays (e.g. Mon, Wed, Fri); a day of the month or the last day; optionally counted from the completion date instead of the due date.
- Task editor: the *Repeat* field offers presets matched to the due date (Daily, Every weekday, Weekly on …, Every 2 weeks on …, Monthly on the …, Yearly on …) and a *Custom…* panel with a live preview.
- Quick-add: `every monday`, `every mon,wed,fri`, `every 2 weeks`, `every other friday`, `every 15th`, `every last day`, `every 3 days after done`, and the shorthands `*daily`, `*weekly`, `*monthly`, `*yearly`, `*weekdays`. Without an `@date`, the due date becomes the first matching day.

### Changed
- Existing Daily/Weekly/Monthly tasks and older backups are converted automatically; nothing is lost.

### Fixed
- Quick-add: after adding a task, the field kept the text, so a second task was appended to the first one (since 1.0.0).

## [2.1.2] - 2026-11-06

### Added
- **Update button** at the top of the sidebar (like VS Code), in the user's accent color: appears once an update is downloaded; one click saves, installs and restarts. Replaces the 30-second "Restart now" notice.

### Changed
- Updates are now published as releases of this repository (`muelgerhbf/todo4me`) instead of the former `todo4me-releases`. Versions 2.0.0–2.1.1 must install 2.1.2 once manually.
- License: MIT.
- All repository documentation is now in English.

### Fixed
- Sidebar items (e.g. *Quick capture*) were squeezed on short windows; the sidebar now scrolls instead.

## [2.1.1] - 2026-11-06

### Fixed
- Monthly recurring tasks no longer drift to the 28th (e.g. due on January 31): the next due date is now calculated from the original date.
- Quick-add: tags and categories with umlauts (`#büro`, `#einkäufe`) no longer remain in the title.
- Quick-add: `@month` or `@satire` are no longer interpreted as Monday or Saturday; `@fri`, `@thurs` and `@friday` still work.
- Updates are also installed while Todo4Me runs in the notification area (tray): if an update is ready and the window is hidden, a Windows notification appears; one click saves everything and restarts.
- Daily backups are also created when Todo4Me runs in the tray for days (checked every 15 minutes for a new day).

### Known limitation
- If a monthly task is completed on the last day of a short month (February 28), the next due date is counted from that date (March 28) and not from the original 31st.

## [2.1.0] - 2026-11-04

### Added
- Reminders: new task field "Reminder" (at the due time, 5/15/30 minutes, 1 hour or 1 day before), bell icon on the task, default time for tasks without a time in the settings. Windows notification with "10 min later"; in the browser a web notification, plus always an in-app notice.
- Tray icon with menu (Open, Quick capture, New task, Quit) and "Keep running in tray" when closing the window.
- Optional autostart with Windows (starts hidden in the tray).
- Global quick-capture shortcut `Ctrl+Alt+Space` (can be turned off, four presets to choose from).
- Calendar view in the weekly planner (Days | Calendar toggle, day or week): tasks as time blocks, move and resize by mouse, keyboard and touch, each with "Undo".
- Calendar subscriptions (read-only): Outlook and Google calendars via ICS link or local `.ics` file, own dependency-free ICS parser, "Calendar today" card on the dashboard.

### Changed
- Installer file names and docs updated to version 2.1.0; the desktop tests find the background module regardless of the install path.

## [2.0.1] - 2026-11-03

### Fixed
- PDF export: page margins were painted in the window background color; the PDF is now generated on white paper without a text cursor, and header and footer sit in the middle of the margin as on the editor page.
- Shapes in the editor: the line width slider could not be dragged. There are now also -/+ buttons and a px display (0 to 20 px).

### Added
- Editor: zoom with Ctrl + mouse wheel or touchpad pinch around the mouse pointer (25 to 300 %).

## [2.0.0] - 2026-11-03

### Added
- Document editor with its own engine: formatting, fonts, tables, images, shapes, charts, formulas (KaTeX), code blocks with syntax highlighting (Prism, incl. C#), undo/redo for all changes.
- Markdown import and export as well as PDF export (printed from the same page, with header/footer and page numbers).
- Documents are stored separately from tasks in IndexedDB; a separate daily backup (`documents-YYYY-MM-DD.json`, 14 days).
- Automatic updates via `electron-updater` and the public repository `todo4me-releases` (background download, "Restart now").
- Bundled fonts Fira Code and Carlito (SIL OFL).

## [1.0.0] - 2026-11-02

### Added
- First version: web app and Windows desktop app (installer and portable version, Electron).
- Dashboard, Inbox, My Tasks, Today, Upcoming, Weekly planner, Daily plan, Weekly notes, Focus mode with Pomodoro, Statistics, Settings.
- Tasks with subtasks, recurrence and undo; quick-add (`!1`, `#work`, `@fri`).
- Light/dark mode, accent colors, responsive layout, keyboard shortcuts.
- Data safety: check on load, daily backup (14 days), damaged data is isolated and restored from the backup; data is stored at a fixed location in `%APPDATA%\Todo4Me`.

[2.8.0]: https://github.com/muelgerhbf/todo4me/releases/tag/v2.8.0
[2.7.0]: https://github.com/muelgerhbf/todo4me/releases/tag/v2.7.0
[2.6.1]: https://github.com/muelgerhbf/todo4me/releases/tag/v2.6.1
[2.6.0]: https://github.com/muelgerhbf/todo4me/releases/tag/v2.6.0
[2.5.0]: https://github.com/muelgerhbf/todo4me/releases/tag/v2.5.0
[2.4.0]: https://github.com/muelgerhbf/todo4me/releases/tag/v2.4.0
[2.3.0]: https://github.com/muelgerhbf/todo4me/releases/tag/windows-v2.3.0
[2.2.0]: https://github.com/muelgerhbf/todo4me/releases/tag/windows-v2.2.0
[2.1.2]: https://github.com/muelgerhbf/todo4me/releases/tag/windows-v2.1.2
[2.1.1]: https://github.com/muelgerhbf/todo4me/releases/tag/windows-v2.1.1
[2.1.0]: https://github.com/muelgerhbf/todo4me/releases/tag/windows-v2.1.0
[2.0.1]: https://github.com/muelgerhbf/todo4me/releases/tag/windows-v2.0.1
[2.0.0]: https://github.com/muelgerhbf/todo4me/releases/tag/windows-v2.0.0
[1.0.0]: https://github.com/muelgerhbf/todo4me/releases/tag/windows-v1.0.0
