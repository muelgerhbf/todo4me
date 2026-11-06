# Todo4Me

A personal productivity dashboard for daily tasks, priorities, weekly planning and weekly notes — plus a
**document editor** with formatting, tables, images, shapes, charts, formulas, code blocks and PDF export.
It runs as a **Windows desktop app** (Electron) or directly in your browser. It needs no backend and no account.

## Desktop-App für Windows

Todo4Me gibt es als normale Windows-11-Anwendung mit Installer, Desktop-Verknüpfung und Startmenü-Eintrag.
Sie läuft vollständig offline. Die Web-App selbst ist unverändert: Electron zeigt dieselben Dateien (`index.html`, `css/`, `js/`) in einem eigenen Fenster an.

### Installieren (für Anwender)

| Datei in `dist/` | Verwendung |
|---|---|
| `Todo4Me-Setup-2.1.1.exe` | **Installer (empfohlen).** Doppelklicken und den Schritten folgen. Erstellt eine Desktop-Verknüpfung und einen Startmenü-Eintrag. Deinstallation über *Einstellungen → Apps*. Keine Admin-Rechte nötig. **Aktualisiert sich ab Version 2.0.0 automatisch** (siehe [Automatische Updates](#automatische-updates)). Eine vorhandene ältere Version wird einfach überinstalliert, alle Daten bleiben erhalten. |
| `Todo4Me-2.1.1-portable.exe` | **Portable Version.** Ohne Installation starten, z. B. vom USB-Stick. Der Start dauert ein paar Sekunden länger, weil die App zuerst in einen temporären Ordner entpackt wird. Aktualisiert sich **nicht** selbst: für ein Update die neue Portable-Datei verwenden. |

> **Windows SmartScreen:** Die `.exe`-Dateien sind nicht digital signiert (dafür wäre ein kostenpflichtiges Code-Signing-Zertifikat nötig).
> Beim ersten Start kann deshalb „Der Computer wurde durch Windows geschützt“ erscheinen. Dann **Weitere Informationen → Trotzdem ausführen** wählen.

### Wo werden die Daten gespeichert?

- Alle Daten liegen im LocalStorage der App, im festen Ordner **`%APPDATA%\Todo4Me`** (z. B. `C:\Users\<Name>\AppData\Roaming\Todo4Me`).
  Installierte und portable Version nutzen **denselben** Ordner und sehen daher dieselben Daten.
- Updates, Neuinstallation und **Deinstallation löschen diese Daten nicht.**
- Zusätzlich schreibt die Desktop-App **einmal täglich eine JSON-Sicherungsdatei** nach `%APPDATA%\Todo4Me\backups`. Die letzten 14 Tage werden aufbewahrt.
  Es zählt immer der Stand beim ersten Start des Tages, ein späteres Missgeschick am selben Tag überschreibt ihn also nicht.
  Jede dieser Dateien lässt sich über **Import JSON** wiederherstellen. Den Ordner öffnest du über *Datei → Open backups folder* oder unter *Settings → Desktop app*.
- Die **Dokumente des Editors** liegen in einer eigenen Datenbank (IndexedDB) im selben Ordner, getrennt von Aufgaben und Notizen.
  Sie bekommen ebenfalls ein tägliches Backup: `backups\documents-JJJJ-MM-TT.json` (inklusive Bilder, 14 Tage). Wiederherstellen über *Settings → Documents → Import documents*.
- Beim Schließen des Fensters läuft Todo4Me standardmäßig im Infobereich (Tray) weiter (siehe [Im Hintergrund](#im-hintergrund-tray-erinnerungen-schnellerfassung)).
  Beim echten Beenden (Tray → *Quit Todo4Me*, *Datei → Exit*, Update-Neustart, Herunterfahren/Abmelden von Windows) speichert der Editor noch offene Änderungen, bevor die App beendet wird.
- Die Einstellungen der Desktop-App (Tray, Autostart, Tastenkürzel) liegen in `%APPDATA%\Todo4Me\desktop-settings.json`. Sie gelten nur für diesen Computer und sind nicht Teil von Export/Import.
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
| File → New document | `Strg+Alt+N` |
| File → Export document as PDF | `Strg+P` |
| File → Export data / Import data | `Strg+E` / `Strg+I` (während du im Editor schreibst, gelten wie in Word `Strg+I` = kursiv, `Strg+E` = zentrieren, `Strg+N` = neues Dokument; über das Menü funktionieren Export/Import/New task immer) |
| File → Open backups folder / Open data folder | |
| Go → Dashboard … Focus Mode / Settings | `Strg+1` … `Strg+9` / `Strg+,` |
| Go → Editor | `Strg+Umschalt+D` |
| View → Zoom, Vollbild, Neu laden | `Strg+Plus/Minus/0`, `F11`, `Strg+R` |
| Help → Check for updates | |
| **Systemweit** (auch wenn ein anderes Programm aktiv ist): Quick capture | `Strg+Alt+Leertaste` (einstellbar, siehe unten) |

### Im Hintergrund: Tray, Erinnerungen, Schnellerfassung

**Tray und Schließen.** Todo4Me zeigt ein Symbol im Infobereich der Taskleiste (Tray). Ein Klick öffnet das Fenster, ein Rechtsklick das Menü:
*Open Todo4Me*, *Quick capture*, *New task*, *Quit Todo4Me*. Das Schließen des Fensters (X, `Alt+F4`) **blendet es nur aus**, Todo4Me läuft weiter,
damit Erinnerungen auch bei geschlossenem Fenster erscheinen. Beim ersten Mal weist eine Windows-Benachrichtigung einmalig darauf hin.
**Wirklich beenden:** Tray → *Quit Todo4Me* oder *Datei → Exit*. Dabei laufen wie bisher „erst speichern, dann schließen“ und das Schreiben aller Daten auf die Festplatte.
Auch Herunterfahren oder Abmelden von Windows beendet Todo4Me ordnungsgemäß, ebenso *Restart & install* bei einem Update.
Ein bereitgestelltes Update wird installiert, sobald Todo4Me wirklich beendet wird (oder sofort mit *Restart now*).

**Erinnerungen.** Im Aufgaben-Editor gibt es das Feld **Reminder**: *At due time*, 5/15/30 Minuten, 1 Stunde oder 1 Tag vorher.
Die Erinnerung bezieht sich auf Fälligkeitsdatum und -uhrzeit. Hat die Aufgabe nur ein Datum, gilt die **Reminder time** aus *Settings → Tasks & planning* (Standard 09:00).
Ohne Datum wird die Aufgabe beim Speichern auf heute gelegt. Zur fälligen Zeit erscheint eine **Windows-Benachrichtigung** (auch wenn das Fenster im Tray ist):
Klick darauf öffnet die Aufgabe, der Knopf **Snooze 10 min** erinnert zehn Minuten später erneut. In der App erscheint zusätzlich eine Meldung mit *Open* und *Snooze 10 min*.
- Jede Erinnerung erscheint **nur einmal** (auch nach einem Neustart), nie für erledigte Aufgaben. Verschiebt man die Aufgabe, gibt es für den neuen Termin eine neue Erinnerung.
- Wiederkehrende Aufgaben: Die nächste Wiederholung bekommt automatisch ihre eigene Erinnerung.
- War Todo4Me geschlossen, als Erinnerungen fällig wurden, kommt beim nächsten Start **eine** Sammelmeldung („2 reminders missed“) statt vieler einzelner.
- Genauigkeit: etwa auf die Minute. Läuft das Fenster lange verborgen, bremst Chromium Zeitgeber auf einmal pro Minute.
- Ob Benachrichtigungen ankommen, lässt sich mit *Settings → Tasks & planning → Reminder notifications → Test* prüfen. Unterdrückt Windows sie (z. B. „Nicht stören“), bleibt die Meldung in der App.

**Schnellerfassung von überall.** `Strg+Alt+Leertaste` holt Todo4Me nach vorne und öffnet *Quick capture*, auch aus einem anderen Programm heraus.
Alternativ wählbar: `Strg+Umschalt+Alt+Leertaste`, `Strg+Alt+T`, `Strg+Umschalt+Alt+T`. Kombinationen, die auf deutschen Tastaturen Zeichen erzeugen
(`AltGr` = `Strg+Alt`, z. B. `AltGr+Q` = `@`), stehen bewusst nicht zur Wahl. Ist ein Dialog geöffnet, wird er nicht ersetzt (nichts Getipptes geht verloren).
Ist das Kürzel schon von einem anderen Programm belegt, sagt das die Einstellungsseite; dann ein anderes wählen.

**Einstellungen** unter *Settings → Desktop app*:

| Einstellung | Standard |
|---|---|
| Keep running in the tray when the window is closed | an |
| Start Todo4Me when Windows starts (startet unsichtbar im Tray) | aus. Nur in der installierten Version; vor einer Deinstallation ausschalten, sonst bleibt ein verwaister Autostart-Eintrag |
| System-wide shortcut / Shortcut | an / `Strg+Alt+Leertaste` |

### Kalender abonnieren (Outlook / Google, nur lesen)

Im **Weekly Planner** gibt es neben den Tagesspalten die Ansicht **Calendar** (Stundenraster für Woche oder Tag, siehe
[Weekly Planner: calendar view](#weekly-planner-calendar-view)). Dort können zusätzlich die Termine aus Outlook oder Google Calendar erscheinen,
**nur zum Ansehen**, in der Farbe des jeweiligen Kalenders und schraffiert, damit man sie nicht mit Aufgaben verwechselt. Auch das Dashboard zeigt „Calendar today“.

**Einrichten** unter *Settings → Calendars*: Namen und Farbe wählen, den Kalender-Link einfügen, **Subscribe**. Den Link gibt es hier:

- **Outlook** (Web/Microsoft 365): *Einstellungen → Kalender → Freigegebene Kalender → Kalender veröffentlichen* → Kalender und „Alle Details“ wählen → **ICS-Link** kopieren.
- **Google Calendar**: *Einstellungen → (Kalender links auswählen) → Kalender integrieren* → **Privatadresse im iCal-Format**.

Es geht ohne Anmeldung (kein OAuth): Todo4Me lädt nur diese ICS-Datei. Erlaubt sind `https://`- und `webcal://`-Adressen.
Die Kalender werden **beim Start, alle 30 Minuten** und mit dem Knopf *Update* (im Kalender oder in den Einstellungen) aktualisiert.
Klappt das nicht (offline, Link zurückgesetzt, Server-Fehler), steht der Grund beim jeweiligen Kalender, und die zuletzt geladene Fassung bleibt sichtbar.
Statt eines Links kann man auch eine **`.ics`-Datei importieren** (wird dann nicht automatisch aktualisiert).

> **Der Link ist ein Geheimnis:** Wer ihn kennt, kann den Kalender lesen. Todo4Me speichert ihn nur auf diesem Computer
> (eigener LocalStorage-Schlüssel, **nicht** in Export, Import oder den täglichen Sicherungsdateien), zeigt ihn nur gekürzt an (`outlook.office365.com/••••••••`)
> und schreibt ihn nie in ein Protokoll. Entfernen über das Papierkorb-Symbol; *Reset all data* löscht ihn ebenfalls.

**Im Browser** (ohne Desktop-App) ist das Abonnieren per Link nicht möglich: Browser lassen eine Seite keine Kalender von fremden Servern laden (CORS),
und die Sicherheitsrichtlinie der Seite verbietet Netzwerkzugriffe. Dort gibt es nur den `.ics`-Import, und die Einstellungen sagen das.

**Technik:** Der Download läuft im Hauptprozess (`electron/calendar.js`) über die einzige neue Brücken-Funktion `fetchCalendar(url)`. Geprüft wird dort:
nur `https://` (`webcal://` wird zu `https://`), keine Zugangsdaten in der Adresse, Weiterleitungen nur auf `https://` (max. 5), höchstens 5 MB, 20 s Zeitlimit,
höchstens 4 Downloads gleichzeitig, eigene Sitzung im Arbeitsspeicher ohne Cookies und ohne Anmeldedaten (Passwort-Abfragen werden abgelehnt),
und die Antwort muss eine iCalendar-Datei sein. Es gelten der System-Proxy und der Windows-Zertifikatspeicher wie im Browser.
Ausgewertet wird die Datei in der Seite (`js/ics.js`, siehe [ICS support](#ics-support)).

### Automatische Updates

Die **installierte** Version (Setup-Datei) aktualisiert sich selbst:

1. Kurz nach dem Start und danach alle 4 Stunden fragt Todo4Me im Hintergrund nach einer neuen Version.
2. Gibt es eine, wird sie im Hintergrund heruntergeladen („Todo4Me 2.1.0 is available and is being downloaded…“).
3. Danach erscheint „Todo4Me 2.1.0 is ready“ mit **Restart now**. Wer später neu startet, bekommt das Update beim nächsten Beenden.
4. Nach dem Neustart bestätigt die App „Todo4Me was updated to version 2.1.0“. Alle Aufgaben, Notizen, Pläne und Dokumente bleiben erhalten,
   denn sie liegen in `%APPDATA%\Todo4Me` und nicht im Programmordner.

Status und Knopf **Check for updates** / **Restart & install** stehen unter *Settings → Desktop app → Updates* und im Menü *Help → Check for updates*.
Ohne Internet passiert nichts Störendes: automatische Prüfungen schlagen still fehl, eine manuelle Prüfung zeigt eine verständliche Meldung.
Die portable `.exe` und die Entwicklerversion (`npm start`) aktualisieren sich nicht selbst und sagen das in den Einstellungen.

> **Einmalig für bestehende Nutzer von Version 1.0.0:** 1.0.0 hatte noch keine Update-Funktion.
> Sie installieren `Todo4Me-Setup-2.1.1.exe` **einmal** über die alte Version (Daten bleiben erhalten). Ab dann kommen alle weiteren Versionen automatisch.

#### Ein Update veröffentlichen (für dich als Entwickler)

Die Updates liegen als *Releases* in einem **öffentlichen** GitHub-Repository `muelgerhbf/todo4me-releases` (nur die fertigen Installer, kein Quellcode;
der Code bleibt im privaten Repo). Eingestellt in `package.json → build.publish`.

**Einmalige Einrichtung**

1. Auf GitHub ein neues, **öffentliches** Repository `todo4me-releases` anlegen (README reicht).
2. GitHub → *Settings → Developer settings → Personal access tokens → Fine-grained tokens* → **Generate new token**:
   Repository access *Only select repositories → todo4me-releases*, Permission *Contents: Read and write*.
3. Den Token als Umgebungsvariable speichern (PowerShell, einmalig; danach Terminal neu öffnen):
   `[Environment]::SetEnvironmentVariable('GH_TOKEN', '<token>', 'User')`

**Bei jedem Update**

1. Versionsnummer in `package.json` erhöhen, z. B. `"version": "2.1.0"`. Sie muss **immer größer** sein als die letzte.
2. `npm run release`. Baut Installer + Portable und lädt sie mit `latest.yml` als **Entwurf** (Draft) zu GitHub hoch.
3. Auf GitHub unter *todo4me-releases → Releases* den Entwurf prüfen und **Publish release** klicken. Ab jetzt bekommen alle das Update.

Nie Dateien aus dem neuesten Release löschen: Die App liest dort `latest.yml`. Ein fehlerhaftes Update korrigierst du mit einer neuen, höheren Version.
`npm run build` (ohne Upload) legt zusätzlich `latest.yml` und `*.blockmap` in `dist/` ab, zum Testen oder für einen eigenen Webserver.

### Entwicklung

Voraussetzung: [Node.js](https://nodejs.org) 20 oder neuer.

```bash
npm install              # einmalig: Electron, electron-builder, electron-updater installieren
npm start                # Desktop-App aus dem Quellcode starten
npm run dev              # wie start, zusätzlich mit geöffneten DevTools
npm run vendor           # nur nach einem Update von KaTeX/Prism/Schriften: kopiert sie nach vendor/
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
                     Speichern-Dialog für Exporte, tägliche Sicherungsdateien, PDF-Export,
                     "erst speichern, dann schließen", Sicherheitsregeln
electron/updater.js  Automatische Updates (electron-updater, GitHub Releases)
electron/background.js  Tray, Schließen in den Tray, Autostart, systemweites Tastenkürzel,
                     Windows-Benachrichtigungen (desktop-settings.json)
electron/calendar.js Download abonnierter Kalender (ICS): nur https, Größen-/Zeitlimit, ohne Cookies
electron/preload.js  Minimale, fest definierte Schnittstelle window.todo4meDesktop (contextBridge)
js/desktop.js        Verbindet Menü, Tray, Tastenkürzel, Sicherungsdateien, Updates und Migrationshinweis
                     mit der Web-App. Ohne Electron (im Browser) tut die Datei nichts.
js/reminders.js      Erinnerungen: Zeitplanung, einmaliges Auslösen, Snooze (Browser und Desktop)
js/calfeeds.js       Kalender-Abos: Liste, Zwischenspeicher, Aktualisieren über fetchCalendar (im Browser nur .ics-Import)
scripts/start.js     Startet Electron für npm start/dev
scripts/build.js     Build-Skript (siehe oben), mit --publish für Releases
scripts/vendor.js    Kopiert KaTeX, Prism und die Schriften aus node_modules nach vendor/
build/icon.png       App-Icon (aus assets/icons/favicon.svg erzeugt), electron-builder macht daraus die .ico
```

**Sicherheit:** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- Die Seite hat keinen Zugriff auf Node.js, sondern nur auf die fest definierten Funktionen aus `preload.js`
  (Info, Sicherungsdateien, Ordner öffnen, PDF-Export, exportierte Datei öffnen, Updates, Menü-Befehle, Kalender-Download,
  Desktop-Einstellungen, Benachrichtigung anzeigen). Der Hauptprozess prüft jeden Wert (z. B. nur die vier Kürzel-Vorgaben, Textlängen).
- Navigation weg von der App und neue Fenster werden blockiert. `http(s)`-Links öffnen im Standardbrowser.
- Alle Berechtigungsanfragen (Kamera, Mikrofon, Standort, auch Web-Benachrichtigungen …) werden abgelehnt. Erinnerungen zeigt der Hauptprozess an, nicht die Seite.
- Eine Content-Security-Policy in `index.html` erlaubt nur lokale Dateien (`connect-src 'none'`: die Seite selbst kann nichts aus dem Netz laden;
  Kalender lädt ausschließlich der Hauptprozess über `fetchCalendar`, mit den oben beschriebenen Prüfungen). Alle Texte aus Kalenderdateien werden als Text angezeigt (HTML-escaped).
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
| **Reminders** | Per task: at due time, 5 / 15 / 30 min, 1 hour or 1 day before (date-only tasks use a configurable reminder time, default 09:00) · Windows notification in the desktop app (also from the tray), browser notification if allowed, always an in-app toast · click opens the task · **Snooze 10 min** · fires once per occurrence, never for completed tasks, recurring tasks get a new reminder per occurrence · reminders missed while the app was closed → one summary on start |
| **Weekly Planner** | Two views, **Days \| Calendar**. Days: Monday–Sunday (or Sunday–Saturday) columns · previous/next week navigation · inline add per day · **drag and drop** to reschedule · click a day for details · the week's notes. **Calendar**: hour grid for the week or one day with a current-time line · timed tasks as blocks (height = estimate) · drag to move, drag the lower edge to resize, drag unscheduled tasks in, click/drag an empty slot to create · Undo · keyboard moves · see [Weekly Planner: calendar view](#weekly-planner-calendar-view) |
| **Calendars** | Outlook / Google calendars **read-only** via their ICS link (desktop app; refreshed at start, every 30 min and on demand) or an imported `.ics` file (also in the browser) · events in the calendar view and on the dashboard · the link is stored only on this device, masked, never exported |
| **Daily Plan** | For any date: main goal, Top 3, that day's tasks, daily notes and reflection. Saves automatically as you type |
| **Weekly Notes** | Notes with a title, text, tags and pin, assigned to a week · grouped by week · search and filter by tag, week or pinned · kept separate from tasks |
| **Editor** | Word-processor documents: formatting, headings, lists, tables, links, images, shapes, charts, LaTeX formulas, code blocks with syntax highlighting · document list with search, pin, duplicate, rename, trash · autosave, undo/redo · PDF (with header, footer, page numbers) and Markdown export · see [Dokumenten-Editor](#dokumenten-editor) |
| **Focus Mode** | Distraction-free view of a single task with its description and checklist · Pomodoro timer (25/5 by default, configurable) with start, pause and reset. The timer keeps running across page refreshes |
| **Statistics** | Completed today / this week / this month · completion rate · day streak · per-day chart for this week · 8-week trend · open tasks by priority · progress by category |
| **Settings** | Your name, light / dark / system theme, accent color, default sorting, start of week, Pomodoro lengths, reminder time and notification test, calendars (subscribe / import `.ics` / rename / recolor / hide / remove), categories (add / rename / recolor / delete), export, import, restore auto-backup, sample data, reset |

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
| `G` then `D` / `I` / `M` / `T` / `U` / `W` / `P` / `O` / `E` / `F` / `S` | Go to Dashboard / Inbox / My Tasks / Today / Upcoming / Week planner / daily Plan / nOtes / Editor / Focus / Stats |
| `Ctrl/⌘ + Enter` | Save the open task or note form |
| `Esc` | Close a dialog, or exit Focus Mode |
| `↑` / `↓` on a focused calendar block | Move the task 15 minutes earlier / later |
| `←` / `→` on a focused calendar block | Move the task to the previous / next day |
| `Shift + ↑` / `Shift + ↓` on a focused calendar block | Make the task 15 minutes shorter / longer |
| `Esc` while dragging in the calendar | Cancel the drag |

### Weekly Planner: calendar view

The Weekly Planner header has a **Days | Calendar** switch. *Days* is the original planner with day columns and is unchanged.
*Calendar* shows the same week (same start of week, same week navigation) as an **hour grid**, or a single day (**Day | Week**; click a day's header to open it).
The grid opens at 06:00 and scrolls from 00:00 to 24:00; a red line marks the current time. The choice is remembered, and `#/planner?view=calendar` opens it directly
(the dashboard's "Open calendar" uses that). On narrow screens (≤ 760 px) the calendar always shows one day.

| In the calendar | What happens |
|---|---|
| Task with a due date **and** time | A block from the due time; height = estimate (30 min if none). Overlapping blocks sit side by side. Completed tasks are dimmed |
| Task with a date but no time | A chip in the **All day** strip of its day |
| Drag a block | Moves the task to another time and/or day (15-minute steps); dropped on the All day strip it keeps the date and loses the time |
| Drag the lower edge of a block | Changes the estimate (15-minute steps) |
| Drag an all-day chip, or a task from **To schedule** (overdue, Inbox, no date) | Schedules it at that day and time (an Inbox task leaves the Inbox) |
| Click a block / chip | Opens the usual task editor |
| Click an empty slot / drag over empty slots | Opens *New task* with that day, start time (and length) filled in; `+` in the All day strip adds a task without a time |
| Events of subscribed calendars | Read-only, hatched blocks in the calendar's color; click shows the details |

Every change is saved like any other edit (`store.commit()`) and the toast offers **Undo**. Reminders move with the task automatically, because a reminder
is stored relative to the due date/time; moving a task also clears a pending snooze (as the task editor does). Touch: press and hold a block briefly, then drag.

### ICS support

Calendar files are parsed by `js/ics.js` (no library): `VEVENT` with `DTSTART` + `DTEND` or `DURATION`, all-day and multi-day events (`VALUE=DATE`, end exclusive),
line folding, escaped text, `STATUS:CANCELLED` (skipped), and recurring events with `RRULE` `FREQ=DAILY/WEEKLY/MONTHLY/YEARLY` plus `INTERVAL`, `COUNT`, `UNTIL`,
`BYDAY` (also `2TU`, `-1FR`), `BYMONTHDAY` (also negative), `BYMONTH`, `BYSETPOS`, `WKST`, `EXDATE` and `RECURRENCE-ID` (single occurrences moved or cancelled).
Recurrences are expanded only for the visible days. Not supported (ignored): `RDATE`, `BYWEEKNO`, `BYYEARDAY`, `BYHOUR`/`BYMINUTE`, `HOURLY` and finer (such an event is shown once).

**Time zones:** `…Z` times are UTC; a `TZID` is resolved with the browser's time zone database (`Intl`), including Mozilla-style IDs and the Windows names Outlook
writes (`W. Europe Standard Time` → `Europe/Berlin`); otherwise the file's own `VTIMEZONE` rules are used. A `TZID` that none of these know, and times without
a zone ("floating"), are **treated as local time** of this computer. Recurring events are expanded in their own zone, so a 10:00 Berlin meeting stays at 10:00 Berlin time across daylight-saving changes,
and everything is shown in this computer's local time. Single events that ended more than 180 days ago are not kept.

## Dokumenten-Editor

Neue Seite **Editor** in der Navigation (Abschnitt *Write*, Kürzel `G` dann `E`). Weekly Notes bleiben unverändert und unabhängig davon.

**Aufbau:** links die Dokumentenliste (Suche in Titel und Inhalt, *All / Pinned / Trash*, „…“-Menü je Dokument),
oben Titel, Speicherstatus, Menüs **File** und **Insert** und der Knopf **Export PDF**, darunter die Formatierungsleiste,
in der Mitte die Seite (Papieransicht im gewählten Format), unten Wörter/Zeichen/Seiten und Zoom (25–300 %, auch mit **Strg + Mausrad**; die Stelle unter dem Mauszeiger bleibt dabei stehen).
Ohne geöffnetes Dokument zeigt die Seite Vorlagen (*Blank, Meeting notes, Report, Feature tour*) und die zuletzt bearbeiteten Dokumente.

| Bereich | Funktionen |
|---|---|
| Dokumente | Neu, aus Vorlage, öffnen, umbenennen, duplizieren, anheften, in den Papierkorb (30 Tage wiederherstellbar), endgültig löschen, suchen, importieren (`.md`, `.html`, `.txt`, Todo4Me-`.json`) |
| Speichern | Automatisch ~0,7 s nach jeder Änderung, sofort beim Seiten- oder Dokumentwechsel und beim Schließen. `Strg+S` speichert sofort. Status oben: *Saved / Editing… / Not saved — retrying* |
| Rückgängig | `Strg+Z` / `Strg+Y` (auch `Strg+Umschalt+Z`) für **alle** Änderungen, auch an Tabellen, Bildern, Formen, Diagrammen, Formeln |
| Text | Fett, kursiv, unterstrichen, durchgestrichen, Textmarker, Schrift- und Hintergrundfarbe, Schriftgröße (8–72 pt), Schriftart, hoch-/tiefgestellt, Inline-Code, Formatierung löschen |
| Absatz | Normal, Überschrift 1–6, Zitat, links/zentriert/rechts/Blocksatz, Aufzählung, Nummerierung (verschachtelt mit Tab), Einzug, Zeilenabstand, Abstand vor/nach, Absatz-Schattierung, horizontale Linie, Seitenumbruch |
| Schriften | **Calibri** (Standard), **Fira Code**, Arial, Georgia, Times New Roman, Verdana. Fira Code ist mitgeliefert. Wo Calibri fehlt (macOS, iPad), wird automatisch das maßgleiche, mitgelieferte *Carlito* verwendet |
| Links | `Strg+K` einfügen/bearbeiten, Klick zeigt Adresse mit *Öffnen / Bearbeiten / Entfernen*, `Strg+Klick` öffnet im Browser |
| Tabellen | Raster-Auswahl oder freie Größe, Kopfzeile, Zeilen/Spalten einfügen und löschen, Zellfarbe, `Tab` springt zur nächsten Zelle (am Ende neue Zeile) |
| Bilder | Einfügen per Knopf, Einfügen aus der Zwischenablage oder Drag & Drop · Größe per Ziehen oder 25/50/75/100 % · links/zentriert/rechts oder Textumfluss · Bildunterschrift, Alternativtext, ersetzen. Große Bilder werden automatisch verkleinert |
| Formen | Kreis, Rechteck, abgerundetes Rechteck, Dreieck, Linie, Pfeil, Raute in einer Zeichenfläche · verschieben (Maus oder Pfeiltasten), Größe über Anfasser (`Umschalt` = proportional), Füll-, Rahmenfarbe, Rahmenstärke (0–20 px, Regler mit gedrückter Maustaste ziehen oder −/+), Text in der Form, duplizieren (`Strg+D`), löschen (`Entf`), nach vorne/hinten · Höhe der Zeichenfläche per Anfasser |
| Diagramme | Balken, Linie, Kreis · Daten in einer Tabelle bearbeiten (Doppelklick), mehrere Datenreihen, Farben, Titel, Legende · als Vektorgrafik im PDF |
| Formeln | LaTeX-Formeleditor (`Strg+M`) mit Live-Vorschau und Symbolpalette (Brüche, Wurzeln, Potenzen, Indizes, Summen, Integrale, Grenzwerte, Matrizen, griechische Buchstaben, Symbole) · in der Zeile oder als eigener Block · Darstellung mit KaTeX |
| Code | Codeblöcke mit Syntax-Highlighting für JavaScript, Python, HTML, CSS, JSON, Java, C++, C, C#, SQL, Bash · Fira Code · Sprache wählbar · Kopieren-Knopf · `Tab` rückt ein, `Esc` verlässt den Block |
| Markdown-Kürzel | `# ` bis `###### ` Überschriften, `- ` Liste, `1. ` Nummerierung, `> ` Zitat, `**fett**`, `*kursiv*`, `` `code` ``, `~~durch~~`, `==markiert==`, ```` ``` ```` + Enter Codeblock, `---` + Enter Linie, `$$` + Enter Formel. `/` in einer leeren Zeile öffnet das Einfügen-Menü. Eingefügter Markdown-Text wird umgewandelt |
| PDF | **Export PDF** (`Strg+P`): professionelles Layout mit sauberen Seitenumbrüchen (Überschriften bleiben beim Text, Tabellenzeilen, Bilder, Formeln und Codeblöcke werden nicht zerrissen, Tabellenköpfe wiederholen sich), eingebetteten Schriften, Vektorgrafiken, Lesezeichen aus den Überschriften. **File → Page setup**: A4/Letter/A5/Legal, Hoch-/Querformat, Ränder, Kopf- und Fußzeile (Platzhalter `{title}`, `{date}`), Seitenzahlen („Page 1 of 3“, „1 / 3“, „1“), erste Seite ohne Kopfzeile. Das PDF entspricht der Seite im Editor: weißes Papier, dieselben Ränder, Kopf- und Fußzeile mittig im Rand. Die gestrichelten Linien auf der Seite zeigen ungefähr, wo eine neue PDF-Seite beginnt. In der Desktop-App öffnet sich ein Speichern-Dialog, im Browser der Druckdialog („Als PDF speichern“). Das Dokument selbst wird dabei nicht verändert |
| Export | Markdown (`.md`, Obsidian-kompatibel, Bilder/Diagramme eingebettet) und Todo4Me-Dokument (`.json`, verlustfrei) · *Settings → Documents* exportiert/importiert alle Dokumente |

**Dateiformat:** Dokumente werden intern als bereinigtes HTML (nur erlaubte Elemente, Attribute und Stilangaben) plus JSON-Metadaten gespeichert,
nicht als PDF und nicht als Markdown. Grund: Markdown kann Farben, Schriften, Ausrichtung, Formen und Diagramme nicht verlustfrei abbilden.
Bilder, Formen, Diagramme, Formeln und Codeblöcke sind „Widgets“, die nur ihre Quelldaten speichern (z. B. LaTeX-Text, Diagrammwerte) und
beim Öffnen neu gezeichnet werden, also immer editierbar bleiben. Markdown ist das Austauschformat für Import und Export.
Alles, was in ein Dokument gelangt (Laden, Einfügen, Import, Rückgängig), läuft durch `editor-sanitize.js`. Skripte, Event-Handler,
`javascript:`-Links, externe Ressourcen und fremde Stilangaben werden entfernt.

**Offline:** KaTeX, Prism und die Schriften liegen in `vendor/` und werden erst geladen, wenn der Editor geöffnet wird (der Start der übrigen App bleibt unverändert schnell).

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

**Settings → Reset all data** deletes everything Todo4Me has stored in this browser, including calendar subscriptions (export first if you might need it).

## Project structure

```
todo4me/
├── index.html            App shell, icon sprite (inline SVG), dialogs, script includes
├── package.json          Desktop app: npm scripts + electron-builder configuration (+ update feed)
├── electron/
│   ├── main.js           Electron main process (window, data folder, menu, backups, PDF, security)
│   ├── updater.js        Automatic updates (electron-updater)
│   ├── background.js     Tray, close to tray, start with Windows, global hotkey, native notifications
│   ├── calendar.js       Downloads subscribed calendars (ICS) for the page: https only, limits, no cookies
│   └── preload.js        Minimal bridge exposed as window.todo4meDesktop
├── scripts/
│   ├── start.js          npm start / npm run dev
│   ├── build.js          npm run build / release (installer + portable + latest.yml → dist/)
│   └── vendor.js         npm run vendor (copies KaTeX, Prism, fonts → vendor/)
├── build/icon.png        App icon used by electron-builder
├── assets/icons/
│   ├── favicon.svg
│   └── icon.png          Window icon
├── vendor/               Offline third-party files for the editor (MIT / SIL OFL, licenses included)
│   ├── katex/            Formula rendering + fonts
│   ├── prism/prism.js    Syntax highlighting (11 languages)
│   └── fonts/            Fira Code, Carlito (Calibri-compatible)
├── tests/                Browser + desktop test suites (Chrome DevTools Protocol, no npm deps),
│                         ICS parser unit tests (test-ics.mjs) and their fixtures (fixtures/ics/)
├── css/
│   ├── styles.css        Design tokens (light/dark), components, views, responsive rules
│   └── editor.css        Editor page, document typography, widgets, print/PDF rules
└── js/
    ├── utils.js          Date helpers (local YYYY-MM-DD), HTML escaping, DOM helpers
    ├── storage.js        Schema defaults, validation/sanitizing, storage adapter, backup, import/export/merge
    ├── store.js          In-memory state, all mutations (commit → save → notify), selectors
    ├── ui.js             Action registry, modal, confirm dialog, toasts, progress components
    ├── tasks.js          Task row/editor/quick capture, quick-add parser; Inbox, My Tasks, Today, Upcoming views
    ├── dashboard.js      Dashboard view, Top 3 card and picker
    ├── planner.js        Weekly planner (drag & drop, day details) and Daily Plan view
    ├── ics.js            iCalendar parser + recurrence expansion (pure, also runs in Node for the tests)
    ├── calfeeds.js       Calendar subscriptions: list, cache, refresh, Settings card, dashboard card
    ├── calendar.js       Weekly Planner → Calendar view: hour grid, drag & drop, resize, create, keyboard
    ├── notes.js          Weekly notes view and editor
    ├── focus.js          Focus mode and Pomodoro timer
    ├── stats.js          Statistics view and charts
    ├── settings.js       Settings view, theme, calendars card, categories, export/import, sample data
    ├── editor-sanitize.js  Editor: HTML allowlist sanitizer (paste, import, storage, undo)
    ├── docstore.js       Editor: IndexedDB storage for documents and images, export/import
    ├── editor-widgets.js Editor: images, drawings/shapes, charts, formulas, code blocks, dialogs
    ├── editor-markdown.js Editor: Markdown import/export
    ├── editor-core.js    Editor: editing engine (selection, undo/redo, formatting, tables, links, paste)
    ├── editor.js         Editor: page, document list, toolbar, menus, autosave, PDF export
    ├── app.js            Router (hash-based), navigation, event delegation, shortcuts, boot
    ├── reminders.js      Reminder scheduler (fire once, snooze, missed summary) + notifications
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
  "reminder": 15,                // minutes before the due date/time (0 = at due time, max 40320) or null; needs dueDate
  "reminderFired": "2026-11-02 15:00|15", // occurrence whose reminder was shown ("date time|minutes"), or null
  "reminderSnooze": null,        // ISO time a snoozed reminder comes back, or null
  "inbox": false,                // true = captured but not organized yet
  "nextOccurrenceId": null,      // set once a recurring task spawned its successor
  "createdAt": "2026-11-02T08:12:00.000Z",
  "updatedAt": "2026-11-02T09:30:00.000Z",
  "completedAt": null            // set when status becomes "done"
}
```

**Recurring tasks:** completing one creates the next occurrence (subtasks reset), dated at the first interval after today. Reopening and re-completing never creates duplicates.

**Reminders** are stored as an offset (`reminder`, minutes before due), not as an absolute time: the reminder moves with the task when it is
rescheduled (editor, planner drag & drop, "move all to today"), and the next occurrence of a recurring task inherits the offset and gets its own reminder.
The fire time is `dueDate` + (`dueTime` or `settings.reminderTime`) − `reminder`. `reminderFired` records which occurrence was already shown,
so a reminder appears once even across restarts, imports and other tabs; changing the due date/time or the offset creates a new occurrence key.
Data without these fields (older versions and exports) loads unchanged with `reminder: null`.

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
  "pomodoroBreak": 5,         // minutes
  "reminderTime": "09:00"     // "HH:MM": reminder time for tasks with a due date but no time
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
| `todo4me.editor.ui` | Editor view preferences: `{ "zoom": 100, "side": true }` (document list shown) |
| `todo4me.app.version` | Desktop app: last started version (to confirm an update once) |
| `todo4me.docs.backupDay` | Desktop app: day of the last documents backup file |
| `todo4me.planner.ui` | Weekly Planner view preference: `{ "mode": "days" \| "calendar", "span": "week" \| "day" }` |
| `todo4me.calendars.v1` | Calendar subscriptions (see below). **Not** part of `todo4me.data.v1`, exports, imports, merges or backup files, because the links are secrets |
| `todo4me.calendars.cache.v1` | Last downloaded/imported version of each calendar, already parsed: `{ "<feedId>": { "at": ISO, "checkedAt": ISO, "error": null, "cal": { "name", "events": [Event], "zones": {} } } }`. Size-limited (~1.5 M characters; descriptions are dropped first), so it can never crowd out the tasks |

```jsonc
// todo4me.calendars.v1
{
  "version": 1,
  "feeds": [{
    "id": "cal_…",
    "name": "Work",                  // ≤ 60 chars
    "color": "#0e7c86",
    "kind": "url",                   // "url" (subscription, desktop app) | "file" (imported .ics, no URL)
    "url": "https://outlook.office365.com/owa/calendar/…/calendar.ics",   // only https (webcal:// is stored as https://)
    "enabled": true,                 // "Show" checkbox
    "addedAt": "ISO"
  }]
}
// Event in the cache (js/ics.js): wall-clock times, expanded per visible range
{ "uid": "…", "title": "…", "location": "…", "description": "…", "allDay": false,
  "start": 1793785200000,            // wall-clock ms in the event's zone (all-day: day × 86400000)
  "tz": "I:Europe/Berlin",           // "Z" (UTC) | "I:<IANA>" | "V:<VTIMEZONE id>" | "L" (local); null for all-day
  "dur": 3600000,                    // ms (all-day: number of days)
  "rrule": { "freq": "WEEKLY", "interval": 1, "byday": [{ "n": 0, "wd": 1 }], "until": { "wall": 1795000000000, "utc": true } },
  "exdates": [], "exdays": [] }
```

No task or settings fields were added for the calendar: a block's position comes from `dueDate`, `dueTime` and `estimate`.

The desktop app keeps its machine settings outside LocalStorage in `<userData>/desktop-settings.json`:
`{ "closeToTray": true, "openAtLogin": false, "hotkeyEnabled": true, "hotkey": "Control+Alt+Space", "trayHintShown": false }`.

### Documents (editor) — IndexedDB `todo4me-docs`

Editor documents are **not** stored in `todo4me.data.v1`; they live in their own IndexedDB database, so large documents and images can never
crowd out tasks and notes (LocalStorage only holds a few MB).

| Store | Record |
|---|---|
| `docs` | `{ id, format: 1, title, text, words, page, pinned, createdAt, updatedAt, openedAt, deletedAt }`; `text` is a plain-text copy for search, `deletedAt` ≠ null means *in trash* (purged after 30 days) |
| `bodies` | `{ id, html }`: the document content (sanitized HTML, see below) |
| `assets` | `{ id, blob, type, size, createdAt }`: images, referenced from the content; unreferenced images are cleaned up after a day |

```jsonc
// page (page setup, per document)
{ "size": "A4", "orientation": "portrait", "margins": "normal", "header": "{title}", "footer": "",
  "pageNumbers": "bottom-center", "numberFormat": "page-of", "firstPageHeader": true }
```

Content HTML uses `p, h1–h6, blockquote, ul/ol/li, table, hr`, inline formatting (`b, i, u, s, mark, sub, sup, code, a, span[style]`) and widgets:

```html
<figure class="t4-w" data-w="img"   data-p='{"a":"img_…","w":50,"al":"center","cap":"","alt":""}'></figure>
<figure class="t4-w" data-w="draw"  data-p='{"h":240,"al":"center","shapes":[{"id":"s1","t":"rect","x":40,"y":40,"w":120,"h":80,"fill":"#dbe4ff","stroke":"#4f6bed","sw":2,"text":"","tc":"#1f2330","fs":16}]}'></figure>
<figure class="t4-w" data-w="chart" data-p='{"type":"bar","title":"","labels":["Q1"],"series":[{"name":"","color":"#4f6bed","values":[12]}],"w":100,"legend":true}'></figure>
<figure class="t4-w" data-w="math"  data-p='{"tex":"\\frac{a}{b}"}'></figure>   <!-- <span …> = inline formula -->
<figure class="t4-w" data-w="code"  data-p='{"lang":"python"}'><pre><code>print("hi")</code></pre></figure>
<figure class="t4-w" data-w="pagebreak" data-p="{}"></figure>
```

Shape types `t`: `rect, round, ellipse, tri, diamond, line, arrow`. A documents export (`*.todo4me-doc.json`, *Settings → Documents*, daily desktop backup)
is `{ "app": "todo4me", "kind": "documents", "format": 1, "documents": [meta + html], "assets": { "img_…": "data:image/…" } }`.
Imports never overwrite existing documents (id clashes get a new id).

## Tests

```bash
node tests/cdp.mjs tests/test-functional.mjs           # 247 checks: all original features + reminders + calendar view and .ics calendars (Chrome)
node tests/cdp.mjs tests/test-editor.mjs               # 166 checks: editor, PDF, persistence, Markdown, security (Chrome)
node tests/cdp-electron.mjs tests/test-functional.mjs  # the same 247 checks inside the desktop app
node tests/cdp-electron.mjs tests/test-electron.mjs    # 112 checks: security, menu, restart, backups, PDF export, close-save, updates,
                                                       #   tray, close to tray vs. quit, hotkey, start with Windows, notifications, missed summary,
                                                       #   fetchCalendar against a local HTTPS server, calendar subscription end to end
node tests/test-ics.mjs                                # 62 checks: ICS parser unit tests (plain Node, fixtures in tests/fixtures/ics)
```

Optional environment: `PDFTEXT=<script>` checks PDF text (page numbers, header/footer) with pdf.js, `TODO4ME_PDF_DIR=<folder>` lets the desktop test export PDFs without a dialog.
The counts above include the `PDFTEXT` checks (editor 9, desktop 4). The desktop suite shows a few real Windows notifications and registers the
global hotkey while it runs; "start with Windows" is never written to the registry in test runs (the call is stubbed).
The reminder scheduler is tested with an explicit clock: `T4.reminders.check({ now })`, `setClock(fn)`, `setNotifier(fn)`.
The calendar checks (`tests/functional-calendar.mjs`) use real mouse input (move, resize, drag in from the All day strip and the To schedule list,
click and drag on empty slots) and the keyboard. The desktop calendar checks (`tests/electron-calendar.mjs`) start an HTTPS server on 127.0.0.1 with a
self-signed certificate made by `openssl` for the run (Git for Windows ships it; without it these checks are skipped and say so). Only for that test the
calendar's own network session is told to accept that certificate for 127.0.0.1; the test checks that the same certificate is still rejected under another host name.
`test-ics.mjs` fixes the time zone to Europe/Berlin (and New York for one block), so its expected times do not depend on the computer.

## Browser support

Current versions of Chrome, Edge, Firefox and Safari (desktop and mobile). Requires `<dialog>`, CSS `color-mix()` and `:has()` support (all evergreen browsers since 2023).
