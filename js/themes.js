/* Todo4Me — theme engine (2.3.0). Registry of designs + apply(settings) which sets the attributes and tokens on <html>.
 * No dependencies: loaded in <head> so the pre-paint script in index.html can call apply() before the first frame.
 *
 * A design is registered with T4.themes.register(def):
 *   { id: 'ocean',                      // [a-z0-9-]{1,32}, unique
 *     name: 'Ocean', tagline: 'Calm and blue',
 *     modes: ['light', 'dark'],         // supported modes; ['dark'] / ['light'] = single-mode design (forces that mode)
 *     accent: '#0e7c86'                 // design accent, or { light: '#…', dark: '#…' }
 *     font: 'system',                   // key of T4.themes.FONTS (default 'inter') or a literal CSS font-family stack
 *     headingFont: 'serif',             // optional, same format; default = body font
 *     radius: 'soft',                   // 'sharp' | 'soft' | 'round' (default 'soft') or { sm, md, lg } in px
 *     preview: { bg, surface, sidebar, text, accent }   // for gallery cards; or { light: {…}, dark: {…} }
 *   }
 * The colors themselves live in css/themes.css: [data-design="ocean"][data-theme="dark"] { --bg: …; … }.
 * The CSS block of a design may set any token listed in the header of css/themes.css. */
window.T4 = window.T4 || {};

