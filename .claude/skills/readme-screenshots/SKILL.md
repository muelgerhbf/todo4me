---
name: readme-screenshots
description: Capture real screenshots from the running Todo4Me app (sample data) and embed them in the README.
---
1. Run `node tests/cdp.mjs tests/test-shots.mjs` (starts the real app in the browser with sample data; images go to `tests/shots/`). Optionally Electron: `node tests/cdp-electron.mjs tests/test-desktop-shots.mjs` (remove `ELECTRON_RUN_AS_NODE` first).
2. Look at the images (Read) – only use them if they rendered correctly and show no private data.
3. Copy a selection to `docs/screenshots/` with descriptive names (e.g. `dashboard-light.png`). Do not invent or edit images.
4. README: embed images with a relative path (`![Dashboard](docs/screenshots/dashboard-light.png)`), replace outdated ones.
