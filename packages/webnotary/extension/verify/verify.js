import { readZip } from '../lib/zip.js';
import { sha256, bytesToHex, textOf } from '../lib/hash.js';
import { verifyToken, parseTimeStampReq } from '../lib/rfc3161.js';

const $ = (id) => document.getElementById(id);

// If the user re-zipped the extracted folder, entries carry a directory prefix.
function normalizePrefix(map) {
  if (map.has('evidence-manifest.json')) return map;
  const key = [...map.keys()].find((k) => k.endsWith('/evidence-manifest.json'));
  if (!key) return map;
  const prefix = key.slice(0, key.length - 'evidence-manifest.json'.length);
  const out = new Map();
  for (const [k, v] of map) out.set(k.startsWith(prefix) ? k.slice(prefix.length) : k, v);
  return out;
}

function el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text != null) n.textContent = text;
  return n;
}

function showError(message) {
  $('verdict').classList.add('hidden');
  $('details').classList.add('hidden');
  document.querySelector('.error-box')?.remove();
  const box = el('div', 'error-box', message);
  $('drop').after(box);
}

function renderVerdict(kind, big, sub) {
  const v = $('verdict');
  v.className = `verdict ${kind}`;
  v.textContent = '';
  v.append(el('span', 'big', big), el('span', 'sub', sub));
  v.classList.remove('hidden');
}

