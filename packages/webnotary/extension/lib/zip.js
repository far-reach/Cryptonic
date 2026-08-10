// ZIP writer (store method only — evidence artifacts should not be transformed)
// and reader (store + deflate, for the verifier, which must also accept bundles
// a user re-zipped with ordinary tools).

import { crc32, concatBytes, utf8, textOf } from './hash.js';

function dosDateTime(date) {
  // ZIP timestamps are local-time by spec; UTC fields are used deliberately so
  // bundle bytes don't depend on the capturing machine's timezone setting.
  const y = Math.max(1980, date.getUTCFullYear());
  return {
    dosDate: ((y - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate(),
    dosTime: (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | (date.getUTCSeconds() >> 1),
  };
}

export function createZip(entries) {
  if (entries.length > 0xffff) throw new Error('too many entries for ZIP (no zip64 support)');
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const e of entries) {
    const nameBytes = utf8(e.name);
    const data = e.data;
    const crc = crc32(data);
    const { dosDate, dosTime } = dosDateTime(e.date ?? new Date(0));

    const lh = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);      // version needed to extract
    lv.setUint16(6, 0x0800, true);  // general purpose flag: UTF-8 names
    lv.setUint16(8, 0, true);       // method: store
    lv.setUint16(10, dosTime, true);
    lv.setUint16(12, dosDate, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    lh.set(nameBytes, 30);
    localParts.push(lh, data);

    const ch = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, dosTime, true);
    cv.setUint16(14, dosDate, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    ch.set(nameBytes, 46);
    centralParts.push(ch);

    offset += lh.length + data.length;
    if (offset > 0xfffffff0) throw new Error('bundle exceeds 4 GB (no zip64 support)');
  }
  const centralSize = centralParts.reduce((a, p) => a + p.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  return concatBytes(...localParts, ...centralParts, eocd);
}

async function inflateRaw(bytes) {
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// Returns Map<name, Uint8Array>. CRC-checked; directories skipped.
export async function readZip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  const min = Math.max(0, bytes.length - 22 - 65535);
  for (let i = bytes.length - 22; i >= min; i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a ZIP file (end-of-central-directory not found)');
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const entries = new Map();
  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error('corrupt central directory');
    const method = view.getUint16(p + 10, true);
    const crc = view.getUint32(p + 16, true);
    const csize = view.getUint32(p + 20, true);
    const usize = view.getUint32(p + 24, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const lho = view.getUint32(p + 42, true);
    const name = textOf(bytes.subarray(p + 46, p + 46 + nameLen));

    if (view.getUint32(lho, true) !== 0x04034b50) throw new Error(`corrupt local header for ${name}`);
    const dataStart = lho + 30 + view.getUint16(lho + 26, true) + view.getUint16(lho + 28, true);
    const raw = bytes.subarray(dataStart, dataStart + csize);

    if (!name.endsWith('/')) {
      let data;
      if (method === 0) data = raw;
      else if (method === 8) data = await inflateRaw(raw);
      else throw new Error(`unsupported compression method ${method} for ${name}`);
      if (data.length !== usize) throw new Error(`size mismatch for ${name}`);
      if (crc32(data) !== crc) throw new Error(`CRC mismatch for ${name} — file is corrupt`);
      entries.set(name, data);
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}
