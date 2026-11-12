/* Todo4Me — minimal ZIP library for the import/export module (T4.edio.zip).
 *
 * Writer: stored or deflate (CompressionStream('deflate-raw') when the browser has it), CRC-32, UTF-8 names.
 * Reader: central directory, stored + deflate (DecompressionStream('deflate-raw')). ZIP64 and encryption are detected and
 * refused with a clear error. Zip-bomb guards: entry count, declared total size, per-entry size while inflating.
 * No dependencies, no eval, no workers, no network. */
(function () {
  'use strict';
  const T4g = window.T4 = window.T4 || {};
  const edio = T4g.edio = T4g.edio || {};

  const LIMITS = { totalBytes: 200 * 1024 * 1024, entryBytes: 120 * 1024 * 1024, entries: 5000 };

  /* ---------- CRC-32 ---------- */
  const TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(bytes, start) {
    let c = start == null ? 0xffffffff : (start ^ 0xffffffff) >>> 0;
    for (let i = 0; i < bytes.length; i++) c = TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  const enc = new TextEncoder();
  const hasCS = typeof CompressionStream === 'function';
  const hasDS = typeof DecompressionStream === 'function';
  const toBytes = (d) => (typeof d === 'string' ? enc.encode(d) : d instanceof Uint8Array ? d : d instanceof ArrayBuffer ? new Uint8Array(d) : ArrayBuffer.isView(d) ? new Uint8Array(d.buffer, d.byteOffset, d.byteLength) : null);

  async function pump(stream, limit) {
    const reader = stream.getReader();
    const chunks = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (limit != null && total > limit) { try { await reader.cancel(); } catch (e) { /* ignore */ } throw new Error('zip: entry is larger than declared (possible zip bomb)'); }
      chunks.push(value);
    }
    const out = new Uint8Array(total);
    let o = 0;
    for (const c of chunks) { out.set(c, o); o += c.length; }
    return out;
  }
  async function deflateRaw(bytes) {
    return pump(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw')));
  }
  async function inflateRaw(bytes, limit) {
    return pump(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')), limit);
  }

  /* ---------- Writer ---------- */
  function dosTime(d) {
    return { time: ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff, date: ((Math.max(0, d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff };
  }
  /** createWriter() → { add(name, data, { store }) → Promise, finish() → Promise<Uint8Array> } */
  function createWriter(opts) {
    opts = opts || {};
    const entries = [];
    const names = new Set();
    let size = 0;
    const stamp = dosTime(opts.date || new Date());
    return {
      async add(name, data, o) {
        name = String(name).replace(/\\/g, '/').replace(/^\/+/, '');
        if (!name || names.has(name)) throw new Error('zip: bad or duplicate entry name ' + name);
        names.add(name);
        const raw = toBytes(data);
        if (!raw) throw new TypeError('zip: data must be string or bytes');
        const crc = crc32(raw);
        let body = raw, method = 0;
        if (hasCS && !(o && o.store) && raw.length >= 64) {
          const z = await deflateRaw(raw);
          if (z.length < raw.length) { body = z; method = 8; }
        }
        size += body.length;
        if (size > 0xfff00000 || entries.length >= 0xfff0) throw new Error('zip: archive too large (ZIP64 is not supported)');
        entries.push({ name: enc.encode(name), crc, method, csize: body.length, usize: raw.length, body });
      },
      async finish() {
        let total = 22;
        entries.forEach((e) => { total += 30 + e.name.length + e.body.length + 46 + e.name.length; });
        const out = new Uint8Array(total);
        const v = new DataView(out.buffer);
        let p = 0;
        const offs = [];
        for (const e of entries) {
          offs.push(p);
          v.setUint32(p, 0x04034b50, true); v.setUint16(p + 4, e.method === 8 ? 20 : 10, true); v.setUint16(p + 6, 0x0800, true); v.setUint16(p + 8, e.method, true);
          v.setUint16(p + 10, stamp.time, true); v.setUint16(p + 12, stamp.date, true); v.setUint32(p + 14, e.crc, true);
          v.setUint32(p + 18, e.csize, true); v.setUint32(p + 22, e.usize, true); v.setUint16(p + 26, e.name.length, true); v.setUint16(p + 28, 0, true);
          out.set(e.name, p + 30); out.set(e.body, p + 30 + e.name.length);
          p += 30 + e.name.length + e.body.length;
        }
        const cdStart = p;
        entries.forEach((e, i) => {
          v.setUint32(p, 0x02014b50, true); v.setUint16(p + 4, 20, true); v.setUint16(p + 6, e.method === 8 ? 20 : 10, true); v.setUint16(p + 8, 0x0800, true); v.setUint16(p + 10, e.method, true);
          v.setUint16(p + 12, stamp.time, true); v.setUint16(p + 14, stamp.date, true); v.setUint32(p + 16, e.crc, true);
          v.setUint32(p + 20, e.csize, true); v.setUint32(p + 24, e.usize, true); v.setUint16(p + 28, e.name.length, true);
          v.setUint16(p + 30, 0, true); v.setUint16(p + 32, 0, true); v.setUint16(p + 34, 0, true); v.setUint16(p + 36, 0, true); v.setUint32(p + 38, 0, true); v.setUint32(p + 42, offs[i], true);
          out.set(e.name, p + 46);
          p += 46 + e.name.length;
        });
        v.setUint32(p, 0x06054b50, true); v.setUint16(p + 4, 0, true); v.setUint16(p + 6, 0, true);
        v.setUint16(p + 8, entries.length, true); v.setUint16(p + 10, entries.length, true); v.setUint32(p + 12, p - cdStart, true); v.setUint32(p + 16, cdStart, true); v.setUint16(p + 20, 0, true);
        return out;
      },
    };
  }

  /* ---------- Reader ---------- */
  function decodeName(bytes, utf8) {
    if (utf8) { try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch (e) { /* fall through */ } }
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch (e) { return new TextDecoder('latin1').decode(bytes); }
  }
  /** readZip(Blob | ArrayBuffer | Uint8Array, { limits }) → Promise<{ names(), has(name), size(name), read(name) → Uint8Array, text(name), entries }> */
  async function readZip(src, opts) {
    const lim = Object.assign({}, LIMITS, opts && opts.limits);
    let bytes;
    if (src instanceof Blob) bytes = new Uint8Array(await src.arrayBuffer());
    else bytes = toBytes(src);
    if (!bytes || bytes.length < 22) throw new Error('zip: not a ZIP file (too small)');
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let eocd = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) { if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; } }
    if (eocd < 0) throw new Error('zip: end of central directory not found (not a ZIP file or damaged)');
    if (eocd >= 20 && v.getUint32(eocd - 20, true) === 0x07064b50) throw new Error('zip: ZIP64 archives are not supported');
    let count = v.getUint16(eocd + 10, true);
    const cdSize = v.getUint32(eocd + 12, true);
    const cdOff = v.getUint32(eocd + 16, true);
    if (count === 0xffff || cdSize === 0xffffffff || cdOff === 0xffffffff) throw new Error('zip: ZIP64 archives are not supported');
    if (count > lim.entries) throw new Error('zip: too many entries (' + count + ')');
    if (cdOff + cdSize > bytes.length) throw new Error('zip: damaged central directory');
    const map = new Map();
    let p = cdOff, declared = 0;
    for (let i = 0; i < count; i++) {
      if (p + 46 > bytes.length || v.getUint32(p, true) !== 0x02014b50) throw new Error('zip: damaged central directory entry');
      const flags = v.getUint16(p + 8, true), method = v.getUint16(p + 10, true);
      const crc = v.getUint32(p + 16, true), csize = v.getUint32(p + 20, true), usize = v.getUint32(p + 24, true);
      const nl = v.getUint16(p + 28, true), xl = v.getUint16(p + 30, true), cl = v.getUint16(p + 32, true);
      const off = v.getUint32(p + 42, true);
      if (csize === 0xffffffff || usize === 0xffffffff || off === 0xffffffff) throw new Error('zip: ZIP64 entries are not supported');
      const name = decodeName(bytes.subarray(p + 46, p + 46 + nl), !!(flags & 0x800)).replace(/\\/g, '/').replace(/^\/+/, '');
      p += 46 + nl + xl + cl;
      if (name.endsWith('/')) continue; // directory
      declared += usize;
      if (usize > lim.entryBytes) throw new Error('zip: entry "' + name + '" is too large');
      if (declared > lim.totalBytes) throw new Error('zip: total uncompressed size is too large (limit ' + Math.round(lim.totalBytes / 1048576) + ' MB)');
      if (!map.has(name)) map.set(name, { name, flags, method, crc, csize, usize, off });
    }
    async function read(name, o) {
      const e = map.get(name);
      if (!e) throw new Error('zip: entry not found: ' + name);
      if (e.flags & 1) throw new Error('zip: encrypted entries are not supported');
      if (e.off + 30 > bytes.length || v.getUint32(e.off, true) !== 0x04034b50) throw new Error('zip: damaged local header for ' + name);
      const start = e.off + 30 + v.getUint16(e.off + 26, true) + v.getUint16(e.off + 28, true);
      if (start + e.csize > bytes.length) throw new Error('zip: entry data is truncated: ' + name);
      const raw = bytes.subarray(start, start + e.csize);
      let out;
      if (e.method === 0) out = raw.slice();
      else if (e.method === 8) {
        if (!hasDS) throw new Error('zip: this browser cannot inflate ZIP data (DecompressionStream missing)');
        out = await inflateRaw(raw, e.usize + 1024);
      } else throw new Error('zip: unsupported compression method ' + e.method + ' in ' + name);
      if (out.length !== e.usize) throw new Error('zip: size mismatch in ' + name);
      if (!(o && o.verify === false) && crc32(out) !== e.crc) throw new Error('zip: CRC error in ' + name);
      return out;
    }
    return {
      names: () => Array.from(map.keys()),
      has: (n) => map.has(n),
      size: (n) => (map.has(n) ? map.get(n).usize : 0),
      read,
      async text(name) { return new TextDecoder('utf-8').decode(await read(name)).replace(/^﻿/, ''); },
      entries: map,
    };
  }

  edio.zip = { crc32, createWriter, readZip, deflateRaw, inflateRaw, hasCompression: hasCS && hasDS, LIMITS };
})();
