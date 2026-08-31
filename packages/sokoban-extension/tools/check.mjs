#!/usr/bin/env node
/**
 * Pre-flight for the unpacked extension. Chrome fails silently on a lot of
 * these (a missing icon just shows a blank square, a bad import kills the
 * whole service worker), so they are worth catching before loading it.
 *
 *   1. manifest.json parses and every file it points at exists
 *   2. every .js file parses as an ES module
 *   3. every relative import resolves to a real file
 *   4. no page pulls in a remote script (the MV3 CSP forbids it anyway)
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];
const note = (message) => problems.push(message);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const files = walk(rootDir);
const exists = (path) => files.includes(resolve(path));

/* ------------------------------------------------------------- 1. manifest */

const manifestPath = join(rootDir, 'manifest.json');
let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
} catch (err) {
  console.error(`manifest.json does not parse: ${err.message}`);
  process.exit(1);
}

const referenced = [
  ...Object.values(manifest.icons ?? {}),
  ...Object.values(manifest.action?.default_icon ?? {}),
  manifest.action?.default_popup,
  manifest.background?.service_worker,
].filter(Boolean);

for (const ref of referenced) {
  if (!exists(join(rootDir, ref))) note(`manifest references a missing file: ${ref}`);
}

if (manifest.manifest_version !== 3) note('manifest_version must be 3');
if (!Array.isArray(manifest.permissions)) note('permissions must be an array');
for (const permission of manifest.permissions ?? []) {
  if (!['storage', 'alarms', 'notifications'].includes(permission)) {
    note(`unexpected permission requested: ${permission} — keep the ask minimal`);
  }
}

/* ------------------------------------------- 2 & 3. modules and their imports */

const scripts = files.filter((f) => f.endsWith('.js') || f.endsWith('.mjs'));

for (const file of scripts) {
  const shown = relative(rootDir, file);
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (err) {
    note(`${shown} does not parse:\n    ${String(err.stderr).trim().split('\n')[0]}`);
    continue;
  }

  const source = readFileSync(file, 'utf8');
  const importRe = /(?:^|\n)\s*(?:import|export)[^'"\n]*?from\s+['"]([^'"]+)['"]/g;
  for (const match of source.matchAll(importRe)) {
    const specifier = match[1];
    if (!specifier.startsWith('.')) {
      if (!specifier.startsWith('node:')) note(`${shown} imports a bare specifier: ${specifier}`);
      continue;
    }
    const target = resolve(dirname(file), specifier);
    if (!exists(target)) note(`${shown} imports a missing file: ${specifier}`);
  }
}

/* -------------------------------------------------------------- 4. HTML refs */

for (const file of files.filter((f) => f.endsWith('.html'))) {
  const shown = relative(rootDir, file);
  const source = readFileSync(file, 'utf8');

  for (const match of source.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
    const ref = match[1];
    if (/^(https?:)?\/\//.test(ref)) {
      note(`${shown} loads a remote resource (${ref}) — the MV3 CSP will block it`);
      continue;
    }
    if (ref.startsWith('#') || ref.startsWith('data:')) continue;
    if (!exists(resolve(dirname(file), ref))) note(`${shown} references a missing file: ${ref}`);
  }

  if (/on(?:click|load|change)=["']/.test(source)) {
    note(`${shown} uses an inline event handler — blocked by the extension CSP`);
  }
}

/* --------------------------------------------------------------------- done */

if (problems.length) {
  console.error(`✗ ${problems.length} problem(s):\n`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(
  `✓ manifest, ${scripts.length} modules and ${files.filter((f) => f.endsWith('.html')).length} pages check out`,
);