async function verifyBundle(map) {
  document.querySelector('.error-box')?.remove();
  map = normalizePrefix(map);

  const manifestBytes = map.get('evidence-manifest.json');
  if (!manifestBytes) {
    showError('No evidence-manifest.json found. Select a WebNotary bundle .zip (or all files extracted from one).');
    return;
  }
  let manifest;
  try {
    manifest = JSON.parse(textOf(manifestBytes));
  } catch {
    showError('evidence-manifest.json is not valid JSON — the bundle appears corrupt.');
    return;
  }

  // 1. Artifact digests
  const hashRows = [];
  for (const [name, expected] of Object.entries(manifest.files ?? {})) {
    const data = map.get(name);
    if (!data) {
      hashRows.push({ name, expected, actual: null, ok: false, missing: true });
      continue;
    }
    const actual = bytesToHex(await sha256(data));
    hashRows.push({ name, expected, actual, ok: actual === expected.toLowerCase(), missing: false });
  }
  const manifestHash = await sha256(manifestBytes);
  const manifestHashHex = bytesToHex(manifestHash);

  // 2. Timestamp tokens
  const tokenNames = [...map.keys()].filter((k) => k.startsWith('timestamps/') && k.endsWith('.tsr')).sort();
  const tokens = [];
  for (const name of tokenNames) {
    const base = name.slice(0, -4);
    let expectedNonceHex = null;
    let tsqImprintOk = null;
    const tsqBytes = map.get(`${base}.tsq`);
    if (tsqBytes) {
      try {
        const tsq = parseTimeStampReq(tsqBytes);
        expectedNonceHex = tsq.nonceHex;
        tsqImprintOk = bytesToHex(tsq.imprintHash) === manifestHashHex;
      } catch { /* request unreadable; token checks still run */ }
    }
    let verdict;
    try {
      verdict = await verifyToken(map.get(name), { expectedImprint: manifestHash, expectedNonceHex });
    } catch (e) {
      verdict = { ok: false, checks: [{ id: 'parse', label: 'Token parses', ok: false, detail: String(e?.message ?? e), critical: true }], warnings: [], tstInfo: null, signerCert: null };
    }
    tokens.push({ name, verdict, tsqImprintOk });
  }

  // 3. Verdict
  const hashesOk = hashRows.length > 0 && hashRows.every((r) => r.ok);
  const validTokens = tokens.filter((t) => t.verdict.ok);
  const kind = !hashesOk ? 'fail' : validTokens.length ? 'ok' : 'partial';
  const earliest = validTokens.map((t) => t.verdict.tstInfo?.genTime?.iso).filter(Boolean).sort()[0] ?? null;
  if (kind === 'ok') {
    renderVerdict('ok', 'VERIFIED — integrity and trusted timestamp confirmed',
      `${hashRows.length} artifact${hashRows.length === 1 ? '' : 's'} match the manifest; ${validTokens.length} RFC 3161 token${validTokens.length === 1 ? '' : 's'} valid. Content existed no later than ${earliest} (excluding chain-of-trust validation — see below).`);
  } else if (kind === 'partial') {
    renderVerdict('partial', 'INTEGRITY VERIFIED — but no valid trusted timestamp',
      tokens.length
        ? 'All artifact digests match the manifest, but none of the RFC 3161 tokens passed every check. Details below.'
        : 'All artifact digests match the manifest, but the bundle contains no RFC 3161 token.');
  } else {
    renderVerdict('fail', 'VERIFICATION FAILED — content does not match the manifest',
      'One or more artifacts are missing or altered. This bundle should not be relied on. Details below.');
  }

  // 4. Details
  const info = $('captureInfo');
  info.textContent = '';
  const addKv = (label, value, mono = false) => {
    info.append(el('dt', null, label));
    const dd = el('dd', mono ? 'mono' : null, value ?? '—');
    info.append(dd);
  };
  addKv('Capture ID', manifest.captureId, true);
  addKv('Manifest created (UTC)', manifest.createdUtc);
  const metaBytes = map.get('metadata.json');
  if (metaBytes) {
    try {
      const meta = JSON.parse(textOf(metaBytes));
      addKv('Captured URL', meta.request?.url, true);
      addKv('Page title', meta.request?.title);
      addKv('Operator', [meta.operator?.name, meta.operator?.organization].filter(Boolean).join(' · ') || null);
      addKv('Matter / case', meta.operator?.matter);
      addKv('WebNotary version', meta.tool?.version);
    } catch { /* metadata unreadable — digests above already flag it */ }
  }

  const tbody = $('hashTable').querySelector('tbody');
  tbody.textContent = '';
  for (const r of hashRows) {
    const tr = document.createElement('tr');
    const stat = el('td', `stat ${r.ok ? 'ok' : 'fail'}`, r.ok ? '✓' : '✕');
    const name = el('td', null, r.name + (r.missing ? ' (missing)' : ''));
    const hash = el('td', 'mono');
    hash.textContent = r.ok ? r.expected : r.missing
      ? `expected ${r.expected}`
      : `expected ${r.expected}\ncomputed ${r.actual}`;
    tr.append(stat, name, hash);
    tbody.appendChild(tr);
  }
  $('manifestRow').textContent = `SHA-256(evidence-manifest.json) = ${manifestHashHex} — this is the digest the timestamp tokens must cover.`;

  const tokensBox = $('tokens');
  tokensBox.textContent = '';
  if (!tokens.length) tokensBox.append(el('p', null, 'No timestamp tokens found in this bundle.'));
  const allWarnings = new Set();
  for (const t of tokens) {
    const box = el('div', 'token');
    const h3 = el('h3', null, `${t.name} `);
    const tst = t.verdict.tstInfo;
    if (tst) h3.append(el('span', 'genTime', `— attested ${tst.genTime.iso}${tst.accuracy?.seconds != null ? ` (±${tst.accuracy.seconds}s)` : ''}`));
    box.append(h3);
    if (tst) {
      const sub = el('div', 'detail');
      sub.textContent = `serial ${tst.serialHex} · policy ${tst.policyOid}` +
        (t.verdict.signerCert ? ` · signer ${t.verdict.signerCert.subject.map.CN ?? t.verdict.signerCert.subject.text}` : '');
      box.append(sub);
    }
    const ul = document.createElement('ul');
    if (t.tsqImprintOk != null) {
      const li = document.createElement('li');
      li.append(el('span', `mark ${t.tsqImprintOk ? 'ok' : 'fail'}`, t.tsqImprintOk ? '✓' : '✕'),
        el('span', null, 'Stored request (.tsq) imprint matches the manifest digest'));
      ul.append(li);
    }
    for (const c of t.verdict.checks) {
      const li = document.createElement('li');
      const mark = c.ok ? 'ok' : c.critical ? 'fail' : 'warn';
      li.append(el('span', `mark ${mark}`, c.ok ? '✓' : c.critical ? '✕' : '⚠'), el('span', null, c.label));
      if (c.detail) li.append(el('span', 'detail', String(c.detail)));
      ul.append(li);
    }
    box.append(ul);
    tokensBox.append(box);
    for (const w of t.verdict.warnings) allWarnings.add(w);
  }

  const warnBox = $('warnings');
  warnBox.textContent = '';
  for (const w of allWarnings) warnBox.append(el('p', null, w));

  $('details').classList.remove('hidden');
}

async function handleFiles(files) {
  if (!files?.length) return;
  try {
    let map;
    if (files.length === 1 && files[0].name.toLowerCase().endsWith('.zip')) {
      map = await readZip(new Uint8Array(await files[0].arrayBuffer()));
    } else {
      map = new Map();
      for (const f of files) {
        // webkitRelativePath is set when a whole directory is dropped/selected.
        const name = (f.webkitRelativePath || f.name).replace(/\\/g, '/');
        map.set(name, new Uint8Array(await f.arrayBuffer()));
      }
    }
    await verifyBundle(map);
  } catch (e) {
    showError(`Could not read the bundle: ${e?.message ?? e}`);
  }
}

const drop = $('drop');
drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('hover'); });
drop.addEventListener('dragleave', () => drop.classList.remove('hover'));
drop.addEventListener('drop', (e) => {
  e.preventDefault();
  drop.classList.remove('hover');
  handleFiles([...e.dataTransfer.files]);
});
drop.addEventListener('click', (e) => {
  if (e.target.closest('label')) return; // the browse label handles itself
  $('file').click();
});
$('file').addEventListener('change', () => handleFiles([...$('file').files]));
