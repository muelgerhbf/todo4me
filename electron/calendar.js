/* Todo4Me — downloading subscribed calendars (ICS) in the main process.
 *
 * The page cannot reach the network (its Content-Security-Policy has connect-src 'none', and that
 * stays). For calendar subscriptions the page asks the main process through one narrow bridge
 * function, fetchCalendar(url), which is validated here:
 *  - only https:// (webcal:// and webcals:// are rewritten to https://), no user name/password in the URL
 *  - redirects are followed only to https:// addresses (max. 5)
 *  - at most 5 MB, 20 s timeout, max. 4 downloads at the same time
 *  - no cookies and no credentials: a separate in-memory session ("todo4me-calendar"), cookies off,
 *    credentials: 'omit', password prompts (401 + login) are refused
 *  - the answer must look like an iCalendar file (BEGIN:VCALENDAR); only its text is returned
 * Chromium's network stack is used (net.request), so the system proxy and the Windows certificate
 * store apply, like in a browser. Calendar addresses are secrets: they are never logged, and error
 * messages never contain them. */
'use strict';

const { ipcMain, net, session } = require('electron');
const T = (key, params) => require('./i18n').t(key, params);

const PARTITION = 'todo4me-calendar'; // no "persist:" prefix → in memory only, nothing written to disk
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_URL = 2048;
const MAX_REDIRECTS = 5;
const MAX_PARALLEL = 4;
let timeoutMs = 20000;
let running = 0;

/** Validate and normalize a calendar address. → { url } or { error } */
function normalizeUrl(raw) {
  if (typeof raw !== 'string') return { error: T('cal.enterAddress') };
  let s = raw.trim();
  if (!s) return { error: T('cal.enterAddress') };
  if (s.length > MAX_URL) return { error: T('cal.tooLong') };
  if (/^webcals?:\/\//i.test(s)) s = 'https://' + s.replace(/^webcals?:\/\//i, '');
  let u;
  try { u = new URL(s); } catch (e) { return { error: T('cal.invalid') }; }
  if (u.protocol !== 'https:') return { error: T('cal.httpsOnly') };
  if (u.username || u.password) return { error: T('cal.noCredentials') };
  if (!u.hostname) return { error: T('cal.invalid') };
  u.hash = '';
  return { url: u.href };
}

function statusError(code) {
  if (code === 401 || code === 403) return T('cal.refused', { code });
  if (code === 404 || code === 410) return T('cal.notFound', { code });
  if (code === 429) return T('cal.busy', { code: 429 });
  if (code >= 500) return T('cal.serverProblem', { code });
  return T('cal.serverError', { code });
}
function netError(e) {
  const m = /net::(ERR_[A-Z_]+)/.exec(String(e && e.message));
  const code = m ? m[1] : '';
  if (/INTERNET_DISCONNECTED|NAME_NOT_RESOLVED|NAME_RESOLUTION_FAILED|ADDRESS_UNREACHABLE|NETWORK_CHANGED|CONNECTION_(REFUSED|RESET|CLOSED|FAILED|TIMED_OUT)|PROXY|TUNNEL/.test(code)) return 'No connection to the calendar server. Are you offline?';
  if (/CERT|SSL/.test(code)) return T('cal.certificate');
  if (/TIMED_OUT/.test(code)) return T('cal.timeout');
  return code ? T('cal.downloadFailedCode', { code }) : T('cal.downloadFailed');
}

/** Download a calendar. Resolves { ok: true, text } or { ok: false, error } — never rejects. */
function fetchCalendar(raw) {
  const n = normalizeUrl(raw);
  if (n.error) return Promise.resolve({ ok: false, error: n.error });
  if (running >= MAX_PARALLEL) return Promise.resolve({ ok: false, error: 'Too many calendar downloads at once. Try again in a moment.' });
  running++;
  return new Promise((resolve) => {
    let done = false, req = null, redirects = 0;
    const finish = (res) => {
      if (done) return;
      done = true;
      running--;
      clearTimeout(timer);
      if (!res.ok) { try { req.abort(); } catch (e) { /* already finished */ } }
      resolve(res);
    };
    const timer = setTimeout(() => finish({ ok: false, error: T('cal.timeout') }), timeoutMs);
    try {
      req = net.request({
        url: n.url, method: 'GET', session: session.fromPartition(PARTITION),
        redirect: 'manual', useSessionCookies: false, credentials: 'omit', cache: 'no-store',
      });
    } catch (e) { finish({ ok: false, error: T('cal.downloadFailed') }); return; }
    req.setHeader('Accept', 'text/calendar, text/plain;q=0.8, */*;q=0.5');
    req.on('redirect', (_status, _method, location) => {
      if (normalizeUrl(location).error) { finish({ ok: false, error: 'The calendar server redirected to an insecure (non-https) address.' }); return; }
      if (++redirects > MAX_REDIRECTS) { finish({ ok: false, error: T('cal.redirects') }); return; }
      try { req.followRedirect(); } catch (e) { finish({ ok: false, error: T('cal.downloadFailed') }); }
    });
    req.on('login', (_info, callback) => {
      try { callback(); } catch (e) { /* cancels the authentication */ }
      finish({ ok: false, error: 'The calendar server asks for a password. Use the calendar\'s published (secret) ICS link instead.' });
    });
    req.on('response', (res) => {
      if (res.statusCode < 200 || res.statusCode > 299) { finish({ ok: false, status: res.statusCode, error: statusError(res.statusCode) }); return; }
      const len = Number(res.headers['content-length']);
      if (len > MAX_BYTES) { finish({ ok: false, error: 'The calendar is too large (more than 5 MB).' }); return; }
      const chunks = [];
      let size = 0;
      res.on('data', (c) => {
        if (done) return;
        size += c.length;
        if (size > MAX_BYTES) { finish({ ok: false, error: 'The calendar is too large (more than 5 MB).' }); return; }
        chunks.push(c);
      });
      res.on('end', () => {
        if (done) return;
        const text = Buffer.concat(chunks).toString('utf8').replace(/^﻿/, '');
        if (!/^\s*BEGIN:VCALENDAR/i.test(text.slice(0, 1024))) { finish({ ok: false, error: 'This address does not return a calendar (ICS) file.' }); return; }
        finish({ ok: true, text });
      });
      res.on('error', (e) => finish({ ok: false, error: netError(e) }));
      res.on('aborted', () => finish({ ok: false, error: T('cal.interrupted') }));
    });
    req.on('error', (e) => finish({ ok: false, error: netError(e) }));
    req.end();
  });
}

function init() {
  ipcMain.handle('calendar:fetch', (_e, url) => fetchCalendar(typeof url === 'string' ? url : ''));
}

module.exports = {
  init, normalizeUrl, fetchCalendar, PARTITION, MAX_BYTES,
  _test: { setTimeoutMs(ms) { timeoutMs = Math.max(100, Number(ms) || 20000); } },
};