T4.themes = (function () {
  'use strict';

  const FONTS = {
    inter: '"Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    system: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    serif: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, "Times New Roman", serif',
    mono: 'ui-monospace, "SF Mono", "Cascadia Code", "Fira Code", Consolas, monospace',
    rounded: 'ui-rounded, "SF Pro Rounded", "Nunito", "Varela Round", "Segoe UI", system-ui, sans-serif',
  };
  const RADII = {
    sharp: { sm: 2, md: 3, lg: 5 },
    soft: { sm: 6, md: 10, lg: 14 },   // = today's look
    round: { sm: 10, md: 16, lg: 22 },
  };
  const DEFAULT_ACCENT = '#5b5bd6';

  const designs = new Map();
  const HEX = /^#[0-9a-f]{6}$/i;
  const ID = /^[a-z0-9-]{1,32}$/;

  function normPreview(p, fallbackAccent) {
    const one = (x) => ({
      bg: (x && x.bg) || '#f6f6f8', surface: (x && x.surface) || '#ffffff', sidebar: (x && x.sidebar) || (x && x.surface) || '#ffffff',
      text: (x && x.text) || '#17171c', accent: (x && x.accent) || fallbackAccent,
    });
    if (p && (p.light || p.dark)) return { light: one(p.light || p.dark), dark: one(p.dark || p.light) };
    const o = one(p);
    return { light: o, dark: o };
  }

  function register(def) {
    if (!def || !ID.test(def.id || '')) throw new Error('themes.register: invalid id');
    const modes = (def.modes || ['light', 'dark']).filter((m) => m === 'light' || m === 'dark');
    if (!modes.length) modes.push('light', 'dark');
    const accentOf = (m) => (def.accent && typeof def.accent === 'object' ? def.accent[m] || def.accent[modes[0]] : def.accent) || DEFAULT_ACCENT;
    const full = {
      id: def.id,
      name: def.name || def.id,
      tagline: def.tagline || '',
      modes,
      accent: def.accent || DEFAULT_ACCENT,
      font: def.font || 'inter',
      headingFont: def.headingFont || null,
      radius: def.radius || 'soft',
      previews: normPreview(def.preview, accentOf(modes[0])),
    };
    full.accentFor = accentOf;
    designs.set(full.id, full);
    return full;
  }

  function fontStack(v) { return v ? (FONTS[v] || String(v)) : null; }
  function radiusSet(v) {
    if (v && typeof v === 'object') return { sm: +v.sm || 6, md: +v.md || 10, lg: +v.lg || 14 };
    return RADII[v] || RADII.soft;
  }

  function get(id) { return designs.get(id) || designs.get('classic'); }
  function list() {
    return Array.from(designs.values()).map((d) => ({
      id: d.id, name: d.name, tagline: d.tagline, modes: d.modes.slice(), accent: d.accentFor(d.modes[0]),
      font: d.font, radius: d.radius, preview: d.previews[d.modes[0]],
    }));
  }

  const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  /* Resolved mode ('light' | 'dark') for settings; a single-mode design forces its mode. */
  function resolveMode(s) {
    s = s || {};
    const d = get(s.design);
    let m = s.theme === 'dark' || s.theme === 'light' ? s.theme : (mq && mq.matches ? 'dark' : 'light');
    if (d.modes.indexOf(m) < 0) m = d.modes[0];
    return m;
  }
  /* The accent actually used. */
  function resolveAccent(s) {
    s = s || {};
    const d = get(s.design);
    if (s.accentSource === 'design') return d.accentFor(resolveMode(s));
    return HEX.test(s.accent || '') ? s.accent : DEFAULT_ACCENT;
  }
  /* Computed token values for settings (without touching the DOM) — used by apply() and tests. */
  function tokens(s) {
    s = s || {};
    const d = get(s.design);
    const bodyFont = s.font && s.font !== 'design' ? s.font : d.font;
    const headFont = s.font && s.font !== 'design' ? null : d.headingFont;
    const r = radiusSet(s.radius && s.radius !== 'design' ? s.radius : d.radius);
    const scale = Math.min(125, Math.max(85, Math.round(+s.fontScale) || 100));
    return {
      '--accent': resolveAccent(s),
      '--font': fontStack(bodyFont),
      '--heading-font': fontStack(headFont),
      '--radius-sm': r.sm + 'px', '--radius': r.md + 'px', '--radius-lg': r.lg + 'px',
      '--font-scale': String(scale / 100),
    };
  }

  function apply(s) {
    s = s || (T4.store && T4.store.settings) || {};
    const root = document.documentElement;
    const d = get(s.design);
    root.setAttribute('data-design', d.id);
    root.setAttribute('data-theme', resolveMode(s));
    root.setAttribute('data-density', s.density === 'compact' ? 'compact' : 'comfortable');
    const t = tokens(s);
    Object.keys(t).forEach((k) => { if (t[k] == null) root.style.removeProperty(k); else root.style.setProperty(k, t[k]); });
  }

  register({
    id: 'classic', name: 'Classic', tagline: 'The original Todo4Me look.', modes: ['light', 'dark'], accent: DEFAULT_ACCENT,
    font: 'inter', radius: 'soft',
    preview: { light: { bg: '#f6f6f8', surface: '#ffffff', sidebar: '#ffffff', text: '#17171c', accent: DEFAULT_ACCENT }, dark: { bg: '#0e0f12', surface: '#16171b', sidebar: '#16171b', text: '#ececf0', accent: DEFAULT_ACCENT } },
  });

  /* The designs. Palettes live in css/themes.css. */
  register({
    id: 'tokio', name: 'Tokio', tagline: 'Neon night city: deep indigo, hot magenta and glowing cyan.', modes: ['dark'], accent: '#ff4fc3',
    font: 'system', headingFont: 'rounded', radius: 'soft',
    preview: { bg: '#0a0920', surface: '#131135', sidebar: '#070618', text: '#eeecff', accent: '#ff4fc3' },
  });
  register({
    id: 'development', name: 'Development', tagline: 'A code editor for your tasks: graphite, syntax colors and monospace headings.', modes: ['dark', 'light'],
    accent: { dark: '#61afef', light: '#1f6fd0' }, font: 'system', headingFont: 'mono', radius: 'sharp',
    preview: { dark: { bg: '#16181c', surface: '#1d2025', sidebar: '#111317', text: '#d7dce4', accent: '#61afef' }, light: { bg: '#f3f4f6', surface: '#ffffff', sidebar: '#eceef2', text: '#1f2430', accent: '#1f6fd0' } },
  });
  register({
    id: 'office', name: 'Office', tagline: 'Crisp and businesslike: white, cool gray and a clear blue.', modes: ['light', 'dark'],
    accent: { light: '#0b63ce', dark: '#4c9aff' }, font: 'system', radius: { sm: 3, md: 5, lg: 8 },
    preview: { light: { bg: '#eef1f5', surface: '#ffffff', sidebar: '#ffffff', text: '#0f1724', accent: '#0b63ce' }, dark: { bg: '#0f141b', surface: '#171e28', sidebar: '#0b1017', text: '#f0f4f9', accent: '#4c9aff' } },
  });
  register({
    id: 'aubergine', name: 'Aubergine', tagline: 'Workspace feel: a deep aubergine sidebar next to a warm, bright work area.', modes: ['light'], accent: '#c2410c',
    font: 'system', radius: { sm: 5, md: 8, lg: 12 },
    preview: { bg: '#faf6f0', surface: '#fffdf9', sidebar: '#3f0e40', text: '#2a1a2e', accent: '#c2410c' },
  });
  register({
    id: 'fjord', name: 'Fjord', tagline: 'Nordic calm in ice blue, gray-blue and frost.', modes: ['light', 'dark'],
    accent: { light: '#2f7aa6', dark: '#88c0d0' }, font: 'system', radius: 'round',
    preview: { light: { bg: '#eaf1f6', surface: '#f9fcfd', sidebar: '#dfeaf2', text: '#1d2c3a', accent: '#2f7aa6' }, dark: { bg: '#19222d', surface: '#212c39', sidebar: '#151d27', text: '#e6eef5', accent: '#88c0d0' } },
  });
  register({
    id: 'paper', name: 'Paper', tagline: 'Warm sepia paper and a serif voice, with a night-reading variant.', modes: ['light', 'dark'],
    accent: { light: '#8f4a1f', dark: '#d9a05b' }, font: 'serif', radius: { sm: 2, md: 4, lg: 6 },
    preview: { light: { bg: '#efe5d0', surface: '#f9f3e5', sidebar: '#e9dec6', text: '#33291d', accent: '#8f4a1f' }, dark: { bg: '#1b1610', surface: '#241e15', sidebar: '#15110c', text: '#e8dcc2', accent: '#d9a05b' } },
  });

  return { FONTS, RADII, register, get, list, apply, resolveMode, resolveAccent, tokens };
})();
