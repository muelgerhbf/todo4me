/* Starts the desktop app for development: `npm start` / `npm run dev`.
 * Removes ELECTRON_RUN_AS_NODE, which some environments (e.g. terminals inside
 * VS Code extensions) set and which would make Electron behave like plain Node. */
'use strict';
const { spawn } = require('node:child_process');
const electronPath = require('electron'); // resolves to the electron.exe path

const env = Object.assign({}, process.env);
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronPath, ['.'].concat(process.argv.slice(2)), { stdio: 'inherit', env, windowsHide: false });
child.on('close', (code) => process.exit(code == null ? 0 : code));
