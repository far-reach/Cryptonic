// Builds the Chrome Web Store upload package: release/webnotary-<version>.zip
// with manifest.json at the ZIP root. Uses the extension's own zip.js (store
// method) and a fixed timestamp, so rebuilding unchanged sources is
// byte-identical — the printed SHA-256 identifies the exact uploaded build.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createZip } from '../extension/lib/zip.js';
import { sha256, bytesToHex } from '../extension/lib/hash.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EXT = join(ROOT, 'extension');
const OUT_DIR = join(ROOT, 'release');

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

const manifest = JSON.parse(readFileSync(join(EXT, 'manifest.json'), 'utf8'));
const entries = walk(EXT).map((p) => ({
  name: relative(EXT, p).replaceAll('\\', '/'),
  data: new Uint8Array(readFileSync(p)),
  date: new Date('1980-01-01T00:00:00Z'), // fixed for reproducible builds
}));

mkdirSync(OUT_DIR, { recursive: true });
const zip = createZip(entries);
const outFile = join(OUT_DIR, `webnotary-${manifest.version}.zip`);
writeFileSync(outFile, zip);
const digest = bytesToHex(await sha256(zip));
console.log(`${outFile}`);
console.log(`  ${entries.length} files, ${zip.length} bytes`);
console.log(`  sha256 ${digest}`);
