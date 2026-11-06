# Todo4Me

**Todo4Me** ist dein persönliches Produktivitäts-Dashboard: Aufgaben mit Prioritäten und Terminen, Wochenplanung (auch als Kalender mit Zeitblöcken),
Wochennotizen, Erinnerungen und ein Dokumenten-Editor mit PDF-Export. Alles läuft **offline auf deinem Computer**, ohne Konto und ohne Cloud.
Es gibt eine Windows-Desktop-App (Electron) und eine Browser-Version.

![Version](https://img.shields.io/badge/Version-2.1.1-5b5bd6)
![Plattform](https://img.shields.io/badge/Plattform-Windows-0078d4)
![Offline](https://img.shields.io/badge/läuft-offline-2e9e5b)

![Todo4Me Dashboard](docs/screenshots/dashboard-light.png)

## Download & installieren

1. Auf der Seite **[Neueste Version](https://github.com/muelgerhbf/todo4me/releases/latest)** (aktuell [2.1.1](https://github.com/muelgerhbf/todo4me/releases/tag/windows-v2.1.1)) unter *Assets* herunterladen:
   - **`Todo4Me-Setup-2.1.1.exe`**: der Installer (empfohlen). Doppelklicken und den Schritten folgen. Keine Admin-Rechte nötig, es entstehen Desktop-Verknüpfung und Startmenü-Eintrag. Die installierte Version **aktualisiert sich automatisch**.
   - **`Todo4Me-2.1.1-portable.exe`**: ohne Installation startbar, z. B. vom USB-Stick. Aktualisiert sich **nicht** selbst.
2. **Windows SmartScreen:** Die Dateien sind nicht digital signiert (ein Code-Signing-Zertifikat kostet Geld). Erscheint „Der Computer wurde durch Windows geschützt“,
   wähle **Weitere Informationen → Trotzdem ausführen**.
3. **Deine Daten** liegen auf deinem Computer im Ordner `%APPDATA%\Todo4Me` (z. B. `C:\Users\<Name>\AppData\Roaming\Todo4Me`), installierte und portable Version teilen sich ihn.
   Updates, Neuinstallation und Deinstallation löschen sie nicht. Die App selbst lädt keine Inhalte aus dem Netz (nur die Update-Prüfung und, wenn du sie einrichtest, abonnierte Kalender).

Du kannst Todo4Me auch ohne Installation im Browser nutzen (siehe [Im Browser nutzen](#im-browser-nutzen)).

## Erste Schritte

1. **Mit Beispieldaten ausprobieren (optional).** *Settings → Data & backup → Add sample data* füllt die App mit Beispielaufgaben. Mit *Reset all data* räumst du später wieder auf.
2. **Erste Aufgabe anlegen.** Tippe im Dashboard oder unter *My Tasks* in das Feld „Add a task…“ und drücke Enter, oder drücke `N` für das ausführliche Formular. Mit der **Quick-add-Syntax** setzt du Priorität, Kategorie und Datum gleich mit:
   `Send invoice !2 #work @fri` (Priorität 2, Kategorie Work, Fälligkeit Freitag). Einen Gedanken ohne Details wirfst du mit `Q` (*Quick capture*) in die **Inbox** und sortierst später.

   ![My Tasks](docs/screenshots/tasks-light.png)

3. **Aufgabe ausarbeiten.** Ein Klick auf eine Aufgabe öffnet den Editor: Priorität, Fälligkeitsdatum und optionale Uhrzeit, Schätzung, Kategorie, Tags, Teilaufgaben, Wiederholung und **Reminder** (Erinnerung). Unter *Today* siehst du, was heute dran ist, unter *Upcoming* die nächsten 14 Tage.
4. **Den Tag fokussieren.** Das Dashboard zeigt deine Tagesübersicht. Mit **Choose** wählst du deine **Top 3 für heute**; *Focus Mode* (`G` dann `F`) blendet alles außer einer Aufgabe aus und bringt einen Pomodoro-Timer mit.
5. **Die Woche planen.** Im *Weekly Planner* ziehst du Aufgaben zwischen den Tagen (**Days**). Die Ansicht **Calendar** zeigt ein Stundenraster: Aufgaben mit Uhrzeit sind Blöcke, die du verschiebst, in der Länge ziehst oder per Klick in einen freien Slot neu anlegst.

   ![Weekly Planner, Ansicht Calendar](docs/screenshots/planner-calendar-light.png)

6. **Notizen und Dokumente.** *Weekly Notes* hält Gedanken und Ideen nach Woche fest (nicht alles muss eine Aufgabe sein). Im **Editor** schreibst du richtige Dokumente (Überschriften, Tabellen, Bilder, Formeln, Code) und exportierst sie als PDF oder Markdown; die Vorlage *Feature tour* zeigt alles.

   ![Dokumenten-Editor](docs/screenshots/editor-light.png)

7. **Im Hintergrund weiterlaufen lassen (Desktop-App).** Schließt du das Fenster, läuft Todo4Me im **Tray** weiter, damit Erinnerungen erscheinen. Mit **`Strg+Alt+Leertaste`** öffnest du *Quick capture* aus jedem Programm.
   Wirklich beenden: Tray-Symbol → *Quit Todo4Me*.

## Funktionen im Überblick

### Hell und dunkel

Das Design wechselt unter *Settings → Appearance → Theme* zwischen **Light**, **Dark** und **System**.

| Hell | Dunkel |
|---|---|
| ![Dashboard hell](docs/screenshots/dashboard-light.png) | ![Dashboard dunkel](docs/screenshots/dashboard-dark.png) |
| ![Kalenderansicht hell](docs/screenshots/planner-calendar-light.png) | ![Kalenderansicht dunkel](docs/screenshots/planner-calendar-dark.png) |
| ![Editor hell](docs/screenshots/editor-light.png) | ![Editor dunkel](docs/screenshots/editor-dark.png) |

### Weitere Ansichten

| | |
|---|---|
| ![Weekly Planner mit Tagesspalten](docs/screenshots/planner-days-light.png) | ![Weekly Notes](docs/screenshots/notes-light.png) |
| **Weekly Planner** (Days) mit Wochennotizen | **Weekly Notes** nach Woche gruppiert |
| ![Statistics](docs/screenshots/statistics-light.png) | ![Focus Mode (dunkel)](docs/screenshots/focus-dark.png) |
| **Statistics** | **Focus Mode** mit Pomodoro-Timer |
| ![Navigation auf dem Handy](docs/screenshots/mobile-menu.png) | |
| Navigation in der schmalen (mobilen) Ansicht | |

Die Screenshots stammen aus der laufenden App mit Beispieldaten.

## Tipps

**Die wichtigsten Kürzel**

| Taste | Aktion |
|---|---|
| `N` | Neue Aufgabe |
| `Q` | Quick capture in die Inbox |
| `/` | Suchfeld fokussieren (My Tasks, Weekly Notes) |
| `G` dann `D` / `M` / `T` / `W` / `E` / `F` | Zu Dashboard / My Tasks / Today / Week planner / Editor / Focus |
| `Strg+Alt+Leertaste` | Quick capture von überall (Desktop-App) |

**Quick-add-Beispiele**

| Eingabe | Ergebnis |
|---|---|
| `Call mom @tomorrow` | Fällig morgen |
| `Report !1 #work @mon` | Priorität 1 (Critical), Kategorie Work, Montag |
| `Buy milk #shopping` | Kategorie Shopping (passt keine Kategorie, wird `#…` ein Tag) |
| `Dentist @2026-12-24` | Fällig am angegebenen Datum |

**Sicherung.** Die Desktop-App legt täglich automatisch eine Sicherung an (letzte 14 Tage, `%APPDATA%\Todo4Me\backups`). Zusätzlich kannst du jederzeit unter
*Settings → Data & backup → Export JSON* eine Datei speichern und mit *Import JSON* wiederherstellen. Mehr: [Daten: Speichern, Sicherung und Wiederherstellung](#daten-speichern-sicherung-und-wiederherstellung).

**Updates.** Die installierte Version prüft selbst auf neue Versionen und fragt vor dem Neustart (*Restart now*). Manuell: *Help → Check for updates*. Details: [Updates](#updates).

Weiterführendes: [Änderungsprotokoll](CHANGELOG.md) · [Anleitung für KI-Agenten](docs/AGENTEN-ANLEITUNG.md)

## Inhalt

- [Download & installieren](#download--installieren) · [Erste Schritte](#erste-schritte) · [Tipps](#tipps)
- [Alle Funktionen](#alle-funktionen)
- [Updates](#updates)
- [Im Browser nutzen](#im-browser-nutzen)
- [Desktop-App im Detail](#desktop-app-im-detail): [Daten](#wo-werden-die-daten-gespeichert) · [Browser-Daten übernehmen](#daten-aus-der-browser-version-übernehmen) · [Menü und Kürzel](#menü-und-tastenkürzel-der-desktop-app) · [Tray, Erinnerungen, Schnellerfassung](#im-hintergrund-tray-erinnerungen-schnellerfassung)
- [Kalender abonnieren](#kalender-abonnieren-outlook--google-nur-lesen)
- [Referenz](#referenz): [Quick-add](#quick-add-syntax) · [Tastenkürzel](#tastenkürzel) · [Kalenderansicht](#weekly-planner-kalenderansicht) · [ICS](#ics-unterstützung) · [Dokumenten-Editor](#dokumenten-editor)
- [Daten: Speichern, Sicherung, Wiederherstellung](#daten-speichern-sicherung-und-wiederherstellung)
- [Für Entwickler](#für-entwickler) (Build, Release, Aufbau, Datenmodell, Tests)
- [Browser-Unterstützung](#browser-unterstützung)

## Alle Funktionen

| Bereich | Was du tun kannst |
|---|---|
| **Dashboard** | Begrüßung und Tagesübersicht, Statistik für heute, Fortschrittsring, **Daily Top 3** mit Hauptziel, heutige Aufgaben, wichtige Termine, Wochenfortschritt, Schnellerfassung |
| **Inbox** | Aufgaben ohne Datum, Priorität und Kategorie erfassen; per Klick auf Heute/Morgen legen, im Editor einsortieren oder nach My Tasks verschieben |
| **My Tasks** | Suche (Titel, Beschreibung, Notizen, Tags, Teilaufgaben, Kategorie), Filter nach Status, Priorität, Kategorie, Datum, Tag, Sortierung |
| **Today / Upcoming** | Heute plus Überfälliges („alle auf heute“) · die nächsten 14 Tage nach Tag gruppiert, dann „Later“ |
| **Aufgaben** | Titel, Beschreibung, Notizen, Priorität (Critical / High / Medium / Low / keine), Status, Kategorie, Tags, Fälligkeit mit optionaler Uhrzeit, Schätzung, Teilaufgaben, Wiederholung (täglich / wöchentlich / monatlich), Rückgängig beim Erledigen und Löschen |
| **Erinnerungen** | Pro Aufgabe zur Fälligkeit oder 5/15/30 min, 1 h, 1 Tag vorher · Windows-Benachrichtigung (auch aus dem Tray) · **Snooze 10 min** · jede Erinnerung nur einmal |
| **Weekly Planner** | Ansicht **Days \| Calendar**: Tagesspalten mit Drag & Drop, oder Stundenraster mit Zeitblöcken zum Verschieben, Größe ändern und Anlegen |
| **Kalender-Abos** | Outlook-/Google-Kalender **nur lesend** per ICS-Link (Desktop-App) oder `.ics`-Import |
| **Daily Plan** | Pro Tag Hauptziel, Top 3, Aufgaben, Notizen und Reflexion, automatisch gespeichert |
| **Weekly Notes** | Notizen mit Titel, Text, Tags und Anheften, nach Woche gruppiert, mit Suche und Filtern |
| **Editor** | Dokumente wie in einer Textverarbeitung, mit PDF- und Markdown-Export |
| **Focus Mode** | Ablenkungsfreie Ansicht einer Aufgabe mit Pomodoro-Timer (Standard 25/5), läuft über Seiten-Neuladen weiter |
| **Statistics** | Heute/Woche/Monat erledigt, Erledigungsrate, Tage-Serie, Wochendiagramm, 8-Wochen-Trend, offene Aufgaben nach Priorität, Fortschritt je Kategorie |
| **Settings** | Name, Theme hell/dunkel/System, Akzentfarbe, Sortierung, Wochenstart, Pomodoro, Erinnerungszeit, Kalender, Kategorien, Export/Import, Auto-Backup, Beispieldaten, Reset |

## Updates

Die **installierte** Version aktualisiert sich selbst:

1. Kurz nach dem Start und danach alle 4 Stunden fragt Todo4Me im Hintergrund nach einer neuen Version.
2. Gibt es eine, wird sie im Hintergrund heruntergeladen („Todo4Me 2.1.0 is available and is being downloaded…“).
3. Danach erscheint „Todo4Me 2.1.0 is ready“ mit **Restart now**. Wer später neu startet, bekommt das Update beim nächsten Beenden.
4. Nach dem Neustart bestätigt die App „Todo4Me was updated to version 2.1.0“. Aufgaben, Notizen, Pläne und Dokumente bleiben erhalten, denn sie liegen in `%APPDATA%\Todo4Me` und nicht im Programmordner.

Status und die Knöpfe **Check for updates** / **Restart & install** stehen unter *Settings → Desktop app → Updates* und im Menü *Help → Check for updates*.
Ohne Internet passiert nichts Störendes: automatische Prüfungen schlagen still fehl, eine manuelle Prüfung zeigt eine verständliche Meldung.
Die portable `.exe` und die Entwicklerversion (`npm start`) aktualisieren sich nicht selbst und sagen das in den Einstellungen.

> **Einmalig für bestehende Nutzer von Version 1.0.0:** 1.0.0 hatte noch keine Update-Funktion.
> Sie installieren `Todo4Me-Setup-2.1.1.exe` **einmal** über die alte Version (Daten bleiben erhalten). Ab dann kommen alle weiteren Versionen automatisch.

Was sich in jeder Version geändert hat, steht im [CHANGELOG](CHANGELOG.md).

## Im Browser nutzen

**Variante 1: einfach öffnen.** `index.html` doppelklicken (oder in Chrome, Edge, Firefox oder Safari ziehen). Alles funktioniert über `file://`.

**Variante 2: lokal ausliefern** (für eine feste Adresse oder mehrere Geräte im Netzwerk):

```bash
python -m http.server 8080        # dann http://localhost:8080 öffnen
npx serve .                        # oder, mit Node.js
```

> Daten werden pro Browser *und* pro Origin gespeichert. `file:///…/index.html` und `http://localhost:8080`
> haben getrennte Daten. Eine Variante wählen oder Daten per Export/Import verschieben.

## Desktop-App im Detail

### Wo werden die Daten gespeichert?

- Alle Daten liegen im LocalStorage der App, im festen Ordner **`%APPDATA%\Todo4Me`** (z. B. `C:\Users\<Name>\AppData\Roaming\Todo4Me`).
  Installierte und portable Version nutzen **denselben** Ordner und sehen dieselben Daten.
- Updates, Neuinstallation und **Deinstallation löschen diese Daten nicht.**
- Die Desktop-App schreibt **einmal täglich eine JSON-Sicherung** nach `%APPDATA%\Todo4Me\backups` (die letzten 14 Tage bleiben erhalten).
  Es zählt der Stand beim ersten Start des Tages, ein späteres Missgeschick überschreibt ihn nicht.
  Wiederherstellen mit **Import JSON**. Den Ordner öffnest du über *Datei → Open backups folder* oder *Settings → Desktop app*.
- Die **Dokumente des Editors** liegen in einer eigenen Datenbank (IndexedDB) im selben Ordner, getrennt von Aufgaben und Notizen.
  Auch sie bekommen ein tägliches Backup: `backups\documents-JJJJ-MM-TT.json` (inklusive Bilder, 14 Tage). Wiederherstellen über *Settings → Documents → Import documents*.
- Beim Schließen des Fensters läuft Todo4Me standardmäßig im Tray weiter (siehe [unten](#im-hintergrund-tray-erinnerungen-schnellerfassung)).
  Beim echten Beenden (Tray → *Quit Todo4Me*, *Datei → Exit*, Update-Neustart, Herunterfahren/Abmelden) speichert der Editor offene Änderungen, bevor die App endet.
- Die Einstellungen der Desktop-App (Tray, Autostart, Tastenkürzel) liegen in `%APPDATA%\Todo4Me\desktop-settings.json`. Sie gelten nur für diesen Computer und sind nicht Teil von Export/Import.
- Es läuft immer nur **eine** Instanz. Ein zweiter Start bringt das vorhandene Fenster nach vorne, damit nie zwei Fenster dieselben Daten schreiben.

### Daten aus der Browser-Version übernehmen

Die Desktop-App kann den LocalStorage deines Browsers nicht direkt lesen. Die Übernahme dauert eine Minute, **nichts wird automatisch überschrieben oder gelöscht**:

1. Die alte Version im Browser öffnen (`index.html`) → **Settings → Export JSON**. Die Datei `todo4me-backup-JJJJ-MM-TT.json` wird gespeichert.
2. Die Desktop-App öffnen → **Settings → Import JSON** (oder *Datei → Import data*, `Strg+I`) → Datei auswählen.
3. **Merge** wählen: Vorhandenes bleibt, Importiertes kommt hinzu. *Replace all* ersetzt alles und fragt vorher ausdrücklich nach.

Die Daten im Browser bleiben unverändert. Solange die Desktop-App leer ist, weist sie beim Start auf diesen Weg hin.

### Menü und Tastenkürzel der Desktop-App

Alle Tastenkürzel der Web-App (`N`, `Q`, `/`, `G` + Buchstabe …) funktionieren weiter. Zusätzlich gibt es das Menü:

| Menü | Kürzel |
|---|---|
| File → New task / Quick capture / New weekly note | `Strg+N` / `Strg+Umschalt+Leertaste` / `Strg+Umschalt+N` |
| File → New document | `Strg+Alt+N` |
| File → Export document as PDF | `Strg+P` |
| File → Export data / Import data | `Strg+E` / `Strg+I` (im Editor gelten wie in Word `Strg+I` = kursiv, `Strg+E` = zentrieren, `Strg+N` = neues Dokument; über das Menü funktionieren Export/Import/New task immer) |
| File → Open backups folder / Open data folder | |
| Go → Dashboard … Focus Mode / Settings | `Strg+1` … `Strg+9` / `Strg+,` |
| Go → Editor | `Strg+Umschalt+D` |
| View → Zoom, Vollbild, Neu laden | `Strg+Plus/Minus/0`, `F11`, `Strg+R` |
| Help → Check for updates | |
| **Systemweit** (auch in anderen Programmen): Quick capture | `Strg+Alt+Leertaste` (einstellbar) |

### Im Hintergrund: Tray, Erinnerungen, Schnellerfassung

**Tray und Schließen.** Todo4Me zeigt ein Symbol im Infobereich der Taskleiste. Klick öffnet das Fenster, Rechtsklick das Menü
(*Open Todo4Me*, *Quick capture*, *New task*, *Quit Todo4Me*). Das Schließen des Fensters (X, `Alt+F4`) **blendet es nur aus**, damit Erinnerungen auch bei geschlossenem Fenster erscheinen.
Beim ersten Mal weist eine Windows-Benachrichtigung einmalig darauf hin. **Wirklich beenden:** Tray → *Quit Todo4Me* oder *Datei → Exit*; dabei gilt weiterhin „erst speichern, dann schließen“.
Herunterfahren oder Abmelden von Windows beendet Todo4Me ordnungsgemäß, ebenso *Restart & install*. Ein bereitgestelltes Update wird installiert, sobald Todo4Me wirklich beendet wird (oder sofort mit *Restart now*).

**Erinnerungen.** Im Aufgaben-Editor gibt es das Feld **Reminder**: *At due time*, 5/15/30 Minuten, 1 Stunde oder 1 Tag vorher.
Maßgeblich sind Fälligkeitsdatum und -uhrzeit. Hat die Aufgabe nur ein Datum, gilt die **Reminder time** aus *Settings → Tasks & planning* (Standard 09:00).
Ohne Datum wird die Aufgabe beim Speichern auf heute gelegt. Zur fälligen Zeit erscheint eine **Windows-Benachrichtigung** (auch im Tray-Betrieb):
Klick öffnet die Aufgabe, **Snooze 10 min** erinnert zehn Minuten später erneut. In der App erscheint zusätzlich eine Meldung mit *Open* und *Snooze 10 min*.

- Jede Erinnerung erscheint **nur einmal** (auch nach einem Neustart), nie für erledigte Aufgaben. Wird die Aufgabe verschoben, gibt es für den neuen Termin eine neue Erinnerung.
- Wiederkehrende Aufgaben: Die nächste Wiederholung bekommt automatisch ihre eigene Erinnerung.
- War Todo4Me geschlossen, als Erinnerungen fällig wurden, kommt beim nächsten Start **eine** Sammelmeldung („2 reminders missed“).
- Genauigkeit: etwa auf die Minute. Läuft das Fenster lange verborgen, bremst Chromium Zeitgeber auf einmal pro Minute.
- Test: *Settings → Tasks & planning → Reminder notifications → Test*. Unterdrückt Windows Benachrichtigungen (z. B. „Nicht stören“), bleibt die Meldung in der App.
- Im Browser gibt es dasselbe als Browser-Benachrichtigung (wenn erlaubt) und immer als Meldung in der App.

**Schnellerfassung von überall.** `Strg+Alt+Leertaste` holt Todo4Me nach vorne und öffnet *Quick capture*, auch aus einem anderen Programm.
Alternativ wählbar: `Strg+Umschalt+Alt+Leertaste`, `Strg+Alt+T`, `Strg+Umschalt+Alt+T`. Kombinationen, die auf deutschen Tastaturen Zeichen erzeugen
(`AltGr` = `Strg+Alt`, z. B. `AltGr+Q` = `@`), stehen bewusst nicht zur Wahl. Ist ein Dialog offen, wird er nicht ersetzt (nichts Getipptes geht verloren).
Ist das Kürzel schon belegt, sagt das die Einstellungsseite.

**Einstellungen** unter *Settings → Desktop app*:

| Einstellung | Standard |
|---|---|
| Keep running in the tray when the window is closed | an |
| Start Todo4Me when Windows starts (startet unsichtbar im Tray) | aus. Nur in der installierten Version; vor einer Deinstallation ausschalten, sonst bleibt ein verwaister Autostart-Eintrag |
| System-wide shortcut / Shortcut | an / `Strg+Alt+Leertaste` |

### Kalender abonnieren (Outlook / Google, nur lesen)

Im **Weekly Planner** gibt es neben den Tagesspalten die Ansicht **Calendar** (siehe [Kalenderansicht](#weekly-planner-kalenderansicht)).
Dort können Termine aus Outlook oder Google Calendar erscheinen, **nur zum Ansehen**, in der Farbe des Kalenders und schraffiert, damit man sie nicht mit Aufgaben verwechselt. Auch das Dashboard zeigt „Calendar today“.

**Einrichten** unter *Settings → Calendars*: Namen und Farbe wählen, Kalender-Link einfügen, **Subscribe**. Den Link gibt es hier:

- **Outlook** (Web/Microsoft 365): *Einstellungen → Kalender → Freigegebene Kalender → Kalender veröffentlichen* → Kalender und „Alle Details“ wählen → **ICS-Link** kopieren.
- **Google Calendar**: *Einstellungen → (Kalender links auswählen) → Kalender integrieren* → **Privatadresse im iCal-Format**.

Es geht ohne Anmeldung (kein OAuth): Todo4Me lädt nur diese ICS-Datei. Erlaubt sind `https://`- und `webcal://`-Adressen.
Die Kalender werden **beim Start, alle 30 Minuten** und mit dem Knopf *Update* aktualisiert.
Klappt das nicht (offline, Link zurückgesetzt, Serverfehler), steht der Grund beim Kalender, und die zuletzt geladene Fassung bleibt sichtbar.
Statt eines Links kann man eine **`.ics`-Datei importieren** (wird nicht automatisch aktualisiert).

> **Der Link ist ein Geheimnis:** Wer ihn kennt, kann den Kalender lesen. Todo4Me speichert ihn nur auf diesem Computer
> (eigener LocalStorage-Schlüssel, **nicht** in Export, Import oder täglichen Sicherungsdateien), zeigt ihn nur gekürzt an (`outlook.office365.com/••••••••`)
> und schreibt ihn nie in ein Protokoll. Entfernen über das Papierkorb-Symbol; *Reset all data* löscht ihn ebenfalls.

**Im Browser** (ohne Desktop-App) ist das Abonnieren per Link nicht möglich: Browser lassen eine Seite keine Kalender von fremden Servern laden (CORS),
und die Sicherheitsrichtlinie der Seite verbietet Netzwerkzugriffe. Dort gibt es nur den `.ics`-Import, und die Einstellungen sagen das.

<details>
<summary>Technik des Kalender-Downloads</summary>

Der Download läuft im Hauptprozess (`electron/calendar.js`) über die einzige neue Brücken-Funktion `fetchCalendar(url)`. Geprüft wird dort:
nur `https://` (`webcal://` wird zu `https://`), keine Zugangsdaten in der Adresse, Weiterleitungen nur auf `https://` (max. 5), höchstens 5 MB, 20 s Zeitlimit,
höchstens 4 Downloads gleichzeitig, eigene Sitzung im Arbeitsspeicher ohne Cookies und ohne Anmeldedaten (Passwort-Abfragen werden abgelehnt),
und die Antwort muss eine iCalendar-Datei sein. Es gelten der System-Proxy und der Windows-Zertifikatspeicher wie im Browser.
Ausgewertet wird die Datei in der Seite (`js/ics.js`, siehe [ICS-Unterstützung](#ics-unterstützung)).

</details>

## Referenz

### Quick-add-Syntax

Jedes „Add a task…“-Feld (und Quick capture) versteht:

| Token | Bedeutung |
|---|---|
| `!1` `!2` `!3` `!4` (oder `!critical`, `!high`, `!medium`, `!low`, `!c`, `!h`, `!m`, `!l`) | Priorität |
| `#work` | Kategorie (Name oder Anfang). Passt keine Kategorie, wird es ein **Tag** |
| `@today` `@tomorrow` `@mon`…`@sun` `@nextweek` `@2026-12-24` | Fälligkeitsdatum |

Beispiel: `Send invoice !2 #work @fri`

In der Inbox sortiert ein Token für Datum, Priorität oder Kategorie die Aufgabe automatisch nach My Tasks ein.

### Tastenkürzel

| Taste | Aktion |
|---|---|
| `N` | Neue Aufgabe |
| `Q` | Quick capture in die Inbox |
| `/` | Suchfeld fokussieren (My Tasks, Weekly Notes) |
| `G` dann `D` / `I` / `M` / `T` / `U` / `W` / `P` / `O` / `E` / `F` / `S` | Zu Dashboard / Inbox / My Tasks / Today / Upcoming / Week planner / daily Plan / nOtes / Editor / Focus / Stats |
| `Strg/⌘ + Enter` | Geöffnetes Aufgaben- oder Notizformular speichern |
| `Esc` | Dialog schließen oder Focus Mode beenden |
| `↑` / `↓` auf einem fokussierten Kalenderblock | Aufgabe 15 Minuten früher / später |
| `←` / `→` auf einem fokussierten Kalenderblock | Aufgabe auf den vorigen / nächsten Tag |
| `Umschalt + ↑` / `↓` auf einem fokussierten Kalenderblock | Aufgabe 15 Minuten kürzer / länger |
| `Esc` beim Ziehen im Kalender | Ziehen abbrechen |

Editor-Kürzel stehen im [Dokumenten-Editor](#dokumenten-editor), Kürzel der Desktop-App [oben](#menü-und-tastenkürzel-der-desktop-app).

### Weekly Planner: Kalenderansicht

Der Kopf des Weekly Planners hat einen Schalter **Days | Calendar**. *Days* ist der unveränderte Planer mit Tagesspalten.
*Calendar* zeigt dieselbe Woche (gleicher Wochenstart, gleiche Navigation) als **Stundenraster**, oder einen einzelnen Tag (**Day | Week**; Klick auf einen Tageskopf öffnet ihn).
Das Raster öffnet bei 06:00 und scrollt von 00:00 bis 24:00; eine rote Linie markiert die aktuelle Zeit. Die Wahl wird gemerkt, `#/planner?view=calendar` öffnet die Ansicht direkt
(das nutzt „Open calendar“ im Dashboard). Auf schmalen Bildschirmen (≤ 760 px) zeigt der Kalender immer einen Tag.

| Im Kalender | Was passiert |
|---|---|
| Aufgabe mit Datum **und** Uhrzeit | Block ab der Uhrzeit; Höhe = Schätzung (30 min ohne). Überlappende Blöcke stehen nebeneinander. Erledigte sind abgedunkelt |
| Aufgabe mit Datum, ohne Uhrzeit | Chip im **All day**-Streifen des Tages |
| Block ziehen | Verschiebt auf andere Zeit und/oder Tag (15-Minuten-Schritte); auf den All-day-Streifen gezogen bleibt das Datum, die Uhrzeit entfällt |
| Unterkante eines Blocks ziehen | Ändert die Schätzung (15-Minuten-Schritte) |
| All-day-Chip oder Aufgabe aus **To schedule** (überfällig, Inbox, ohne Datum) hineinziehen | Legt sie auf Tag und Uhrzeit (eine Inbox-Aufgabe verlässt die Inbox) |
| Klick auf Block / Chip | Öffnet den üblichen Aufgaben-Editor |
| Klick auf / Ziehen über freie Zeit | Öffnet *New task* mit Tag, Startzeit (und Dauer); `+` im All-day-Streifen legt eine Aufgabe ohne Uhrzeit an |
| Termine abonnierter Kalender | Nur lesen, schraffierte Blöcke in der Kalenderfarbe; Klick zeigt Details |

Jede Änderung wird wie jede andere gespeichert (`store.commit()`), die Meldung bietet **Undo**. Erinnerungen wandern mit der Aufgabe, weil sie relativ zur Fälligkeit gespeichert sind;
das Verschieben löscht außerdem eine ausstehende Snooze-Zeit (wie der Aufgaben-Editor). Touch: Block kurz gedrückt halten, dann ziehen.

### ICS-Unterstützung

Kalenderdateien wertet `js/ics.js` aus (ohne Bibliothek): `VEVENT` mit `DTSTART` + `DTEND` oder `DURATION`, ganztägige und mehrtägige Termine (`VALUE=DATE`, Ende exklusiv),
Zeilenfaltung, maskierter Text, `STATUS:CANCELLED` (wird übersprungen) und Serientermine mit `RRULE` `FREQ=DAILY/WEEKLY/MONTHLY/YEARLY` samt `INTERVAL`, `COUNT`, `UNTIL`,
`BYDAY` (auch `2TU`, `-1FR`), `BYMONTHDAY` (auch negativ), `BYMONTH`, `BYSETPOS`, `WKST`, `EXDATE` und `RECURRENCE-ID` (einzelne verschobene oder abgesagte Termine).
Serien werden nur für die sichtbaren Tage aufgelöst. Nicht unterstützt (ignoriert): `RDATE`, `BYWEEKNO`, `BYYEARDAY`, `BYHOUR`/`BYMINUTE`, `HOURLY` und feiner (ein solcher Termin erscheint einmal).

**Zeitzonen:** `…Z`-Zeiten sind UTC; eine `TZID` wird mit der Zeitzonendatenbank des Browsers (`Intl`) aufgelöst, auch Mozilla-IDs und die Windows-Namen, die Outlook schreibt
(`W. Europe Standard Time` → `Europe/Berlin`); sonst gelten die `VTIMEZONE`-Regeln der Datei. Eine unbekannte `TZID` und Zeiten ohne Zone („floating“) werden als
**lokale Zeit** dieses Computers behandelt. Serientermine werden in ihrer eigenen Zone aufgelöst, ein Termin um 10:00 Berlin bleibt also auch beim Wechsel der Sommerzeit um 10:00 Berlin;
angezeigt wird alles in der lokalen Zeit dieses Computers. Einzeltermine, die vor mehr als 180 Tagen endeten, werden nicht behalten.

### Dokumenten-Editor

Eigene Seite **Editor** in der Navigation (Abschnitt *Write*, Kürzel `G` dann `E`). Weekly Notes bleiben unverändert und unabhängig davon.

**Aufbau:** links die Dokumentenliste (Suche in Titel und Inhalt, *All / Pinned / Trash*, „…“-Menü je Dokument),
oben Titel, Speicherstatus, Menüs **File** und **Insert** und der Knopf **Export PDF**, darunter die Formatierungsleiste,
in der Mitte die Seite (Papieransicht im gewählten Format), unten Wörter/Zeichen/Seiten und Zoom (25–300 %, auch mit **Strg + Mausrad**; die Stelle unter dem Mauszeiger bleibt stehen).
Ohne geöffnetes Dokument zeigt die Seite Vorlagen (*Blank, Meeting notes, Report, Feature tour*) und die zuletzt bearbeiteten Dokumente.

| Bereich | Funktionen |
|---|---|
| Dokumente | Neu, aus Vorlage, öffnen, umbenennen, duplizieren, anheften, in den Papierkorb (30 Tage wiederherstellbar), endgültig löschen, suchen, importieren (`.md`, `.html`, `.txt`, Todo4Me-`.json`) |
| Speichern | Automatisch ~0,7 s nach jeder Änderung, sofort beim Seiten- oder Dokumentwechsel und beim Schließen. `Strg+S` speichert sofort. Status oben: *Saved / Editing… / Not saved — retrying* |
| Rückgängig | `Strg+Z` / `Strg+Y` (auch `Strg+Umschalt+Z`) für **alle** Änderungen, auch an Tabellen, Bildern, Formen, Diagrammen, Formeln |
| Text | Fett, kursiv, unterstrichen, durchgestrichen, Textmarker, Schrift- und Hintergrundfarbe, Schriftgröße (8–72 pt), Schriftart, hoch-/tiefgestellt, Inline-Code, Formatierung löschen |
| Absatz | Normal, Überschrift 1–6, Zitat, links/zentriert/rechts/Blocksatz, Aufzählung, Nummerierung (verschachtelt mit Tab), Einzug, Zeilenabstand, Abstand vor/nach, Absatz-Schattierung, horizontale Linie, Seitenumbruch |
| Schriften | **Calibri** (Standard), **Fira Code**, Arial, Georgia, Times New Roman, Verdana. Fira Code ist mitgeliefert. Wo Calibri fehlt (macOS, iPad), wird automatisch das maßgleiche, mitgelieferte *Carlito* verwendet |
| Links | `Strg+K` einfügen/bearbeiten, Klick zeigt die Adresse mit *Öffnen / Bearbeiten / Entfernen*, `Strg+Klick` öffnet im Browser |
| Tabellen | Raster-Auswahl oder freie Größe, Kopfzeile, Zeilen/Spalten einfügen und löschen, Zellfarbe, `Tab` springt zur nächsten Zelle (am Ende neue Zeile) |
| Bilder | Einfügen per Knopf, aus der Zwischenablage oder per Drag & Drop · Größe per Ziehen oder 25/50/75/100 % · links/zentriert/rechts oder Textumfluss · Bildunterschrift, Alternativtext, ersetzen. Große Bilder werden automatisch verkleinert |
| Formen | Kreis, Rechteck, abgerundetes Rechteck, Dreieck, Linie, Pfeil, Raute in einer Zeichenfläche · verschieben (Maus oder Pfeiltasten), Größe über Anfasser (`Umschalt` = proportional), Füll-, Rahmenfarbe, Rahmenstärke (0–20 px), Text in der Form, duplizieren (`Strg+D`), löschen (`Entf`), nach vorne/hinten · Höhe der Zeichenfläche per Anfasser |
| Diagramme | Balken, Linie, Kreis · Daten in einer Tabelle bearbeiten (Doppelklick), mehrere Datenreihen, Farben, Titel, Legende · als Vektorgrafik im PDF |
| Formeln | LaTeX-Formeleditor (`Strg+M`) mit Live-Vorschau und Symbolpalette (Brüche, Wurzeln, Potenzen, Indizes, Summen, Integrale, Grenzwerte, Matrizen, griechische Buchstaben, Symbole) · in der Zeile oder als eigener Block · Darstellung mit KaTeX |
| Code | Codeblöcke mit Syntax-Highlighting für JavaScript, Python, HTML, CSS, JSON, Java, C++, C, C#, SQL, Bash · Fira Code · Sprache wählbar · Kopieren-Knopf · `Tab` rückt ein, `Esc` verlässt den Block |
| Markdown-Kürzel | `# ` bis `###### ` Überschriften, `- ` Liste, `1. ` Nummerierung, `> ` Zitat, `**fett**`, `*kursiv*`, `` `code` ``, `~~durch~~`, `==markiert==`, ```` ``` ```` + Enter Codeblock, `---` + Enter Linie, `$$` + Enter Formel. `/` in einer leeren Zeile öffnet das Einfügen-Menü. Eingefügter Markdown-Text wird umgewandelt |
| PDF | **Export PDF** (`Strg+P`): sauberes Layout mit sinnvollen Seitenumbrüchen (Überschriften bleiben beim Text, Tabellenzeilen, Bilder, Formeln und Codeblöcke werden nicht zerrissen, Tabellenköpfe wiederholen sich), eingebettete Schriften, Vektorgrafiken, Lesezeichen aus den Überschriften. **File → Page setup**: A4/Letter/A5/Legal, Hoch-/Querformat, Ränder, Kopf- und Fußzeile (Platzhalter `{title}`, `{date}`), Seitenzahlen („Page 1 of 3“, „1 / 3“, „1“), erste Seite ohne Kopfzeile. Das PDF entspricht der Seite im Editor (weißes Papier, gleiche Ränder, Kopf-/Fußzeile mittig im Rand); gestrichelte Linien auf der Seite zeigen ungefähr, wo eine neue PDF-Seite beginnt. Desktop-App: Speichern-Dialog, Browser: Druckdialog („Als PDF speichern“). Das Dokument selbst bleibt dabei unverändert |
| Export | Markdown (`.md`, Obsidian-kompatibel, Bilder/Diagramme eingebettet) und Todo4Me-Dokument (`.json`, verlustfrei) · *Settings → Documents* exportiert/importiert alle Dokumente |

**Dateiformat:** Dokumente werden intern als bereinigtes HTML (nur erlaubte Elemente, Attribute und Stilangaben) plus JSON-Metadaten gespeichert,
nicht als PDF oder Markdown, denn Markdown kann Farben, Schriften, Ausrichtung, Formen und Diagramme nicht verlustfrei abbilden.
Bilder, Formen, Diagramme, Formeln und Codeblöcke sind „Widgets“, die nur ihre Quelldaten speichern (z. B. LaTeX-Text, Diagrammwerte) und
beim Öffnen neu gezeichnet werden, bleiben also immer editierbar. Markdown ist das Austauschformat für Import und Export.
Alles, was in ein Dokument gelangt (Laden, Einfügen, Import, Rückgängig), läuft durch `editor-sanitize.js`: Skripte, Event-Handler,
`javascript:`-Links, externe Ressourcen und fremde Stilangaben werden entfernt.

**Offline:** KaTeX, Prism und die Schriften liegen in `vendor/` und werden erst geladen, wenn der Editor geöffnet wird (der Start der übrigen App bleibt schnell).

## Daten: Speichern, Sicherung und Wiederherstellung

- **Automatisches Speichern.** Jede Änderung wird sofort in `localStorage` geschrieben. Die Seitenleiste zeigt den letzten Speicherzeitpunkt und warnt, wenn das Speichern fehlschlägt (z. B. Speicher voll).
- **Automatisches Backup.** Eine zweite Kopie (`todo4me.backup.v1`) wird höchstens einmal täglich erneuert. Sind die Hauptdaten unlesbar, stellt die App beim Start dieses Backup wieder her.
  Die beschädigte Kopie bleibt unter `todo4me.corrupt.<Zeitstempel>` erhalten, und du wirst informiert. Manuell: **Settings → Restore auto-backup**.
- **Validierung.** Alle Daten (aus dem Speicher oder einem Import) laufen durch einen Sanitizer: unbekannte Felder entfallen, ungültige Werte fallen auf sichere Standards zurück, nicht reparierbare Einträge werden übersprungen und gemeldet.
- **Mehrere Tabs** bleiben synchron: Eine Änderung in einem Tab aktualisiert die anderen.
- **Jede zerstörerische Aktion wird bestätigt** (Aufgabe, Notiz oder Kategorie löschen; Import mit Ersetzen; Backup wiederherstellen; Reset).

**Export (Backup):** *Settings → Data & backup → Export JSON* lädt `todo4me-backup-JJJJ-MM-TT.json` mit allen Aufgaben, Notizen, Kategorien, Tagesplänen, Einstellungen und Statistiken.

**Import (wiederherstellen oder auf ein anderes Gerät):** *Settings → Data & backup → Import JSON*, Datei wählen. Du siehst, was die Datei enthält, und wählst:

- **Merge**: Aktuelle Daten bleiben, die Einträge der Datei kommen hinzu. Existiert ein Eintrag in beiden, gewinnt der zuletzt geänderte. Deine Einstellungen bleiben.
- **Replace all** (mit Bestätigung): ersetzt alles, auch die Einstellungen, durch den Dateiinhalt.

**Reset:** *Settings → Reset all data* löscht alles, was Todo4Me in diesem Browser gespeichert hat, auch Kalender-Abos (vorher exportieren).

## Für Entwickler

Quellcode: <https://github.com/muelgerhbf/todo4me> (öffentlich). Fertige Installer liegen in den Releases von `muelgerhbf/todo4me-releases`.
Arbeitsweise für KI-Agenten: [docs/AGENTEN-ANLEITUNG.md](docs/AGENTEN-ANLEITUNG.md). Änderungen je Version: [CHANGELOG.md](CHANGELOG.md).

<details>
<summary><strong>Entwicklung und Build</strong></summary>

Voraussetzung: [Node.js](https://nodejs.org) 20 oder neuer.

```bash
npm install              # einmalig: Electron, electron-builder, electron-updater installieren
npm start                # Desktop-App aus dem Quellcode starten
npm run dev              # wie start, zusätzlich mit geöffneten DevTools
npm run vendor           # nur nach einem Update von KaTeX/Prism/Schriften: kopiert sie nach vendor/
```

Änderungen an `index.html`, `css/` oder `js/` siehst du nach **Strg+R** im App-Fenster.

> Falls `npm install` meldet, dass Install-Skripte blockiert wurden (npm 11), und `npm start` „Electron failed to install correctly“ zeigt,
> einmalig `node node_modules/electron/install.js` ausführen. Das lädt das Electron-Programm herunter.

**Installer und Portable bauen**

```bash
npm run build            # beides: Installer + Portable
npm run build:installer  # nur Todo4Me-Setup-<version>.exe
npm run build:portable   # nur Todo4Me-<version>-portable.exe
npm run pack             # nur entpackte App in dist/win-unpacked (zum schnellen Testen)
```

Die fertigen Dateien liegen in **`dist/`**. Der erste Build lädt einmalig Werkzeuge (NSIS, Electron für Windows) herunter. Die Versionsnummer steht in `package.json` und im Dateinamen.
`scripts/build.js` lässt electron-builder in einem temporären Ordner außerhalb des Projekts arbeiten und kopiert nur die fertigen `.exe`-Dateien nach `dist/`.
Grund: Ist das Projekt in VS Code geöffnet, sperrt VS Code (selbst eine Electron-App) neu entstehende `.asar`-Dateien, und ein direkter Build bricht mit `EBUSY`/`EPERM` ab.

</details>

<details>
<summary><strong>Ein Update veröffentlichen (Release-Prozess)</strong></summary>

Die Updates liegen als *Releases* in einem **öffentlichen** GitHub-Repository `muelgerhbf/todo4me-releases` (nur die fertigen Installer, kein Quellcode),
eingestellt in `package.json → build.publish`.

**Einmalige Einrichtung**

1. Auf GitHub ein **öffentliches** Repository `todo4me-releases` anlegen (README reicht).
2. GitHub → *Settings → Developer settings → Personal access tokens → Fine-grained tokens* → **Generate new token**:
   Repository access *Only select repositories → todo4me-releases*, Permission *Contents: Read and write*.
3. Den Token als Umgebungsvariable speichern (PowerShell, einmalig; danach Terminal neu öffnen):
   `[Environment]::SetEnvironmentVariable('GH_TOKEN', '<token>', 'User')`

**Bei jedem Update**

1. Versionsnummer in `package.json` erhöhen. Sie muss **immer größer** sein als die letzte.
2. `npm run release`. Baut Installer + Portable und lädt sie mit `latest.yml` als **Entwurf** (Draft) zu GitHub hoch.
3. Auf GitHub unter *todo4me-releases → Releases* den Entwurf prüfen und **Publish release** klicken. Ab jetzt bekommen alle das Update.

Nie Dateien aus dem neuesten Release löschen: Die App liest dort `latest.yml`. Ein fehlerhaftes Update korrigierst du mit einer neuen, höheren Version.
`npm run build` (ohne Upload) legt zusätzlich `latest.yml` und `*.blockmap` in `dist/` ab, zum Testen oder für einen eigenen Webserver.

</details>

<details>
<summary><strong>Aufbau der Desktop-Integration und Sicherheit</strong></summary>

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
scripts/build.js     Build-Skript, mit --publish für Releases
scripts/vendor.js    Kopiert KaTeX, Prism und die Schriften aus node_modules nach vendor/
build/icon.png       App-Icon (aus assets/icons/favicon.svg erzeugt), electron-builder macht daraus die .ico
```

**Sicherheit:** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- Die Seite hat keinen Zugriff auf Node.js, nur auf die fest definierten Funktionen aus `preload.js`
  (Info, Sicherungsdateien, Ordner öffnen, PDF-Export, exportierte Datei öffnen, Updates, Menü-Befehle, Kalender-Download,
  Desktop-Einstellungen, Benachrichtigung anzeigen). Der Hauptprozess prüft jeden Wert (z. B. nur die vier Kürzel-Vorgaben, Textlängen).
- Navigation weg von der App und neue Fenster werden blockiert. `http(s)`-Links öffnen im Standardbrowser.
- Alle Berechtigungsanfragen (Kamera, Mikrofon, Standort, auch Web-Benachrichtigungen …) werden abgelehnt. Erinnerungen zeigt der Hauptprozess an, nicht die Seite.
- Eine Content-Security-Policy in `index.html` erlaubt nur lokale Dateien (`connect-src 'none'`: die Seite selbst lädt nichts aus dem Netz;
  Kalender lädt ausschließlich der Hauptprozess über `fetchCalendar`). Alle Texte aus Kalenderdateien werden als Text angezeigt (HTML-escaped).
  Das kleine Inline-Skript im `<head>` ist per SHA-256-Hash freigegeben. Wer es ändert, muss den Hash in der CSP anpassen.

</details>

<details>
<summary><strong>Projektstruktur und Architektur</strong></summary>

```
todo4me/
├── index.html            App-Shell, Icon-Sprite (inline SVG), Dialoge, Script-Einbindung
├── package.json          Desktop-App: npm-Skripte + electron-builder-Konfiguration (+ Update-Feed)
├── electron/
│   ├── main.js           Hauptprozess (Fenster, Datenordner, Menü, Backups, PDF, Sicherheit)
│   ├── updater.js        Automatische Updates (electron-updater)
│   ├── background.js     Tray, Schließen in den Tray, Autostart, globales Kürzel, native Benachrichtigungen
│   ├── calendar.js       Lädt abonnierte Kalender (ICS): nur https, Limits, keine Cookies
│   └── preload.js        Minimale Brücke window.todo4meDesktop
├── scripts/              start.js, build.js, vendor.js
├── build/icon.png        App-Icon für electron-builder
├── assets/icons/         favicon.svg, icon.png (Fenster-Icon)
├── docs/                 AGENTEN-ANLEITUNG.md, screenshots/
├── vendor/               Offline-Dateien für den Editor (MIT / SIL OFL, Lizenzen enthalten)
│   ├── katex/            Formeldarstellung + Schriften
│   ├── prism/prism.js    Syntax-Highlighting (11 Sprachen)
│   └── fonts/            Fira Code, Carlito (Calibri-kompatibel)
├── tests/                Browser- und Desktop-Tests (Chrome DevTools Protocol, keine npm-Abhängigkeiten),
│                         ICS-Parser-Tests (test-ics.mjs) mit Fixtures (fixtures/ics/)
├── css/
│   ├── styles.css        Design-Tokens (hell/dunkel), Komponenten, Ansichten, responsive Regeln
│   └── editor.css        Editor-Seite, Dokumenttypografie, Widgets, Druck-/PDF-Regeln
└── js/
    ├── utils.js          Datumshilfen (lokal JJJJ-MM-TT), HTML-Escaping, DOM-Helfer
    ├── storage.js        Schema-Standards, Validierung/Sanitizing, Speicher-Adapter, Backup, Import/Export/Merge
    ├── store.js          Zustand im Speicher, alle Änderungen (commit → save → notify), Selektoren
    ├── ui.js             Aktionsregister, Modal, Bestätigungsdialog, Toasts, Fortschrittskomponenten
    ├── tasks.js          Aufgabenzeile/-editor, Quick capture, Quick-add-Parser; Inbox, My Tasks, Today, Upcoming
    ├── dashboard.js      Dashboard, Top-3-Karte und Auswahl
    ├── planner.js        Weekly Planner (Drag & Drop, Tagesdetails) und Daily Plan
    ├── ics.js            iCalendar-Parser + Serienauflösung (rein, läuft auch in Node für die Tests)
    ├── calfeeds.js       Kalender-Abos: Liste, Cache, Aktualisieren, Settings-Karte, Dashboard-Karte
    ├── calendar.js       Weekly Planner → Kalenderansicht: Stundenraster, Drag & Drop, Größe ändern, Anlegen, Tastatur
    ├── notes.js          Weekly Notes
    ├── focus.js          Focus Mode und Pomodoro-Timer
    ├── stats.js          Statistik und Diagramme
    ├── settings.js       Einstellungen, Theme, Kalender-Karte, Kategorien, Export/Import, Beispieldaten
    ├── editor-sanitize.js  Editor: HTML-Allowlist-Sanitizer (Einfügen, Import, Speicher, Undo)
    ├── docstore.js       Editor: IndexedDB-Speicher für Dokumente und Bilder, Export/Import
    ├── editor-widgets.js Editor: Bilder, Zeichnungen/Formen, Diagramme, Formeln, Codeblöcke, Dialoge
    ├── editor-markdown.js Editor: Markdown-Import/-Export
    ├── editor-core.js    Editor: Bearbeitungs-Engine (Auswahl, Undo/Redo, Formatierung, Tabellen, Links, Einfügen)
    ├── editor.js         Editor: Seite, Dokumentenliste, Toolbar, Menüs, Autosave, PDF-Export
    ├── app.js            Router (Hash), Navigation, Event-Delegation, Kürzel, Start
    ├── reminders.js      Erinnerungs-Scheduler (einmal auslösen, Snooze, Sammelmeldung) + Benachrichtigungen
    └── desktop.js        Nur-Desktop-Ergänzungen (im Browser inaktiv)
```

- **Reines JavaScript (ES2020), kein Build.** Klassische Skripte mit einem gemeinsamen Namensraum `window.T4` statt ES-Modulen, damit die App auch direkt von der Platte (`file://`) läuft, wo Browser Modul-Importe blockieren.
- **Einseitiger Datenfluss.** Ansichten sind Funktionen `render(params) → HTML-String`. Jede Änderung läuft über `T4.store.commit()`, das speichert und die App benachrichtigt, die die aktuelle Ansicht neu rendert. Fokus und halb getippter Quick-add-Text bleiben dabei erhalten.
- **Event-Delegation.** Interaktive Elemente deklarieren `data-action="name"` (Klicks), `data-form` (Submits), `data-input` / `data-change` (Eingaben). Module registrieren Handler mit `T4.ui.on(name, fn)`.
- **Alle Nutzerinhalte werden vor dem Rendern HTML-escaped.**
- **Backend-fähig.** Die Persistenz steckt in `storage.js` hinter einem Adapter mit `load(key)` / `save(key, value)` / `remove(key)`. Für einen Server diese ersetzen und `T4.storage.setAdapter(adapter)` aufrufen. Jede Entität hat bereits eine stabile String-`id` und `createdAt`/`updatedAt`, und `storage.merge()` macht schon Last-Write-Wins-Abgleich.

</details>

<details>
<summary><strong>Datenmodell (JSON)</strong></summary>

Alles liegt als ein JSON-Dokument unter dem `localStorage`-Schlüssel `todo4me.data.v1`. Exporte haben dieselbe Form plus `app` und `exportedAt`.
Daten sind lokale Kalendertage (`"YYYY-MM-DD"`), Uhrzeiten `"HH:MM"` (24 h), Zeitstempel ISO-8601-Strings.

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
  "id": "task_lz1k2…",           // eindeutiger String
  "title": "Finish quarterly report",   // Pflicht, ≤ 500 Zeichen
  "description": "",
  "notes": "",
  "status": "todo",              // "todo" | "in_progress" | "done"
  "priority": "high",            // "critical" | "high" | "medium" | "low" | null (keine)
  "categoryId": "cat_work",      // Category.id oder null
  "tags": ["q4", "reports"],     // klein geschrieben, eindeutig, ≤ 20
  "dueDate": "2026-11-02",       // oder null
  "dueTime": "15:00",            // oder null (nur mit dueDate)
  "estimate": 90,                // Minuten (1–1440) oder null
  "subtasks": [{ "id": "sub_…", "title": "Collect numbers", "done": true }],
  "recurrence": null,            // "daily" | "weekly" | "monthly" | null
  "reminder": 15,                // Minuten vor Fälligkeit (0 = zur Fälligkeit, max 40320) oder null; braucht dueDate
  "reminderFired": "2026-11-02 15:00|15", // Termin, für den die Erinnerung gezeigt wurde ("Datum Zeit|Minuten"), oder null
  "reminderSnooze": null,        // ISO-Zeit, zu der eine zurückgestellte Erinnerung wiederkommt, oder null
  "inbox": false,                // true = erfasst, noch nicht einsortiert
  "nextOccurrenceId": null,      // gesetzt, sobald eine Wiederholung ihren Nachfolger erzeugt hat
  "createdAt": "2026-11-02T08:12:00.000Z",
  "updatedAt": "2026-11-02T09:30:00.000Z",
  "completedAt": null            // gesetzt, wenn der Status "done" wird
}
```

**Wiederkehrende Aufgaben:** Das Erledigen erzeugt die nächste Wiederholung (Teilaufgaben zurückgesetzt) am ersten Intervall nach heute. Wieder öffnen und erneut erledigen erzeugt keine Duplikate.

**Erinnerungen** werden als Abstand (`reminder`, Minuten vor Fälligkeit) gespeichert, nicht als absolute Zeit: Sie wandern mit der Aufgabe beim Verschieben
(Editor, Planner-Drag-&-Drop, „alle auf heute“), und die nächste Wiederholung erbt den Abstand und bekommt eine eigene Erinnerung.
Die Auslösezeit ist `dueDate` + (`dueTime` oder `settings.reminderTime`) − `reminder`. `reminderFired` merkt sich, welcher Termin schon gezeigt wurde,
damit eine Erinnerung auch über Neustarts, Importe und andere Tabs hinweg nur einmal erscheint; ändern sich Datum/Uhrzeit oder Abstand, entsteht ein neuer Schlüssel.
Daten ohne diese Felder (ältere Versionen und Exporte) laden unverändert mit `reminder: null`.

### Category

```jsonc
{ "id": "cat_work", "name": "Work", "color": "#2f6fed" }
```

Standard: Work, Personal, Health, Shopping, Learning, Other. Beim Löschen einer Kategorie bleiben ihre Aufgaben erhalten (`categoryId: null`).

### Note

```jsonc
{
  "id": "note_…",
  "title": "Ideas for the launch",   // Titel oder Text nötig
  "body": "Free text, line breaks preserved",
  "weekOf": "2026-11-02",            // Startdatum der Woche, zu der die Notiz gehört
  "tags": ["ideas"],
  "pinned": true,                    // angeheftet = wichtig; zuerst und im Dashboard gezeigt
  "createdAt": "ISO",
  "updatedAt": "ISO"
}
```

Notizen werden nach der Woche gruppiert, die `weekOf` enthält, gemäß der Einstellung *Wochenstart*.

### DailyPlan

```jsonc
{
  "date": "2026-11-02",
  "goal": "Send the quarterly report",
  "top3": ["task_a", "task_b", "task_c"],   // bis zu 3 vorhandene Aufgaben-IDs, in Reihenfolge
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
  "accent": "#5b5bd6",        // Hex-Farbe
  "defaultSort": "priority",  // "priority" | "due" | "created" | "alpha" | "status"
  "weekStart": 1,             // 1 = Montag, 0 = Sonntag
  "showCompleted": true,
  "pomodoroFocus": 25,        // Minuten
  "pomodoroBreak": 5,         // Minuten
  "reminderTime": "09:00"     // "HH:MM": Erinnerungszeit für Aufgaben mit Datum, aber ohne Uhrzeit
}
```

### Stats

```jsonc
{
  "completions":   { "2026-11-02": 4 },   // erledigte Aufgaben pro Tag
  "focusSessions": { "2026-11-02": 2 }    // abgeschlossene Pomodoro-Fokusphasen pro Tag
}
```

Erledigungen werden pro Tag beim Abhaken gezählt (und beim Wieder-Öffnen abgezogen), der Verlauf bleibt also auch nach dem Löschen erledigter Aufgaben erhalten.

### Weitere localStorage-Schlüssel

| Schlüssel | Zweck |
|---|---|
| `todo4me.backup.v1` | `{ "at": ISO, "data": <volles Dokument> }`, das tägliche automatische Backup |
| `todo4me.focus.v1` | Zustand des Focus Mode: gewählte Aufgabe und Timer (`mode`, `running`, `endsAt`, `remaining`) |
| `todo4me.corrupt.<ms>` | Unter Quarantäne gestellte unlesbare Daten (nur bei erkannter Beschädigung) |
| `todo4me.editor.ui` | Editor-Ansicht: `{ "zoom": 100, "side": true }` (Dokumentenliste sichtbar) |
| `todo4me.app.version` | Desktop-App: zuletzt gestartete Version (bestätigt ein Update einmalig) |
| `todo4me.docs.backupDay` | Desktop-App: Tag der letzten Dokumenten-Sicherungsdatei |
| `todo4me.planner.ui` | Ansicht des Weekly Planners: `{ "mode": "days" \| "calendar", "span": "week" \| "day" }` |
| `todo4me.calendars.v1` | Kalender-Abos (siehe unten). **Nicht** Teil von `todo4me.data.v1`, Exporten, Importen, Merges oder Sicherungsdateien, weil die Links Geheimnisse sind |
| `todo4me.calendars.cache.v1` | Zuletzt geladene/importierte Fassung jedes Kalenders, bereits ausgewertet: `{ "<feedId>": { "at": ISO, "checkedAt": ISO, "error": null, "cal": { "name", "events": [Event], "zones": {} } } }`. Größenbegrenzt (~1,5 M Zeichen; Beschreibungen entfallen zuerst), verdrängt also nie die Aufgaben |

```jsonc
// todo4me.calendars.v1
{
  "version": 1,
  "feeds": [{
    "id": "cal_…",
    "name": "Work",                  // ≤ 60 Zeichen
    "color": "#0e7c86",
    "kind": "url",                   // "url" (Abo, Desktop-App) | "file" (importierte .ics, keine URL)
    "url": "https://outlook.office365.com/owa/calendar/…/calendar.ics",   // nur https (webcal:// wird als https:// gespeichert)
    "enabled": true,                 // Häkchen "Show"
    "addedAt": "ISO"
  }]
}
// Event im Cache (js/ics.js): Wanduhrzeiten, je sichtbarem Bereich aufgelöst
{ "uid": "…", "title": "…", "location": "…", "description": "…", "allDay": false,
  "start": 1793785200000,            // Wanduhr-ms in der Zone des Termins (ganztägig: Tag × 86400000)
  "tz": "I:Europe/Berlin",           // "Z" (UTC) | "I:<IANA>" | "V:<VTIMEZONE-Id>" | "L" (lokal); null bei ganztägig
  "dur": 3600000,                    // ms (ganztägig: Anzahl Tage)
  "rrule": { "freq": "WEEKLY", "interval": 1, "byday": [{ "n": 0, "wd": 1 }], "until": { "wall": 1795000000000, "utc": true } },
  "exdates": [], "exdays": [] }
```

Für den Kalender wurden keine Aufgaben- oder Einstellungsfelder ergänzt: Die Position eines Blocks ergibt sich aus `dueDate`, `dueTime` und `estimate`.

Die Desktop-App hält ihre Rechner-Einstellungen außerhalb des LocalStorage in `<userData>/desktop-settings.json`:
`{ "closeToTray": true, "openAtLogin": false, "hotkeyEnabled": true, "hotkey": "Control+Alt+Space", "trayHintShown": false }`.

### Dokumente (Editor) — IndexedDB `todo4me-docs`

Editor-Dokumente liegen **nicht** in `todo4me.data.v1`, sondern in einer eigenen IndexedDB-Datenbank, damit große Dokumente und Bilder nie Aufgaben und Notizen verdrängen
(LocalStorage fasst nur wenige MB).

| Store | Eintrag |
|---|---|
| `docs` | `{ id, format: 1, title, text, words, page, pinned, createdAt, updatedAt, openedAt, deletedAt }`; `text` ist eine Klartextkopie für die Suche, `deletedAt` ≠ null heißt *im Papierkorb* (nach 30 Tagen gelöscht) |
| `bodies` | `{ id, html }`: der Dokumentinhalt (bereinigtes HTML, siehe unten) |
| `assets` | `{ id, blob, type, size, createdAt }`: Bilder, vom Inhalt referenziert; unreferenzierte Bilder werden nach einem Tag aufgeräumt |

```jsonc
// page (Seiteneinrichtung, pro Dokument)
{ "size": "A4", "orientation": "portrait", "margins": "normal", "header": "{title}", "footer": "",
  "pageNumbers": "bottom-center", "numberFormat": "page-of", "firstPageHeader": true }
```

Inhalts-HTML nutzt `p, h1–h6, blockquote, ul/ol/li, table, hr`, Inline-Formatierung (`b, i, u, s, mark, sub, sup, code, a, span[style]`) und Widgets:

```html
<figure class="t4-w" data-w="img"   data-p='{"a":"img_…","w":50,"al":"center","cap":"","alt":""}'></figure>
<figure class="t4-w" data-w="draw"  data-p='{"h":240,"al":"center","shapes":[{"id":"s1","t":"rect","x":40,"y":40,"w":120,"h":80,"fill":"#dbe4ff","stroke":"#4f6bed","sw":2,"text":"","tc":"#1f2330","fs":16}]}'></figure>
<figure class="t4-w" data-w="chart" data-p='{"type":"bar","title":"","labels":["Q1"],"series":[{"name":"","color":"#4f6bed","values":[12]}],"w":100,"legend":true}'></figure>
<figure class="t4-w" data-w="math"  data-p='{"tex":"\\frac{a}{b}"}'></figure>   <!-- <span …> = Formel in der Zeile -->
<figure class="t4-w" data-w="code"  data-p='{"lang":"python"}'><pre><code>print("hi")</code></pre></figure>
<figure class="t4-w" data-w="pagebreak" data-p="{}"></figure>
```

Formtypen `t`: `rect, round, ellipse, tri, diamond, line, arrow`. Ein Dokumenten-Export (`*.todo4me-doc.json`, *Settings → Documents*, tägliches Desktop-Backup)
ist `{ "app": "todo4me", "kind": "documents", "format": 1, "documents": [Meta + html], "assets": { "img_…": "data:image/…" } }`.
Importe überschreiben nie vorhandene Dokumente (bei ID-Konflikt gibt es eine neue ID).

</details>

<details>
<summary><strong>Tests</strong></summary>

Alle Suiten sind abhängigkeitsfrei (Chrome bzw. Electron über das DevTools-Protokoll, ICS-Tests in reinem Node). Stand: alle bestanden.

```bash
node tests/cdp.mjs tests/test-functional.mjs           # 251 Prüfungen: alle Funktionen + Erinnerungen + Kalenderansicht und .ics-Kalender (Chrome)
node tests/cdp.mjs tests/test-editor.mjs               # 157 Prüfungen: Editor, PDF, Persistenz, Markdown, Sicherheit (Chrome)
node tests/cdp-electron.mjs tests/test-functional.mjs  # dieselben 251 Prüfungen in der Desktop-App
node tests/cdp-electron.mjs tests/test-electron.mjs    # 108 Prüfungen: Sicherheit, Menü, Neustart, Backups, PDF-Export, Speichern beim Schließen, Updates,
                                                       #   Tray, Schließen in den Tray vs. Beenden, Hotkey, Autostart, Benachrichtigungen, Sammelmeldung,
                                                       #   fetchCalendar gegen einen lokalen HTTPS-Server, Kalender-Abo komplett
node tests/test-ics.mjs                                # 62 Prüfungen: ICS-Parser-Unit-Tests (reines Node, Fixtures in tests/fixtures/ics)
```

Die Desktop-Suite braucht `TODO4ME_PDF_DIR=<Ordner>` (damit der Test PDFs ohne Dialog exportieren kann); optional prüft `PDFTEXT=<Skript>` PDF-Text
(Seitenzahlen, Kopf-/Fußzeile) mit pdf.js. Die Zahlen oben enthalten die `PDFTEXT`-Prüfungen.
Die Desktop-Suite zeigt ein paar echte Windows-Benachrichtigungen und registriert das globale Kürzel, solange sie läuft; „Start with Windows“ wird in Testläufen nie in die Registry geschrieben (der Aufruf ist ersetzt).
Der Erinnerungs-Scheduler wird mit expliziter Uhr getestet: `T4.reminders.check({ now })`, `setClock(fn)`, `setNotifier(fn)`.
Die Kalender-Prüfungen (`tests/functional-calendar.mjs`) nutzen echte Mauseingaben (bewegen, Größe ändern, aus dem All-day-Streifen und der To-schedule-Liste hineinziehen,
Klicken und Ziehen auf freien Zeiten) und die Tastatur. Die Desktop-Kalender-Prüfungen (`tests/electron-calendar.mjs`) starten einen HTTPS-Server auf 127.0.0.1 mit einem
selbstsignierten Zertifikat, das `openssl` für den Lauf erzeugt (Git für Windows bringt es mit; ohne werden diese Prüfungen übersprungen und sagen das). Nur für diesen Test
akzeptiert die Kalender-Sitzung dieses Zertifikat für 127.0.0.1; der Test prüft, dass dasselbe Zertifikat unter einem anderen Hostnamen weiter abgelehnt wird.
`test-ics.mjs` legt die Zeitzone auf Europe/Berlin fest (und New York für einen Block), die erwarteten Zeiten hängen also nicht vom Rechner ab.

**Screenshots für dieses README** entstehen aus der laufenden App mit Beispieldaten: `node tests/cdp.mjs tests/test-shots.mjs` (Bilder in `tests/shots/`),
Auswahl nach `docs/screenshots/`. Details: `.claude/skills/readme-screenshots/SKILL.md`.

</details>

## Browser-Unterstützung

Aktuelle Versionen von Chrome, Edge, Firefox und Safari (Desktop und mobil). Voraussetzung sind `<dialog>`, CSS `color-mix()` und `:has()` (alle aktuellen Browser seit 2023).
