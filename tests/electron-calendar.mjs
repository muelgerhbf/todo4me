// Desktop: calendar subscriptions — part of tests/test-electron.mjs.
// fetchCalendar() runs in the main process (electron/calendar.js). It is tested against a real local HTTPS
// server with a self-signed certificate made by openssl for this run. Only for this test, the calendar's own
// network session ("todo4me-calendar") is told to accept that certificate for 127.0.0.1; first the test
// checks that the certificate is rejected without that exception.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import https from 'node:https';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

function makeCert(dir) {
  const key = path.join(dir, 'key.pem'), cert = path.join(dir, 'cert.pem');
  const candidates = ['openssl', 'C:/Program Files/Git/usr/bin/openssl.exe', 'C:/Program Files/Git/mingw64/bin/openssl.exe'];
  for (const exe of candidates) {
    try {
      execFileSync(exe, ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '2',
        '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1'], { stdio: 'ignore' });
      return { key: fs.readFileSync(key), cert: fs.readFileSync(cert) };
    } catch (e) { /* try the next one */ }
  }
  return null;
}

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate());

export default async function calendarFetchChecks(b, ok, run) {
  const fetchCal = (url) => b.evaluate(`todo4meDesktop.fetchCalendar(${JSON.stringify(url)})`);

  // --- Validation (no server needed)
  let r = await fetchCal('http://example.com/calendar.ics');
  ok(!r.ok && /https/.test(r.error) && !('text' in r), 'fetchCalendar rejects http:// — ' + r.error);
  r = await fetchCal('file:///C:/Windows/win.ini');
  ok(!r.ok && /https/.test(r.error), 'fetchCalendar rejects file://');
  r = await fetchCal('javascript:alert(1)');
  ok(!r.ok, 'fetchCalendar rejects javascript:');
  r = await fetchCal('https://user:secret@example.com/cal.ics');
  ok(!r.ok && /user name or password/.test(r.error), 'fetchCalendar rejects addresses with credentials');
  r = await fetchCal('https://example.com/' + 'a'.repeat(5000));
  ok(!r.ok && /too long/.test(r.error), 'fetchCalendar rejects over-long addresses');
  r = await b.evaluate(`todo4meDesktop.fetchCalendar(42)`).catch((e) => ({ ok: false, error: String(e) }));
  ok(!r.ok, 'fetchCalendar with a non-string argument fails safely');
  const norm = await b.mainEval(`(() => { const c = Object.values(process.mainModule.constructor._cache).find((m) => m.filename && m.filename.endsWith('calendar.js') && m.filename.includes('electron')).exports;
    return [c.normalizeUrl('webcal://Outlook.Office365.com/owa/calendar/x/calendar.ics#frag').url, c.normalizeUrl('webcals://a.example/b').url, c.normalizeUrl(' https://x.example/c ').url, !!c.normalizeUrl('ftp://x').error]; })()`);
  ok(norm[0] === 'https://outlook.office365.com/owa/calendar/x/calendar.ics' && norm[1] === 'https://a.example/b' && norm[2] === 'https://x.example/c' && norm[3], 'webcal:// / webcals:// become https://, fragments removed: ' + norm[0]);

  // --- Local HTTPS server
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 't4cal-'));
  const tls = makeCert(dir);
  if (!tls) {
    console.log('SKIP local HTTPS checks: openssl not found (validation checks above still ran)');
    return;
  }
  const token = 'secret' + crypto.randomBytes(8).toString('hex');
  const today = new Date();
  const ics = (title) => ['BEGIN:VCALENDAR', 'VERSION:2.0', 'X-WR-CALNAME:Work', 'BEGIN:VEVENT', 'UID:w1', 'SUMMARY:' + title,
    'DTSTART:' + ymd(today) + 'T071500', 'DTEND:' + ymd(today) + 'T074500', 'END:VEVENT', 'END:VCALENDAR', ''].join('\r\n');
  const seen = [];
  let down = false;
  const server = https.createServer({ key: tls.key, cert: tls.cert }, (req, res) => {
    seen.push({ url: req.url, headers: req.headers });
    const u = req.url;
    if (u === '/' + token + '/cal.ics') {
      if (down) { res.writeHead(503); res.end('down'); return; }
      res.writeHead(200, { 'Content-Type': 'text/calendar; charset=utf-8', 'Set-Cookie': 'tracking=1; Path=/; Secure' });
      res.end('\uFEFF' + ics('Team meeting <b>bold</b>'));
    } else if (u === '/404.ics') { res.writeHead(404); res.end('nope'); }
    else if (u === '/big.ics') {
      res.writeHead(200, { 'Content-Type': 'text/calendar' });
      res.write('BEGIN:VCALENDAR\r\n');
      const chunk = 'X-FILLER:' + 'x'.repeat(1024 * 64) + '\r\n';
      let sent = 0;
      const pump = () => { while (sent < 6 * 1024 * 1024) { sent += chunk.length; if (!res.write(chunk)) { res.once('drain', pump); return; } } res.end('END:VCALENDAR\r\n'); };
      res.on('error', () => {}); pump();
    } else if (u === '/page.html') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<!doctype html><html><body>Sign in</body></html>'); }
    else if (u === '/to-http') { res.writeHead(302, { Location: 'http://127.0.0.1:' + server.address().port + '/' + token + '/cal.ics' }); res.end(); }
    else if (u === '/to-https') { res.writeHead(302, { Location: '/' + token + '/cal.ics' }); res.end(); }
    else if (u === '/auth') { res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="cal"' }); res.end(); }
    else if (u === '/slow') { /* never answers */ }
    else { res.writeHead(404); res.end(); }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = 'https://127.0.0.1:' + server.address().port;
  const CAL = `Object.values(process.mainModule.constructor._cache).find((m) => m.filename && m.filename.endsWith('calendar.js') && m.filename.includes('electron')).exports`;
  try {
    // Test-only exception: the calendar session accepts the self-signed certificate for 127.0.0.1
    // (Chromium caches verification results, so this is set before the first request).
    await b.mainEval(`globalThis.__t4certHosts = []; process.mainModule.require('electron').session.fromPartition(${CAL}.PARTITION).setCertificateVerifyProc((req, cb) => { globalThis.__t4certHosts.push(req.hostname); cb(req.hostname === '127.0.0.1' ? 0 : -3); }); true`);
    // Certificate verification is still on for everything else: the same certificate under another name is refused.
    r = await fetchCal('https://localhost:' + server.address().port + '/' + token + '/cal.ics');
    ok(!r.ok && /certificate/.test(r.error), 'an invalid certificate is rejected (verification stays on): ' + r.error);
    seen.length = 0;
    r = await fetchCal('webcal://127.0.0.1:' + server.address().port + '/' + token + '/cal.ics');
    ok(r.ok && /^BEGIN:VCALENDAR/.test(r.text) && /Team meeting/.test(r.text), 'webcal:// address downloaded over https (BOM removed)' + (r.ok ? '' : ': ' + r.error + ' ' + JSON.stringify(await b.mainEval('globalThis.__t4certHosts'))));
    r = await fetchCal(base + '/' + token + '/cal.ics');
    const h = seen.map((x) => x.headers);
    ok(r.ok && h.length === 2 && h.every((x) => !x.cookie && !x.authorization), 'no cookies and no credentials are sent (the server set a cookie on the first answer)');
    r = await fetchCal(base + '/404.ics');
    ok(!r.ok && /not found/.test(r.error) && /404/.test(r.error), '404 → clear error: ' + r.error);
    r = await fetchCal(base + '/big.ics');
    ok(!r.ok && /too large/.test(r.error), 'more than 5 MB → rejected: ' + r.error);
    r = await fetchCal(base + '/page.html');
    ok(!r.ok && /not return a calendar/.test(r.error), 'a web page instead of a calendar → rejected: ' + r.error);
    r = await fetchCal(base + '/to-http');
    ok(!r.ok && /insecure/.test(r.error), 'redirect to http:// → rejected: ' + r.error);
    r = await fetchCal(base + '/to-https');
    ok(r.ok && /Team meeting/.test(r.text), 'redirect to https:// is followed');
    r = await fetchCal(base + '/auth');
    ok(!r.ok && /refused|password/.test(r.error), 'password-protected address → refused without asking: ' + r.error);
    await b.mainEval(`${CAL}._test.setTimeoutMs(1500); true`);
    r = await fetchCal(base + '/slow');
    await b.mainEval(`${CAL}._test.setTimeoutMs(20000); true`);
    ok(!r.ok && /did not answer in time/.test(r.error), 'no answer → timeout: ' + r.error);

    // --- End to end: subscribe in Settings, events in the calendar, secret never shown or logged
    const url = 'webcal://127.0.0.1:' + server.address().port + '/' + token + '/cal.ics';
    await run(`
      window.__logs = [];
      ['log', 'info', 'warn', 'error', 'debug'].forEach((k) => { const o = console[k]; console[k] = function () { window.__logs.push(Array.from(arguments).map(String).join(' ')); return o.apply(console, arguments); }; });
      location.hash = '#/settings'; await wait(300);
      const f = $('#cal-add-form');
      ok(!!f && !!f.querySelector('input[type=url]'), 'Settings → Calendars: subscribe form in the desktop app');
      f.querySelector('[name=name]').value = 'Work';
      f.querySelector('[name=url]').value = ${JSON.stringify(url)};
      f.requestSubmit();
      for (let i = 0; i < 100 && !(T4.calfeeds.status[(T4.calfeeds.feeds[0] || {}).id] || {}).at; i++) await wait(100);
      const fd = T4.calfeeds.feeds[0], st = T4.calfeeds.status[fd.id];
      ok(fd.kind === 'url' && fd.name === 'Work' && st.state === 'ok' && st.count === 1, 'subscribed calendar downloaded: ' + st.state + ' ' + (st.error || ''));
      await wait(100);
      const html = document.documentElement.outerHTML;
      ok(/127\\.0\\.0\\.1:\\d+\\/•+/.test($('#cal-settings').textContent) && !html.includes(${JSON.stringify(token)}), 'the address is shown masked (server only), the secret part is not in the page');
      ok(!JSON.stringify(window.__logs).includes(${JSON.stringify(token)}) && !${JSON.stringify(JSON.stringify(b.errors))}.includes(${JSON.stringify(token)}), 'the address is never logged');
      ok(localStorage.getItem('todo4me.calendars.v1').includes(${JSON.stringify(token)}) && !(localStorage.getItem('todo4me.data.v1') || '').includes(${JSON.stringify(token)}) && !T4.storage.exportJSON(S()).includes(${JSON.stringify(token)}), 'the address is stored only in todo4me.calendars.v1 (not in the data document, not in exports)');
      location.hash = '#/planner?view=calendar'; await wait(300);
      const ev = $$('.cal-ev').find((x) => /Team meeting/.test(x.textContent));
      ok(ev && ev.closest('.cal__col').classList.contains('is-today') && /<b>bold<\\/b>/.test(ev.textContent) && !ev.querySelector('b'), 'subscribed event shown read-only in today\\'s column, HTML as text');
    `);
    // The server goes down: clear status, the last version stays visible
    down = true;
    await run(`
      click('[data-action=cal-refresh-all]');
      const id = T4.calfeeds.feeds[0].id;
      for (let i = 0; i < 100 && T4.calfeeds.status[id].state !== 'error'; i++) await wait(100);
      await wait(2300); // a pending repaint waits while nothing is being typed
      ok(T4.calfeeds.status[id].state === 'error' && /503/.test(T4.calfeeds.status[id].error), 'refresh while the server fails → error status: ' + T4.calfeeds.status[id].error);
      ok($$('.cal-ev').some((x) => /Team meeting/.test(x.textContent)) && /Work:/.test(($('.cal-problem') || {}).textContent || ''), 'calendar keeps showing the last downloaded version and explains the problem');
    `);
    await b.reload();
    await b.sleep(4500); // start-up refresh (3 s) fails again
    await run(`
      location.hash = '#/planner?view=calendar'; await wait(300);
      ok($$('.cal-ev').some((x) => /Team meeting/.test(x.textContent)), 'after a restart the cached calendar is shown although the server is down');
      location.hash = '#/settings'; await wait(300);
      ok(/503/.test($('#cal-settings').textContent) && /showing the version from/.test($('#cal-settings').textContent), 'Settings shows the error per calendar');
      click('[data-action=cal-remove]'); await wait(50); click('#confirm [data-confirm=yes]'); await wait(100);
      ok(T4.calfeeds.feeds.length === 0 && !(localStorage.getItem('todo4me.calendars.v1') || '').includes(${JSON.stringify(token)}), 'removing the subscription deletes the stored address');
    `);
  } finally {
    server.close();
    try { server.closeAllConnections && server.closeAllConnections(); } catch (e) { /* ignore */ }
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  }
}
