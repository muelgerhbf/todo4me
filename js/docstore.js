/* Todo4Me — document storage for the editor (IndexedDB).
 *
 * Kept completely separate from the existing LocalStorage data (todo4me.data.v1):
 * documents and images can be large, and LocalStorage is limited to a few MB that
 * tasks and notes must keep for themselves.
 *
 * Database "todo4me-docs" (version 1):
 *   docs   { id, title, text, words, page, pinned, createdAt, updatedAt, openedAt, deletedAt }
 *   bodies { id, html }                       — the document content (sanitized HTML)
 *   assets { id, blob, type, size, createdAt } — images, referenced as data-p {"a": id}
 *
 * If IndexedDB is unavailable (e.g. some private browsing modes) everything works
 * in memory and the editor warns that documents won't be kept. */
T4.docstore = (function () {
  'use strict';
  const U = T4.util;

  const DB_NAME = 'todo4me-docs';
  const DB_VERSION = 1;
  const FORMAT = 1;
  const TRASH_DAYS = 30;
  const PAGE_DEFAULTS = { size: 'A4', orientation: 'portrait', margins: 'normal', header: '', footer: '', pageNumbers: 'bottom-center', numberFormat: 'page-of', firstPageHeader: true };

  let db = null;
  let mode = 'none'; // 'idb' | 'memory'
  let opening = null;
  const mem = { docs: new Map(), bodies: new Map(), assets: new Map() };
  const listeners = new Set();
  const urlCache = new Map(); // asset id → object URL

  function emit(info) { listeners.forEach((fn) => { try { fn(info || {}); } catch (e) { console.error(e); } }); }
  function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

  /* ---------- Opening ---------- */
  function open() {
    if (opening) return opening;
    opening = new Promise((resolve) => {
      if (!window.indexedDB) { mode = 'memory'; resolve({ ok: false, mode }); return; }
      let req;
      try { req = indexedDB.open(DB_NAME, DB_VERSION); } catch (e) { mode = 'memory'; resolve({ ok: false, mode, error: e.message }); return; }
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains('docs')) d.createObjectStore('docs', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('bodies')) d.createObjectStore('bodies', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('assets')) d.createObjectStore('assets', { keyPath: 'id' });
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
      puts.forEach(([s, v]) => mem[s].set(v.id, clone(v)));
      dels.forEach(([s, id]) => mem[s].delete(id));
      return;
    }
    const stores = Array.from(new Set(puts.map((p) => p[0]).concat(dels.map((d) => d[0]))));
    const t = tx(stores, true);
    puts.forEach(([s, v]) => t.objectStore(s).put(v));
    dels.forEach(([s, id]) => t.objectStore(s).delete(id));
    await doneP(t);
  }
  function clone(v) {
    if (v && v.blob instanceof Blob) return Object.assign({}, v);
    return v == null ? v : JSON.parse(JSON.stringify(v));
  }

  /* ---------- Validation ---------- */
  const iso = (v, d) => (typeof v === 'string' && !isNaN(Date.parse(v)) ? v : d);
  function cleanPage(p) {
    p = p && typeof p === 'object' ? p : {};
    const one = (v, list, d) => (list.includes(v) ? v : d);
    return {
      size: one(p.size, ['A4', 'Letter', 'A5', 'Legal'], PAGE_DEFAULTS.size),
      orientation: one(p.orientation, ['portrait', 'landscape'], PAGE_DEFAULTS.orientation),
      margins: one(p.margins, ['normal', 'narrow', 'moderate', 'wide'], PAGE_DEFAULTS.margins),
      header: String(p.header || '').slice(0, 200),
      footer: String(p.footer || '').slice(0, 200),
      pageNumbers: one(p.pageNumbers, ['none', 'bottom-center', 'bottom-right', 'top-right'], PAGE_DEFAULTS.pageNumbers),
      numberFormat: one(p.numberFormat, ['page-of', 'plain', 'slash'], PAGE_DEFAULTS.numberFormat),
      firstPageHeader: p.firstPageHeader !== false,
    };
  }
  function cleanMeta(m) {
    const now = new Date().toISOString();
    return {
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
  async function save(id, content, patch) {
    const cur = await getOne('docs', id);
    if (!cur) throw new Error('Document not found');
    const meta = cleanMeta(Object.assign({}, cur, patch || {}, content ? { text: content.text, words: content.words } : {}, { id, updatedAt: new Date().toISOString() }));
    const puts = [['docs', meta]];
    if (content) puts.push(['bodies', { id, html: String(content.html) }]);
    await write(puts);
    emit({ type: 'saved', id, silent: true });
    return meta;
  }
  /** Metadata-only update that doesn't count as an edit (e.g. pinning, opening). */
  async function touch(id, patch) {
    const cur = await getOne('docs', id);
    if (!cur) return null;
    const meta = cleanMeta(Object.assign({}, cur, patch, { id }));
    await write([['docs', meta]]);
    emit({ type: 'meta', id });
    return meta;
  }
  async function duplicate(id) {
    const d = await get(id);
    if (!d) return null;
    const now = new Date().toISOString();
    const meta = cleanMeta(Object.assign({}, d.meta, { id: U.uid('doc'), title: displayTitle(d.meta) + ' (copy)', pinned: false, createdAt: now, updatedAt: now, openedAt: now, deletedAt: null }));
    await write([['docs', meta], ['bodies', { id: meta.id, html: d.html }]]);
    emit({ type: 'created', id: meta.id });
    return meta;
  }
  const trash = (id) => touch(id, { deletedAt: new Date().toISOString(), pinned: false }).then((m) => { emit({ type: 'trashed', id }); return m; });
  const restore = (id) => touch(id, { deletedAt: null }).then((m) => { emit({ type: 'restored', id }); return m; });
  async function destroy(id) {
    await write([], [['docs', id], ['bodies', id]]);
    emit({ type: 'deleted', id });
  }
  async function purgeTrash(all) {
    const limit = Date.now() - TRASH_DAYS * 86400000;
    const old = (await list()).filter((m) => m.deletedAt && (all || Date.parse(m.deletedAt) < limit));
    if (!old.length) return 0;
    await write([], old.flatMap((m) => [['docs', m.id], ['bodies', m.id]]));
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

  /** Remove images that no document (including trashed ones) references anymore. Keeps today's uploads for undo. */
  async function collectGarbage() {
    const bodies = await getAll('bodies');
    const used = new Set(bodies.flatMap((b) => assetRefs(b.html)));
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
    try { j = typeof text === 'string' ? JSON.parse(text) : text; } catch (e) { throw new Error('The file is not valid JSON.'); }
    if (!j || j.kind !== 'documents' || !Array.isArray(j.documents)) throw new Error('This file is not a Todo4Me documents export.');
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

  async function usage() {
    const [docs, assets] = await Promise.all([list(), getAll('assets')]);
    return { docs: docs.filter((d) => !d.deletedAt).length, trashed: docs.filter((d) => d.deletedAt).length, images: assets.length, imageBytes: assets.reduce((s, a) => s + (a.size || 0), 0) };
  }

  return {
    open, subscribe, list, get, create, save, touch, duplicate, trash, restore, destroy, purgeTrash,
    putAsset, assetURL, cachedAssetURL, assetDataURL, blobToDataURL, dataURLToBlob, collectGarbage,
    exportBundle, parseBundle, importBundle, usage, cleanPage, displayTitle, PAGE_DEFAULTS, TRASH_DAYS,
    get mode() { return mode; },
  };
})();
