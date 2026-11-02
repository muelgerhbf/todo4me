# Todo4Me

A personal productivity dashboard for daily tasks, priorities, weekly planning and weekly notes.
It runs as a **Windows desktop app** (Electron) or directly in your browser. It needs no backend and no account.

## Desktop-App für Windows

Todo4Me gibt es als normale Windows-11-Anwendung mit Installer, Desktop-Verknüpfung und Startmenü-Eintrag.
Sie läuft vollständig offline. Die Web-App selbst ist unverändert: Electron zeigt dieselben Dateien (`index.html`, `css/`, `js/`) in einem eigenen Fenster an.

### Installieren (für Anwender)

| Datei in `dist/` | Verwendung |
|---|---|
| `Todo4Me-Setup-1.0.0.exe` | **Installer.** Doppelklicken und den Schritten folgen. Erstellt eine Desktop-Verknüpfung und einen Startmenü-Eintrag. Deinstallation über *Einstellungen → Apps*. Keine Admin-Rechte nötig. |
| `Todo4Me-1.0.0-portable.exe` | **Portable Version.** Ohne Installation starten, z. B. vom USB-Stick. Der Start dauert ein paar Sekunden länger, weil die App zuerst in einen temporären Ordner entpackt wird. |

> **Windows SmartScreen:** Die `.exe`-Dateien sind nicht digital signiert (dafür wäre ein kostenpflichtiges Code-Signing-Zertifikat nötig).
> Beim ersten Start kann deshalb „Der Computer wurde durch Windows geschützt“ erscheinen. Dann **Weitere Informationen → Trotzdem ausführen** wählen.

### Wo werden die Daten gespeichert?

- Alle Daten liegen im LocalStorage der App, im festen Ordner **`%APPDATA%\Todo4Me`** (z. B. `C:\Users\<Name>\AppData\Roaming\Todo4Me`).
  Installierte und portable Version nutzen **denselben** Ordner und sehen daher dieselben Daten.
- Updates, Neuinstallation und **Deinstallation löschen diese Daten nicht.**
- Zusätzlich schreibt die Desktop-App **einmal täglich eine JSON-Sicherungsdatei** nach `%APPDATA%\Todo4Me\backups`. Die letzten 14 Tage werden aufbewahrt.
  Es zählt immer der Stand beim ersten Start des Tages, ein späteres Missgeschick am selben Tag überschreibt ihn also nicht.
  Jede dieser Dateien lässt sich über **Import JSON** wiederherstellen. Den Ordner öffnest du über *Datei → Open backups folder* oder unter *Settings → Desktop app*.
- Es läuft immer nur **eine** Instanz. Ein zweiter Start bringt das vorhandene Fenster nach vorne, damit nie zwei Fenster gleichzeitig dieselben Daten schreiben.

### Daten aus der Browser-Version übernehmen

Die Desktop-App kann den LocalStorage deines Browsers technisch nicht direkt lesen (jeder Browser hat seinen eigenen, geschützten Speicher).
Die Übernahme dauert eine Minute, und **nichts wird automatisch überschrieben oder gelöscht**:

1. Die alte Version im Browser öffnen (`index.html`) → **Settings → Export JSON**. Die Datei `todo4me-backup-JJJJ-MM-TT.json` wird gespeichert.
2. Die Desktop-App öffnen → **Settings → Import JSON** (oder *Datei → Import data*, `Strg+I`) → die Datei auswählen.
3. **Merge** wählen: Vorhandene Daten bleiben erhalten, die importierten kommen hinzu.
   *Replace all* ersetzt alles und fragt vorher ausdrücklich nach.

Die Daten im Browser bleiben dabei unverändert. Solange die Desktop-App noch leer ist, weist sie beim Start mit einem Hinweis auf diesen Weg hin.

### Menü und Tastenkürzel der Desktop-App

Alle bisherigen Tastenkürzel (`N`, `Q`, `/`, `G` + Buchstabe …) funktionieren weiter. Zusätzlich gibt es das Menü:

