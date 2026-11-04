/* Todo4Me — iCalendar (ICS, RFC 5545) parser and recurrence expansion.
 *
 * Pure functions, no DOM and no dependencies: runs in the page (T4.ics) and in Node (tests).
 * ICS text is UNTRUSTED input. The parser only extracts plain text values (length-limited);
 * everything shown in the app is HTML-escaped by the views.
 *
 * Supported:
 *  - VEVENT with DTSTART + DTEND or DURATION (no end → all-day: 1 day, timed: 0 minutes)
 *  - all-day events (VALUE=DATE, DTEND exclusive), multi-day events
 *  - times in UTC ("…Z"), with TZID, or floating (= local time)
 *  - line folding (CRLF/LF + space/tab), escaped text (\\ \; \, \n)
 *  - RRULE: FREQ=DAILY/WEEKLY/MONTHLY/YEARLY with INTERVAL, COUNT, UNTIL, BYDAY (also 2TU, -1FR),
 *    BYMONTHDAY (also negative), BYMONTH, BYSETPOS, WKST; EXDATE; RECURRENCE-ID overrides
 *    (moved or cancelled single occurrences, as Outlook and Google publish them).
 *    Not supported (ignored): BYWEEKNO, BYYEARDAY, BYHOUR/BYMINUTE/BYSECOND, RDATE, HOURLY and finer.
 *  - STATUS:CANCELLED events are skipped.
 *
 * Time zones, in this order:
 *  1. "Z" → UTC.
 *  2. TZID that Intl knows (IANA, e.g. Europe/Berlin; also Mozilla-style "/mozilla.org/…/Europe/Berlin").
 *  3. Windows zone names as Outlook writes them ("W. Europe Standard Time") → IANA via a built-in table.
 *  4. The VTIMEZONE block of the file (STANDARD/DAYLIGHT with TZOFFSETTO and a yearly RRULE).
 *  5. Unknown → treated as local time ("floating"). Documented in the README.
 * Recurring events are expanded in the wall-clock time of their own zone, so a weekly 10:00 meeting
 * in Europe/Berlin stays at 10:00 Berlin time across daylight-saving changes.
 *
 * Internal representation: a "wall" time is the wall-clock date/time encoded as if it were UTC
 * (Date.UTC(y, m - 1, d, h, mi, s)); a "day" is Math.floor(wall / DAY). */
