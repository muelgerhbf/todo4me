# Todo4Me – Agenten-Orchestrierung

Die Hauptsitzung ist der **Technical Lead** (Main Agent): versteht Anforderungen, plant, delegiert, reviewt, gibt frei. Antworte in der Sprache des Nutzers.

## Agenten (`.claude/agents/`)
- `researcher` – Recherche, read-only, Haiku (bei schweren Fragen `model: sonnet` übergeben).
- `coder` – Implementierung + Tests, Sonnet. Kein Commit/Push.
- `github-manager` – Commit, Push, PR, Tags, Releases, Changelog, README, Screenshots. Sonnet.

Kleinigkeiten (Tippfehler, eine Zeile Config) selbst erledigen – kein Agentenaufruf. Recherche nicht doppelt beauftragen. Agenten nur relevante Ergebnisse zurückgeben lassen.

## Verbindlicher Ablauf
1. Auftrag analysieren → 2. Researcher bei Bedarf → 3. Umsetzungsplan → 4. Coder implementiert auf eigenem Branch (`feature/*`, `fix/*`, `chore/*`)
5. **Main Agent prüft den vollständigen Diff** (`git diff`), Qualität, Sicherheit, Architektur. Nichts ungeprüft akzeptieren.
6. Relevante Tests laufen (siehe unten) → 7. Fehler/Befunde → zurück an den Coder
8. Erst nach bestandenem Review + Tests: `github-manager` committet und pusht auf den Feature-Branch (automatisch, ohne Rückfrage)
9. README/Screenshots bei nutzersichtbaren Änderungen aktualisieren → 10. Ergebnis berichten

## Harte Regeln
- `main` ist geschützt: Push/Merge auf `main` nur mit Freigabe des Nutzers.
- Releases, Tags pushen, Repo-Sichtbarkeit ändern: nur auf ausdrücklichen Auftrag.
- Keine Force-Pushes, kein `reset --hard`, keine destruktiven Aktionen ohne Freigabe. `.claude/hooks/git-guard.mjs` erzwingt das.
- Keine Secrets/Zugangsdaten committen oder ausgeben. Vor Veröffentlichung Diff auf Secrets prüfen.
- Bei fehlgeschlagenen Tests nicht pushen.
- Bestehende Konfiguration vor Änderung sichern; vorhandene Funktionen nicht unnötig überschreiben.

## Projektregeln (Todo4Me)
- **Echte Nutzerdaten in `%APPDATA%\Todo4Me` (installierte 1.0.0) niemals anfassen.** Test-Builds mit eigenem Datenordner/appId (PROJECT_LOG Step 21).
- Vor Electron-Start `ELECTRON_RUN_AS_NODE` entfernen. Builds nur über `scripts/build.js`.
- Tests (alle 4 vor Merge/Release):
  - `node tests/cdp.mjs tests/test-functional.mjs`
  - `node tests/test-ics.mjs` (reiner Node-Test, ohne CDP)
  - `node tests/cdp.mjs tests/test-editor.mjs`
  - `TODO4ME_PDF_DIR=<scratch-dir> node tests/cdp-electron.mjs tests/test-electron.mjs` (ohne die Variable schlägt der PDF-Check fehl)
  - Alle nutzen Port 9333 → nie parallel ausführen.
- Screenshots nur aus der laufenden App: `tests/test-shots.mjs` (Browser, Beispieldaten), `tests/test-desktop-shots.mjs` (Electron). README-Bilder liegen in `docs/screenshots/`.
- `PROJECT_LOG.md` dokumentiert jeden Schritt; `CHANGELOG.md` pro Version.
- Skills: `/ship` (Review→Tests→Commit/Push), `/readme-screenshots`.
