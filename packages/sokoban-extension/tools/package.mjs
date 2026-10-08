#!/usr/bin/env node
/**
 * Builds the upload zip for the Chrome Web Store — source only, no tooling,
 * no tests. Written by hand rather than shelling out to `zip` so it works the
 * same on any machine with node and nothing else installed.
 */
import { deflateRawSync } from 'node:zlib';
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const INCLUDE = ['manifest.json', 'icons', 'src'];

const manifest = JSON.parse(readFileSync(join(rootDir, 'manifest.json'), 'utf8'));
const outDir = join(rootDir, 'dist');
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, `crate-and-cards-${manifest.version}.zip`);

function collect(path, out = []) {
  const stat = statSync(path);
  if (stat.isDirectory()) {
    for (const entry of readdirSync(path).sort()) collect(join(path, entry), out);
  } else {
    out.push(path);
  }
  return out;
}

const files = INCLUDE.flatMap((entry) => collect(join(rootDir, entry)));

/* --------------------------------------------------------------- zip bytes */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const locals = [];
const central = [];
let offset = 0;

for (const file of files) {
  const name = relative(rootDir, file).split(sep).join('/');
  const raw = readFileSync(file);
  const deflated = deflateRawSync(raw, { level: 9 });
  const useDeflate = deflated.length < raw.length;
  const body = useDeflate ? deflated : raw;
  const nameBytes = Buffer.from(name, 'utf8');
  const crc = crc32(raw);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4); // version needed
  local.writeUInt16LE(0, 6); // flags
  local.writeUInt16LE(useDeflate ? 8 : 0, 8);
  local.writeUInt16LE(0, 10); // mod time — fixed, so builds are reproducible
  local.writeUInt16LE(0x0021, 12); // mod date: 2000-01-01
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(body.length, 18);
  local.writeUInt32LE(raw.length, 22);
  local.writeUInt16LE(nameBytes.length, 26);
  local.writeUInt16LE(0, 28);

  locals.push(local, nameBytes, body);

  const entry = Buffer.alloc(46);
  entry.writeUInt32LE(0x02014b50, 0);
  entry.writeUInt16LE(20, 4);
  entry.writeUInt16LE(20, 6);
  entry.writeUInt16LE(0, 8);
  entry.writeUInt16LE(useDeflate ? 8 : 0, 10);
  entry.writeUInt16LE(0, 12);
  entry.writeUInt16LE(0x0021, 14);
  entry.writeUInt32LE(crc, 16);
  entry.writeUInt32LE(body.length, 20);
  entry.writeUInt32LE(raw.length, 24);
  entry.writeUInt16LE(nameBytes.length, 28);
  entry.writeUInt32LE(offset, 42);

  central.push(entry, nameBytes);
  offset += local.length + nameBytes.length + body.length;
}

const centralBuf = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(centralBuf.length, 12);
end.writeUInt32LE(offset, 16);

writeFileSync(outFile, Buffer.concat([...locals, centralBuf, end]));

const bytes = statSync(outFile).size;
console.log(`packed ${files.length} files → ${relative(rootDir, outFile)} (${(bytes / 1024).toFixed(1)} kB)`);
