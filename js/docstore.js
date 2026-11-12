/* Todo4Me — document storage for the editor (IndexedDB).
 *
 * Kept completely separate from the existing LocalStorage data (todo4me.data.v1):
 * documents and images can be large, and LocalStorage is limited to a few MB that
 * tasks and notes must keep for themselves.
 *
 * Database "todo4me-docs" (version 2):
 *   docs     { id, title, text, words, page, pinned, createdAt, updatedAt, openedAt, deletedAt, …registered meta fields }
 *   bodies   { id, html }                       — the document content (sanitized HTML)
 *   assets   { id, blob, type, size, createdAt } — images, referenced as data-p {"a": id}
 *   versions { id, docId, createdAt, title, words, html, reason }  (v2) — version history; indexes docId, createdAt;
 *            NOT part of the export bundle; deleted together with their document; their html keeps assets alive
 *   kv       { k, v, updatedAt }                (v2) — small module state (edx.db.kv)
 * Schema changes are versioned migrations (MIGRATIONS below): never edit an old step, append a new one.
 *
 * If IndexedDB is unavailable (e.g. some private browsing modes) everything works
 * in memory and the editor warns that documents won't be kept. */
T4.docstore = (function () {
  'use strict';
  const U = T4.util;

  const DB_NAME = 'todo4me-docs';
  const DB_VERSION = 2;
  const FORMAT = 1;
  const TRASH_DAYS = 30;
  // Page model. `header` is the centre header slot and `footer` the left footer slot (the original two fields); headerL/headerR/footerC/footerR
  // are the other four margin boxes. Sizes in mm; 'Custom' uses customW/customH, margins 'custom' uses marginsMm. bg: light page colour or ''.
  const PAGE_SIZES = { A4: [210, 297], A3: [297, 420], A5: [148, 210], Letter: [215.9, 279.4], Legal: [215.9, 355.6] };
  const PAGE_MARGINS = { normal: [25.4, 25.4, 25.4, 25.4], narrow: [12.7, 12.7, 12.7, 12.7], moderate: [25.4, 19.05, 25.4, 19.05], wide: [25.4, 50.8, 25.4, 50.8] };
  const PAGE_DEFAULTS = {
    size: 'A4', orientation: 'portrait', margins: 'normal', header: '', footer: '', pageNumbers: 'bottom-center', numberFormat: 'page-of', firstPageHeader: true,
    customW: 210, customH: 297, marginsMm: { t: 25.4, r: 25.4, b: 25.4, l: 25.4 }, headerL: '', headerR: '', footerC: '', footerR: '', bg: '',
  };

  let db = null;
  let mode = 'none'; // 'idb' | 'memory'
  let opening = null;
  const mem = { docs: new Map(), bodies: new Map(), assets: new Map(), versions: new Map(), kv: new Map() };
  const keyOf = (store, v) => (store === 'kv' ? v.k : v.id);
  const listeners = new Set();
  const urlCache = new Map(); // asset id → object URL

  function emit(info) { listeners.forEach((fn) => { try { fn(info || {}); } catch (e) { console.error(e); } }); }
  function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

  /* ---------- Schema migrations: MIGRATIONS[n - 1] upgrades a database from version n - 1 to n (existing data stays) ---------- */
  const MIGRATIONS = [
    function v1(d) {
      if (!d.objectStoreNames.contains('docs')) d.createObjectStore('docs', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('bodies')) d.createObjectStore('bodies', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('assets')) d.createObjectStore('assets', { keyPath: 'id' });
    },
    function v2(d, t) {
      const vs = d.objectStoreNames.contains('versions') ? t.objectStore('versions') : d.createObjectStore('versions', { keyPath: 'id' });
      if (!vs.indexNames.contains('docId')) vs.createIndex('docId', 'docId');
      if (!vs.indexNames.contains('createdAt')) vs.createIndex('createdAt', 'createdAt');
      if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv', { keyPath: 'k' });
    },
  ];

  /* ---------- Opening ---------- */
  function open() {
    if (opening) return opening;
    opening = new Promise((resolve) => {
      if (!window.indexedDB) { mode = 'memory'; resolve({ ok: false, mode }); return; }
      let req;
      try { req = indexedDB.open(DB_NAME, DB_VERSION); } catch (e) { mode = 'memory'; resolve({ ok: false, mode, error: e.message }); return; }
      req.onupgradeneeded = (ev) => {
        const d = req.result;
        for (let v = ev.oldVersion + 1; v <= DB_VERSION; v++) MIGRATIONS[v - 1](d, req.transaction);
      };
      req.onsuccess = () => {
        db = req.result;
        mode = 'idb';
        // Another tab upgraded the schema: close so it can proceed; we reopen lazily.
        db.onversionchange = () => { db.close(); db = null; opening = null; };
        resolve({ ok: true, mode });
      };
      req.onerror = () => { mode = 'memory'; resolve({ ok: false, mode, error: req.error && req.error.message }); };
      req.onblocked = () => { /* another tab holds an old version open; onsuccess follows once it closes */ };
    });
    return opening;
  }

  /* ---------- Tiny IndexedDB helpers ---------- */
  function tx(stores, rw) {
    return db.transaction(stores, rw ? 'readwrite' : 'readonly', rw ? { durability: 'strict' } : undefined);
  }
  const reqP = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const doneP = (t) => new Promise((res, rej) => { t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('Transaction aborted')); });

  async function getAll(store) {
    await open();
    if (mode !== 'idb') return Array.from(mem[store].values()).map(clone);
    return reqP(tx([store]).objectStore(store).getAll());
  }
  async function getOne(store, id) {
    await open();
    if (mode !== 'idb') return mem[store].has(id) ? clone(mem[store].get(id)) : null;
    return (await reqP(tx([store]).objectStore(store).get(id))) || null;
  }
  /** Write several records atomically: puts = [[store, value]], dels = [[store, id]] */
  async function write(puts, dels) {
    await open();
    dels = dels || [];
    if (mode !== 'idb') {
      puts.forEach(([s, v]) => mem[s].set(keyOf(s, v), clone(v)));
      dels.forEach(([s, id]) => mem[s].delete(id));
      return;
    }
    const stores = Array.from(new Set(puts.map((p) => p[0]).concat(dels.map((d) => d[0]))));
    const t = tx(stores, true);
    puts.forEach(([s, v]) => t.objectStore(s).put(v));
    dels.forEach(([s, id]) => t.objectStore(s).delete(id));
    await doneP(t);
  }
  /** Read-modify-write operations on one document must not interleave (a save and a metadata update would overwrite each other). */
  let lockChain = Promise.resolve();
  function locked(fn) {
    const run = lockChain.then(fn, fn);
    lockChain = run.catch(() => {});
    return run;
  }
  /** Visit every record of a store without holding them all in memory (cursor); falls back to getAll in memory mode. */
  async function scan(store, fn) {
    await open();
    if (mode !== 'idb') { mem[store].forEach((v) => fn(v)); return; }
    await new Promise((res, rej) => {
      const r = tx([store]).objectStore(store).openCursor();
      r.onsuccess = () => { const c = r.result; if (!c) { res(); return; } fn(c.value); c.continue(); };
      r.onerror = () => rej(r.error);
    });
  }
  function clone(v) {
    if (v && v.blob instanceof Blob) return Object.assign({}, v);
    return v == null ? v : JSON.parse(JSON.stringify(v));
  }

  /* ---------- Validation ---------- */
  const iso = (v, d) => (typeof v === 'string' && !isNaN(Date.parse(v)) ? v : d);
  const mm = (v, min, max, d) => { const n = Number(v); return v !== '' && v != null && Number.isFinite(n) ? Math.round(Math.min(max, Math.max(min, n)) * 10) / 10 : d; };
  /** Light page colours only (the text stays readable and the PDF stays printable): '#rrggbb' with a luminance of at least 190, else ''. */
  function lightColor(v) {
    const m = typeof v === 'string' && v.match(/^#([0-9a-f]{6})$/i);
    if (!m) return '';
    const n = parseInt(m[1], 16);
    return 0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255) >= 190 ? '#' + m[1].toLowerCase() : '';
  }
  function cleanPage(p) {
    p = p && typeof p === 'object' ? p : {};
    const one = (v, list, d) => (list.includes(v) ? v : d);
    const mg = p.marginsMm && typeof p.marginsMm === 'object' ? p.marginsMm : {};
    const dm = PAGE_DEFAULTS.marginsMm;
    return {
      size: one(p.size, ['A4', 'A3', 'A5', 'Letter', 'Legal', 'Custom'], PAGE_DEFAULTS.size),
      orientation: one(p.orientation, ['portrait', 'landscape'], PAGE_DEFAULTS.orientation),
      margins: one(p.margins, ['normal', 'narrow', 'moderate', 'wide', 'custom'], PAGE_DEFAULTS.margins),
      customW: mm(p.customW, 50, 1000, PAGE_DEFAULTS.customW),
      customH: mm(p.customH, 50, 1000, PAGE_DEFAULTS.customH),
      marginsMm: { t: mm(mg.t, 0, 100, dm.t), r: mm(mg.r, 0, 100, dm.r), b: mm(mg.b, 0, 100, dm.b), l: mm(mg.l, 0, 100, dm.l) },
      headerL: String(p.headerL || '').slice(0, 200),
      headerR: String(p.headerR || '').slice(0, 200),
      footerC: String(p.footerC || '').slice(0, 200),
      footerR: String(p.footerR || '').slice(0, 200),
      bg: lightColor(p.bg),
      header: String(p.header || '').slice(0, 200),
      footer: String(p.footer || '').slice(0, 200),
      pageNumbers: one(p.pageNumbers, ['none', 'bottom-center', 'bottom-right', 'top-right'], PAGE_DEFAULTS.pageNumbers),
      numberFormat: one(p.numberFormat, ['page-of', 'plain', 'slash'], PAGE_DEFAULTS.numberFormat),
      firstPageHeader: p.firstPageHeader !== false,
    };
  }
  /** Paper geometry in mm with the orientation applied: { widthMm, heightMm, margins: { t, r, b, l } } (margins never leave less than 20 mm of text area). */
  function pageGeometry(page) {
    const p = cleanPage(page);
    let [w, h] = p.size === 'Custom' ? [p.customW, p.customH] : PAGE_SIZES[p.size];
    if (p.orientation === 'landscape') [w, h] = [h, w];
    const m = p.margins === 'custom' ? p.marginsMm : (([t, r, b, l]) => ({ t, r, b, l }))(PAGE_MARGINS[p.margins]);
    const fit = (a, b, total) => (a + b > total - 20 ? [Math.max(0, (total - 20) * a / (a + b)), Math.max(0, (total - 20) * b / (a + b))].map((x) => Math.round(x * 10) / 10) : [a, b]);
    const [t, b] = fit(m.t, m.b, h), [l, r] = fit(m.l, m.r, w);
    return { widthMm: w, heightMm: h, margins: { t, r, b, l } };
  }
  function cleanMeta(m) {
    const now = new Date().toISOString();
    const out = {
      id: typeof m.id === 'string' && /^[\w-]{1,80}$/.test(m.id) ? m.id : U.uid('doc'),
      format: FORMAT,
      title: String(m.title == null ? '' : m.title).slice(0, 200),
      text: String(m.text || '').slice(0, 200000),
      words: Math.max(0, Math.min(1e7, Number(m.words) || 0)),
      page: cleanPage(m.page),
      pinned: !!m.pinned,
      createdAt: iso(m.createdAt, now),
      updatedAt: iso(m.updatedAt, now),
      openedAt: iso(m.openedAt, null),
      deletedAt: iso(m.deletedAt, null),
    };
    T4.edx.meta.applyTo(m, out); // fields registered by feature modules (edx.meta.extend)
    return out;
  }
  const displayTitle = (m) => (m && m.title && m.title.trim()) || 'Untitled document';

  /* ---------- Documents ---------- */
  async function list() {
    const all = await getAll('docs');
    return all.map(cleanMeta);
  }
  async function get(id) {
    const meta = await getOne('docs', id);
    if (!meta) return null;
    const body = await getOne('bodies', id);
    return { meta: cleanMeta(meta), html: body ? String(body.html || '') : '' };
  }
  async function create(fields) {
    fields = fields || {};
    const now = new Date().toISOString();
    const meta = cleanMeta(Object.assign({ createdAt: now, updatedAt: now, openedAt: now }, fields, { id: U.uid('doc') }));
    await write([['docs', meta], ['bodies', { id: meta.id, html: String(fields.html || '<p><br></p>') }]]);
    emit({ type: 'created', id: meta.id });
    return meta;
  }
  /** Save content (+ derived text/words) and optional metadata changes. */
  function save(id, content, patch) {
    return locked(async () => {
      const cur = await getOne('docs', id);
      if (!cur) throw new Error('Document not found');
      const meta = cleanMeta(Object.assign({}, cur, patch || {}, content ? { text: content.text, words: content.words } : {}, { id, updatedAt: new Date().toISOString() }));
      const puts = [['docs', meta]];
      if (content) puts.push(['bodies', { id, html: String(content.html) }]);
      await write(puts);
      emit({ type: 'saved', id, silent: true });
      return meta;
    });
  }
  /** Metadata-only update that doesn't count as an edit (e.g. pinning, opening). */
  function touch(id, patch) {
    return locked(async () => {
      const cur = await getOne('docs', id);
      if (!cur) return null;
      const meta = cleanMeta(Object.assign({}, cur, patch, { id }));
      await write([['docs', meta]]);
      emit({ type: 'meta', id });
      return meta;
    });
  }
  async function duplicate(id) {
    const d = await get(id);
    if (!d) return null;
    const now = new Date().toISOString();
    const reset = {};
    T4.edx.meta.resetOnDuplicate(reset);
    const meta = cleanMeta(Object.assign({}, d.meta, reset, { id: U.uid('doc'), title: displayTitle(d.meta) + ' (copy)', pinned: false, createdAt: now, updatedAt: now, openedAt: now, deletedAt: null }));
    await write([['docs', meta], ['bodies', { id: meta.id, html: d.html }]]);
    emit({ type: 'created', id: meta.id });
    return meta;
  }
  const trash = (id) => touch(id, { deletedAt: new Date().toISOString(), pinned: false }).then((m) => { emit({ type: 'trashed', id }); return m; });
  const restore = (id) => touch(id, { deletedAt: null }).then((m) => { emit({ type: 'restored', id }); return m; });
  async function destroy(id) {
    await write([], [['docs', id], ['bodies', id]].concat((await versionIds(id)).map((v) => ['versions', v])));
    emit({ type: 'deleted', id });
  }
  async function purgeTrash(all) {
    const limit = Date.now() - TRASH_DAYS * 86400000;
    const old = (await list()).filter((m) => m.deletedAt && (all || Date.parse(m.deletedAt) < limit));
    if (!old.length) return 0;
    const dels = old.flatMap((m) => [['docs', m.id], ['bodies', m.id]]);
    for (const m of old) (await versionIds(m.id)).forEach((v) => dels.push(['versions', v]));
    await write([], dels);
    emit({ type: 'deleted' });
    return old.length;
  }

  /* ---------- Assets (images) ---------- */
  async function putAsset(blob) {
    const a = { id: U.uid('img'), blob, type: blob.type || 'image/png', size: blob.size, createdAt: new Date().toISOString() };
    await write([['assets', a]]);
    urlCache.set(a.id, URL.createObjectURL(blob));
    return a.id;
  }
  /** Object URL for an asset (cached for the session), or null if missing. */
  async function assetURL(id) {
    if (urlCache.has(id)) return urlCache.get(id);
    const a = await getOne('assets', id);
    if (!a || !(a.blob instanceof Blob)) return null;
    const url = URL.createObjectURL(a.blob);
    urlCache.set(id, url);
    return url;
  }
  const cachedAssetURL = (id) => urlCache.get(id) || null;
  async function assetDataURL(id) {
    const a = await getOne('assets', id);
    if (!a || !(a.blob instanceof Blob)) return null;
    return blobToDataURL(a.blob);
  }
  function blobToDataURL(blob) {
    return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
  }
  async function dataURLToBlob(url) {
    const m = /^data:([\w/+.-]+);base64,(.*)$/.exec(url);
    if (!m) throw new Error('bad data URL');
    const bin = atob(m[2]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: m[1] });
  }
  const assetRefs = (html) => Array.from(String(html).matchAll(/&quot;a&quot;:&quot;(img_[\w]+)&quot;|"a":"(img_[\w]+)"/g)).map((m) => m[1] || m[2]);

  /** Remove images that no document (including trashed ones) or saved version references anymore. Keeps today's uploads for undo. */
  async function collectGarbage() {
    const used = new Set();
    const collect = (r) => assetRefs(r.html).forEach((a) => used.add(a));
    await scan('bodies', collect);
    await scan('versions', collect); // images that only an old version uses must survive until that version is pruned
    const assets = await getAll('assets');
    const limit = Date.now() - 86400000;
    const dead = assets.filter((a) => !used.has(a.id) && Date.parse(a.createdAt) < limit);
    if (dead.length) await write([], dead.map((a) => ['assets', a.id]));
    return dead.length;
  }

  /* ---------- Export / import (full fidelity, images inlined) ---------- */
  async function exportBundle(ids) {
    const metas = (await list()).filter((m) => (ids ? ids.includes(m.id) : !m.deletedAt));
    const docs = [];
    const assets = {};
    for (const m of metas) {
      const d = await get(m.id);
      docs.push(Object.assign({}, m, { html: d.html }));
      for (const a of assetRefs(d.html)) if (!assets[a]) { const url = await assetDataURL(a); if (url) assets[a] = url; }
    }
    return { app: 'todo4me', kind: 'documents', format: FORMAT, exportedAt: new Date().toISOString(), documents: docs, assets };
  }
  function parseBundle(text) {
    let j;
    try { j = typeof text === 'string' ? JSON.parse(text) : text; } catch (e) { throw new Error(T4.i18n.t('sto.badJson')); }
    if (!j || j.kind !== 'documents' || !Array.isArray(j.documents)) throw new Error(T4.i18n.t('sto.notDocs'));
    return j;
  }
  /** Import documents. Existing documents are never overwritten: id clashes get a new id. */
  async function importBundle(bundle) {
    const existing = new Set((await list()).map((m) => m.id));
    const idMap = {};
    for (const [id, url] of Object.entries(bundle.assets || {})) {
      if (typeof url !== 'string' || !/^img_\w+$/.test(id)) continue;
      try { idMap[id] = await putAsset(await dataURLToBlob(url)); } catch (e) { /* skip broken image */ }
    }
    let count = 0;
    for (const d of bundle.documents) {
      if (!d || typeof d !== 'object') continue;
      let html = String(d.html || '');
      html = html.replace(/(&quot;a&quot;:&quot;|"a":")(img_\w+)/g, (all, pre, id) => pre + (idMap[id] || id));
      html = T4.edSanitize.sanitizeToString(html);
      const meta = cleanMeta(Object.assign({}, d, { id: existing.has(d.id) || !d.id ? U.uid('doc') : d.id, deletedAt: null }));
      await write([['docs', meta], ['bodies', { id: meta.id, html }]]);
      existing.add(meta.id);
      count++;
    }
    emit({ type: 'imported' });
    return count;
  }

  /* ---------- Versions (version history; see edx.db.versions) ---------- */
  async function versionIds(docId) {
    await open();
    if (mode !== 'idb') return Array.from(mem.versions.values()).filter((v) => v.docId === docId).map((v) => v.id);
    return reqP(tx(['versions']).objectStore('versions').index('docId').getAllKeys(docId));
  }
  const strip = (r) => { const o = Object.assign({}, r); delete o.html; return o; };
  const DOC_ID = /^[\w-]{1,80}$/;
  const versions = {
    /** add({ docId, html, title?, words?, reason?, createdAt? }) → stored record (with generated id). */
    async add(rec) {
      if (!rec || !DOC_ID.test(rec.docId || '')) throw new Error('versions.add: docId required');
      const v = {
        id: typeof rec.id === 'string' && /^[\w-]{1,80}$/.test(rec.id) ? rec.id : U.uid('ver'),
        docId: rec.docId,
        createdAt: iso(rec.createdAt, new Date().toISOString()),
        title: String(rec.title == null ? '' : rec.title).slice(0, 200),
        words: Math.max(0, Math.min(1e7, Number(rec.words) || 0)),
        html: String(rec.html == null ? '' : rec.html),
        reason: String(rec.reason == null ? 'auto' : rec.reason).replace(/[^\w .:-]/g, '').slice(0, 40),
      };
      await write([['versions', v]]);
      return v;
    },
    /** list(docId, { html: false }) → records of a document, newest first (without html unless asked). */
    async list(docId, opts) {
      await open();
      const all = mode !== 'idb' ? Array.from(mem.versions.values()).filter((v) => v.docId === docId).map(clone) : await reqP(tx(['versions']).objectStore('versions').index('docId').getAll(docId));
      all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return opts && opts.html ? all : all.map(strip);
    },
    get: (id) => getOne('versions', id),
    async remove(id) { await write([], [['versions', id]]); },
    async count(docId) { return (await versionIds(docId)).length; },
    /** prune(docId, keep, { protect(rec) → bool }) — keep the `keep` newest versions (plus protected ones); returns how many were removed. */
    async prune(docId, keep, opts) {
      const all = await versions.list(docId);
      const dead = all.slice(Math.max(0, keep | 0)).filter((r) => !(opts && opts.protect && opts.protect(r)));
      if (dead.length) await write([], dead.map((r) => ['versions', r.id]));
      return dead.length;
    },
  };

  /* ---------- Key-value store for small module state (edx.db.kv) ---------- */
  const KV_KEY = /^[\w.:-]{1,100}$/;
  const kv = {
    async get(k) { if (!KV_KEY.test(k)) return undefined; const r = await getOne('kv', k); return r ? r.v : undefined; },
    /** set(key, value) — value must be structured-cloneable (JSON-like); keep it small. */
    async set(k, v) { if (!KV_KEY.test(k)) throw new Error('kv.set: invalid key'); await write([['kv', { k, v: clone({ v }).v, updatedAt: new Date().toISOString() }]]); },
    async remove(k) { await write([], [['kv', k]]); },
    async keys(prefix) { return (await getAll('kv')).map((r) => r.k).filter((k) => !prefix || k.indexOf(prefix) === 0); },
  };

  async function usage() {
    const [docs, assets] = await Promise.all([list(), getAll('assets')]);
    return { docs: docs.filter((d) => !d.deletedAt).length, trashed: docs.filter((d) => d.deletedAt).length, images: assets.length, imageBytes: assets.reduce((s, a) => s + (a.size || 0), 0) };
  }

  return {
    open, subscribe, list, get, create, save, touch, duplicate, trash, restore, destroy, purgeTrash,
    putAsset, assetURL, cachedAssetURL, assetDataURL, blobToDataURL, dataURLToBlob, collectGarbage,
    exportBundle, parseBundle, importBundle, usage, cleanPage, pageGeometry, PAGE_SIZES, PAGE_MARGINS, displayTitle, PAGE_DEFAULTS, TRASH_DAYS, versions, kv, DB_NAME, DB_VERSION,
    get mode() { return mode; },
  };
})();