| Menü | Kürzel |
|---|---|
| File → New task / Quick capture / New weekly note | `Strg+N` / `Strg+Umschalt+Leertaste` / `Strg+Umschalt+N` |
| File → Export data / Import data | `Strg+E` / `Strg+I` |
| File → Open backups folder / Open data folder | |
| Go → Dashboard … Focus Mode / Settings | `Strg+1` … `Strg+9` / `Strg+,` |
| View → Zoom, Vollbild, Neu laden | `Strg+Plus/Minus/0`, `F11`, `Strg+R` |

### Entwicklung

Voraussetzung: [Node.js](https://nodejs.org) 20 oder neuer.

```bash
npm install              # einmalig: Electron + electron-builder installieren
npm start                # Desktop-App aus dem Quellcode starten
npm run dev              # wie start, zusätzlich mit geöffneten DevTools
```

Änderungen an `index.html`, `css/` oder `js/` siehst du nach **Strg+R** im App-Fenster.

> Falls `npm install` meldet, dass Install-Skripte blockiert wurden (npm 11) und `npm start` „Electron failed to install correctly“ zeigt,
> einmalig `node node_modules/electron/install.js` ausführen. Das lädt das Electron-Programm herunter.

### Windows-Installer und Portable-Version bauen

```bash
npm run build            # beides: Installer + Portable
npm run build:installer  # nur Todo4Me-Setup-<version>.exe
npm run build:portable   # nur Todo4Me-<version>-portable.exe
npm run pack             # nur entpackte App in dist/win-unpacked (zum schnellen Testen)
```

Die fertigen Dateien liegen danach in **`dist/`** im Projektordner. Der erste Build lädt einmalig Werkzeuge (NSIS, Electron für Windows) herunter, danach geht es schneller.
Die Versionsnummer steht in `package.json` (`"version"`) und erscheint im Dateinamen.

`scripts/build.js` lässt electron-builder in einem temporären Ordner außerhalb des Projekts arbeiten und kopiert nur die fertigen `.exe`-Dateien nach `dist/`.
Grund: Ist das Projekt in VS Code geöffnet, öffnet VS Code (selbst eine Electron-App) neu entstehende `.asar`-Dateien und sperrt sie.
Ein direkter Build in den Projektordner bricht dann mit `EBUSY`/`EPERM` ab.

### Aufbau der Desktop-Integration

```
electron/main.js     Hauptprozess: Fenster, fester Datenordner, Einzelinstanz, Menü,
                     Speichern-Dialog für Exporte, tägliche Sicherungsdatei, Sicherheitsregeln
electron/preload.js  Minimale, fest definierte Schnittstelle window.todo4meDesktop (contextBridge)
js/desktop.js        Verbindet Menü, Sicherungsdateien und Migrationshinweis mit der Web-App.
                     Ohne Electron (im Browser) tut die Datei nichts.
scripts/start.js     Startet Electron für npm start/dev
scripts/build.js     Build-Skript (siehe oben)
build/icon.png       App-Icon (aus assets/icons/favicon.svg erzeugt), electron-builder macht daraus die .ico
```

**Sicherheit:** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- Die Seite hat keinen Zugriff auf Node.js, sondern nur auf die vier Funktionen aus `preload.js`.
- Navigation weg von der App und neue Fenster werden blockiert. `http(s)`-Links öffnen im Standardbrowser.
- Alle Berechtigungsanfragen (Kamera, Mikrofon, Standort …) werden abgelehnt.
- Eine Content-Security-Policy in `index.html` erlaubt nur lokale Dateien.
  Das kleine Inline-Skript im `<head>` ist per SHA-256-Hash freigegeben. Wer es ändert, muss den Hash in der CSP anpassen.

## Running it in the browser

**Option 1: just open it.** Double-click `index.html` (or drag it into Chrome, Edge, Firefox or Safari).
Everything works over `file://`.

**Option 2: serve it locally** (recommended if you want a stable URL or plan to install it on several devices on your network):

```bash
# any static server works, for example:
python -m http.server 8080        # then open http://localhost:8080
npx serve .                        # or this, if you have Node.js
```

> Data is stored per browser *and* per origin. `file:///…/index.html` and `http://localhost:8080`
> keep separate data. Pick one, or move data between them with Export/Import.

## Features

| Area | What you can do |
|---|---|
| **Dashboard** | Greeting, date and summary · stats for today (total / completed / remaining / overdue) · progress ring · **Daily Top 3** and main goal · today's tasks · important deadlines · this week's progress, upcoming tasks and notes · quick capture |
| **Inbox** | Capture tasks without a date, priority or category · one click to schedule for Today or Tomorrow, organize in the editor, or move to My Tasks |
| **My Tasks** | Search (title, description, notes, tags, subtasks, category) · filter by status, priority, category, due date and tag · sort by priority, due date, creation date, title or status |
| **Today / Upcoming** | Today's tasks plus overdue ones (with "move all to today") · the next 14 days grouped by day, then "Later" |
| **Tasks** | Title, description, notes, priority (Critical / High / Medium / Low / none), status (To do / In progress / Completed), category, tags, due date, optional time, estimate, subtasks, recurrence (daily / weekly / monthly), created and completed timestamps · undo for completing and deleting |
| **Weekly Planner** | Monday–Sunday (or Sunday–Saturday) columns · previous/next week navigation · inline add per day · **drag and drop** to reschedule · click a day for details · the week's notes |
| **Daily Plan** | For any date: main goal, Top 3, that day's tasks, daily notes and reflection. Saves automatically as you type |
| **Weekly Notes** | Notes with a title, text, tags and pin, assigned to a week · grouped by week · search and filter by tag, week or pinned · kept separate from tasks |
| **Focus Mode** | Distraction-free view of a single task with its description and checklist · Pomodoro timer (25/5 by default, configurable) with start, pause and reset. The timer keeps running across page refreshes |
| **Statistics** | Completed today / this week / this month · completion rate · day streak · per-day chart for this week · 8-week trend · open tasks by priority · progress by category |
| **Settings** | Your name, light / dark / system theme, accent color, default sorting, start of week, Pomodoro lengths, categories (add / rename / recolor / delete), export, import, restore auto-backup, sample data, reset |

### Quick-add syntax

Every "Add a task…" field (and Quick capture) understands:

| Token | Meaning |
|---|---|
| `!1` `!2` `!3` `!4` (or `!critical`, `!high`, `!medium`, `!low`, `!c`, `!h`, `!m`, `!l`) | priority |
| `#work` | category (name or prefix). If no category matches, it becomes a **tag** |
| `@today` `@tomorrow` `@mon`…`@sun` `@nextweek` `@2026-12-24` | due date |

Example: `Send invoice !2 #work @fri`

In the Inbox, a token that sets a date, priority or category automatically files the task into My Tasks.

### Keyboard shortcuts

| Key | Action |
|---|---|
| `N` | New task |
| `Q` | Quick capture to Inbox |
| `/` | Focus the search box (My Tasks, Weekly Notes) |
| `G` then `D` / `I` / `M` / `T` / `U` / `W` / `P` / `O` / `F` / `S` | Go to Dashboard / Inbox / My Tasks / Today / Upcoming / Week planner / daily Plan / nOtes / Focus / Stats |
| `Ctrl/⌘ + Enter` | Save the open task or note form |
| `Esc` | Close a dialog, or exit Focus Mode |

## Your data: saving, backup and restore

- **Automatic saving.** Every change is written to `localStorage` immediately. The sidebar footer shows when the last save happened, and warns if a save fails (for example, storage is full).
- **Automatic backup.** A second copy (`todo4me.backup.v1`) is refreshed at most once a day. If the main data ever becomes unreadable, the app restores this backup on startup. The damaged copy is kept under `todo4me.corrupt.<timestamp>` rather than deleted, and you are told what happened. You can also restore the backup manually from **Settings → Restore auto-backup**.
- **Validation.** All data (from storage or from an import) passes through a sanitizer. Unknown fields are dropped, invalid values fall back to safe defaults, and items that cannot be repaired are skipped and reported.
- **Multiple tabs** stay in sync: a change in one tab updates the others.
- **Every destructive action is confirmed** (delete task, note or category; import with replace; restore backup; reset).

### Export (backup)

**Settings → Data & backup → Export JSON** downloads `todo4me-backup-YYYY-MM-DD.json` with all tasks, notes, categories, daily plans, settings and statistics.

### Import (restore or move to another device)

**Settings → Data & backup → Import JSON**, then choose a file. You'll see what the file contains and can pick:

- **Merge**: keeps your current data and adds the file's items. When the same item exists in both, the one updated most recently wins. Your current settings are kept.
- **Replace all**: (asks for confirmation) replaces everything, including settings, with the file's contents.

### Reset

**Settings → Reset all data** deletes everything Todo4Me has stored in this browser (export first if you might need it).

## Project structure

```
todo4me/
├── index.html            App shell, icon sprite (inline SVG), dialogs, script includes
├── package.json          Desktop app: npm scripts + electron-builder configuration
├── electron/
│   ├── main.js           Electron main process (window, data folder, menu, backups, security)
│   └── preload.js        Minimal bridge exposed as window.todo4meDesktop
├── scripts/
│   ├── start.js          npm start / npm run dev
│   └── build.js          npm run build (installer + portable → dist/)
├── build/icon.png        App icon used by electron-builder
├── assets/icons/
│   ├── favicon.svg
│   └── icon.png          Window icon
├── css/
│   └── styles.css        Design tokens (light/dark), components, views, responsive rules
└── js/
    ├── utils.js          Date helpers (local YYYY-MM-DD), HTML escaping, DOM helpers
    ├── storage.js        Schema defaults, validation/sanitizing, storage adapter, backup, import/export/merge
    ├── store.js          In-memory state, all mutations (commit → save → notify), selectors
    ├── ui.js             Action registry, modal, confirm dialog, toasts, progress components
    ├── tasks.js          Task row/editor/quick capture, quick-add parser; Inbox, My Tasks, Today, Upcoming views
    ├── dashboard.js      Dashboard view, Top 3 card and picker
    ├── planner.js        Weekly planner (drag & drop, day details) and Daily Plan view
    ├── notes.js          Weekly notes view and editor
    ├── focus.js          Focus mode and Pomodoro timer
    ├── stats.js          Statistics view and charts
    ├── settings.js       Settings view, theme, categories, export/import, sample data
    ├── app.js            Router (hash-based), navigation, event delegation, shortcuts, boot
    └── desktop.js        Desktop-only additions (inactive in the browser)
```

### Architecture notes

- **Plain JavaScript (ES2020) with no build.** The files are classic scripts that share one `window.T4` namespace instead of ES modules, so the app also works when opened directly from disk (`file://`), where browsers block module imports.
- **One-way data flow.** Views are functions `render(params) → HTML string`. Every change goes through `T4.store.commit()`, which saves to storage and notifies the app, which then re-renders the current view. Focus and half-typed quick-add text are preserved across re-renders.
- **Event delegation.** Interactive elements declare `data-action="name"` (clicks), `data-form` (submits), `data-input` / `data-change` (inputs). Modules register handlers with `T4.ui.on(name, fn)`.
- **All user content is HTML-escaped** before rendering.
- **Backend-ready.** Persistence is isolated in `storage.js` behind an adapter with `load(key)` / `save(key, value)` / `remove(key)`. To sync with a server, implement those (or swap `load`/`save` for API calls) and call `T4.storage.setAdapter(adapter)`. Every entity already has a stable string `id` and `createdAt`/`updatedAt` timestamps, and `storage.merge()` already does last-write-wins reconciliation.

## Data model (JSON)

Everything is stored as one JSON document under the `localStorage` key `todo4me.data.v1`. Exports use the same shape, plus `app` and `exportedAt`.
Dates are local calendar dates (`"YYYY-MM-DD"`), times are `"HH:MM"` (24h), and timestamps are ISO-8601 strings.

```jsonc
{
  "version": 1,
  "tasks": [Task],
  "categories": [Category],
  "notes": [Note],
  "dailyPlans": { "YYYY-MM-DD": DailyPlan },
  "settings": Settings,
  "stats": Stats,
  "meta": { "createdAt": "ISO", "updatedAt": "ISO" }
}
```

### Task

```jsonc
{
  "id": "task_lz1k2…",           // unique string
  "title": "Finish quarterly report",   // required, ≤ 500 chars
  "description": "",
  "notes": "",
  "status": "todo",              // "todo" | "in_progress" | "done"
  "priority": "high",            // "critical" | "high" | "medium" | "low" | null (none)
  "categoryId": "cat_work",      // Category.id or null
  "tags": ["q4", "reports"],     // lowercase, unique, ≤ 20
  "dueDate": "2026-11-02",       // or null
  "dueTime": "15:00",            // or null (only kept when dueDate is set)
  "estimate": 90,                // minutes (1–1440) or null
  "subtasks": [{ "id": "sub_…", "title": "Collect numbers", "done": true }],
  "recurrence": null,            // "daily" | "weekly" | "monthly" | null
  "inbox": false,                // true = captured but not organized yet
  "nextOccurrenceId": null,      // set once a recurring task spawned its successor
  "createdAt": "2026-11-02T08:12:00.000Z",
  "updatedAt": "2026-11-02T09:30:00.000Z",
  "completedAt": null            // set when status becomes "done"
}
```

**Recurring tasks:** completing one creates the next occurrence (subtasks reset), dated at the first interval after today. Reopening and re-completing never creates duplicates.

### Category

```jsonc
{ "id": "cat_work", "name": "Work", "color": "#2f6fed" }
```

Defaults: Work, Personal, Health, Shopping, Learning, Other. Deleting a category keeps its tasks, which end up with `categoryId: null`.

### Note

```jsonc
{
  "id": "note_…",
  "title": "Ideas for the launch",   // title or body required
  "body": "Free text, line breaks preserved",
  "weekOf": "2026-11-02",            // start date of the week the note belongs to
  "tags": ["ideas"],
  "pinned": true,                    // pinned = important; shown first and on the dashboard
  "createdAt": "ISO",
  "updatedAt": "ISO"
}
```

Notes are grouped by the week that contains `weekOf`, using the current *start of week* setting.

### DailyPlan

```jsonc
{
  "date": "2026-11-02",
  "goal": "Send the quarterly report",
  "top3": ["task_a", "task_b", "task_c"],   // up to 3 existing task ids, in order
  "notes": "",
  "reflection": "",
  "updatedAt": "ISO"
}
```

### Settings

```jsonc
{
  "userName": "",
  "theme": "system",          // "light" | "dark" | "system"
  "accent": "#5b5bd6",        // hex color
  "defaultSort": "priority",  // "priority" | "due" | "created" | "alpha" | "status"
  "weekStart": 1,             // 1 = Monday, 0 = Sunday
  "showCompleted": true,
  "pomodoroFocus": 25,        // minutes
  "pomodoroBreak": 5          // minutes
}
```

### Stats

```jsonc
{
  "completions":   { "2026-11-02": 4 },   // tasks completed per day
  "focusSessions": { "2026-11-02": 2 }    // finished Pomodoro focus sessions per day
}
```

Completions are counted per day as you complete tasks (and decremented if you reopen one), so your history survives deleting completed tasks.

### Other localStorage keys

| Key | Purpose |
|---|---|
| `todo4me.backup.v1` | `{ "at": ISO, "data": <full document> }`, the daily automatic backup |
| `todo4me.focus.v1` | Focus mode state: selected task and timer (`mode`, `running`, `endsAt`, `remaining`) |
| `todo4me.corrupt.<ms>` | Quarantined unreadable data (only appears if corruption was detected) |

## Browser support

Current versions of Chrome, Edge, Firefox and Safari (desktop and mobile). Requires `<dialog>`, CSS `color-mix()` and `:has()` support (all evergreen browsers since 2023).
