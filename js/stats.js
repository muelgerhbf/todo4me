/* Todo4Me — Productivity statistics. Completions come from stats.completions
 * (a per-day counter), so history survives deleting completed tasks. */
T4.stats = (function () {
  'use strict';
  const U = T4.util, ui = T4.ui, store = T4.store;
  const { esc, icon } = U;

  const countRange = (map, from, to) => Object.keys(map).reduce((s, d) => s + (d >= from && d <= to ? map[d] : 0), 0);

  function streak(map) {
    let d = U.today(), n = 0;
    if (!map[d]) d = U.addDays(d, -1); // today not done yet doesn't break the streak
    while (map[d]) { n++; d = U.addDays(d, -1); }
    return n;
  }

  /** Single-series bar chart. points: [{ label, value, tip, current }] */
  function barChart(points, title) {
    const max = Math.max(1, ...points.map((p) => p.value));
    const niceMax = max <= 4 ? max : Math.ceil(max / 2) * 2;
    const cols = points.map((p) =>
      '<div class="chart__col' + (p.current ? ' is-current' : '') + '" tabindex="0" data-tip="' + esc(p.tip) + '" aria-label="' + esc(p.tip) + '">' +
        (p.current && p.value ? '<span class="chart__val">' + p.value + '</span>' : '') +
        '<div class="chart__bar" style="height:' + (p.value / niceMax * 100).toFixed(1) + '%"></div></div>').join('');
    const labels = points.map((p) => '<span' + (p.current ? ' class="is-current"' : '') + '>' + esc(p.label) + '</span>').join('');
    const table = '<details class="chart__table"><summary>View as table</summary><table><thead><tr><th scope="col">Period</th><th scope="col">Completed</th></tr></thead><tbody>' +
      points.map((p) => '<tr><td>' + esc(p.tip.split(':')[0]) + '</td><td>' + p.value + '</td></tr>').join('') + '</tbody></table></details>';
    return '<div class="chart" aria-label="' + esc(title) + '">' +
      '<div class="chart__plot">' +
        '<div class="chart__axis" aria-hidden="true"><span>' + niceMax + '</span><span>' + (niceMax / 2 % 1 ? '' : niceMax / 2) + '</span><span>0</span></div>' +
        '<div class="chart__cols">' + cols + '</div>' +
      '</div>' +
      '<div class="chart__labels" aria-hidden="true">' + labels + '</div>' + table + '</div>';
  }

  function tile(label, value, sub, iconName) {
    return '<div class="stat"><span class="stat__icon">' + icon(iconName) + '</span><div>' +
      '<div class="stat__value">' + value + '</div><div class="stat__label">' + esc(label) + '</div>' +
      (sub ? '<div class="stat__hint">' + sub + '</div>' : '') + '</div></div>';
  }

  T4.views.stats = {
    title: 'Statistics',
    render() {
      const map = store.data.stats.completions;
      const today = U.today();
      const ws = store.weekStartOf(today);
      const ms = U.startOfMonth(today);
      const all = store.data.tasks;
      const total = all.length;
      const done = all.filter((t) => t.status === 'done').length;
      const rate = total ? done / total : 0;
      const doneToday = map[today] || 0;
      const doneWeek = countRange(map, ws, U.addDays(ws, 6));
      const lastWeek = countRange(map, U.addDays(ws, -7), U.addDays(ws, -1));
      const doneMonth = countRange(map, ms, today);
      const focusWeek = countRange(store.data.stats.focusSessions, ws, U.addDays(ws, 6));
      const st = streak(map);

      const weekPoints = U.weekDays(ws).map((d) => ({
        label: U.fmt(d, { weekday: 'short' }),
        value: map[d] || 0,
        current: d === today,
        tip: U.fmt(d, { weekday: 'long', month: 'short', day: 'numeric' }) + ': ' + U.plural(map[d] || 0, 'task') + ' completed',
      }));
      const trendPoints = [];
      for (let i = 7; i >= 0; i--) {
        const s = U.addDays(ws, -7 * i);
        const v = countRange(map, s, U.addDays(s, 6));
        trendPoints.push({ label: U.fmt(s, { month: 'short', day: 'numeric' }), value: v, current: i === 0, tip: 'Week of ' + U.fmt(s, { month: 'short', day: 'numeric' }) + ': ' + U.plural(v, 'task') + ' completed' });
      }
      const weekDelta = doneWeek - lastWeek;
      const deltaTxt = lastWeek || doneWeek ? (weekDelta >= 0 ? '+' : '') + weekDelta + ' vs last week' : '';

      // Breakdown: open tasks by priority
      const open = store.planned().filter(store.isOpen).concat(store.inboxTasks());
      const prios = ['critical', 'high', 'medium', 'low'];
      const prioCounts = prios.map((p) => open.filter((t) => t.priority === p).length);
      const prioMax = Math.max(1, ...prioCounts);
      const prioRows = prios.map((p, i) =>
        '<div class="hbar"><span class="hbar__label">' + T4.tasks.priorityBadge(p) + '</span>' +
        '<span class="hbar__track"><span class="hbar__fill hbar__fill--' + p + '" style="width:' + (prioCounts[i] / prioMax * 100).toFixed(1) + '%"></span></span>' +
        '<span class="hbar__val">' + prioCounts[i] + '</span></div>').join('');

      // Completion by category
      const catRows = store.data.categories.map((c) => {
        const ts = all.filter((t) => t.categoryId === c.id);
        if (!ts.length) return '';
        const d = ts.filter((t) => t.status === 'done').length;
        return '<div class="hbar"><span class="hbar__label"><span class="chip chip--cat"><span class="dot" style="background:' + esc(c.color) + '"></span>' + esc(c.name) + '</span></span>' +
          '<span class="hbar__track">' + '<span class="hbar__fill" style="width:' + (d / ts.length * 100).toFixed(1) + '%"></span></span>' +
          '<span class="hbar__val">' + d + '/' + ts.length + '</span></div>';
      }).join('');

      return '<header class="page-head"><div><h1 class="page-title">Statistics</h1><p class="page-sub">A quick look at your momentum.</p></div></header>' +
        '<section class="stats stats--4" aria-label="Key numbers">' +
          tile('Completed today', doneToday, '', 'check') +
          tile('This week', doneWeek, esc(deltaTxt), 'week') +
          tile('This month', doneMonth, esc(U.fmt(today, { month: 'long' })), 'calendar') +
          tile('Completion rate', Math.round(rate * 100) + '%', done + ' of ' + U.plural(total, 'task'), 'chart') +
        '</section>' +
        '<div class="dash-grid">' +
          '<section class="card"><div class="card__head"><h2 class="card__title">' + icon('week') + 'Completed this week</h2></div>' + barChart(weekPoints, 'Tasks completed per day this week') + '</section>' +
          '<section class="card"><div class="card__head"><h2 class="card__title">' + icon('chart') + 'Weekly trend</h2><span class="muted small">Last 8 weeks</span></div>' + barChart(trendPoints, 'Tasks completed per week, last 8 weeks') + '</section>' +
          '<section class="card"><div class="card__head"><h2 class="card__title">' + icon('flag') + 'Open tasks by priority</h2></div>' +
            (open.length ? prioRows : '<p class="muted small">No open tasks.</p>') + '</section>' +
          '<section class="card"><div class="card__head"><h2 class="card__title">' + icon('tag') + 'Progress by category</h2></div>' +
            (catRows || '<p class="muted small">Assign categories to tasks to see progress here.</p>') +
            '<div class="mini-stats"><div><strong>' + st + '</strong><span>day streak</span></div><div><strong>' + focusWeek + '</strong><span>focus sessions this week</span></div>' +
            '<div><strong>' + ui.progressRing(rate, 64, 'Overall completion ' + Math.round(rate * 100) + '%') + '</strong><span>overall</span></div></div>' +
          '</section>' +
        '</div>';
    },
  };

  /* Shared tooltip for [data-tip] elements (charts). */
  const tip = document.createElement('div');
  tip.className = 'tooltip';
  tip.setAttribute('role', 'tooltip');
  tip.hidden = true;
  document.body.appendChild(tip);
  function showTip(el) {
    tip.textContent = el.dataset.tip;
    tip.hidden = false;
    const r = el.getBoundingClientRect();
    const tw = tip.offsetWidth;
    const left = Math.min(window.innerWidth - tw - 8, Math.max(8, r.left + r.width / 2 - tw / 2));
    tip.style.left = left + 'px';
    tip.style.top = (r.top + window.scrollY - tip.offsetHeight - 8) + 'px';
  }
  const hideTip = () => { tip.hidden = true; };
  document.addEventListener('pointerover', (e) => { const el = e.target.closest && e.target.closest('[data-tip]'); if (el) showTip(el); });
  document.addEventListener('pointerout', (e) => { if (e.target.closest && e.target.closest('[data-tip]')) hideTip(); });
  document.addEventListener('focusin', (e) => { if (e.target.matches && e.target.matches('[data-tip]')) showTip(e.target); else hideTip(); });
  window.addEventListener('hashchange', hideTip);

  return { barChart };
})();