(function (root) {
  'use strict';

  const DAY = 86400000;
  const WD = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  const MAX = { title: 300, location: 300, description: 2000, uid: 200, events: 20000, occurrences: 5000 };

  /* ---------------- Lines ---------------- */
  /** Unfold (RFC 5545 3.1): a line break followed by one space or tab continues the previous line. */
  function unfold(text) {
    return String(text == null ? '' : text).replace(/^﻿/, '').replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  }

  /** "NAME;P1=a;P2="x:y",b:value" → { name, params: { P1: 'a', P2: 'x:y,b' }, value } (or null). */
  function parseLine(line) {
    const n = line.length;
    let i = 0;
    while (i < n && line[i] !== ';' && line[i] !== ':') i++;
    const name = line.slice(0, i).trim().toUpperCase();
    if (!name) return null;
    const params = {};
    while (i < n && line[i] === ';') {
      i++;
      const eq = line.indexOf('=', i);
      if (eq < 0) return null;
      const pname = line.slice(i, eq).trim().toUpperCase();
      i = eq + 1;
      const vals = [];
      for (;;) {
        if (line[i] === '"') {
          const q = line.indexOf('"', i + 1);
          if (q < 0) return null;
          vals.push(line.slice(i + 1, q));
          i = q + 1;
        } else {
          let j = i;
          while (j < n && line[j] !== ';' && line[j] !== ':' && line[j] !== ',') j++;
          vals.push(line.slice(i, j));
          i = j;
        }
        if (line[i] === ',') { i++; continue; }
        break;
      }
      params[pname] = vals.join(',');
    }
    if (line[i] !== ':') return null;
    return { name, params, value: line.slice(i + 1) };
  }

  /** TEXT value: \n → line break, \, \; \\ → literal; control characters removed; trimmed and limited. */
  function unescapeText(v, max) {
    const s = String(v == null ? '' : v)
      .replace(/\\([\\;,nN])/g, (m, c) => (c === 'n' || c === 'N' ? '\n' : c))
      .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')
      .trim();
    return max ? s.slice(0, max) : s;
  }

  /* ---------------- Values ---------------- */
  const dayOf = (y, m, d) => Math.floor(Date.UTC(y, m - 1, d) / DAY);
  const pad = (n) => String(n).padStart(2, '0');
  /** day number → 'YYYY-MM-DD' */
  function dayStr(day) {
    const d = new Date(day * DAY);
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }
  /** 'YYYY-MM-DD' → day number */
  function strDay(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    return m ? dayOf(+m[1], +m[2], +m[3]) : NaN;
  }

  /** DATE or DATE-TIME → { date: true, day } | { date: false, wall, utc, tzid } | null */
  function parseDT(value, params) {
    const v = String(value || '').trim();
    params = params || {};
    let m = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
    if (!m && String(params.VALUE || '').toUpperCase() === 'DATE') m = /^(\d{4})(\d{2})(\d{2})/.exec(v);
    if (m) {
      const y = +m[1], mo = +m[2], d = +m[3];
      if (!validDate(y, mo, d)) return null;
      return { date: true, day: dayOf(y, mo, d) };
    }
    m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/i.exec(v);
    if (!m) return null;
    const y = +m[1], mo = +m[2], d = +m[3], h = +m[4], mi = +m[5], s = Math.min(59, +(m[6] || 0));
    if (!validDate(y, mo, d) || h > 23 || mi > 59) return null;
    return { date: false, wall: Date.UTC(y, mo - 1, d, h, mi, s), utc: !!m[7], tzid: params.TZID ? String(params.TZID).trim() : null };
  }
  function validDate(y, mo, d) {
    if (y < 1000 || y > 9999 || mo < 1 || mo > 12 || d < 1) return false;
    return d <= new Date(Date.UTC(y, mo, 0)).getUTCDate();
  }

  /** "P1W", "PT1H30M", "-P1D", "P1DT12H" → milliseconds (or null). */
  function parseDuration(v) {
    const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i.exec(String(v || '').trim());
    if (!m || (!m[2] && !m[3] && !m[4] && !m[5] && !m[6])) return null;
    const ms = (((+m[2] || 0) * 7 + (+m[3] || 0)) * 24 * 3600 + (+m[4] || 0) * 3600 + (+m[5] || 0) * 60 + (+m[6] || 0)) * 1000;
    return m[1] === '-' ? -ms : ms;
  }

  /** "+0100", "-0500", "+053000" → milliseconds */
  function parseOffset(v) {
    const m = /^([+-])(\d{2})(\d{2})(\d{2})?$/.exec(String(v || '').trim());
    if (!m) return null;
    const ms = ((+m[2]) * 3600 + (+m[3]) * 60 + (+(m[4] || 0))) * 1000;
    return m[1] === '-' ? -ms : ms;
  }

  /* ---------------- Time zones ---------------- */
  // Windows time zone names (Outlook) → IANA (CLDR windowsZones, territory "001").
  const WINDOWS = {
    'Dateline Standard Time': 'Etc/GMT+12', 'UTC-11': 'Etc/GMT+11', 'Hawaiian Standard Time': 'Pacific/Honolulu',
    'Alaskan Standard Time': 'America/Anchorage', 'Pacific Standard Time': 'America/Los_Angeles',
    'Pacific Standard Time (Mexico)': 'America/Tijuana', 'US Mountain Standard Time': 'America/Phoenix',
    'Mountain Standard Time': 'America/Denver', 'Central America Standard Time': 'America/Guatemala',
    'Central Standard Time': 'America/Chicago', 'Canada Central Standard Time': 'America/Regina',
    'Central Standard Time (Mexico)': 'America/Mexico_City', 'SA Pacific Standard Time': 'America/Bogota',
    'Eastern Standard Time': 'America/New_York', 'US Eastern Standard Time': 'America/Indiana/Indianapolis',
    'Atlantic Standard Time': 'America/Halifax', 'Newfoundland Standard Time': 'America/St_Johns',
    'E. South America Standard Time': 'America/Sao_Paulo', 'Argentina Standard Time': 'America/Argentina/Buenos_Aires',
    'SA Eastern Standard Time': 'America/Cayenne', 'Greenland Standard Time': 'America/Nuuk',
    'UTC': 'Etc/UTC', 'Coordinated Universal Time': 'Etc/UTC', 'GMT Standard Time': 'Europe/London',
    'Greenwich Standard Time': 'Atlantic/Reykjavik', 'W. Europe Standard Time': 'Europe/Berlin',
    'Central Europe Standard Time': 'Europe/Budapest', 'Romance Standard Time': 'Europe/Paris',
    'Central European Standard Time': 'Europe/Warsaw', 'W. Central Africa Standard Time': 'Africa/Lagos',
    'GTB Standard Time': 'Europe/Bucharest', 'E. Europe Standard Time': 'Europe/Chisinau',
    'FLE Standard Time': 'Europe/Kyiv', 'Israel Standard Time': 'Asia/Jerusalem', 'Egypt Standard Time': 'Africa/Cairo',
    'South Africa Standard Time': 'Africa/Johannesburg', 'Turkey Standard Time': 'Europe/Istanbul',
    'Russian Standard Time': 'Europe/Moscow', 'Belarus Standard Time': 'Europe/Minsk', 'Arabic Standard Time': 'Asia/Baghdad',
    'Arab Standard Time': 'Asia/Riyadh', 'Arabian Standard Time': 'Asia/Dubai', 'Iran Standard Time': 'Asia/Tehran',
    'Pakistan Standard Time': 'Asia/Karachi', 'India Standard Time': 'Asia/Kolkata', 'Sri Lanka Standard Time': 'Asia/Colombo',
    'Nepal Standard Time': 'Asia/Kathmandu', 'Bangladesh Standard Time': 'Asia/Dhaka', 'SE Asia Standard Time': 'Asia/Bangkok',
    'China Standard Time': 'Asia/Shanghai', 'Singapore Standard Time': 'Asia/Singapore', 'Taipei Standard Time': 'Asia/Taipei',
    'W. Australia Standard Time': 'Australia/Perth', 'Tokyo Standard Time': 'Asia/Tokyo', 'Korea Standard Time': 'Asia/Seoul',
    'AUS Central Standard Time': 'Australia/Darwin', 'Cen. Australia Standard Time': 'Australia/Adelaide',
    'AUS Eastern Standard Time': 'Australia/Sydney', 'E. Australia Standard Time': 'Australia/Brisbane',
    'Tasmania Standard Time': 'Australia/Hobart', 'New Zealand Standard Time': 'Pacific/Auckland',
    'Morocco Standard Time': 'Africa/Casablanca', 'Ekaterinburg Standard Time': 'Asia/Yekaterinburg',
    'Central Asia Standard Time': 'Asia/Almaty', 'North Asia Standard Time': 'Asia/Krasnoyarsk',
    'Vladivostok Standard Time': 'Asia/Vladivostok',
  };

  const ianaOk = {};
  function isIana(id) {
    if (id in ianaOk) return ianaOk[id];
    let ok = false;
    try { new Intl.DateTimeFormat('en-US', { timeZone: id }).format(0); ok = true; } catch (e) { ok = false; }
    ianaOk[id] = ok;
    return ok;
  }

  /** TZID → zone code: 'Z' (UTC), 'I:<IANA>', 'V:<tzid>' (VTIMEZONE of the file) or 'L' (local/floating). */
  function resolveZone(tzid, vtz) {
    if (!tzid) return 'L';
    const id = String(tzid).trim().replace(/^"|"$/g, '');
    if (/^(Z|UTC|GMT|Etc\/UTC|Etc\/GMT|Etc\/Zulu|Zulu|Coordinated Universal Time)$/i.test(id)) return 'Z';
    if (/^[A-Za-z][\w+\-]*(\/[\w+\-]+){0,2}$/.test(id) && isIana(id)) return 'I:' + id;
    const tail = /([A-Za-z]+\/[A-Za-z_+\-]+(?:\/[A-Za-z_+\-]+)?)\s*$/.exec(id); // "/mozilla.org/20050126_1/Europe/Berlin"
    if (tail && isIana(tail[1])) return 'I:' + tail[1];
    if (WINDOWS[id] && isIana(WINDOWS[id])) return 'I:' + WINDOWS[id];
    if (vtz && vtz[id] && vtz[id].obs.length) return 'V:' + id;
    return 'L';
  }

  const fmtCache = {};
  /** wall − utc for an IANA zone at the instant utcMs. */
  function ianaOffset(zone, utcMs) {
    const f = fmtCache[zone] || (fmtCache[zone] = new Intl.DateTimeFormat('en-US', {
      timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
    }));
    const p = {};
    f.formatToParts(new Date(utcMs)).forEach((x) => { p[x.type] = x.value; });
    const wall = Date.UTC(+p.year, +p.month - 1, +p.day, (+p.hour) % 24, +p.minute, +p.second);
    return wall - Math.floor(utcMs / 1000) * 1000;
  }
  function ianaToUtc(zone, wall) {
    const o1 = ianaOffset(zone, wall);
    const t1 = wall - o1;
    const o2 = ianaOffset(zone, t1);
    if (o1 === o2) return t1;
    const t2 = wall - o2;
    const o3 = ianaOffset(zone, t2);
    if (o2 === o3) return t2;
    return wall - Math.min(o2, o3); // non-existent local time (spring forward): offset before the change (RFC 5545)
  }

  /** wall − utc for a VTIMEZONE at the given wall time: the observance with the latest onset before it. */
  const onsetCache = typeof WeakMap === 'function' ? new WeakMap() : null; // not on the objects: they are cached as JSON
  function vtzOffset(zone, wall) {
    const y = new Date(wall).getUTCFullYear();
    let best = null, bestAt = -Infinity;
    zone.obs.forEach((o) => {
      let cache = onsetCache && onsetCache.get(o);
      if (!cache) { cache = {}; if (onsetCache) onsetCache.set(o, cache); }
      let onsets = cache[y];
      if (!onsets) {
        onsets = [];
        if (o.rrule) recur(o.rrule, o.start, Date.UTC(y, 11, 31, 23, 59), Date.UTC(y - 1, 0, 1), (w) => { onsets.push(w); }, untilWall(o.rrule, null));
        else onsets.push(o.start);
        cache[y] = onsets;
      }
      onsets.forEach((at) => { if (at <= wall && at > bestAt) { bestAt = at; best = o; } });
    });
    if (best) return best.to;
    const first = zone.obs.slice().sort((a, b) => a.start - b.start)[0];
    return first ? first.from : 0;
  }

  /** Wall-clock time in a zone → UTC milliseconds. */
  function toUtc(code, wall, zones) {
    if (code === 'Z') return wall;
    if (code && code.indexOf('I:') === 0) return ianaToUtc(code.slice(2), wall);
    if (code && code.indexOf('V:') === 0 && zones && zones[code.slice(2)]) return wall - vtzOffset(zones[code.slice(2)], wall);
    const d = new Date(wall); // floating / unknown → local time of this computer
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()).getTime();
  }

  /* ---------------- RRULE ---------------- */
  const ints = (s, min, max) => String(s).split(',').map((x) => parseInt(x, 10)).filter((n) => Number.isFinite(n) && n !== 0 && n >= min && n <= max);

  function parseRule(v) {
    const r = {};
    String(v || '').split(';').forEach((kv) => {
      const i = kv.indexOf('=');
      if (i > 0) r[kv.slice(0, i).trim().toUpperCase()] = kv.slice(i + 1).trim();
    });
    const freq = String(r.FREQ || '').toUpperCase();
    if (['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].indexOf(freq) < 0) return null;
    const out = { freq, interval: Math.min(1000, Math.max(1, parseInt(r.INTERVAL, 10) || 1)) };
    if (r.COUNT) { const c = parseInt(r.COUNT, 10); if (c > 0) out.count = Math.min(c, 100000); }
    if (r.UNTIL) {
      const u = parseDT(r.UNTIL, {});
      if (u) out.until = u.date ? { day: u.day } : { wall: u.wall, utc: u.utc };
    }
    if (r.BYDAY) {
      const bd = r.BYDAY.split(',').map((x) => /^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/i.exec(x.trim())).filter(Boolean)
        .map((m) => ({ n: m[1] ? parseInt(m[1], 10) : 0, wd: WD.indexOf(m[2].toUpperCase()) }));
      if (bd.length) out.byday = bd;
    }
    if (r.BYMONTHDAY) { const x = ints(r.BYMONTHDAY, -31, 31); if (x.length) out.bymonthday = x; }
    if (r.BYMONTH) { const x = ints(r.BYMONTH, 1, 12); if (x.length) out.bymonth = x; }
    if (r.BYSETPOS) { const x = ints(r.BYSETPOS, -366, 366); if (x.length) out.bysetpos = x; }
    if (r.WKST && WD.indexOf(r.WKST.toUpperCase()) >= 0) out.wkst = WD.indexOf(r.WKST.toUpperCase());
    if (r.BYWEEKNO || r.BYYEARDAY || r.BYHOUR || r.BYMINUTE || r.BYSECOND) out.partial = true;
    return out;
  }

  const wdOf = (day) => (day % 7 + 7 + 4) % 7; // day 0 = 1970-01-01 = Thursday
  const ymOf = (day) => { const d = new Date(day * DAY); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() }; };
  const dim = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

  /** Days in a month (or a whole year) matching BYDAY entries ({ n, wd }). */
  function bydayIn(first, len, byday) {
    const out = [];
    byday.forEach((b) => {
      const all = [];
      const off = (b.wd - wdOf(first) + 7) % 7;
      for (let d = first + off; d < first + len; d += 7) all.push(d);
      if (!b.n) out.push.apply(out, all);
      else {
        const x = b.n > 0 ? all[b.n - 1] : all[all.length + b.n];
        if (x != null) out.push(x);
      }
    });
    return out;
  }
  function monthDays(y, m, rule, startD) {
    const first = dayOf(y, m, 1), len = dim(y, m);
    let days;
    if (rule.bymonthday) {
      days = rule.bymonthday.map((md) => (md > 0 ? (md <= len ? first + md - 1 : null) : (len + md >= 0 ? first + len + md : null))).filter((d) => d != null);
      if (rule.byday) { const wds = rule.byday.map((b) => b.wd); days = days.filter((d) => wds.indexOf(wdOf(d)) >= 0); }
    } else if (rule.byday) {
      days = bydayIn(first, len, rule.byday);
    } else {
      days = startD <= len ? [first + startD - 1] : [];
    }
    return days;
  }
  function setpos(days, rule) {
    days = Array.from(new Set(days)).sort((a, b) => a - b);
    if (!rule.bysetpos) return days;
    const out = [];
    rule.bysetpos.forEach((p) => { const x = p > 0 ? days[p - 1] : days[days.length + p]; if (x != null) out.push(x); });
    return Array.from(new Set(out)).sort((a, b) => a - b);
  }

  /**
   * Walk the occurrences of `rule` starting at `start` (wall ms; its time of day is kept) in order.
   * fromWall: occurrences before this may be skipped (only used when there is no COUNT);
   * toWall: stop after this; beyond(wall) → true when UNTIL is passed. cb(wall) returns false to stop.
   * DTSTART is always the first occurrence (as in libical).
   */
  function recur(rule, start, toWall, fromWall, cb, beyond) {
    const tod = ((start % DAY) + DAY) % DAY;
    const sDay = Math.floor(start / DAY);
    const s = ymOf(sDay);
    const toDay = Math.floor(toWall / DAY);
    const iv = rule.interval || 1;
    const max = rule.count || Infinity;
    let count = 0;
    const emit = (day) => {
      const wall = day * DAY + tod;
      if (beyond && beyond(wall)) return false;
      if (++count > max || day > toDay) return false;
      return cb(wall) !== false;
    };
    if (!emit(sDay)) return;

    const wkst = rule.wkst == null ? 1 : rule.wkst;
    const week0 = sDay - ((wdOf(sDay) - wkst + 7) % 7);
    const month0 = s.y * 12 + (s.m - 1);
    let k = 0;
    if (!rule.count && fromWall != null) { // jump close to the visible range
      const fromDay = Math.floor(fromWall / DAY) - 1;
      if (fromDay > sDay) {
        const f = ymOf(fromDay);
        const periods = rule.freq === 'DAILY' ? (fromDay - sDay) : rule.freq === 'WEEKLY' ? (fromDay - week0) / 7
          : rule.freq === 'MONTHLY' ? (f.y * 12 + f.m - 1) - month0 : f.y - s.y;
        k = Math.max(0, Math.floor(periods / iv) - 1);
      }
    }
    for (let guard = 0; guard < 200000; guard++, k++) {
      let days;
      if (rule.freq === 'DAILY') {
        const d = sDay + k * iv;
        if (d > toDay) return;
        const ym = ymOf(d);
        let ok = !rule.bymonth || rule.bymonth.indexOf(ym.m) >= 0;
        if (ok && rule.bymonthday) ok = rule.bymonthday.some((md) => (md > 0 ? md === ym.d : dim(ym.y, ym.m) + md + 1 === ym.d));
        if (ok && rule.byday) ok = rule.byday.some((b) => b.wd === wdOf(d));
        days = ok ? [d] : [];
      } else if (rule.freq === 'WEEKLY') {
        const ws = week0 + k * 7 * iv;
        if (ws > toDay) return;
        const wds = rule.byday ? rule.byday.map((b) => b.wd) : [wdOf(sDay)];
        days = wds.map((w) => ws + ((w - wkst + 7) % 7));
        if (rule.bymonth) days = days.filter((d) => rule.bymonth.indexOf(ymOf(d).m) >= 0);
        days = setpos(days, rule);
      } else if (rule.freq === 'MONTHLY') {
        const mi = month0 + k * iv, y = Math.floor(mi / 12), m = (mi % 12) + 1;
        if (dayOf(y, m, 1) > toDay) return;
        days = rule.bymonth && rule.bymonth.indexOf(m) < 0 ? [] : setpos(monthDays(y, m, rule, s.d), rule);
      } else { // YEARLY
        const y = s.y + k * iv;
        if (dayOf(y, 1, 1) > toDay) return;
        if (rule.byday && !rule.bymonth && !rule.bymonthday) {
          days = bydayIn(dayOf(y, 1, 1), dayOf(y + 1, 1, 1) - dayOf(y, 1, 1), rule.byday);
        } else {
          days = [];
          (rule.bymonth || [s.m]).forEach((m) => { days.push.apply(days, monthDays(y, m, rule, s.d)); });
        }
        days = setpos(days, rule);
      }
      for (let i = 0; i < days.length; i++) {
        if (days[i] <= sDay) continue;
        if (!emit(days[i])) return;
      }
    }
  }

  /** UNTIL check for a rule: function(wall) → true when the occurrence is after UNTIL. */
  function untilWall(rule, zoneFn) {
    const u = rule.until;
    if (!u) return null;
    if (u.day != null) return (wall) => Math.floor(wall / DAY) > u.day;
    if (u.utc && zoneFn) return (wall) => zoneFn(wall) > u.wall;
    return (wall) => wall > u.wall;
  }

  /* ---------------- Parse ---------------- */
  /**
   * Parse ICS text → { name, events: [Event], zones, stats: { events, skipped, cancelled, partialRules } }.
   * Event: { uid, title, location, description, allDay, start, tz, dur, rrule, exdates, exdays }
   *  - all-day: start = day number × DAY (wall ms of midnight), dur = number of days
   *  - timed:   start = wall ms in zone tz ('Z' | 'I:…' | 'V:…' | 'L'), dur = milliseconds
   *  - exdates: UTC ms (timed) or day numbers (all-day); exdays: day numbers (date-only EXDATE on timed events)
   * Throws an Error with a readable message if the text is not a calendar at all.
   */
  function parse(text) {
    const lines = unfold(text);
    if (!lines.some((l) => /^BEGIN:VCALENDAR\s*$/i.test(l))) throw new Error('This is not an iCalendar (.ics) file.');
    const out = { name: '', events: [], zones: {}, stats: { events: 0, skipped: 0, cancelled: 0, partialRules: 0 } };
    const raws = [];
    const vtz = {};
    const stack = [];
    let cur = null, tz = null, obs = null;
    for (let li = 0; li < lines.length; li++) {
      const raw = lines[li];
      if (!raw) continue;
      const p = parseLine(raw);
      if (!p) continue;
      if (p.name === 'BEGIN') {
        const v = p.value.trim().toUpperCase();
        stack.push(v);
        if (v === 'VEVENT' && !cur) cur = { props: {}, ex: [] };
        else if (v === 'VTIMEZONE') tz = { id: null, obs: [] };
        else if ((v === 'STANDARD' || v === 'DAYLIGHT') && tz) obs = { type: v, props: {} };
        continue;
      }
      if (p.name === 'END') {
        const v = p.value.trim().toUpperCase();
        const idx = stack.lastIndexOf(v);
        if (idx >= 0) stack.length = idx;
        if (v === 'VEVENT' && cur) { if (raws.length < MAX.events) raws.push(cur); else out.stats.skipped++; cur = null; }
        else if ((v === 'STANDARD' || v === 'DAYLIGHT') && obs && tz) { tz.obs.push(obs); obs = null; }
        else if (v === 'VTIMEZONE' && tz) { if (tz.id) vtz[tz.id] = tz; tz = null; }
        continue;
      }
      const top = stack[stack.length - 1];
      if (top === 'VEVENT' && cur) {
        if (p.name === 'EXDATE') cur.ex.push(p);
        else if (!(p.name in cur.props)) cur.props[p.name] = p;
      } else if (obs && (top === 'STANDARD' || top === 'DAYLIGHT')) {
        if (!(p.name in obs.props)) obs.props[p.name] = p;
      } else if (tz && top === 'VTIMEZONE' && p.name === 'TZID') {
        tz.id = p.value.trim();
      } else if (top === 'VCALENDAR' && p.name === 'X-WR-CALNAME' && !out.name) {
        out.name = unescapeText(p.value, 60);
      }
    }

    // VTIMEZONE observances
    const zones = {};
    Object.keys(vtz).forEach((id) => {
      const list = [];
      vtz[id].obs.forEach((o) => {
        const st = o.props.DTSTART && parseDT(o.props.DTSTART.value, {});
        const to = o.props.TZOFFSETTO && parseOffset(o.props.TZOFFSETTO.value);
        const from = o.props.TZOFFSETFROM ? parseOffset(o.props.TZOFFSETFROM.value) : to;
        if (!st || st.date || to == null) return;
        list.push({ type: o.type, start: st.wall, from: from == null ? to : from, to, rrule: o.props.RRULE ? parseRule(o.props.RRULE.value) : null });
      });
      if (list.length) zones[id] = { obs: list };
    });
    const zoneOf = (tzid) => resolveZone(tzid, zones);

    const masters = {};   // uid → [event] (recurring)
    const overrides = []; // { uid, rid, cancelled, ev }
    raws.forEach((r, index) => {
      const P = r.props;
      const ds = P.DTSTART && parseDT(P.DTSTART.value, P.DTSTART.params);
      if (!ds) { out.stats.skipped++; return; }
      const status = P.STATUS ? P.STATUS.value.trim().toUpperCase() : '';
      const ev = {
        uid: unescapeText(P.UID ? P.UID.value : '', MAX.uid) || 'no-uid-' + index,
        title: unescapeText(P.SUMMARY ? P.SUMMARY.value : '', MAX.title) || '(No title)',
        location: unescapeText(P.LOCATION ? P.LOCATION.value : '', MAX.location),
        description: unescapeText(P.DESCRIPTION ? P.DESCRIPTION.value : '', MAX.description),
        allDay: ds.date,
        start: 0, tz: null, dur: 0, rrule: null, exdates: [], exdays: [],
      };
      let zone = null;
      if (ds.date) {
        ev.start = ds.day * DAY;
        let days = 1;
        const de = P.DTEND && parseDT(P.DTEND.value, P.DTEND.params);
        if (de) days = (de.date ? de.day : Math.ceil(de.wall / DAY)) - ds.day;
        else if (P.DURATION) { const d = parseDuration(P.DURATION.value); if (d != null) days = Math.round(d / DAY); }
        ev.dur = Math.min(366, Math.max(1, days || 1));
      } else {
        zone = ds.utc ? 'Z' : zoneOf(ds.tzid);
        ev.tz = zone;
        ev.start = ds.wall;
        const s0 = toUtc(zone, ds.wall, zones);
        let dur = 0;
        const de = P.DTEND && parseDT(P.DTEND.value, P.DTEND.params);
        if (de && !de.date) dur = toUtc(de.utc ? 'Z' : (de.tzid ? zoneOf(de.tzid) : zone), de.wall, zones) - s0;
        else if (P.DURATION) dur = parseDuration(P.DURATION.value) || 0;
        ev.dur = Math.min(366 * DAY, Math.max(0, dur));
      }
      if (P.RRULE) {
        ev.rrule = parseRule(P.RRULE.value);
        if (ev.rrule && ev.rrule.partial) out.stats.partialRules++;
      }
      r.ex.forEach((p) => {
        String(p.value).split(',').forEach((v) => {
          const x = parseDT(v, p.params);
          if (!x) return;
          if (ev.allDay) ev.exdates.push(x.date ? x.day : Math.floor(x.wall / DAY));
          else if (x.date) ev.exdays.push(x.day);
          else ev.exdates.push(toUtc(x.utc ? 'Z' : (x.tzid ? zoneOf(x.tzid) : zone), x.wall, zones));
        });
      });
      const ridP = P['RECURRENCE-ID'];
      if (ridP) {
        const x = parseDT(ridP.value, ridP.params);
        if (x) {
          overrides.push({ uid: ev.uid, cancelled: status === 'CANCELLED', ev,
            rid: x.date ? { day: x.day } : { utc: toUtc(x.utc ? 'Z' : (x.tzid ? zoneOf(x.tzid) : zone), x.wall, zones) } });
          return;
        }
      }
      if (status === 'CANCELLED') { out.stats.cancelled++; return; }
      if (ev.rrule) (masters[ev.uid] = masters[ev.uid] || []).push(ev);
      out.events.push(ev);
    });
    // A moved or cancelled single occurrence replaces that occurrence of its series.
    overrides.forEach((o) => {
      (masters[o.uid] || []).forEach((m) => {
        if (o.rid.day != null) (m.allDay ? m.exdates : m.exdays).push(o.rid.day);
        else if (m.allDay) m.exdates.push(Math.floor(o.rid.utc / DAY));
        else m.exdates.push(o.rid.utc);
      });
      if (o.cancelled) out.stats.cancelled++;
      else out.events.push(o.ev);
    });
    // Keep only the time zones the events use.
    const used = {};
    out.events.forEach((e) => { if (e.tz && e.tz.indexOf('V:') === 0) used[e.tz.slice(2)] = zones[e.tz.slice(2)]; });
    out.zones = used;
    out.stats.events = out.events.length;
    return out;
  }

  /* ---------------- Expand ---------------- */
  function localMidnight(dateStr) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
    return new Date(+m[1], +m[2] - 1, +m[3]).getTime();
  }

  /**
   * Occurrences of a parsed calendar overlapping the local dates [from, to) ('YYYY-MM-DD', to exclusive).
   * → [{ uid, title, location, description, allDay, start, end, recurring }]
   *   timed:   start/end = UTC milliseconds
   *   all-day: start/end = 'YYYY-MM-DD' (end exclusive)
   */
  function expand(cal, from, to) {
    const out = [];
    if (!cal || !Array.isArray(cal.events)) return out;
    const zones = cal.zones || {};
    const fromMs = localMidnight(from), toMs = localMidnight(to);
    const fromDay = strDay(from), toDay = strDay(to);
    for (let i = 0; i < cal.events.length && out.length < MAX.occurrences; i++) {
      const e = cal.events[i];
      const base = { uid: e.uid, title: e.title, location: e.location, description: e.description, allDay: !!e.allDay, recurring: !!e.rrule };
      if (e.allDay) {
        const dur = Math.max(1, e.dur || 1);
        const add = (wall) => {
          const d = Math.floor(wall / DAY);
          if (d >= toDay) return false;
          if (d + dur <= fromDay || (e.exdates && e.exdates.indexOf(d) >= 0)) return true;
          out.push(Object.assign({ start: dayStr(d), end: dayStr(d + dur) }, base));
          return out.length < MAX.occurrences;
        };
        if (e.rrule) recur(e.rrule, e.start, toDay * DAY, (fromDay - dur) * DAY, add, untilWall(e.rrule, null));
        else add(e.start);
      } else {
        const zone = e.tz || 'L';
        const conv = (w) => toUtc(zone, w, zones);
        const dur = Math.max(0, e.dur || 0);
        const ex = e.exdates && e.exdates.length ? new Set(e.exdates) : null;
        const exd = e.exdays && e.exdays.length ? new Set(e.exdays) : null;
        const add = (wall) => {
          const s = conv(wall);
          if (s >= toMs) return wall < toMs + 2 * DAY; // keep going a little: zone offsets
          const en = s + dur;
          if ((ex && ex.has(s)) || (exd && exd.has(Math.floor(wall / DAY)))) return true;
          if (en > fromMs || (dur === 0 && s >= fromMs)) out.push(Object.assign({ start: s, end: en }, base));
          return out.length < MAX.occurrences;
        };
        if (e.rrule) recur(e.rrule, e.start, toMs + 2 * DAY, fromMs - dur - 2 * DAY, add, untilWall(e.rrule, conv));
        else add(e.start);
      }
    }
    return out;
  }

  /** Drop single (non-recurring) events that ended before sinceMs. Returns the number removed. */
  function prune(cal, sinceMs) {
    if (!cal || !Array.isArray(cal.events)) return 0;
    const sinceDay = Math.floor(sinceMs / DAY) - 1;
    const before = cal.events.length;
    cal.events = cal.events.filter((e) => {
      if (e.rrule) return true;
      if (e.allDay) return Math.floor(e.start / DAY) + (e.dur || 1) >= sinceDay;
      return toUtc(e.tz || 'L', e.start, cal.zones) + (e.dur || 0) >= sinceMs;
    });
    return before - cal.events.length;
  }

  const api = { parse, expand, prune, unfold, parseLine, unescapeText, parseDT, parseDuration, parseRule, resolveZone, toUtc, dayStr, WINDOWS, MAX };
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) { root.T4 = root.T4 || {}; root.T4.ics = api; }
})(typeof window !== 'undefined' ? window : null);
