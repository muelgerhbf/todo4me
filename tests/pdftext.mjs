// PDFTEXT helper for Linux/macOS hosts without pdf.js: node tests/pdftext.mjs <file.pdf>
// Prints JSON { pages, text: [per page], outline: [titles], title } using poppler (pdfinfo / pdftotext).
// Use it as PDFTEXT=tests/pdftext.mjs. Outline titles are read from the raw PDF outline dictionaries.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const file = process.argv[2];
const run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 << 20 });
const info = run('pdfinfo', ['-enc', 'UTF-8', file]);
const pages = Number((info.match(/^Pages:\s+(\d+)/m) || [])[1]) || 0;
const title = ((info.match(/^Title:\s*(.*)$/m) || [])[1] || '').trim();
const text = [];
for (let p = 1; p <= pages; p++) text.push(run('pdftotext', ['-enc', 'UTF-8', '-layout', '-f', String(p), '-l', String(p), file, '-']));

function pdfString(s) { // literal "(...)" or hex "<...>" string -> text
  if (s[0] === '<') {
    const b = Buffer.from(s.slice(1, -1).replace(/\s+/g, ''), 'hex');
    return b[0] === 0xfe && b[1] === 0xff ? Buffer.from(b.subarray(2)).swap16().toString('utf16le') : b.toString('latin1');
  }
  return s.slice(1, -1).replace(/\\([nrtbf()\\])/g, (_, c) => ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' }[c] || c));
}
const raw = fs.readFileSync(file).toString('latin1');
const outline = [];
const lineRe = /\/Title\s*(\((?:\\.|[^\\)])*\)|<[0-9A-Fa-f\s]*>)/g;
for (const dict of raw.match(/<<[^<>]*\/Title[^<>]*(?:\/Parent|\/Dest|\/A\b)[^<>]*>>/g) || []) {
  const m = lineRe.exec(dict); lineRe.lastIndex = 0;
  if (m) outline.push(pdfString(m[1]));
}
console.log(JSON.stringify({ pages, text, outline, title }));
