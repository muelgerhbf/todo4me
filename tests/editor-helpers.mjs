// Shared helpers for the editor test suites (tests/test-editor.mjs and the per-module suites tests/editor-<module>.mjs).
// Module suites export `test(t)` (called by test-editor.mjs, see its ed-tests anchors) and a default export for running alone:
//   CDP_PORT=9341 node tests/cdp.mjs tests/editor-<module>.mjs
// t = { b, out, run(name, jsBody), PRELUDE, shots }. `run` evaluates the body in the page (async function) after the PRELUDE helpers
// ($, $$, wait, ok(cond, msg), D(), C(), W(), caretEnd(), tb(), menuItem(), stored(), newDoc()) and collects PASS/FAIL lines.
export const PRELUDE = `
  window.__r = window.__r || [];
  var $ = (s, r) => (r || document).querySelector(s);
  var $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  var wait = (ms) => new Promise((r) => setTimeout(r, ms));
  var ok = (c, msg) => { window.__r.push((c ? 'PASS ' : 'FAIL ') + msg); };
  var D = () => document.getElementById('ed-doc');
  var C = () => T4.edcore;
  var W = () => T4.edw;
  var caretEnd = () => { const d = D(); d.focus(); const r = document.createRange(); r.selectNodeContents(d.lastElementChild || d); r.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(r); };
  var selectNode = (el) => { D().focus(); const r = document.createRange(); r.selectNodeContents(el); getSelection().removeAllRanges(); getSelection().addRange(r); };
  var tb = (cmd) => { const b = $('#ed-toolbar [data-cmd="' + cmd + '"]') || $('.ed-bar [data-cmd="' + cmd + '"]'); if (!b) throw new Error('no toolbar button ' + cmd); b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); b.click(); };
  var menuItem = (label) => { const b = $$('.ed-menu [data-mi]').find((x) => x.textContent.trim().startsWith(label)); if (!b) throw new Error('no menu item ' + label); b.click(); };
  var stored = async () => { await T4.editor.flush(); const d = await T4.docstore.get(T4.editor.current.id); return d; };
  var newDoc = async (tpl) => { await T4.editor.newDocument(tpl); for (let i = 0; i < 60 && !(T4.editor.current && location.hash.includes(T4.editor.current.id)); i++) await wait(50); await wait(150); };
`;

/** Evaluate a body in the page with the PRELUDE; PASS/FAIL lines are collected in `out`. */
export function makeRunner(b, out) {
  return async (name, body) => {
    try { await b.evaluate(PRELUDE + '(async () => {' + body + '})()'); }
    catch (e) { out.push('FAIL ' + name + ' threw: ' + e.message.split('\n')[0]); }
    const r = await b.evaluate('window.__r || []'); out.push(...r); await b.evaluate('window.__r = []');
  };
}

/** Context object handed to module suites. */
export function makeContext(b, out) {
  return { b, out, run: makeRunner(b, out), PRELUDE, shots: process.argv[3] || 'tests/shots' };
}

/** Back to the editor start page with no document open (call between suites). */
export async function resetEditor(b) {
  await b.evaluate(`(async () => { if (T4.editor.current) { await T4.editor.flush(); } location.hash = '#/editor'; await new Promise((r) => setTimeout(r, 400)); return true; })()`);
}

/** Default export for a module suite: fresh profile page, clean documents database, run test(t), print the totals. */
export function standalone(test) {
  return async function (b) {
    const out = [];
    await b.viewport(1440, 900);
    await b.goto();
    await b.evaluate(`localStorage.clear(); new Promise((r) => { const q = indexedDB.deleteDatabase('todo4me-docs'); q.onsuccess = q.onerror = q.onblocked = () => r(true); })`);
    await b.reload();
    await b.evaluate(`location.hash = '#/editor'; new Promise((r) => setTimeout(r, 500))`);
    await test(makeContext(b, out));
    out.forEach((r) => console.log(r));
    console.log('\n' + out.filter((r) => r.startsWith('PASS')).length + ' passed, ' + out.filter((r) => r.startsWith('FAIL')).length + ' failed');
  };
}
