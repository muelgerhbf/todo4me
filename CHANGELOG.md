# Changelog

Alle nennenswerten Änderungen an Todo4Me (Windows-Desktop-App und Web-App) stehen in dieser Datei.
Das Format orientiert sich an [Keep a Changelog](https://keepachangelog.com/de/1.1.0/), die Versionierung folgt [Semantic Versioning](https://semver.org/lang/de/).
Release-Tags tragen das Präfix `windows-v`.

## [2.1.1] - 2026-11-06

### Behoben
- Monatlich wiederkehrende Aufgaben rutschen nicht mehr auf den 28. (z. B. fällig am 31. Januar): Die nächste Fälligkeit wird jetzt ab dem ursprünglichen Datum berechnet.
- Quick-Add: Tags und Kategorien mit Umlauten (`#büro`, `#einkäufe`) bleiben nicht mehr im Titel stehen.
- Quick-Add: `@month` oder `@satire` werden nicht mehr als Montag bzw. Samstag gedeutet; `@fri`, `@thurs` und `@friday` funktionieren weiterhin.
- Updates werden auch installiert, wenn Todo4Me im Infobereich (Tray) läuft: Ist ein Update bereit und das Fenster versteckt, erscheint eine Windows-Benachrichtigung; ein Klick speichert alles und startet neu.
- Tägliche Backups werden auch erstellt, wenn Todo4Me tagelang im Tray läuft (Prüfung alle 15 Minuten auf einen neuen Tag).

### Bekannte Einschränkung
- Wird eine monatliche Aufgabe in einem kurzen Monat am letzten Tag erledigt (28. Februar), zählt die nächste Fälligkeit ab diesem Datum (28. März) und nicht ab dem ursprünglichen 31.

## [2.1.0] - 2026-11-04

### Hinzugefügt
- Erinnerungen: neues Aufgabenfeld "Erinnerung" (zur Fälligkeit, 5/15/30 Minuten, 1 Stunde oder 1 Tag vorher), Glocken-Symbol an der Aufgabe, Standard-Uhrzeit für Aufgaben ohne Uhrzeit in den Einstellungen. Windows-Benachrichtigung mit "10 Min. später"; im Browser Web-Benachrichtigung, zusätzlich immer ein Hinweis in der App.
- Tray-Symbol mit Menü (Öffnen, Schnellerfassung, Neue Aufgabe, Beenden) und "Im Tray weiterlaufen" beim Schließen des Fensters.
- Optionaler Autostart mit Windows (startet versteckt im Tray).
- Globaler Schnellerfassungs-Shortcut `Strg+Alt+Leertaste` (abschaltbar, vier Vorgaben wählbar).
- Kalenderansicht im Wochenplaner (Umschalter Tage | Kalender, Tag oder Woche): Aufgaben als Zeitblöcke, Verschieben und Größe ändern per Maus, Tastatur und Touch, jeweils mit "Rückgängig".
- Kalender-Abos (nur lesen): Outlook- und Google-Kalender über ICS-Link oder lokale `.ics`-Datei, eigener ICS-Parser ohne Abhängigkeiten, Karte "Kalender heute" im Dashboard.

### Geändert
- Installer-Dateinamen und Doku auf Version 2.1.0 angepasst; die Desktop-Tests finden das Hintergrundmodul unabhängig vom Installationspfad.

## [2.0.1] - 2026-11-03

### Behoben
- PDF-Export: Seitenränder waren in der Fensterhintergrundfarbe gemalt; das PDF wird jetzt auf weißem Papier ohne Textcursor erzeugt, Kopf- und Fußzeile sitzen wie auf der Editor-Seite in der Mitte des Randes.
- Formen im Editor: Der Schieberegler für die Linienstärke ließ sich nicht ziehen. Außerdem gibt es jetzt -/+-Knöpfe und eine px-Anzeige (0 bis 20 px).

### Hinzugefügt
- Editor: Zoom mit Strg + Mausrad bzw. Touchpad-Pinch um den Mauszeiger (25 bis 300 %).

## [2.0.0] - 2026-11-03

### Hinzugefügt
- Dokumenteditor mit eigener Engine: Formatierung, Schriften, Tabellen, Bilder, Formen, Diagramme, Formeln (KaTeX), Code-Blöcke mit Syntaxhervorhebung (Prism, u. a. C#), Rückgängig/Wiederholen für alle Änderungen.
- Markdown-Import und -Export sowie PDF-Export (aus derselben Seite gedruckt, mit Kopf-/Fußzeile und Seitenzahlen).
- Dokumente liegen getrennt von den Aufgaben in IndexedDB; täglich eine eigene Sicherung (`documents-JJJJ-MM-TT.json`, 14 Tage).
- Automatische Updates über `electron-updater` und das öffentliche Repository `todo4me-releases` (Download im Hintergrund, "Jetzt neu starten").
- Mitgelieferte Schriften Fira Code und Carlito (SIL OFL).

## [1.0.0] - 2026-11-02

### Hinzugefügt
- Erste Version: Web-App und Windows-Desktop-App (Installer und portable Version, Electron).
- Dashboard, Eingang, Meine Aufgaben, Heute, Demnächst, Wochenplaner, Tagesplan, Wochennotizen, Fokus-Modus mit Pomodoro, Statistiken, Einstellungen.
- Aufgaben mit Unteraufgaben, Wiederholung und Rückgängig; Quick-Add (`!1`, `#work`, `@fri`).
- Hell/Dunkel-Modus, Akzentfarben, responsives Layout, Tastenkürzel.
- Datensicherheit: Prüfung beim Laden, tägliches Backup (14 Tage), beschädigte Daten werden isoliert und aus dem Backup wiederhergestellt; Daten liegen fest in `%APPDATA%\Todo4Me`.

[2.1.1]: https://github.com/muelgerhbf/todo4me/releases/tag/windows-v2.1.1
[2.1.0]: https://github.com/muelgerhbf/todo4me/releases/tag/windows-v2.1.0
[2.0.1]: https://github.com/muelgerhbf/todo4me/releases/tag/windows-v2.0.1
[2.0.0]: https://github.com/muelgerhbf/todo4me/releases/tag/windows-v2.0.0
[1.0.0]: https://github.com/muelgerhbf/todo4me/releases/tag/windows-v1.0.0
