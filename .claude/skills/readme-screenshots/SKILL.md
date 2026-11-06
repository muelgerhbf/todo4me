---
name: readme-screenshots
description: Capture real screenshots from the running Todo4Me app (sample data) and embed them in the README.
---
1. `node tests/cdp.mjs tests/test-shots.mjs` ausführen (startet die echte App im Browser mit Beispieldaten; Bilder in `tests/shots/`). Optional Electron: `node tests/cdp-electron.mjs tests/test-desktop-shots.mjs` (vorher `ELECTRON_RUN_AS_NODE` entfernen).
2. Bilder ansehen (Read) – nur verwenden, wenn sie korrekt gerendert sind und keine privaten Daten zeigen.
3. Auswahl nach `docs/screenshots/` kopieren, sprechende Namen (z. B. `dashboard-light.png`). Keine Bilder erfinden oder bearbeiten.
4. README: Bilder mit relativem Pfad einbinden (`![Dashboard](docs/screenshots/dashboard-light.png)`), veraltete ersetzen.
