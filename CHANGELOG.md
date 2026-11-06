# Changelog

All notable changes to Todo4Me (Windows desktop app and web app) are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versioning follows [Semantic Versioning](https://semver.org/).
Release tags use the prefix `windows-v`.

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

[2.1.1]: https://github.com/muelgerhbf/todo4me/releases/tag/windows-v2.1.1
[2.1.0]: https://github.com/muelgerhbf/todo4me/releases/tag/windows-v2.1.0
[2.0.1]: https://github.com/muelgerhbf/todo4me/releases/tag/windows-v2.0.1
[2.0.0]: https://github.com/muelgerhbf/todo4me/releases/tag/windows-v2.0.0
[1.0.0]: https://github.com/muelgerhbf/todo4me/releases/tag/windows-v1.0.0
