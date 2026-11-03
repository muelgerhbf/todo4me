# Todo4Me

A personal productivity dashboard for daily tasks, priorities, weekly planning and weekly notes â€” plus a
**document editor** with formatting, tables, images, shapes, charts, formulas, code blocks and PDF export.
It runs as a **Windows desktop app** (Electron) or directly in your browser. It needs no backend and no account.

## Desktop-App fÃ¼r Windows

Todo4Me gibt es als normale Windows-11-Anwendung mit Installer, Desktop-VerknÃ¼pfung und StartmenÃ¼-Eintrag.
Sie lÃ¤uft vollstÃ¤ndig offline. Die Web-App selbst ist unverÃ¤ndert: Electron zeigt dieselben Dateien (`index.html`, `css/`, `js/`) in einem eigenen Fenster an.

### Installieren (fÃ¼r Anwender)

| Datei in `dist/` | Verwendung |
|---|---|
| `Todo4Me-Setup-2.0.0.exe` | **Installer (empfohlen).** Doppelklicken und den Schritten folgen. Erstellt eine Desktop-VerknÃ¼pfung und einen StartmenÃ¼-Eintrag. Deinstallation Ã¼ber *Einstellungen â†’ Apps*. Keine Admin-Rechte nÃ¶tig. **Aktualisiert sich ab Version 2.0.0 automatisch** (siehe [Automatische Updates](#automatische-updates)). Eine vorhandene Ã¤ltere Version wird einfach Ã¼berinstalliert, alle Daten bleiben erhalten. |
| `Todo4Me-2.0.0-portable.exe` | **Portable Version.** Ohne Installation starten, z. B. vom USB-Stick. Der Start dauert ein paar Sekunden lÃ¤nger, weil die App zuerst in einen temporÃ¤ren Ordner entpackt wird. Aktualisiert sich **nicht** selbst: fÃ¼r ein Update die neue Portable-Datei verwenden. |

> **Windows SmartScreen:** Die `.exe`-Dateien sind nicht digital signiert (dafÃ¼r wÃ¤re ein kostenpflichtiges Code-Signing-Zertifikat nÃ¶tig).
> Beim ersten Start kann deshalb â€žDer Computer wurde durch Windows geschÃ¼tztâ€œ erscheinen. Dann **Weitere Informationen â†’ Trotzdem ausfÃ¼hren** wÃ¤hlen.

### Wo werden die Daten gespeichert?

- Alle Daten liegen im LocalStorage der App, im festen Ordner **`%APPDATA%\Todo4Me`** (z. B. `C:\Users\<Name>\AppData\Roaming\Todo4Me`).
  Installierte und portable Version nutzen **denselben** Ordner und sehen daher dieselben Daten.
- Updates, Neuinstallation und **Deinstallation lÃ¶schen diese Daten nicht.**
- ZusÃ¤tzlich schreibt die Desktop-App **einmal tÃ¤glich eine JSON-Sicherungsdatei** nach `%APPDATA%\Todo4Me\backups`. Die letzten 14 Tage werden aufbewahrt.
  Es zÃ¤hlt immer der Stand beim ersten Start des Tages, ein spÃ¤teres Missgeschick am selben Tag Ã¼berschreibt ihn also nicht.
  Jede dieser Dateien lÃ¤sst sich Ã¼ber **Import JSON** wiederherstellen. Den Ordner Ã¶ffnest du Ã¼ber *Datei â†’ Open backups folder* oder unter *Settings â†’ Desktop app*.
- Die **Dokumente des Editors** liegen in einer eigenen Datenbank (IndexedDB) im selben Ordner, getrennt von Aufgaben und Notizen.
  Sie bekommen ebenfalls ein tÃ¤gliches Backup: `backups\documents-JJJJ-MM-TT.json` (inklusive Bilder, 14 Tage). Wiederherstellen Ã¼ber *Settings â†’ Documents â†’ Import documents*.
- Beim SchlieÃŸen des Fensters speichert der Editor noch offene Ã„nderungen, bevor die App beendet wird.
- Es lÃ¤uft immer nur **eine** Instanz. Ein zweiter Start bringt das vorhandene Fenster nach vorne, damit nie zwei Fenster gleichzeitig dieselben Daten schreiben.

### Daten aus der Browser-Version Ã¼bernehmen

Die Desktop-App kann den LocalStorage deines Browsers technisch nicht direkt lesen (jeder Browser hat seinen eigenen, geschÃ¼tzten Speicher).
Die Ãœbernahme dauert eine Minute, und **nichts wird automatisch Ã¼berschrieben oder gelÃ¶scht**:

1. Die alte Version im Browser Ã¶ffnen (`index.html`) â†’ **Settings â†’ Export JSON**. Die Datei `todo4me-backup-JJJJ-MM-TT.json` wird gespeichert.
2. Die Desktop-App Ã¶ffnen â†’ **Settings â†’ Import JSON** (oder *Datei â†’ Import data*, `Strg+I`) â†’ die Datei auswÃ¤hlen.
3. **Merge** wÃ¤hlen: Vorhandene Daten bleiben erhalten, die importierten kommen hinzu.
   *Replace all* ersetzt alles und fragt vorher ausdrÃ¼cklich nach.

Die Daten im Browser bleiben dabei unverÃ¤ndert. Solange die Desktop-App noch leer ist, weist sie beim Start mit einem Hinweis auf diesen Weg hin.

### MenÃ¼ und TastenkÃ¼rzel der Desktop-App

Alle bisherigen TastenkÃ¼rzel (`N`, `Q`, `/`, `G` + Buchstabe â€¦) funktionieren weiter. ZusÃ¤tzlich gibt es das MenÃ¼:

| MenÃ¼ | KÃ¼rzel |
|---|---|
| File â†’ New task / Quick capture / New weekly note | `Strg+N` / `Strg+Umschalt+Leertaste` / `Strg+Umschalt+N` |
| File â†’ New document | `Strg+Alt+N` |
| File â†’ Export document as PDF | `Strg+P` |
| File â†’ Export data / Import data | `Strg+E` / `Strg+I` (wÃ¤hrend du im Editor schreibst, gelten wie in Word `Strg+I` = kursiv, `Strg+E` = zentrieren, `Strg+N` = neues Dokument; Ã¼ber das MenÃ¼ funktionieren Export/Import/New task immer) |
| File â†’ Open backups folder / Open data folder | |
| Go â†’ Dashboard â€¦ Focus Mode / Settings | `Strg+1` â€¦ `Strg+9` / `Strg+,` |
| Go â†’ Editor | `Strg+Umschalt+D` |
| View â†’ Zoom, Vollbild, Neu laden | `Strg+Plus/Minus/0`, `F11`, `Strg+R` |
| Help â†’ Check for updates | |

### Automatische Updates

Die **installierte** Version (Setup-Datei) aktualisiert sich selbst:

1. Kurz nach dem Start und danach alle 4 Stunden fragt Todo4Me im Hintergrund nach einer neuen Version.
2. Gibt es eine, wird sie im Hintergrund heruntergeladen (â€žTodo4Me 2.1.0 is available and is being downloadedâ€¦â€œ).
3. Danach erscheint â€žTodo4Me 2.1.0 is readyâ€œ mit **Restart now**. Wer spÃ¤ter neu startet, bekommt das Update beim nÃ¤chsten Beenden.
4. Nach dem Neustart bestÃ¤tigt die App â€žTodo4Me was updated to version 2.1.0â€œ. Alle Aufgaben, Notizen, PlÃ¤ne und Dokumente bleiben erhalten,
   denn sie liegen in `%APPDATA%\Todo4Me` und nicht im Programmordner.

Status und Knopf **Check for updates** / **Restart & install** stehen unter *Settings â†’ Desktop app â†’ Updates* und im MenÃ¼ *Help â†’ Check for updates*.
Ohne Internet passiert nichts StÃ¶rendes: automatische PrÃ¼fungen schlagen still fehl, eine manuelle PrÃ¼fung zeigt eine verstÃ¤ndliche Meldung.
Die portable `.exe` und die Entwicklerversion (`npm start`) aktualisieren sich nicht selbst und sagen das in den Einstellungen.

> **Einmalig fÃ¼r bestehende Nutzer von Version 1.0.0:** 1.0.0 hatte noch keine Update-Funktion.
> Sie installieren `Todo4Me-Setup-2.0.0.exe` **einmal** Ã¼ber die alte Version (Daten bleiben erhalten). Ab dann kommen alle weiteren Versionen automatisch.

#### Ein Update verÃ¶ffentlichen (fÃ¼r dich als Entwickler)

Die Updates liegen als *Releases* in einem **Ã¶ffentlichen** GitHub-Repository `muelgerhbf/todo4me-releases` (nur die fertigen Installer, kein Quellcode;
der Code bleibt im privaten Repo). Eingestellt in `package.json â†’ build.publish`.

**Einmalige Einrichtung**

1. Auf GitHub ein neues, **Ã¶ffentliches** Repository `todo4me-releases` anlegen (README reicht).
2. GitHub â†’ *Settings â†’ Developer settings â†’ Personal access tokens â†’ Fine-grained tokens* â†’ **Generate new token**:
   Repository access *Only select repositories â†’ todo4me-releases*, Permission *Contents: Read and write*.
3. Den Token als Umgebungsvariable speichern (PowerShell, einmalig; danach Terminal neu Ã¶ffnen):
   `[Environment]::SetEnvironmentVariable('GH_TOKEN', '<token>', 'User')`

**Bei jedem Update**

1. Versionsnummer in `package.json` erhÃ¶hen, z. B. `"version": "2.1.0"`. Sie muss **immer grÃ¶ÃŸer** sein als die letzte.
2. `npm run release`. Baut Installer + Portable und lÃ¤dt sie mit `latest.yml` als **Entwurf** (Draft) zu GitHub hoch.
3. Auf GitHub unter *todo4me-releases â†’ Releases* den Entwurf prÃ¼fen und **Publish release** klicken. Ab jetzt bekommen alle das Update.

Nie Dateien aus dem neuesten Release lÃ¶schen: Die App liest dort `latest.yml`. Ein fehlerhaftes Update korrigierst du mit einer neuen, hÃ¶heren Version.
`npm run build` (ohne Upload) legt zusÃ¤tzlich `latest.yml` und `*.blockmap` in `dist/` ab, zum Testen oder fÃ¼r einen eigenen Webserver.

### Entwicklung

Voraussetzung: [Node.js](https://nodejs.org) 20 oder neuer.

```bash
npm install              # einmalig: Electron, electron-builder, electron-updater installieren
npm start                # Desktop-App aus dem Quellcode starten
npm run dev              # wie start, zusÃ¤tzlich mit geÃ¶ffneten DevTools
npm run vendor           # nur nach einem Update von KaTeX/Prism/Schriften: kopiert sie nach vendor/
```

Ã„nderungen an `index.html`, `css/` oder `js/` siehst du nach **Strg+R** im App-Fenster.

> Falls `npm install` meldet, dass Install-Skripte blockiert wurden (npm 11) und `npm start` â€žElectron failed to install correctlyâ€œ zeigt,
> einmalig `node node_modules/electron/install.js` ausfÃ¼hren. Das lÃ¤dt das Electron-Programm herunter.

### Windows-Installer und Portable-Version bauen

```bash
npm run build            # beides: Installer + Portable
npm run build:installer  # nur Todo4Me-Setup-<version>.exe
npm run build:portable   # nur Todo4Me-<version>-portable.exe
npm run pack             # nur entpackte App in dist/win-unpacked (zum schnellen Testen)
```

Die fertigen Dateien liegen danach in **`dist/`** im Projektordner. Der erste Build lÃ¤dt einmalig Werkzeuge (NSIS, Electron fÃ¼r Windows) herunter, danach geht es schneller.
Die Versionsnummer steht in `package.json` (`"version"`) und erscheint im Dateinamen.

`scripts/build.js` lÃ¤sst electron-builder in einem temporÃ¤ren Ordner auÃŸerhalb des Projekts arbeiten und kopiert nur die fertigen `.exe`-Dateien nach `dist/`.
Grund: Ist das Projekt in VS Code geÃ¶ffnet, Ã¶ffnet VS Code (selbst eine Electron-App) neu entstehende `.asar`-Dateien und sperrt sie.
Ein direkter Build in den Projektordner bricht dann mit `EBUSY`/`EPERM` ab.

### Aufbau der Desktop-Integration

```
electron/main.js     Hauptprozess: Fenster, fester Datenordner, Einzelinstanz, MenÃ¼,
                     Speichern-Dialog fÃ¼r Exporte, tÃ¤gliche Sicherungsdateien, PDF-Export,
                     "erst speichern, dann schlieÃŸen", Sicherheitsregeln
electron/updater.js  Automatische Updates (electron-updater, GitHub Releases)
electron/preload.js  Minimale, fest definierte Schnittstelle window.todo4meDesktop (contextBridge)
js/desktop.js        Verbindet MenÃ¼, Sicherungsdateien, Updates und Migrationshinweis mit der Web-App.
                     Ohne Electron (im Browser) tut die Datei nichts.
scripts/start.js     Startet Electron fÃ¼r npm start/dev
scripts/build.js     Build-Skript (siehe oben), mit --publish fÃ¼r Releases
scripts/vendor.js    Kopiert KaTeX, Prism und die Schriften aus node_modules nach vendor/
build/icon.png       App-Icon (aus assets/icons/favicon.svg erzeugt), electron-builder macht daraus die .ico
```

**Sicherheit:** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- Die Seite hat keinen Zugriff auf Node.js, sondern nur auf die fest definierten Funktionen aus `preload.js`
  (Info, Sicherungsdateien, Ordner Ã¶ffnen, PDF-Export, exportierte Datei Ã¶ffnen, Updates, MenÃ¼-Befehle).
- Navigation weg von der App und neue Fenster werden blockiert. `http(s)`-Links Ã¶ffnen im Standardbrowser.
- Alle Berechtigungsanfragen (Kamera, Mikrofon, Standort â€¦) werden abgelehnt.
- Eine Content-Security-Policy in `index.html` erlaubt nur lokale Dateien.
  Das kleine Inline-Skript im `<head>` ist per SHA-256-Hash freigegeben. Wer es Ã¤ndert, muss den Hash in der CSP anpassen.

## Running it in the browser

**Option 1: just open it.** Double-click `index.html` (or drag it into Chrome, Edge, Firefox or Safari).
Everything works over `file://`.

**Option 2: serve it locally** (recommended if you want a stable URL or plan to install it on several devices on your network):

```bash
# any static server works, for example:
python -m http.server 8080        # then open http://localhost:8080
npx serve .                        # or this, if you have Node.js
```

> Data is stored per browser *and* per origin. `file:///â€¦/index.html` and `http://localhost:8080`
> keep separate data. Pick one, or move data between them with Export/Import.

## Features

| Area | What you can do |
|---|---|
| **Dashboard** | Greeting, date and summary Â· stats for today (total / completed / remaining / overdue) Â· progress ring Â· **Daily Top 3** and main goal Â· today's tasks Â· important deadlines Â· this week's progress, upcoming tasks and notes Â· quick capture |
| **Inbox** | Capture tasks without a date, priority or category Â· one click to schedule for Today or Tomorrow, organize in the editor, or move to My Tasks |
| **My Tasks** | Search (title, description, notes, tags, subtasks, category) Â· filter by status, priority, category, due date and tag Â· sort by priority, due date, creation date, title or status |
| **Today / Upcoming** | Today's tasks plus overdue ones (with "move all to today") Â· the next 14 days grouped by day, then "Later" |
| **Tasks** | Title, description, notes, priority (Critical / High / Medium / Low / none), status (To do / In progress / Completed), category, tags, due date, optional time, estimate, subtasks, recurrence (daily / weekly / monthly), created and completed timestamps Â· undo for completing and deleting |
| **Weekly Planner** | Mondayâ€“Sunday (or Sundayâ€“Saturday) columns Â· previous/next week navigation Â· inline add per day Â· **drag and drop** to reschedule Â· click a day for details Â· the week's notes |
| **Daily Plan** | For any date: main goal, Top 3, that day's tasks, daily notes and reflection. Saves automatically as you type |
| **Weekly Notes** | Notes with a title, text, tags and pin, assigned to a week Â· grouped by week Â· search and filter by tag, week or pinned Â· kept separate from tasks |
| **Editor** | Word-processor documents: formatting, headings, lists, tables, links, images, shapes, charts, LaTeX formulas, code blocks with syntax highlighting Â· document list with search, pin, duplicate, rename, trash Â· autosave, undo/redo Â· PDF (with header, footer, page numbers) and Markdown export Â· see [Dokumenten-Editor](#dokumenten-editor) |
| **Focus Mode** | Distraction-free view of a single task with its description and checklist Â· Pomodoro timer (25/5 by default, configurable) with start, pause and reset. The timer keeps running across page refreshes |
| **Statistics** | Completed today / this week / this month Â· completion rate Â· day streak Â· per-day chart for this week Â· 8-week trend Â· open tasks by priority Â· progress by category |
| **Settings** | Your name, light / dark / system theme, accent color, default sorting, start of week, Pomodoro lengths, categories (add / rename / recolor / delete), export, import, restore auto-backup, sample data, reset |

### Quick-add syntax

Every "Add a taskâ€¦" field (and Quick capture) understands:

| Token | Meaning |
|---|---|
| `!1` `!2` `!3` `!4` (or `!critical`, `!high`, `!medium`, `!low`, `!c`, `!h`, `!m`, `!l`) | priority |
| `#work` | category (name or prefix). If no category matches, it becomes a **tag** |
| `@today` `@tomorrow` `@mon`â€¦`@sun` `@nextweek` `@2026-12-24` | due date |

Example: `Send invoice !2 #work @fri`

In the Inbox, a token that sets a date, priority or category automatically files the task into My Tasks.

### Keyboard shortcuts

| Key | Action |
|---|---|
| `N` | New task |
| `Q` | Quick capture to Inbox |
| `/` | Focus the search box (My Tasks, Weekly Notes) |
| `G` then `D` / `I` / `M` / `T` / `U` / `W` / `P` / `O` / `E` / `F` / `S` | Go to Dashboard / Inbox / My Tasks / Today / Upcoming / Week planner / daily Plan / nOtes / Editor / Focus / Stats |
| `Ctrl/âŒ˜ + Enter` | Save the open task or note form |
| `Esc` | Close a dialog, or exit Focus Mode |

## Dokumenten-Editor

Neue Seite **Editor** in der Navigation (Abschnitt *Write*, KÃ¼rzel `G` dann `E`). Weekly Notes bleiben unverÃ¤ndert und unabhÃ¤ngig davon.

**Aufbau:** links die Dokumentenliste (Suche in Titel und Inhalt, *All / Pinned / Trash*, â€žâ€¦â€œ-MenÃ¼ je Dokument),
oben Titel, Speicherstatus, MenÃ¼s **File** und **Insert** und der Knopf **Export PDF**, darunter die Formatierungsleiste,
in der Mitte die Seite (Papieransicht im gewÃ¤hlten Format), unten WÃ¶rter/Zeichen/Seiten und Zoom.
Ohne geÃ¶ffnetes Dokument zeigt die Seite Vorlagen (*Blank, Meeting notes, Report, Feature tour*) und die zuletzt bearbeiteten Dokumente.

| Bereich | Funktionen |
|---|---|
| Dokumente | Neu, aus Vorlage, Ã¶ffnen, umbenennen, duplizieren, anheften, in den Papierkorb (30 Tage wiederherstellbar), endgÃ¼ltig lÃ¶schen, suchen, importieren (`.md`, `.html`, `.txt`, Todo4Me-`.json`) |
| Speichern | Automatisch ~0,7 s nach jeder Ã„nderung, sofort beim Seiten- oder Dokumentwechsel und beim SchlieÃŸen. `Strg+S` speichert sofort. Status oben: *Saved / Editingâ€¦ / Not saved â€” retrying* |
| RÃ¼ckgÃ¤ngig | `Strg+Z` / `Strg+Y` (auch `Strg+Umschalt+Z`) fÃ¼r **alle** Ã„nderungen, auch an Tabellen, Bildern, Formen, Diagrammen, Formeln |
| Text | Fett, kursiv, unterstrichen, durchgestrichen, Textmarker, Schrift- und Hintergrundfarbe, SchriftgrÃ¶ÃŸe (8â€“72 pt), Schriftart, hoch-/tiefgestellt, Inline-Code, Formatierung lÃ¶schen |
| Absatz | Normal, Ãœberschrift 1â€“6, Zitat, links/zentriert/rechts/Blocksatz, AufzÃ¤hlung, Nummerierung (verschachtelt mit Tab), Einzug, Zeilenabstand, Abstand vor/nach, Absatz-Schattierung, horizontale Linie, Seitenumbruch |
| Schriften | **Calibri** (Standard), **Fira Code**, Arial, Georgia, Times New Roman, Verdana. Fira Code ist mitgeliefert. Wo Calibri fehlt (macOS, iPad), wird automatisch das maÃŸgleiche, mitgelieferte *Carlito* verwendet |
| Links | `Strg+K` einfÃ¼gen/bearbeiten, Klick zeigt Adresse mit *Ã–ffnen / Bearbeiten / Entfernen*, `Strg+Klick` Ã¶ffnet im Browser |
| Tabellen | Raster-Auswahl oder freie GrÃ¶ÃŸe, Kopfzeile, Zeilen/Spalten einfÃ¼gen und lÃ¶schen, Zellfarbe, `Tab` springt zur nÃ¤chsten Zelle (am Ende neue Zeile) |
| Bilder | EinfÃ¼gen per Knopf, EinfÃ¼gen aus der Zwischenablage oder Drag & Drop Â· GrÃ¶ÃŸe per Ziehen oder 25/50/75/100 % Â· links/zentriert/rechts oder Textumfluss Â· Bildunterschrift, Alternativtext, ersetzen. GroÃŸe Bilder werden automatisch verkleinert |
| Formen | Kreis, Rechteck, abgerundetes Rechteck, Dreieck, Linie, Pfeil, Raute in einer ZeichenflÃ¤che Â· verschieben (Maus oder Pfeiltasten), GrÃ¶ÃŸe Ã¼ber Anfasser (`Umschalt` = proportional), FÃ¼ll-, Rahmenfarbe, RahmenstÃ¤rke, Text in der Form, duplizieren (`Strg+D`), lÃ¶schen (`Entf`), nach vorne/hinten Â· HÃ¶he der ZeichenflÃ¤che per Anfasser |
| Diagramme | Balken, Linie, Kreis Â· Daten in einer Tabelle bearbeiten (Doppelklick), mehrere Datenreihen, Farben, Titel, Legende Â· als Vektorgrafik im PDF |
| Formeln | LaTeX-Formeleditor (`Strg+M`) mit Live-Vorschau und Symbolpalette (BrÃ¼che, Wurzeln, Potenzen, Indizes, Summen, Integrale, Grenzwerte, Matrizen, griechische Buchstaben, Symbole) Â· in der Zeile oder als eigener Block Â· Darstellung mit KaTeX |
| Code | CodeblÃ¶cke mit Syntax-Highlighting fÃ¼r JavaScript, Python, HTML, CSS, JSON, Java, C++, C, C#, SQL, Bash Â· Fira Code Â· Sprache wÃ¤hlbar Â· Kopieren-Knopf Â· `Tab` rÃ¼ckt ein, `Esc` verlÃ¤sst den Block |
| Markdown-KÃ¼rzel | `# ` bis `###### ` Ãœberschriften, `- ` Liste, `1. ` Nummerierung, `> ` Zitat, `**fett**`, `*kursiv*`, `` `code` ``, `~~durch~~`, `==markiert==`, ```` ``` ```` + Enter Codeblock, `---` + Enter Linie, `$$` + Enter Formel. `/` in einer leeren Zeile Ã¶ffnet das EinfÃ¼gen-MenÃ¼. EingefÃ¼gter Markdown-Text wird umgewandelt |
| PDF | **Export PDF** (`Strg+P`): professionelles Layout mit sauberen SeitenumbrÃ¼chen (Ãœberschriften bleiben beim Text, Tabellenzeilen, Bilder, Formeln und CodeblÃ¶cke werden nicht zerrissen, TabellenkÃ¶pfe wiederholen sich), eingebetteten Schriften, Vektorgrafiken, Lesezeichen aus den Ãœberschriften. **File â†’ Page setup**: A4/Letter/A5/Legal, Hoch-/Querformat, RÃ¤nder, Kopf- und FuÃŸzeile (Platzhalter `{title}`, `{date}`), Seitenzahlen (â€žPage 1 of 3â€œ, â€ž1 / 3â€œ, â€ž1â€œ), erste Seite ohne Kopfzeile. Die gestrichelten Linien auf der Seite zeigen ungefÃ¤hr, wo eine neue PDF-Seite beginnt. In der Desktop-App Ã¶ffnet sich ein Speichern-Dialog, im Browser der Druckdialog (â€žAls PDF speichernâ€œ). Das Dokument selbst wird dabei nicht verÃ¤ndert |
| Export | Markdown (`.md`, Obsidian-kompatibel, Bilder/Diagramme eingebettet) und Todo4Me-Dokument (`.json`, verlustfrei) Â· *Settings â†’ Documents* exportiert/importiert alle Dokumente |

**Dateiformat:** Dokumente werden intern als bereinigtes HTML (nur erlaubte Elemente, Attribute und Stilangaben) plus JSON-Metadaten gespeichert,
nicht als PDF und nicht als Markdown. Grund: Markdown kann Farben, Schriften, Ausrichtung, Formen und Diagramme nicht verlustfrei abbilden.
Bilder, Formen, Diagramme, Formeln und CodeblÃ¶cke sind â€žWidgetsâ€œ, die nur ihre Quelldaten speichern (z. B. LaTeX-Text, Diagrammwerte) und
beim Ã–ffnen neu gezeichnet werden, also immer editierbar bleiben. Markdown ist das Austauschformat fÃ¼r Import und Export.
Alles, was in ein Dokument gelangt (Laden, EinfÃ¼gen, Import, RÃ¼ckgÃ¤ngig), lÃ¤uft durch `editor-sanitize.js`. Skripte, Event-Handler,
`javascript:`-Links, externe Ressourcen und fremde Stilangaben werden entfernt.

**Offline:** KaTeX, Prism und die Schriften liegen in `vendor/` und werden erst geladen, wenn der Editor geÃ¶ffnet wird (der Start der Ã¼brigen App bleibt unverÃ¤ndert schnell).

## Your data: saving, backup and restore

- **Automatic saving.** Every change is written to `localStorage` immediately. The sidebar footer shows when the last save happened, and warns if a save fails (for example, storage is full).
- **Automatic backup.** A second copy (`todo4me.backup.v1`) is refreshed at most once a day. If the main data ever becomes unreadable, the app restores this backup on startup. The damaged copy is kept under `todo4me.corrupt.<timestamp>` rather than deleted, and you are told what happened. You can also restore the backup manually from **Settings â†’ Restore auto-backup**.
- **Validation.** All data (from storage or from an import) passes through a sanitizer. Unknown fields are dropped, invalid values fall back to safe defaults, and items that cannot be repaired are skipped and reported.
- **Multiple tabs** stay in sync: a change in one tab updates the others.
- **Every destructive action is confirmed** (delete task, note or category; import with replace; restore backup; reset).

### Export (backup)

**Settings â†’ Data & backup â†’ Export JSON** downloads `todo4me-backup-YYYY-MM-DD.json` with all tasks, notes, categories, daily plans, settings and statistics.

### Import (restore or move to another device)

**Settings â†’ Data & backup â†’ Import JSON**, then choose a file. You'll see what the file contains and can pick:

- **Merge**: keeps your current data and adds the file's items. When the same item exists in both, the one updated most recently wins. Your current settings are kept.
- **Replace all**: (asks for confirmation) replaces everything, including settings, with the file's contents.

### Reset

**Settings â†’ Reset all data** deletes everything Todo4Me has stored in this browser (export first if you might need it).

## Project structure

```
todo4me/
â”œâ”€â”€ index.html            App shell, icon sprite (inline SVG), dialogs, script includes
â”œâ”€â”€ package.json          Desktop app: npm scripts + electron-builder configuration (+ update feed)
â”œâ”€â”€ electron/
â”‚   â”œâ”€â”€ main.js           Electron main process (window, data folder, menu, backups, PDF, security)
â”‚   â”œâ”€â”€ updater.js        Automatic updates (electron-updater)
â”‚   â””â”€â”€ preload.js        Minimal bridge exposed as window.todo4meDesktop
â”œâ”€â”€ scripts/
â”‚   â”œâ”€â”€ start.js          npm start / npm run dev
â”‚   â”œâ”€â”€ build.js          npm run build / release (installer + portable + latest.yml â†’ dist/)
â”‚   â””â”€â”€ vendor.js         npm run vendor (copies KaTeX, Prism, fonts â†’ vendor/)
â”œâ”€â”€ build/icon.png        App icon used by electron-builder
â”œâ”€â”€ assets/icons/
â”‚   â”œâ”€â”€ favicon.svg
â”‚   â””â”€â”€ icon.png          Window icon
â”œâ”€â”€ vendor/               Offline third-party files for the editor (MIT / SIL OFL, licenses included)
â”‚   â”œâ”€â”€ katex/            Formula rendering + fonts
â”‚   â”œâ”€â”€ prism/prism.js    Syntax highlighting (11 languages)
â”‚   â””â”€â”€ fonts/            Fira Code, Carlito (Calibri-compatible)
â”œâ”€â”€ tests/                Browser + desktop test suites (Chrome DevTools Protocol, no npm deps)
â”œâ”€â”€ css/
â”‚   â”œâ”€â”€ styles.css        Design tokens (light/dark), components, views, responsive rules
â”‚   â””â”€â”€ editor.css        Editor page, document typography, widgets, print/PDF rules
â””â”€â”€ js/
    â”œâ”€â”€ utils.js          Date helpers (local YYYY-MM-DD), HTML escaping, DOM helpers
    â”œâ”€â”€ storage.js        Schema defaults, validation/sanitizing, storage adapter, backup, import/export/merge
    â”œâ”€â”€ store.js          In-memory state, all mutations (commit â†’ save â†’ notify), selectors
    â”œâ”€â”€ ui.js             Action registry, modal, confirm dialog, toasts, progress components
    â”œâ”€â”€ tasks.js          Task row/editor/quick capture, quick-add parser; Inbox, My Tasks, Today, Upcoming views
    â”œâ”€â”€ dashboard.js      Dashboard view, Top 3 card and picker
    â”œâ”€â”€ planner.js        Weekly planner (drag & drop, day details) and Daily Plan view
    â”œâ”€â”€ notes.js          Weekly notes view and editor
    â”œâ”€â”€ focus.js          Focus mode and Pomodoro timer
    â”œâ”€â”€ stats.js          Statistics view and charts
    â”œâ”€â”€ settings.js       Settings view, theme, categories, export/import, sample data
    â”œâ”€â”€ editor-sanitize.js  Editor: HTML allowlist sanitizer (paste, import, storage, undo)
    â”œâ”€â”€ docstore.js       Editor: IndexedDB storage for documents and images, export/import
    â”œâ”€â”€ editor-widgets.js Editor: images, drawings/shapes, charts, formulas, code blocks, dialogs
    â”œâ”€â”€ editor-markdown.js Editor: Markdown import/export
    â”œâ”€â”€ editor-core.js    Editor: editing engine (selection, undo/redo, formatting, tables, links, paste)
    â”œâ”€â”€ editor.js         Editor: page, document list, toolbar, menus, autosave, PDF export
    â”œâ”€â”€ app.js            Router (hash-based), navigation, event delegation, shortcuts, boot
    â””â”€â”€ desktop.js        Desktop-only additions (inactive in the browser)
```

### Architecture notes

- **Plain JavaScript (ES2020) with no build.** The files are classic scripts that share one `window.T4` namespace instead of ES modules, so the app also works when opened directly from disk (`file://`), where browsers block module imports.
- **One-way data flow.** Views are functions `render(params) â†’ HTML string`. Every change goes through `T4.store.commit()`, which saves to storage and notifies the app, which then re-renders the current view. Focus and half-typed quick-add text are preserved across re-renders.
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
  "id": "task_lz1k2â€¦",           // unique string
  "title": "Finish quarterly report",   // required, â‰¤ 500 chars
  "description": "",
  "notes": "",
  "status": "todo",              // "todo" | "in_progress" | "done"
  "priority": "high",            // "critical" | "high" | "medium" | "low" | null (none)
  "categoryId": "cat_work",      // Category.id or null
  "tags": ["q4", "reports"],     // lowercase, unique, â‰¤ 20
  "dueDate": "2026-11-02",       // or null
  "dueTime": "15:00",            // or null (only kept when dueDate is set)
  "estimate": 90,                // minutes (1â€“1440) or null
  "subtasks": [{ "id": "sub_â€¦", "title": "Collect numbers", "done": true }],
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
  "id": "note_â€¦",
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
| `todo4me.editor.ui` | Editor view preferences: `{ "zoom": 100, "side": true }` (document list shown) |
| `todo4me.app.version` | Desktop app: last started version (to confirm an update once) |
| `todo4me.docs.backupDay` | Desktop app: day of the last documents backup file |

### Documents (editor) â€” IndexedDB `todo4me-docs`

Editor documents are **not** stored in `todo4me.data.v1`; they live in their own IndexedDB database, so large documents and images can never
crowd out tasks and notes (LocalStorage only holds a few MB).

| Store | Record |
|---|---|
| `docs` | `{ id, format: 1, title, text, words, page, pinned, createdAt, updatedAt, openedAt, deletedAt }`; `text` is a plain-text copy for search, `deletedAt` â‰  null means *in trash* (purged after 30 days) |
| `bodies` | `{ id, html }`: the document content (sanitized HTML, see below) |
| `assets` | `{ id, blob, type, size, createdAt }`: images, referenced from the content; unreferenced images are cleaned up after a day |

```jsonc
// page (page setup, per document)
{ "size": "A4", "orientation": "portrait", "margins": "normal", "header": "{title}", "footer": "",
  "pageNumbers": "bottom-center", "numberFormat": "page-of", "firstPageHeader": true }
```

Content HTML uses `p, h1â€“h6, blockquote, ul/ol/li, table, hr`, inline formatting (`b, i, u, s, mark, sub, sup, code, a, span[style]`) and widgets:

```html
<figure class="t4-w" data-w="img"   data-p='{"a":"img_â€¦","w":50,"al":"center","cap":"","alt":""}'></figure>
<figure class="t4-w" data-w="draw"  data-p='{"h":240,"al":"center","shapes":[{"id":"s1","t":"rect","x":40,"y":40,"w":120,"h":80,"fill":"#dbe4ff","stroke":"#4f6bed","sw":2,"text":"","tc":"#1f2330","fs":16}]}'></figure>
<figure class="t4-w" data-w="chart" data-p='{"type":"bar","title":"","labels":["Q1"],"series":[{"name":"","color":"#4f6bed","values":[12]}],"w":100,"legend":true}'></figure>
<figure class="t4-w" data-w="math"  data-p='{"tex":"\\frac{a}{b}"}'></figure>   <!-- <span â€¦> = inline formula -->
<figure class="t4-w" data-w="code"  data-p='{"lang":"python"}'><pre><code>print("hi")</code></pre></figure>
<figure class="t4-w" data-w="pagebreak" data-p="{}"></figure>
```

Shape types `t`: `rect, round, ellipse, tri, diamond, line, arrow`. A documents export (`*.todo4me-doc.json`, *Settings â†’ Documents*, daily desktop backup)
is `{ "app": "todo4me", "kind": "documents", "format": 1, "documents": [meta + html], "assets": { "img_â€¦": "data:image/â€¦" } }`.
Imports never overwrite existing documents (id clashes get a new id).

## Tests

```bash
node tests/cdp.mjs tests/test-functional.mjs           # 141 checks: all original features (Chrome)
node tests/cdp.mjs tests/test-editor.mjs               # 155 checks: editor, PDF, persistence, Markdown, security (Chrome)
node tests/cdp-electron.mjs tests/test-functional.mjs  # the original checks inside the desktop app
node tests/cdp-electron.mjs tests/test-electron.mjs    # 52 checks: security, menu, restart, backups, PDF export, close-save, updates
```

Optional environment: `PDFTEXT=<script>` checks PDF text (page numbers, header/footer) with pdf.js, `TODO4ME_PDF_DIR=<folder>` lets the desktop test export PDFs without a dialog.

## Browser support

Current versions of Chrome, Edge, Firefox and Safari (desktop and mobile). Requires `<dialog>`, CSS `color-mix()` and `:has()` support (all evergreen browsers since 2023).
