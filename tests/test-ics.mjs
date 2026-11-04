// Unit tests for the ICS parser (js/ics.js), run with plain Node: node tests/test-ics.mjs
// Uses the fixtures in tests/fixtures/ics. The local time zone is fixed to Europe/Berlin
// (and later America/New_York) so the expected local times do not depend on this computer.
process.env.TZ = 'Europe/Berlin';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const here = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1');
const ICS = require(path.join(here, '..', 'js', 'ics.js'));
const fx = (name) => fs.readFileSync(path.join(here, 'fixtures', 'ics', name), 'utf8');

const out = [];
const ok = (c, msg) => { out.push((c ? 'PASS ' : 'FAIL ') + msg); };
const pad = (n) => String(n).padStart(2, '0');
/** UTC ms → local 'YYYY-MM-DD HH:MM' in the current TZ */
const local = (ms) => { const d = new Date(ms); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
const iso = (ms) => new Date(ms).toISOString().slice(0, 16) + 'Z';
const byUid = (list, uid) => list.filter((o) => o.uid === uid).sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
const safe = (name, fn) => { try { fn(); } catch (e) { ok(false, name + ' threw: ' + e.stack); } };

/* ---------- Low-level helpers ---------- */
safe('helpers', () => {
  ok(ICS.unfold('A:1\r\n 2\r\n\t3\nB:x').join('|') === 'A:123|B:x', 'line unfolding (CRLF/LF + space/tab)');
  const p = ICS.parseLine('ATTENDEE;CN="Doe, John: Boss";ROLE=REQ:mailto:a@b');
  ok(p && p.name === 'ATTENDEE' && p.params.CN === 'Doe, John: Boss' && p.params.ROLE === 'REQ' && p.value === 'mailto:a@b', 'quoted parameter values may contain ":" and ","');
  ok(ICS.unescapeText('a\\nb\\, c\\; d \\\\ e') === 'a\nb, c; d \\ e', 'text unescaping (\\n \\, \\; \\\\)');
  ok(ICS.unescapeText('x\u0000y\u0007z') === 'xyz', 'control characters removed');
  ok(ICS.parseDuration('PT1H30M') === 5400000 && ICS.parseDuration('P1D') === 86400000 && ICS.parseDuration('P1W') === 604800000 && ICS.parseDuration('-PT15M') === -900000 && ICS.parseDuration('P') === null, 'DURATION parsing');
  ok(ICS.parseDT('20260230', {}) === null && ICS.parseDT('20261104T250000', {}) === null && ICS.parseDT('garbage', {}) === null, 'invalid dates are rejected');
  ok(ICS.resolveZone('Europe/Berlin') === 'I:Europe/Berlin' && ICS.resolveZone('W. Europe Standard Time') === 'I:Europe/Berlin' && ICS.resolveZone('/mozilla.org/20050126_1/Europe/Berlin') === 'I:Europe/Berlin' && ICS.resolveZone('UTC') === 'Z' && ICS.resolveZone('Mars/Olympus_Mons') === 'L' && ICS.resolveZone(null) === 'L', 'TZID resolution: IANA, Windows name, Mozilla prefix, UTC, unknown → local');
  let threw = ''; try { ICS.parse('<html>not a calendar</html>'); } catch (e) { threw = e.message; }
  ok(/not an iCalendar/.test(threw), 'non-ICS text is rejected with a readable message');
  const empty = ICS.parse('BEGIN:VCALENDAR\r\nEND:VCALENDAR');
  ok(empty.events.length === 0, 'empty calendar parses');
  const broken = ICS.parse('BEGIN:VCALENDAR\nBEGIN:VEVENT\nSUMMARY:no start\nEND:VEVENT\nBEGIN:VEVENT\nDTSTART:2026\nEND:VEVENT\nBEGIN:VEVENT\nUID:ok\nDTSTART:20261104T100000Z\nEND:VEVENT\nthis line is junk\nBEGIN:VEVENT\nUID:unclosed\nDTSTART:20261104T110000Z');
  ok(broken.events.length === 1 && broken.events[0].uid === 'ok' && broken.stats.skipped === 2, 'events without a valid DTSTART are skipped, junk and unclosed blocks ignored');
});

/* ---------- Time zones ---------- */
safe('timezones', () => {
  const cal = ICS.parse(fx('timezones.ics'));
  ok(cal.name === 'Zones' && cal.events.length === 11, 'timezones.ics: 11 events, calendar name');
  const occ = ICS.expand(cal, '2026-02-25', '2026-11-30');
  const one = (uid) => byUid(occ, uid)[0];
  ok(iso(one('tz-a').start) === '2026-03-05T14:00Z' && local(one('tz-a').start) === '2026-03-05 15:00' && one('tz-a').end - one('tz-a').start === 3600000, 'TZID America/New_York before US DST: 09:00 EST = 14:00 UTC = 15:00 Berlin');
  ok(iso(one('tz-b').start) === '2026-03-10T13:00Z' && local(one('tz-b').start) === '2026-03-10 14:00' && one('tz-b').end - one('tz-b').start === 45 * 60000, 'TZID America/New_York after US DST: 09:00 EDT = 13:00 UTC; DURATION 45 min');
  ok(local(one('tz-c').start) === '2026-03-29 10:00' && local(one('tz-c').end) === '2026-03-29 11:00', 'UTC time on the Berlin DST day → 10:00 CEST');
  ok(local(one('tz-d').start) === '2026-11-04 10:00' && iso(one('tz-d').start) === '2026-11-04T09:00Z', 'Outlook Windows zone name "W. Europe Standard Time" → Europe/Berlin');
  ok(local(one('tz-e').start) === '2026-11-04 12:00', 'floating time = local time');
  ok(local(one('tz-f').start) === '2026-11-04 15:00', 'unknown TZID without VTIMEZONE → treated as local time');
  ok(iso(one('tz-g1').start) === '2026-03-05T14:00Z' && iso(one('tz-g2').start) === '2026-03-12T13:00Z', 'custom VTIMEZONE (STANDARD/DAYLIGHT rules) used when Intl does not know the TZID');
  const h = byUid(occ, 'tz-h').map((o) => local(o.start));
  ok(h.join() === '2026-03-19 10:00,2026-03-26 10:00,2026-04-02 10:00', 'weekly Europe/Berlin series stays at 10:00 across the DST change: ' + h.join());
  const hu = byUid(occ, 'tz-h').map((o) => iso(o.start));
  ok(hu.join() === '2026-03-19T09:00Z,2026-03-26T09:00Z,2026-04-02T08:00Z', '… which is 09:00 UTC before and 08:00 UTC after the change');
  const i = byUid(occ, 'tz-i').map((o) => local(o.start));
  ok(i.join() === '2026-03-01 15:00,2026-03-08 14:00,2026-03-15 14:00', 'weekly New York series converted to Berlin across the US DST change: ' + i.join());
  ok(local(one('tz-j').start) === '2026-11-04 08:00', 'Mozilla-style TZID prefix');
  ok(ICS.expand(cal, '2026-11-04', '2026-11-05').length === 4, 'expand returns only occurrences in the range');
});

/* ---------- All-day ---------- */
safe('allday', () => {
  const cal = ICS.parse(fx('allday.ics'));
  const occ = ICS.expand(cal, '2026-11-01', '2026-12-01');
  const one = (uid) => byUid(occ, uid)[0];
  ok(one('ad-1').allDay && one('ad-1').start === '2026-11-05' && one('ad-1').end === '2026-11-06', 'all-day event (VALUE=DATE), DTEND exclusive');
  ok(one('ad-2').start === '2026-11-09' && one('ad-2').end === '2026-11-12', 'multi-day all-day event (3 days)');
  ok(one('ad-3').start === '2026-11-20' && one('ad-3').end === '2026-11-21', 'all-day without DTEND = one day');
  ok(one('ad-4').start === '2026-11-21' && one('ad-4').end === '2026-11-23', 'date without VALUE=DATE + DURATION P2D');
  ok(byUid(occ, 'ad-6').map((o) => o.start).join() === '2026-11-02,2026-11-16,2026-11-23', 'weekly all-day with COUNT=4 and EXDATE;VALUE=DATE');
  const b = byUid(ICS.expand(cal, '2027-02-01', '2027-03-01'), 'ad-5');
  ok(b.length === 1 && b[0].start === '2027-02-15', 'yearly all-day series from 1990 (birthday)');
  ok(byUid(ICS.expand(cal, '2026-11-10', '2026-11-11'), 'ad-2').length === 1, 'a multi-day event shows on its middle day');
  ok(ICS.expand(cal, '2026-11-06', '2026-11-09').length === 0, 'nothing on days without events');
});

/* ---------- Folding, escaping, untrusted text ---------- */
safe('folding', () => {
  const cal = ICS.parse(fx('folding-escaping.ics'));
  const ev = (uid) => cal.events.find((e) => e.uid === uid);
  ok(cal.name === 'Team , Calendar', 'X-WR-CALNAME unescaped');
  ok(ev('fold-1').title === 'This summary is folded across three lines', 'folded SUMMARY over three lines (space + tab)');
  ok(ev('fold-1').description === 'Line one\nLine two, with comma; semicolon and a backslash \\ done', 'escaped DESCRIPTION');
  ok(ev('fold-1').location === 'Room 4, Building B', 'escaped LOCATION');
  ok(ev('fold-1').tz === 'I:Europe/Berlin', 'quoted TZID parameter');
  ok(ev('valarm-only').description === '' && ev('valarm-only').title === 'Has alarm', 'VALARM properties do not replace the event\'s SUMMARY/DESCRIPTION');
  ok(ev('evil-1').title === '<img src=x onerror="alert(1)"><script>alert(2)</script>Evil', 'malicious SUMMARY kept as plain text (the views escape it)');
  ok(ev('fold-1').title.length <= ICS.MAX.title && ICS.parse('BEGIN:VCALENDAR\nBEGIN:VEVENT\nDTSTART:20261104T100000Z\nSUMMARY:' + 'x'.repeat(5000) + '\nEND:VEVENT\nEND:VCALENDAR').events[0].title.length === ICS.MAX.title, 'long text is limited');
});

/* ---------- Recurrence ---------- */
safe('rrule', () => {
  const cal = ICS.parse(fx('rrule.ics'));
  const occ = ICS.expand(cal, '2026-11-01', '2027-03-01');
  const days = (uid) => byUid(occ, uid).map((o) => (o.allDay ? o.start : local(o.start).slice(0, 10)));
  ok(days('r1').join() === '2026-11-02,2026-11-06,2026-11-09,2026-11-11,2026-11-13,2026-11-16,2026-11-18,2026-11-20', 'WEEKLY BYDAY=MO,WE,FR + UNTIL + EXDATE (Nov 4 excluded): ' + days('r1').join());
  ok(byUid(occ, 'r1').every((o) => local(o.start).endsWith('09:00') && o.end - o.start === 1800000), '… each at 09:00 for 30 minutes');
  ok(days('r2').join() === '2026-11-03,2026-11-17,2026-12-01,2026-12-15', 'WEEKLY INTERVAL=2 BYDAY=TU COUNT=4');
  ok(days('r3').join() === '2026-11-01,2026-11-03,2026-11-05,2026-11-07,2026-11-09', 'DAILY INTERVAL=2 COUNT=5');
  ok(days('r4').join() === '2026-11-10,2026-12-08,2027-01-12,2027-02-09', 'MONTHLY BYDAY=2TU (second Tuesday)');
  ok(days('r5').join() === '2026-11-30,2026-12-31,2027-01-31,2027-02-28', 'MONTHLY BYMONTHDAY=-1 (last day of the month)');
  ok(days('r6').join() === '2026-11-30,2026-12-31,2027-01-29,2027-02-26', 'MONTHLY BYDAY=MO..FR BYSETPOS=-1 (last weekday)');
  ok(days('r7').join() === '2026-11-26', 'YEARLY BYMONTH=11 BYDAY=4TH (Thanksgiving)');
  const r8 = byUid(occ, 'r8').map((o) => local(o.start) + ' ' + o.title);
  ok(r8.join('|') === '2026-11-05 14:00 Series with exceptions|2026-11-12 16:00 Moved|2026-11-26 14:00 Series with exceptions', 'RECURRENCE-ID: moved occurrence replaces the original, cancelled occurrence removed: ' + r8.join('|'));
  ok(!occ.some((o) => o.uid === 'c1'), 'STATUS:CANCELLED event skipped');
  ok(cal.stats.cancelled === 2, 'cancelled events counted (event + cancelled occurrence)');
  ok(days('r9').join() === '2026-12-31,2027-01-31', 'MONTHLY on the 31st skips shorter months');
  const leap = byUid(ICS.expand(cal, '2025-01-01', '2029-01-01'), 'r11').map((o) => o.start);
  ok(leap.join() === '2028-02-29', 'YEARLY from Feb 29 only in leap years');
  const hourly = byUid(ICS.expand(cal, '2026-11-04', '2026-11-05'), 'r12');
  ok(hourly.length === 1, 'unsupported FREQ=HOURLY → shown once (DTSTART), not dropped and not exploding');
  // Long-running series: the visible range is reached quickly and the result is bounded.
  const daily = ICS.parse('BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:d\nDTSTART;TZID=Europe/Berlin:20000101T070000\nDURATION:PT15M\nRRULE:FREQ=DAILY\nEND:VEVENT\nEND:VCALENDAR');
  const t0 = Date.now();
  const d = ICS.expand(daily, '2026-11-02', '2026-11-09');
  ok(d.length === 7 && d.every((o) => local(o.start).endsWith('07:00')) && Date.now() - t0 < 500, 'daily series from 2000: one occurrence per visible day, fast (' + (Date.now() - t0) + ' ms)');
  const many = ICS.parse('BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:m\nDTSTART:20260101T000000Z\nRRULE:FREQ=DAILY\nEND:VEVENT\nEND:VCALENDAR');
  ok(ICS.expand(many, '2026-01-01', '2100-01-01').length <= ICS.MAX.occurrences, 'expansion is capped (' + ICS.MAX.occurrences + ' occurrences)');
});

/* ---------- Cache shape, pruning ---------- */
safe('cache', () => {
  const cal = ICS.parse(fx('timezones.ics'));
  const json = JSON.parse(JSON.stringify(cal));
  ICS.expand(cal, '2026-03-01', '2026-03-20'); // fills the VTIMEZONE onset cache
  ok(JSON.stringify(cal) === JSON.stringify(json), 'parsed calendar is plain JSON and expanding does not add data to it (safe to cache)');
  ok(Object.keys(cal.zones).join() === 'Fabrikam Eastern', 'only VTIMEZONEs that events need are kept');
  const again = ICS.expand(json, '2026-03-01', '2026-03-20').map((o) => o.uid + o.start).join();
  ok(again === ICS.expand(cal, '2026-03-01', '2026-03-20').map((o) => o.uid + o.start).join(), 'a calendar restored from JSON expands identically');
  const rr = ICS.parse(fx('rrule.ics'));
  const n = rr.events.length;
  const removed = ICS.prune(rr, Date.parse('2026-11-25T00:00:00Z'));
  ok(removed === 2 && rr.events.length === n - 2 && rr.events.every((e) => e.rrule || e.uid === 'r8'), 'prune drops only past single events, never series');
});

/* ---------- Another local time zone ---------- */
safe('newyork', () => {
  process.env.TZ = 'America/New_York';
  const cal = ICS.parse(fx('timezones.ics'));
  const occ = ICS.expand(cal, '2026-02-25', '2026-11-30');
  const one = (uid) => byUid(occ, uid)[0];
  ok(local(one('tz-a').start) === '2026-03-05 09:00' && local(one('tz-c').start) === '2026-03-29 04:00' && local(one('tz-d').start) === '2026-11-04 04:00', 'in New York the same instants show at New York local times');
  ok(local(one('tz-e').start) === '2026-11-04 12:00', 'floating time stays 12:00 local in any zone');
  const ad = ICS.expand(ICS.parse(fx('allday.ics')), '2026-11-01', '2026-12-01');
  ok(byUid(ad, 'ad-1')[0].start === '2026-11-05', 'all-day dates do not shift with the local zone');
  process.env.TZ = 'Europe/Berlin';
});

out.forEach((r) => console.log(r));
const failed = out.filter((r) => r.startsWith('FAIL')).length;
console.log('\n' + out.filter((r) => r.startsWith('PASS')).length + ' passed, ' + failed + ' failed');
process.exitCode = failed ? 1 : 0;
