/* Todo4Me editor module "ink" (ui): the floating pen bar, its popovers (tool options, canvas menu, layers, selection, settings,
 * pen profiles) and the editor toolbar button. Built only on the public T4.ink API (docs/INK-CONTRACT.md, sections 4 and 5);
 * the widget CSS lives in css/ed-ink.css. All state (profiles, bar layout, position) is kept here and in edx.db.kv, never in the
 * editor shell (it is rebuilt on language change). Texts: edx.ink.* (js/i18n/ed-ink.js). */
T4.inkui = (function () {
  'use strict';
  const X = T4.edx, API = T4.ink;
  if (!X || !API || typeof API.get !== 'function' || typeof API.on !== 'function') {
    console.warn('[Todo4Me ink ui] T4.ink engine not available: pen bar not registered');
    return null;
  }
  const esc = X.util.esc, icon = X.util.icon;
  const t = (k, fb, p) => X.t('edx.ink.' + k, fb, p);
  const HEX = /^#[0-9a-f]{6}$/i;
  const hex = (c, d) => (typeof c === 'string' && HEX.test(c) ? c.toLowerCase() : d || '#000000');
  const num = (v, a, b, d) => { v = Number(v); return Number.isFinite(v) ? Math.min(b, Math.max(a, v)) : d; };
  const hasDoc = () => { try { return !!X.editor.current(); } catch (e) { return false; } };
  const readonly = () => { try { return X.editor.readonly(); } catch (e) { return false; } };

  /* ====================== Icons ====================== */
  const ICONS = {
    'ink-write': '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/>',
    'ink-pen': '<path d="M17 3l4 4L8 20l-5 1 1-5z"/><path d="M14 6l4 4"/>',
    'ink-hl': '<path d="M9 11l-6 6v3h9l3-3"/><path d="M22 12l-4.6 4.6a2 2 0 01-2.8 0l-5.2-5.2a2 2 0 010-2.8L14 4"/>',
    'ink-lasso': '<path d="M8 18C4 17 2 15 2 12c0-4 4.5-7 10-7s10 3 10 7-4.5 7-10 7c-1 0-2-.1-3-.3"/><circle cx="6.5" cy="19.5" r="2"/>',
    'ink-shape': '<rect x="3" y="12" width="9" height="9" rx="1"/><circle cx="16" cy="8" r="5"/>',
    'ink-pan': '<polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/>',
    'ink-layers': '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
    'ink-canvas': '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 15c2-5 3 2 5-1.5s3-2.5 5-5"/>',
    'ink-sliders': '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
    'ink-grip': '<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>',
    'ink-cut': '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.1" y2="15.9"/><line x1="14.5" y1="14.5" x2="20" y2="20"/><line x1="8.1" y1="8.1" x2="12" y2="12"/>',
    'ink-paste': '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/>',
    'ink-dup': '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M4 16V5a1 1 0 011-1h11"/>',
    'ink-eye': '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>',
    'ink-eyeoff': '<path d="M17.9 17.9A10.9 10.9 0 0112 19C5 19 1 12 1 12a18.5 18.5 0 015.1-5.9"/><path d="M9.9 5.1A10.4 10.4 0 0112 5c7 0 11 7 11 7a18.6 18.6 0 01-2.2 3.2"/><line x1="1" y1="1" x2="23" y2="23"/>',
    'ink-lock': '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/>',
    'ink-unlock': '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 017.5-2"/>',
    'ink-up': '<polyline points="6 15 12 9 18 15"/>',
    'ink-down': '<polyline points="6 9 12 15 18 9"/>',
    'ink-left': '<polyline points="15 6 9 12 15 18"/>',
    'ink-right': '<polyline points="9 6 15 12 9 18"/>',
    'ink-select-off': '<rect x="4" y="4" width="16" height="16" rx="1" stroke-dasharray="3 3"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/>',
    'ink-recolor': '<circle cx="12" cy="12" r="9"/><path d="M12 3v18"/><path d="M12 3a9 9 0 010 18z"/>',
    'ink-zoom-in': '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>',
    'ink-zoom-out': '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/><line x1="8" y1="11" x2="14" y2="11"/>',
  };
  Object.keys(ICONS).forEach((n) => { try { X.icons.add(n, ICONS[n]); } catch (e) { console.warn('[Todo4Me ink ui] icon ' + n, e); } });

  /* ====================== Static tables ====================== */
  const PALETTE = ['#111111', '#6b7280', '#e03131', '#f08c00', '#2f9e44', '#1971c2', '#7048e8', '#d6336c'];
  const HL_PALETTE = ['#fff176', '#a5f3a0', '#8ad8ff', '#ffb3d1', '#ffcc80', '#d1b3ff'];
  const FILL_PALETTE = ['#ffe3e3', '#fff3bf', '#d3f9d8', '#d0ebff', '#e5dbff', '#e9ecef'];
  const SIZES = { pen: [1.5, 3, 5, 9, 16], hl: [10, 16, 24, 36], eraser: [6, 12, 24, 48], shape: [1, 2, 4, 8] };
  const RANGES = { pen: [0.5, 40, 0.5], hl: [4, 60, 1], eraser: [2, 120, 1], shape: [0.5, 30, 0.5] };
  const TOOLS = [
    { id: 'pen', icon: 'ink-pen', fb: 'Pen', kbd: 'P', pop: true },
    { id: 'hl', icon: 'ink-hl', fb: 'Highlighter', kbd: 'H', pop: true },
    { id: 'eraser', icon: 'eraser', fb: 'Eraser', kbd: 'E', pop: true },
    { id: 'lasso', icon: 'ink-lasso', fb: 'Lasso', kbd: 'L', pop: false },
    { id: 'shape', icon: 'ink-shape', fb: 'Shapes', kbd: 'S', pop: true },
    { id: 'pan', icon: 'ink-pan', fb: 'Move canvas', kbd: '', pop: false },
  ];
  const TOOL_IDS = TOOLS.map((x) => x.id);
  const SHAPES = [['line', 'line', 'Line'], ['arrow', 'arrow-shape', 'Arrow'], ['rect', 'rect', 'Rectangle'], ['ellipse', 'circle', 'Ellipse'], ['tri', 'triangle', 'Triangle']];
  const BGS = [['none', 'bgNone', 'None'], ['dots', 'bgDots', 'Dots'], ['lines', 'bgLines', 'Lines'], ['grid', 'bgGrid', 'Grid']];
  const toolLabel = (id) => t('tool.' + id, (TOOLS.find((x) => x.id === id) || {}).fb || id);

  /* ====================== Safe access to T4.ink ====================== */
  const FALLBACK = { mode: false, tool: 'pen', tools: { pen: {}, hl: {}, eraser: {}, shape: {} }, options: {}, active: null, selection: { count: 0 }, canUndo: false, canRedo: false };
  function snap() { try { return Object.assign({}, FALLBACK, API.get() || {}); } catch (e) { return FALLBACK; } }
  function lookup(path) {
    const p = path.split('.'), fn = p.pop();
    let o = API;
    for (const k of p) o = o && o[k];
    return o && typeof o[fn] === 'function' ? [o, fn] : null;
  }
  const has = (path) => !!lookup(path);
  function call(path, ...a) {
    const r = lookup(path);
    if (!r) return undefined;
    try { return r[0][r[1]](...a); } catch (e) { console.error('[Todo4Me ink ui] ' + path + ' failed', e); return undefined; }
  }

  /* ====================== State, persistence ====================== */
  const KV_PROFILES = 'ink.profiles', KV_UI = 'ink.ui';
  const DEF_UI = { tools: TOOL_IDS.slice(), slots: 4, size: 'compact', pos: null };
  const S = { profiles: [], ui: Object.assign({}, DEF_UI, { tools: TOOL_IDS.slice() }), loaded: false, root: null, rows: null, selRow: null, pop: null, popKey: '', popAnchor: '', sig: '', popSig: '', raf: 0, renaming: '', rov: '', kbd: false, drag: null };

  function cleanProfiles(v) {
    if (!Array.isArray(v)) return [];
    const seen = new Set(), out = [];
    v.forEach((p) => {
      if (!p || typeof p !== 'object' || out.length >= 24) return;
      const tool = p.tool === 'hl' ? 'hl' : 'pen';
      let id = typeof p.id === 'string' && /^[\w-]{1,40}$/.test(p.id) ? p.id : X.util.uid();
      if (seen.has(id)) id = X.util.uid();
      seen.add(id);
      out.push({ id, name: String(p.name == null ? '' : p.name).slice(0, 40), tool, c: hex(p.c, tool === 'hl' ? '#fff176' : '#111111'), s: num(p.s, 0.5, 60, 3), o: num(p.o, 0.05, 1, tool === 'hl' ? 0.35 : 1), pr: p.pr ? 1 : 0 });
    });
    return out;
  }
  function cleanUi(v) {
    const u = { tools: TOOL_IDS.slice(), slots: DEF_UI.slots, size: 'compact', pos: null };
    if (!v || typeof v !== 'object') return u;
    if (Array.isArray(v.tools)) { const l = TOOL_IDS.filter((id) => v.tools.includes(id)); if (l.length) u.tools = l; }
    u.slots = Math.round(num(v.slots, 0, 8, DEF_UI.slots));
    u.size = v.size === 'large' ? 'large' : 'compact';
    if (v.pos && Number.isFinite(v.pos.x) && Number.isFinite(v.pos.y)) u.pos = { x: Math.round(v.pos.x), y: Math.round(v.pos.y) };
    return u;
  }
  function defaultProfiles() {
    return cleanProfiles([
      { name: t('defFine', 'Fine pen'), tool: 'pen', c: '#111111', s: 1.5, o: 1, pr: 1 },
      { name: t('defBlue', 'Blue pen'), tool: 'pen', c: '#1971c2', s: 3, o: 1, pr: 1 },
      { name: t('defRed', 'Red marker'), tool: 'pen', c: '#e03131', s: 5, o: 1, pr: 0 },
      { name: t('defHl', 'Yellow highlighter'), tool: 'hl', c: '#fff176', s: 24, o: 0.35 },
    ]);
  }
  const kvSet = (k, v) => { try { return Promise.resolve(X.db.kv.set(k, v)).catch((e) => console.warn('[Todo4Me ink ui] save ' + k, e)); } catch (e) { return Promise.resolve(); } };
  const saveProfiles = () => kvSet(KV_PROFILES, S.profiles);
  const saveUi = () => kvSet(KV_UI, S.ui);
  async function kvGet(k) { try { return await X.db.kv.get(k); } catch (e) { return undefined; } }
  const ready = (async function load() {
    const [p, u] = await Promise.all([kvGet(KV_PROFILES), kvGet(KV_UI)]);
    S.ui = cleanUi(u);
    if (p == null) { S.profiles = defaultProfiles(); saveProfiles(); } else S.profiles = cleanProfiles(p);
    S.loaded = true;
    S.sig = ''; S.popSig = '';
    update();
  })().catch((e) => { console.error('[Todo4Me ink ui] load', e); S.loaded = true; });

  /* ====================== Option access (data-opt paths) ====================== */
  function optGet(path, g) {
    const i = path.indexOf('.'), a = path.slice(0, i), b = path.slice(i + 1);
    g = g || snap();
    if (a === 'opt') return !!(g.options || {})[b];
    if (a === 'cv') return g.active ? g.active[b] : undefined;
    if (a === 'ui') return S.ui[b];
    if (a === 'uit') return S.ui.tools.includes(b);
    if (a === 'sel') return undefined;
    return g.tools && g.tools[a] ? g.tools[a][b] : undefined;
  }
  function optSet(path, v) {
    const i = path.indexOf('.'), a = path.slice(0, i), b = path.slice(i + 1);
    if (a === 'opt') call('setOption', b, !!v);
    else if (a === 'cv') {
      const cur = snap().active;
      if (b === 'bg') call('canvas.setBackground', v);
      else if (b === 'al') call('canvas.setAlign', v);
      else if (b === 'w' || b === 'h') call('canvas.setSize', Object.assign({ w: cur && cur.w, h: cur && cur.h }, { [b]: Math.round(v) }));
    } else if (a === 'sel') call('selection.setStyle', { [b]: v });
    else if (a === 'ui') {
      if (b === 'slots') S.ui.slots = Math.round(num(v, 0, 8, 4)); else if (b === 'size') S.ui.size = v === 'large' ? 'large' : 'compact';
      saveUi(); update();
    } else if (a === 'uit') {
      const on = S.ui.tools.includes(b);
      if (!!v && !on) S.ui.tools = TOOL_IDS.filter((id) => id === b || S.ui.tools.includes(id));
      else if (!v && on && S.ui.tools.length > 1) S.ui.tools = S.ui.tools.filter((id) => id !== b);
      saveUi(); update();
    } else call('setToolOptions', a, { [b]: v });
  }

  /* ====================== Markup helpers ====================== */
  const fmtOut = (v, f) => (v == null || v === '' ? '' : f === 'pct' ? Math.round(v * 100) + '%' : f === 'wpct' ? Math.round(v / 10) + '%' : String(Math.round(v * 10) / 10));
  function btn(o) {
    const a = ['type="button"', 'class="' + (o.cls || 'ink-btn') + (o.on ? ' is-on' : '') + '"'];
    if (o.id) a.push('data-id="' + esc(o.id) + '"');
    if (o.act) a.push('data-act="' + esc(o.act) + '"');
    if (o.arg != null) a.push('data-arg="' + esc(o.arg) + '"');
    if (o.opt) a.push('data-opt="' + esc(o.opt) + '"');
    if (o.val != null) a.push('data-val="' + esc(o.val) + '"');
    if (o.label) a.push('title="' + esc(o.title || o.label) + '"', 'aria-label="' + esc(o.label) + '"');
    if (o.pressed != null) a.push('aria-pressed="' + (o.pressed ? 'true' : 'false') + '"');
    if (o.popup) a.push('aria-haspopup="true"', 'aria-expanded="' + (o.expanded ? 'true' : 'false') + '"');
    if (o.disabled) a.push('disabled');
    if (o.style) a.push('style="' + esc(o.style) + '"');
    return '<button ' + a.join(' ') + '>' + (o.html || '') + '</button>';
  }
  const sec = (label, body, cls) => '<div class="ink-sec' + (cls ? ' ' + cls : '') + '">' + (label ? '<div class="ink-lb">' + esc(label) + '</div>' : '') + body + '</div>';
  function swatches(path, colors, o) {
    o = o || {};
    let h = colors.map((c) => btn({ cls: 'ink-sw', opt: path, val: c, label: c, style: '--c:' + c, pressed: false })).join('');
    if (o.none) h = btn({ cls: 'ink-sw ink-sw--none', opt: path, val: 'none', label: t('fillNone', 'No fill'), pressed: false }) + h;
    h += '<label class="ink-sw ink-sw--custom" title="' + esc(t('custom', 'Custom color')) + '"><input type="color" data-opt="' + esc(path) + '"' + (o.commit ? ' data-commit="change"' : '') + ' aria-label="' + esc(t('custom', 'Custom color')) + '" value="#000000"></label>';
    return '<div class="ink-sws" role="group">' + h + '</div>';
  }
  function range(path, label, min, max, step, fmt, o) {
    o = o || {};
    return '<label class="ink-rg"><span class="ink-rg__l">' + esc(label) + '</span><input type="range" class="ink-range" data-opt="' + esc(path) + '" min="' + min + '" max="' + max + '" step="' + step + '"' +
      (o.commit ? ' data-commit="change"' : '') + (o.value != null ? ' value="' + o.value + '"' : '') + ' aria-label="' + esc(label) + '"><output class="ink-out" data-out="' + esc(path) + '" data-fmt="' + (fmt || 'num') + '"></output></label>';
  }
  function seg(path, items, label) {
    return '<div class="ink-seg" role="group" aria-label="' + esc(label || '') + '">' + items.map((it) => btn({ cls: 'ink-segb', opt: path, val: it.val, label: it.label, pressed: false, html: (it.icon ? icon(it.icon) : '') + (it.text ? '<span>' + esc(it.text) + '</span>' : '') })).join('') + '</div>';
  }
  function toggle(path, label, ic) {
    return '<button type="button" class="ink-switch" role="switch" aria-checked="false" data-opt="' + esc(path) + '" data-bool="1">' + (ic ? icon(ic) : '') + '<span class="ink-switch__t">' + esc(label) + '</span><span class="ink-switch__k" aria-hidden="true"></span></button>';
  }
  function sizes(tool) {
    const L = t('size', 'Size');
    const presets = SIZES[tool].map((v) => btn({ cls: 'ink-size ink-size--' + tool, opt: tool + '.s', val: v, label: L + ' ' + v, pressed: false, style: '--d:' + Math.min(22, Math.max(4, Math.sqrt(v) * 3.4)).toFixed(1) + 'px', html: '<i></i>' })).join('');
    const r = RANGES[tool];
    return sec(L, '<div class="ink-sizes">' + presets + '</div>' + range(tool + '.s', L, r[0], r[1], r[2], 'num'));
  }
  const wide = (o) => btn(Object.assign({ cls: 'ink-wide' + (o.danger ? ' is-danger' : '') }, o, { html: icon(o.icon) + '<span>' + esc(o.text) + '</span>' }));
  const note = (s) => '<p class="ink-note">' + esc(s) + '</p>';

  /* ====================== Popover contents ====================== */
  function profileRow(p, i, n) {
    const L = (k, fb) => t(k, fb);
    return '<div class="ink-prow" data-pid="' + esc(p.id) + '">' +
      '<span class="ink-prof ink-prof--' + p.tool + '" style="--c:' + hex(p.c) + ';--d:' + Math.min(20, Math.max(6, 5 + p.s * 0.7)).toFixed(1) + 'px" aria-hidden="true"><i></i></span>' +
      '<input type="text" class="ink-name" data-ink-in="prof-name" data-arg="' + esc(p.id) + '" maxlength="40" value="' + esc(p.name) + '" placeholder="' + esc(toolLabel(p.tool)) + '" aria-label="' + esc(L('profName', 'Profile name')) + '">' +
      btn({ cls: 'ink-ibtn', act: 'prof-mv', arg: p.id + ':-1', label: L('profMoveLeft', 'Move earlier'), disabled: i === 0, html: icon('ink-up') }) +
      btn({ cls: 'ink-ibtn', act: 'prof-mv', arg: p.id + ':1', label: L('profMoveRight', 'Move later'), disabled: i === n - 1, html: icon('ink-down') }) +
      btn({ cls: 'ink-ibtn is-danger', act: 'prof-del', arg: p.id, label: L('profDelete', 'Delete profile'), html: icon('trash') }) + '</div>';
  }
  const profileList = () => (S.profiles.length ? S.profiles.map((p, i) => profileRow(p, i, S.profiles.length)).join('') : note(t('profEmpty', 'No profiles yet. Choose a pen or highlighter and save it.')));
  const profilesSig = () => JSON.stringify(S.profiles);

  const POPS = {
    pen: () => ({ title: toolLabel('pen'), sig: '', html:
      sec(t('colour', 'Color'), swatches('pen.c', PALETTE)) + sizes('pen') + sec('', range('pen.o', t('opacity', 'Opacity'), 0.05, 1, 0.05, 'pct')) +
      sec('', toggle('pen.pressure', t('pressure', 'Pressure sensitivity'))) + wide({ act: 'prof-add', icon: 'plus', text: t('profAdd', 'Save as profile'), label: t('profAdd', 'Save as profile') }) }),
    hl: () => ({ title: toolLabel('hl'), sig: '', html:
      sec(t('colour', 'Color'), swatches('hl.c', HL_PALETTE)) + sizes('hl') + sec('', range('hl.o', t('opacity', 'Opacity'), 0.05, 1, 0.05, 'pct')) +
      wide({ act: 'prof-add', icon: 'plus', text: t('profAdd', 'Save as profile'), label: t('profAdd', 'Save as profile') }) }),
    eraser: () => ({ title: toolLabel('eraser'), sig: '', html:
      sec(t('eraserMode', 'Mode'), seg('eraser.mode', [{ val: 'stroke', text: t('eraserStroke', 'Whole stroke'), label: t('eraserStroke', 'Whole stroke') }, { val: 'area', text: t('eraserArea', 'Area'), label: t('eraserArea', 'Area') }], t('eraserMode', 'Mode'))) + sizes('eraser') }),
    shape: () => ({ title: toolLabel('shape'), sig: '', html:
      sec(t('shapeKind', 'Shape'), seg('shape.kind', SHAPES.map((s) => ({ val: s[0], icon: s[1], label: t('shape.' + s[0], s[2]) })), t('shapeKind', 'Shape'))) +
      sec(t('strokeColour', 'Line color'), swatches('shape.c', PALETTE)) + sec('', range('shape.s', t('width', 'Line width'), RANGES.shape[0], RANGES.shape[1], RANGES.shape[2], 'num')) +
      sec('', range('shape.o', t('opacity', 'Opacity'), 0.05, 1, 0.05, 'pct')) + sec(t('fill', 'Fill'), swatches('shape.f', FILL_PALETTE, { none: true })) }),
    canvas() {
      const g = snap(), a = g.active, sel = (g.selection && g.selection.count) > 0;
      let h = '<div class="ink-btnrow">' + wide({ act: 'cv-insert', icon: 'plus', text: t('insert', 'Handwriting canvas'), label: t('insert', 'Handwriting canvas'), disabled: !has('canvas.insert') }) +
        wide({ act: 'sel-paste', icon: 'ink-paste', text: t('selPaste', 'Paste'), label: t('selPaste', 'Paste'), disabled: !has('selection.paste') }) + '</div>';
      if (!a) return { title: t('canvasMenu', 'Canvas'), sig: 'n', html: h + note(t('noCanvas', 'No canvas selected. Tap a canvas, or insert one.')) };
      h += sec(t('background', 'Background'), seg('cv.bg', BGS.map((b) => ({ val: b[0], text: t(b[1], b[2]), label: t(b[1], b[2]) })), t('background', 'Background')));
      if (!a.overlay) {
        h += sec('', range('cv.w', t('cvWidth', 'Width'), 200, 1000, 50, 'wpct', { commit: true })) +
          sec('', range('cv.h', t('cvHeight', 'Height'), 60, Math.max(4000, a.h || 0), 20, 'num', { commit: true })) +
          sec(t('align', 'Alignment'), seg('cv.al', [['left', 'align-left', 'alignLeft', 'Left'], ['center', 'align-center', 'alignCenter', 'Center'], ['right', 'align-right', 'alignRight', 'Right']].map((x) => ({ val: x[0], icon: x[1], label: t(x[2], x[3]) })), t('align', 'Alignment'))) +
          sec(t('scale', 'Scale content'), '<div class="ink-btnrow">' + btn({ cls: 'ink-ibtn ink-ibtn--wide', act: 'cv-scale', arg: '0.8', label: t('scaleDown', 'Smaller'), html: icon('minus') + '<span>80%</span>' }) +
            btn({ cls: 'ink-ibtn ink-ibtn--wide', act: 'cv-scale', arg: '1.25', label: t('scaleUp', 'Larger'), html: icon('plus') + '<span>125%</span>' }) + '</div>');
      }
      h += sec(t('zoom', 'Zoom'), '<div class="ink-btnrow">' + btn({ cls: 'ink-ibtn', act: 'cv-zoom', arg: 'out', label: t('zoomOut', 'Zoom out'), html: icon('ink-zoom-out') }) +
        btn({ cls: 'ink-ibtn ink-ibtn--wide', act: 'cv-zoom', arg: 'reset', label: t('zoomReset', 'Reset zoom'), html: '<span data-out="cv.zoom" data-fmt="pct">100%</span>' }) +
        btn({ cls: 'ink-ibtn', act: 'cv-zoom', arg: 'in', label: t('zoomIn', 'Zoom in'), html: icon('ink-zoom-in') }) + '</div>');
      h += sec('', '<div class="ink-btnrow">' + wide({ act: 'cv-export', arg: 'svg', icon: 'download', text: t('exportSvg', 'Export SVG'), label: t('exportSvg', 'Export SVG') }) +
        wide({ act: 'cv-export', arg: 'png', icon: 'download', text: t('exportPng', 'Export PNG'), label: t('exportPng', 'Export PNG') }) + '</div>' +
        (sel ? '<div class="ink-btnrow">' + wide({ act: 'cv-export', arg: 'svg-sel', icon: 'download', text: t('exportSelSvg', 'Selection as SVG'), label: t('exportSelSvg', 'Selection as SVG') }) +
          wide({ act: 'cv-export', arg: 'png-sel', icon: 'download', text: t('exportSelPng', 'Selection as PNG'), label: t('exportSelPng', 'Selection as PNG') }) + '</div>' : '') +
        '<div class="ink-btnrow">' + wide({ act: 'cv-clear', icon: 'eraser', text: t('clear', 'Clear drawing'), label: t('clear', 'Clear drawing'), danger: true }) +
        wide({ act: 'cv-delete', icon: 'trash', text: t('delete', 'Delete drawing'), label: t('delete', 'Delete drawing'), danger: true }) + '</div>');
      return { title: t('canvasMenu', 'Canvas'), sig: 'a' + (a.overlay ? 'o' : '') + (sel ? 's' : '') + (a.h > 4000 ? 'h' : ''), html: h };
    },
    layers() {
      const a = snap().active;
      if (!a) return { title: t('layers', 'Layers'), sig: 'n', html: note(t('noCanvas', 'No canvas selected. Tap a canvas, or insert one.')) };
      const L = a.layers || [];
      let h = wide({ act: 'layer-add', icon: 'plus', text: t('layerAdd', 'Add layer'), label: t('layerAdd', 'Add layer'), disabled: L.length >= 8 || !has('canvas.layers.add') });
      h += '<div class="ink-layers" role="list">';
      for (let i = L.length - 1; i >= 0; i--) {
        const l = L[i], name = l.name || t('layerN', 'Layer {n}', { n: i + 1 }), on = l.id === a.layer;
        h += '<div class="ink-lrow' + (on ? ' is-active' : '') + (l.hidden ? ' is-hidden' : '') + '" role="listitem" data-lid="' + esc(l.id) + '">' +
          (S.renaming === l.id
            ? '<input type="text" class="ink-name" data-ink-in="layer-name" data-arg="' + esc(l.id) + '" maxlength="40" value="' + esc(l.name || '') + '" placeholder="' + esc(name) + '" aria-label="' + esc(t('layerName', 'Layer name')) + '">'
            : btn({ cls: 'ink-lsel', act: 'layer-active', arg: l.id, pressed: on, label: name, title: t('layerActive', 'Active layer') + ': ' + name, html: '<span class="ink-lname">' + esc(name) + '</span><span class="ink-lcount">' + (l.count || 0) + '</span>' })) +
          btn({ cls: 'ink-ibtn', act: 'layer-eye', arg: l.id, pressed: !l.hidden, label: l.hidden ? t('layerShow', 'Show layer') : t('layerHide', 'Hide layer'), html: icon(l.hidden ? 'ink-eyeoff' : 'ink-eye') }) +
          btn({ cls: 'ink-ibtn', act: 'layer-lock', arg: l.id, pressed: !!l.locked, label: l.locked ? t('layerUnlock', 'Unlock layer') : t('layerLock', 'Lock layer'), html: icon(l.locked ? 'ink-lock' : 'ink-unlock') }) +
          btn({ cls: 'ink-ibtn', act: 'layer-mv', arg: l.id + ':1', label: t('layerUp', 'Move layer up'), disabled: i === L.length - 1, html: icon('ink-up') }) +
          btn({ cls: 'ink-ibtn', act: 'layer-mv', arg: l.id + ':-1', label: t('layerDown', 'Move layer down'), disabled: i === 0, html: icon('ink-down') }) +
          btn({ cls: 'ink-ibtn', act: 'layer-ren', arg: l.id, label: t('layerRename', 'Rename layer'), html: icon('edit') }) +
          btn({ cls: 'ink-ibtn is-danger', act: 'layer-del', arg: l.id, label: t('layerDelete', 'Delete layer'), disabled: L.length <= 1, html: icon('trash') }) + '</div>';
      }
      return { title: t('layers', 'Layers'), sig: JSON.stringify([a.id, a.layer, L]) + '|' + S.renaming, html: h + '</div>' };
    },
    settings: () => ({ title: t('settings', 'Pen bar settings'), sig: profilesSig(), html:
      sec(t('options', 'Options'), toggle('opt.recognize', t('recognize', 'Recognize shapes')) + toggle('opt.fingerDraw', t('fingerDraw', 'Draw with finger')) + toggle('opt.autoPen', t('autoPen', 'Pen draws on canvases without pen mode'))) +
      sec(t('showTools', 'Tools in the bar'), '<div class="ink-chks">' + TOOLS.map((x) => '<button type="button" class="ink-chk" role="switch" aria-checked="false" data-opt="uit.' + x.id + '" data-bool="1">' + icon(x.icon) + '<span>' + esc(toolLabel(x.id)) + '</span></button>').join('') + '</div>') +
      sec('', range('ui.slots', t('slots', 'Profile slots'), 0, 8, 1, 'int')) +
      sec(t('btnSize', 'Button size'), seg('ui.size', [{ val: 'compact', text: t('compact', 'Compact'), label: t('compact', 'Compact') }, { val: 'large', text: t('large', 'Large'), label: t('large', 'Large') }], t('btnSize', 'Button size'))) +
      sec(t('profiles', 'Pen profiles'), '<div class="ink-plist">' + profileList() + '</div>') }),
    'sel-colour': () => ({ title: t('selColour', 'Color and style'), sig: '', html:
      sec(t('colour', 'Color'), swatches('sel.c', PALETTE.concat(HL_PALETTE.slice(0, 2)), { commit: true })) +
      sec('', range('sel.o', t('opacity', 'Opacity'), 0.05, 1, 0.05, 'pct', { commit: true, value: 1 })) + sec('', range('sel.s', t('width', 'Line width'), 0.5, 40, 0.5, 'num', { commit: true, value: 3 })) }),
    'sel-layer': () => {
      const a = snap().active, L = (a && a.layers) || [];
      let h = '<div class="ink-layers">';
      for (let i = L.length - 1; i >= 0; i--) h += btn({ cls: 'ink-lsel', act: 'sel-layer', arg: L[i].id, pressed: L[i].id === a.layer, label: L[i].name || t('layerN', 'Layer {n}', { n: i + 1 }), html: '<span class="ink-lname">' + esc(L[i].name || t('layerN', 'Layer {n}', { n: i + 1 })) + '</span>' });
      return { title: t('selLayer', 'Move to layer'), sig: JSON.stringify(L.map((l) => l.id)), html: h + '</div>' };
    },
    prof(id) {
      const i = S.profiles.findIndex((p) => p.id === id);
      return { title: t('profiles', 'Pen profiles'), sig: profilesSig(), html: i < 0 ? note(t('profEmpty', 'No profiles yet.')) : profileRow(S.profiles[i], i, S.profiles.length) };
    },
  };
  function buildPop() {
    const k = S.popKey;
    if (!k) return null;
    return k.indexOf('prof:') === 0 ? POPS.prof(k.slice(5)) : POPS[k] ? POPS[k]() : null;
  }

  /* ====================== Rendering ====================== */
  function ensureRoot() {
    if (S.root && S.root.isConnected) return S.root;
    const r = document.createElement('div');
    r.className = 'ed-ui ink-bar';
    r.hidden = true;
    r.setAttribute('role', 'toolbar');
    r.setAttribute('aria-orientation', 'horizontal');
    r.innerHTML = '<div class="ink-row ink-row--main"></div><div class="ink-row ink-row--sel" hidden></div><div class="ink-pop" role="dialog" hidden></div>';
    document.body.appendChild(r);
    S.root = r; S.rows = r.firstChild; S.selRow = r.children[1]; S.pop = r.children[2];
    bind(r);
    return r;
  }
  const fkey = (el) => (el ? el.dataset.id || (el.dataset.act ? el.dataset.act + ':' + (el.dataset.arg || '') : el.dataset.opt ? el.dataset.opt + ':' + (el.dataset.val || '') : el.dataset.inkIn ? el.dataset.inkIn + ':' + (el.dataset.arg || '') : '') : '');
  function keepFocus(container, fn) {
    const ae = document.activeElement, k = ae && container.contains(ae) ? fkey(ae) : '';
    const sel = k && ae.tagName === 'INPUT' && ae.type === 'text' ? [ae.selectionStart, ae.selectionEnd] : null;
    fn();
    if (!k) return;
    const el = Array.from(container.querySelectorAll('button, input')).find((e) => fkey(e) === k);
    if (el && !el.disabled) { try { el.focus({ preventScroll: true }); if (sel && el.setSelectionRange) el.setSelectionRange(sel[0], sel[1]); } catch (e) { /* ignore */ } }
  }

  function profileOn(p, g) {
    const tl = (g.tools || {})[p.tool] || {};
    return g.tool === p.tool && hex(tl.c, '') === p.c && Math.abs((tl.s || 0) - p.s) < 0.01 && Math.abs((tl.o == null ? p.o : tl.o) - p.o) < 0.01;
  }
  function mainHtml(g) {
    const tl = g.tools || {};
    let h = '<div class="ink-grp ink-grp--grip">' + btn({ cls: 'ink-grip', id: 'grip', label: t('grip', 'Move pen bar'), html: icon('ink-grip') }) + '</div>';
    h += '<div class="ink-grp" role="group" aria-label="' + esc(t('tools', 'Tools')) + '">' + TOOLS.filter((x) => S.ui.tools.includes(x.id)).map((x) => {
      const lab = toolLabel(x.id), c = tl[x.id] && tl[x.id].c;
      return btn({ id: 'tool:' + x.id, act: 'tool', arg: x.id, on: g.tool === x.id, pressed: g.tool === x.id, popup: x.pop, expanded: S.popKey === x.id, label: lab, title: lab + (x.kbd ? ' (' + x.kbd + ')' : ''),
        html: icon(x.icon) + (c && HEX.test(c) && x.id !== 'eraser' ? '<i class="ink-dot" style="--c:' + hex(c) + '"></i>' : '') });
    }).join('') + '</div>';
    const slots = S.profiles.slice(0, S.ui.slots), canAdd = g.tool === 'pen' || g.tool === 'hl';
    if (slots.length || canAdd) {
      h += '<div class="ink-grp" role="group" aria-label="' + esc(t('profiles', 'Pen profiles')) + '">' + slots.map((p) => {
        const on = profileOn(p, g), nm = p.name || toolLabel(p.tool);
        return btn({ cls: 'ink-prof ink-prof--' + p.tool, id: 'prof:' + p.id, act: 'prof', arg: p.id, on, pressed: on, label: nm, popup: on, expanded: S.popKey === 'prof:' + p.id,
          style: '--c:' + hex(p.c) + ';--d:' + Math.min(20, Math.max(6, 5 + p.s * 0.7)).toFixed(1) + 'px', html: '<i></i>' });
      }).join('') + (canAdd ? btn({ cls: 'ink-btn ink-btn--sm', id: 'prof-add', act: 'prof-add', label: t('profAdd', 'Save as profile'), html: icon('plus') }) : '') + '</div>';
    }
    h += '<div class="ink-grp">' + btn({ id: 'undo', act: 'undo', label: t('undo', 'Undo'), disabled: !g.canUndo || !has('undo'), html: icon('undo') }) +
      btn({ id: 'redo', act: 'redo', label: t('redo', 'Redo'), disabled: !g.canRedo || !has('redo'), html: icon('redo') }) + '</div>';
    h += '<div class="ink-grp">' + btn({ id: 'canvas', act: 'pop', arg: 'canvas', on: S.popKey === 'canvas', popup: true, expanded: S.popKey === 'canvas', label: t('canvasMenu', 'Canvas'), html: icon('ink-canvas') }) +
      btn({ id: 'layers', act: 'pop', arg: 'layers', on: S.popKey === 'layers', popup: true, expanded: S.popKey === 'layers', label: t('layers', 'Layers'), disabled: !has('canvas.layers.add'), html: icon('ink-layers') }) +
      btn({ id: 'settings', act: 'pop', arg: 'settings', on: S.popKey === 'settings', popup: true, expanded: S.popKey === 'settings', label: t('settings', 'Pen bar settings'), html: icon('ink-sliders') }) +
      btn({ id: 'done', act: 'done', label: t('done', 'Exit pen mode'), html: icon('check') }) + '</div>';
    return h;
  }
  function selHtml(g) {
    const n = (g.selection && g.selection.count) || 0;
    const b = (id, ic, key, fb, need) => btn({ id, act: id, label: t(key, fb), html: icon(ic), disabled: !has(need) });
    return '<span class="ink-selcount" role="status">' + esc(t('selCount', '{n} selected', { n })) + '</span>' +
      b('sel-copy', 'copy', 'selCopy', 'Copy', 'selection.copy') + b('sel-cut', 'ink-cut', 'selCut', 'Cut', 'selection.cut') +
      b('sel-paste', 'ink-paste', 'selPaste', 'Paste', 'selection.paste') + b('sel-dup', 'ink-dup', 'selDup', 'Duplicate', 'selection.duplicate') +
      btn({ id: 'sel-colour', act: 'pop', arg: 'sel-colour', on: S.popKey === 'sel-colour', popup: true, expanded: S.popKey === 'sel-colour', label: t('selColour', 'Color and style'), html: icon('ink-recolor'), disabled: !has('selection.setStyle') }) +
      b('sel-front', 'bring-front', 'selFront', 'Bring to front', 'selection.toFront') + b('sel-back', 'send-back', 'selBack', 'Send to back', 'selection.toBack') +
      btn({ id: 'sel-layer', act: 'pop', arg: 'sel-layer', on: S.popKey === 'sel-layer', popup: true, expanded: S.popKey === 'sel-layer', label: t('selLayer', 'Move to layer'), html: icon('ink-layers'), disabled: !has('selection.toLayer') }) +
      btn({ id: 'sel-del', act: 'sel-del', cls: 'ink-btn is-danger', label: t('selDelete', 'Delete selection'), html: icon('trash'), disabled: !has('selection.delete') }) +
      btn({ id: 'sel-clear', act: 'sel-clear', label: t('selClear', 'Deselect'), html: icon('ink-select-off'), disabled: !has('selection.clear') });
  }

  function syncPop() {
    if (!S.pop || S.pop.hidden) return;
    const g = snap();
    S.pop.querySelectorAll('[data-opt]').forEach((el) => {
      const path = el.dataset.opt, v = optGet(path, g);
      if (v === undefined) return;
      if (el.tagName === 'INPUT') {
        if (document.activeElement === el) return;
        if (el.type === 'color') el.value = hex(v, '#ffffff'); else if (v !== '' && el.value !== String(v)) el.value = v;
      } else if (el.dataset.bool) {
        el.classList.toggle('is-on', !!v); el.setAttribute('aria-checked', v ? 'true' : 'false');
      } else {
        const cur = el.dataset.val, on = typeof v === 'number' ? Math.abs(v - Number(cur)) < 0.01 : String(v).toLowerCase() === String(cur).toLowerCase();
        el.classList.toggle('is-on', on); el.setAttribute('aria-pressed', on ? 'true' : 'false');
      }
    });
    S.pop.querySelectorAll('[data-out]').forEach((el) => {
      const v = optGet(el.dataset.out, g);
      if (v == null) return;
      el.textContent = el.dataset.fmt === 'int' ? String(Math.round(v)) : fmtOut(v, el.dataset.fmt);
    });
  }
  function textFocused() { const ae = document.activeElement; return !!(ae && S.pop && S.pop.contains(ae) && ae.tagName === 'INPUT' && ae.type === 'text'); }
  function renderPop(force) {
    if (!S.pop) return;
    const def = S.popKey ? buildPop() : null;
    if (!def) { S.pop.hidden = true; S.pop.innerHTML = ''; S.popSig = ''; S.popKey = ''; return; }
    const sig = S.popKey + '|' + def.sig + '|' + T4.i18n.locale();
    if (force || sig !== S.popSig) {
      if (textFocused() && !force) { S.popPending = true; }
      else {
        S.popPending = false; S.popSig = sig;
        keepFocus(S.pop, () => {
          S.pop.innerHTML = '<div class="ink-pop__head"><span class="ink-pop__t">' + esc(def.title) + '</span>' + btn({ cls: 'ink-ibtn', act: 'pop-close', label: t('close', 'Close'), html: icon('x') }) + '</div><div class="ink-pop__body">' + def.html + '</div>';
        });
        S.pop.setAttribute('aria-label', def.title);
      }
    }
    S.pop.hidden = false;
    syncPop();
    placePop();
  }
  function placePop() {
    if (!S.pop || S.pop.hidden || !S.root || S.root.hidden) return;
    const vw = document.documentElement.clientWidth, vh = window.innerHeight;
    const anchor = S.root.querySelector('[data-id="' + CSS.escape(S.popAnchor) + '"]') || S.root.querySelector('.ink-row--main button');
    const br = S.root.getBoundingClientRect(), ar = anchor ? anchor.getBoundingClientRect() : br;
    S.pop.style.maxHeight = '';
    const above = br.top - 12, below = vh - br.bottom - 12, useBelow = below >= Math.min(S.pop.scrollHeight + 8, 360) || below >= above;
    S.pop.style.maxHeight = Math.max(140, Math.min(useBelow ? below : above, vh - 24)) + 'px';
    const pw = S.pop.offsetWidth, ph = S.pop.offsetHeight;
    let left = ar.left + ar.width / 2 - pw / 2;
    left = Math.max(8, Math.min(left, vw - pw - 8));
    let top = useBelow ? br.bottom + 6 : br.top - ph - 6;
    top = Math.max(8, Math.min(top, vh - ph - 8));
    S.pop.style.left = left + 'px'; S.pop.style.top = top + 'px';
  }
  function applyPos() {
    const r = S.root;
    if (!r || r.hidden) return;
    const vw = document.documentElement.clientWidth, vh = window.innerHeight, w = r.offsetWidth, h = r.offsetHeight;
    let x = S.ui.pos ? S.ui.pos.x : (vw - w) / 2, y = S.ui.pos ? S.ui.pos.y : vh - h - 40;
    x = Math.max(8, Math.min(x, vw - w - 8)); y = Math.max(8, Math.min(y, vh - h - 8));
    r.style.left = Math.round(x) + 'px'; r.style.top = Math.round(y) + 'px';
  }
  const wanted = () => { const g = snap(); return !!(g.mode && hasDoc() && !readonly()); };

  function update() {
    S.raf = 0;
    const r = ensureRoot();
    if (!S.loaded) return;
    const on = wanted();
    if (!on) {
      if (!r.hidden) { r.hidden = true; }
      if (S.popKey) { S.popKey = ''; renderPop(); }
      return;
    }
    const g = snap();
    if (S.popKey && TOOL_IDS.includes(S.popKey) && S.popKey !== g.tool) { S.popKey = ''; }
    const n = (g.selection && g.selection.count) || 0;
    const sig = [T4.i18n.locale(), g.tool, g.canUndo, g.canRedo, n, !!g.active, S.popKey, JSON.stringify(g.tools), JSON.stringify(S.ui), JSON.stringify(S.profiles)].join('|');
    r.className = 'ed-ui ink-bar' + (S.ui.size === 'large' ? ' is-large' : '') + (n > 0 ? ' has-sel' : '');
    r.setAttribute('aria-label', t('bar', 'Pen bar'));
    const wasHidden = r.hidden;
    r.hidden = false;
    if (sig !== S.sig || wasHidden) {
      S.sig = sig;
      keepFocus(S.rows, () => { S.rows.innerHTML = mainHtml(g); });
      S.selRow.hidden = n === 0;
      keepFocus(S.selRow, () => { S.selRow.innerHTML = n ? selHtml(g) : ''; });
      applyRov();
    }
    if (S.popKey) renderPop(); else if (!S.pop.hidden) renderPop();
    applyPos();
    placePop();
  }
  function schedule() { if (!S.raf) S.raf = requestAnimationFrame(update); }

  function applyRov() {
    const all = Array.from(S.root.querySelectorAll('.ink-row button')).filter((b) => !b.disabled);
    if (!all.length) return;
    const cur = all.find((b) => fkey(b) === S.rov) || all.find((b) => b.classList.contains('is-on')) || all[0];
    S.root.querySelectorAll('.ink-row button').forEach((b) => { b.tabIndex = b === cur ? 0 : -1; });
  }

  /* ====================== Popover open/close ====================== */
  function openPop(key, anchor, focus) {
    S.popKey = key; S.popAnchor = anchor || ''; S.popSig = '';
    S.sig = '';
    update();
    if (focus) { const f = S.pop.querySelector('input, button:not([disabled])'); if (f) f.focus(); }
  }
  function closePop(refocus) {
    if (!S.popKey) return;
    const a = S.popAnchor;
    S.popKey = ''; S.sig = '';
    update();
    if (refocus && S.root) { const b = S.root.querySelector('[data-id="' + CSS.escape(a) + '"]'); if (b) b.focus(); }
  }
  function togglePop(key, anchor, kbd) { if (S.popKey === key) closePop(kbd); else openPop(key, anchor, kbd); }

  /* ====================== Actions ====================== */
  function applyProfile(p) {
    call('setTool', p.tool);
    call('setToolOptions', p.tool, p.tool === 'pen' ? { c: p.c, s: p.s, o: p.o, pressure: !!p.pr } : { c: p.c, s: p.s, o: p.o });
  }
  function profIndex(id) { return S.profiles.findIndex((p) => p.id === id); }
  const ACT = {
    tool(id, el) {
      const g = snap(), def = TOOLS.find((x) => x.id === id);
      if (g.tool === id && def && def.pop) { togglePop(id, 'tool:' + id, S.kbd); return; }
      S.popKey = ''; S.sig = '';
      call('setTool', id);
      update();
    },
    prof(id, el) {
      const i = profIndex(id);
      if (i < 0) return;
      if (profileOn(S.profiles[i], snap())) { togglePop('prof:' + id, 'prof:' + id, S.kbd); return; }
      S.popKey = ''; S.sig = '';
      applyProfile(S.profiles[i]);
      update();
    },
    'prof-add'() {
      const g = snap(), tool = g.tool === 'hl' ? 'hl' : 'pen', tl = (g.tools || {})[tool] || {};
      if (S.profiles.length >= 24) return;
      const p = cleanProfiles([{ id: X.util.uid(), name: '', tool, c: tl.c, s: tl.s, o: tl.o, pr: tool === 'pen' && tl.pressure ? 1 : 0 }])[0];
      p.name = toolLabel(tool) + ' ' + (S.profiles.filter((q) => q.tool === tool).length + 1);
      S.profiles.push(p);
      if (S.profiles.length > S.ui.slots) S.ui.slots = Math.min(8, S.profiles.length);
      saveProfiles(); saveUi();
      S.popKey = ''; S.sig = '';
      update();
      openPop('prof:' + p.id, S.profiles.indexOf(p) < S.ui.slots ? 'prof:' + p.id : 'settings', false);
      const inp = S.pop.querySelector('.ink-name');
      if (inp) { inp.focus(); inp.select(); }
    },
    'prof-del'(id) { const i = profIndex(id); if (i < 0) return; S.profiles.splice(i, 1); saveProfiles(); if (S.popKey === 'prof:' + id) S.popKey = ''; S.sig = ''; update(); },
    'prof-mv'(arg) {
      const [id, d] = arg.split(':'), i = profIndex(id), j = i + Number(d);
      if (i < 0 || j < 0 || j >= S.profiles.length) return;
      const [p] = S.profiles.splice(i, 1); S.profiles.splice(j, 0, p);
      saveProfiles(); S.sig = ''; update();
    },
    pop(key, el) { togglePop(key, el.dataset.id, S.kbd); },
    'pop-close'() { closePop(true); },
    undo() { call('undo'); update(); }, redo() { call('redo'); update(); },
    done() { S.popKey = ''; call('setMode', false); update(); },
    'cv-insert'() { const a = snap().active; call('canvas.insert', { w: 1000, h: 400, bg: a && a.bg ? a.bg : 'none' }); closePop(); },
    'cv-scale'(f) { call('canvas.scale', Number(f)); },
    'cv-zoom'(k) { if (k === 'reset') call('canvas.resetView'); else call('canvas.zoomBy', k === 'in' ? 1.25 : 0.8); },
    'cv-export'(k) {
      const selectionOnly = /-sel$/.test(k);
      if (/^svg/.test(k)) call('canvas.exportSVG', { selectionOnly }); else call('canvas.exportPNG', { selectionOnly, scale: 2 });
    },
    'cv-clear'() { call('canvas.clear'); },
    'cv-delete'() { call('canvas.remove'); closePop(); },
    'layer-add'() { call('canvas.layers.add', ''); },
    'layer-active'(id) { call('canvas.layers.setActive', id); },
    'layer-eye'(id) { const l = layerOf(id); if (l) call('canvas.layers.setHidden', id, !l.hidden); },
    'layer-lock'(id) { const l = layerOf(id); if (l) call('canvas.layers.setLocked', id, !l.locked); },
    'layer-mv'(arg) { const [id, d] = arg.split(':'); call('canvas.layers.move', id, Number(d)); },
    'layer-ren'(id) { S.renaming = S.renaming === id ? '' : id; S.popSig = ''; renderPop(true); const i = S.pop.querySelector('.ink-name'); if (i) { i.focus(); i.select(); } },
    'layer-del'(id) { call('canvas.layers.remove', id); },
    'sel-copy'() { call('selection.copy'); }, 'sel-cut'() { call('selection.cut'); }, 'sel-paste'() { call('selection.paste'); }, 'sel-dup'() { call('selection.duplicate'); },
    'sel-del'() { call('selection.delete'); }, 'sel-front'() { call('selection.toFront'); }, 'sel-back'() { call('selection.toBack'); }, 'sel-clear'() { call('selection.clear'); },
    'sel-layer'(id) { call('selection.toLayer', id); closePop(); },
  };
  function layerOf(id) { const a = snap().active; return a && (a.layers || []).find((l) => l.id === id); }

  /* ====================== Events ====================== */
  function commitInput(el) {
    const k = el.dataset.inkIn, id = el.dataset.arg;
    if (k === 'prof-name') {
      const i = profIndex(id);
      if (i >= 0 && S.profiles[i].name !== el.value.trim().slice(0, 40)) { S.profiles[i].name = el.value.trim().slice(0, 40); saveProfiles(); S.sig = ''; update(); }
    } else if (k === 'layer-name') {
      if (S.renaming === id) { S.renaming = ''; call('canvas.layers.rename', id, el.value.trim().slice(0, 40)); S.popSig = ''; renderPop(true); }
    }
  }
  function bind(r) {
    // keep the document selection/focus when pressing bar buttons (inputs keep their normal behaviour)
    r.addEventListener('mousedown', (e) => { if (e.target.closest('button') && !e.target.closest('input')) e.preventDefault(); });
    r.addEventListener('pointerdown', (e) => {
      S.kbd = false;
      const g = e.target.closest('.ink-grip');
      if (g && e.button === 0) {
        const b = r.getBoundingClientRect();
        S.drag = { dx: e.clientX - b.left, dy: e.clientY - b.top, id: e.pointerId };
        r.classList.add('is-dragging');
        e.preventDefault();
      }
    });
    r.addEventListener('click', (e) => {
      S.kbd = e.detail === 0;
      const b = e.target.closest('button');
      if (!b || b.disabled || !r.contains(b)) return;
      if (b.dataset.opt) {
        const path = b.dataset.opt;
        if (b.dataset.bool) optSet(path, !optGet(path));
        else { const v = b.dataset.val; optSet(path, /^-?\d+(\.\d+)?$/.test(v) && !/^(cv\.(bg|al)|ui\.size)$/.test(path) ? Number(v) : v); }
        syncPop();
        return;
      }
      const act = b.dataset.act;
      if (act && ACT[act]) ACT[act](b.dataset.arg, b);
      if (act !== 'pop' && act !== 'tool') syncPop();
    });
    r.addEventListener('input', (e) => {
      const el = e.target;
      if (el.dataset && el.dataset.opt && el.tagName === 'INPUT' && el.dataset.commit !== 'change') {
        const v = el.type === 'range' ? Number(el.value) : el.value;
        optSet(el.dataset.opt, v);
        const out = el.parentNode && el.parentNode.querySelector('[data-out]');
        if (out && el.type === 'range') out.textContent = el.dataset.opt === 'ui.slots' ? String(Math.round(v)) : fmtOut(v, out.dataset.fmt);
      } else if (el.dataset && el.dataset.opt && el.type === 'range') {
        const out = el.parentNode.querySelector('[data-out]'); if (out) out.textContent = fmtOut(Number(el.value), out.dataset.fmt);
      }
    });
    r.addEventListener('change', (e) => {
      const el = e.target;
      if (el.dataset && el.dataset.opt && el.tagName === 'INPUT' && el.dataset.commit === 'change') optSet(el.dataset.opt, el.type === 'range' ? Number(el.value) : el.value);
      else if (el.dataset && el.dataset.inkIn) commitInput(el);
    });
    r.addEventListener('focusout', (e) => {
      const el = e.target;
      if (el.dataset && el.dataset.inkIn === 'layer-name') commitInput(el);
      if (S.popPending) setTimeout(() => { if (!textFocused()) { S.popPending = false; renderPop(); } }, 0);
    });
    r.addEventListener('focusin', (e) => { const b = e.target.closest('.ink-row button'); if (b) { S.rov = fkey(b); applyRov(); } });
    r.addEventListener('keydown', onKey);
    r.addEventListener('contextmenu', (e) => {
      const p = e.target.closest('.ink-prof[data-arg]');
      if (p) { e.preventDefault(); openPop('prof:' + p.dataset.arg, 'prof:' + p.dataset.arg, false); }
    });
  }
  function onKey(e) {
    const el = e.target;
    if (el.dataset && el.dataset.inkIn === 'layer-name' && (e.key === 'Enter' || e.key === 'Escape')) {
      e.preventDefault(); e.stopPropagation();
      if (e.key === 'Escape') { S.renaming = ''; S.popSig = ''; renderPop(true); } else commitInput(el);
      return;
    }
    if (el.dataset && el.dataset.inkIn === 'prof-name' && e.key === 'Enter') { e.preventDefault(); commitInput(el); el.blur(); return; }
    if (el.classList && el.classList.contains('ink-grip') && /^Arrow/.test(e.key)) {
      e.preventDefault();
      const b = S.root.getBoundingClientRect(), d = e.shiftKey ? 64 : 16;
      S.ui.pos = { x: b.left + (e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0), y: b.top + (e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0) };
      applyPos(); placePop(); saveUi();
      return;
    }
    if (S.pop && S.pop.contains(el)) return;
    if (el.tagName === 'BUTTON' && el.closest('.ink-row') && /^(ArrowLeft|ArrowRight|Home|End)$/.test(e.key)) {
      const all = Array.from(S.root.querySelectorAll('.ink-row button')).filter((b) => !b.disabled && b.offsetParent !== null);
      const i = all.indexOf(el);
      const j = e.key === 'Home' ? 0 : e.key === 'End' ? all.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + all.length) % all.length;
      e.preventDefault(); all[j].focus();
    }
  }
  // dragging the bar
  window.addEventListener('pointermove', (e) => {
    if (!S.drag || !S.root) return;
    const vw = document.documentElement.clientWidth, vh = window.innerHeight, w = S.root.offsetWidth, h = S.root.offsetHeight;
    S.ui.pos = { x: Math.round(Math.max(8, Math.min(e.clientX - S.drag.dx, vw - w - 8))), y: Math.round(Math.max(8, Math.min(e.clientY - S.drag.dy, vh - h - 8))) };
    applyPos(); placePop();
  });
  const endDrag = () => { if (!S.drag) return; S.drag = null; S.root.classList.remove('is-dragging'); saveUi(); };
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);
  window.addEventListener('resize', () => { applyPos(); placePop(); });
  // outside click and Esc close the popover
  document.addEventListener('pointerdown', (e) => { if (S.popKey && S.root && !S.root.contains(e.target)) closePop(); }, true);
  // window capture runs before any document-level handler (the engine's Esc = leave pen mode): an open popover takes the key first
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && S.popKey && S.root && !S.root.hidden && !e.defaultPrevented && !(e.target.dataset && e.target.dataset.inkIn === 'layer-name')) { e.preventDefault(); e.stopImmediatePropagation(); closePop(true); }
  }, true);

  /* ====================== Wiring: engine events, editor events, toolbar button ====================== */
  API.on((reason) => {
    if (reason === 'mode') syncToolbarButton();
    if (reason === 'view' && S.pop && !S.pop.hidden) { syncPop(); return; }
    schedule();
  });
  ['doc-open', 'doc-close', 'shell-built'].forEach((ev) => X.events.on(ev, () => { schedule(); syncToolbarButton(); }));
  try { T4.i18n.onChange(() => { S.sig = ''; S.popSig = ''; schedule(); }); } catch (e) { /* ignore */ }

  function syncToolbarButton() {
    const b = document.querySelector('#ed-tb-ext [data-cmd="ext:ink.mode"]');
    if (!b) return;
    const on = !!snap().mode;
    b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
  function toggleMode() { if (has('toggleMode')) call('toggleMode'); else call('setMode', !snap().mode); }
  try {
    if (!X.toolbar.has('ink.mode')) {
      X.toolbar.add({ id: 'ink.mode', group: 'ink', icon: 'ink-write', labelKey: 'edx.ink.mode', label: 'Pen mode', order: 1, isActive: () => !!snap().mode, run: toggleMode });
    }
  } catch (e) { console.warn('[Todo4Me ink ui] toolbar button', e); }

  return { ready, state: () => ({ pop: S.popKey, profiles: S.profiles.map((p) => Object.assign({}, p)), ui: JSON.parse(JSON.stringify(S.ui)) }), bar: () => S.root, openPop, closePop, update };
})();
