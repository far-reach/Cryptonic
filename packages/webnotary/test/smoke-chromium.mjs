// End-to-end smoke test for WebNotary in real (headless) Chromium.
//
// What it does:
//   1. Copies extension/ to a TEST build whose host_permissions are <all_urls>,
//      so a capture can be triggered programmatically (no toolbar-click gesture).
//      The shipped extension is NOT modified.
//   2. Serves a local test web page and a local RFC 3161 TSA (openssl ts -reply).
//   3. Loads the test build in Chromium, points its settings at the local TSA,
//      captures the page, and waits for the bundle download.
//   4. Verifies the produced bundle with the extension's own lib code in Node,
//      then cross-checks the token with `openssl ts -verify`.
//
// Requirements: a Chromium binary and playwright-core:
//   npm i --no-save playwright-core
//   WN_CHROME=/path/to/chrome node test/smoke-chromium.mjs
// (WN_CHROME defaults to the Playwright-managed Chromium if present.)

import { execFileSync } from 'node:child_process';
import http from 'node:http';
import { mkdirSync, writeFileSync, readFileSync, cpSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

let chromium;
try {
  ({ chromium } = await import('playwright-core'));
} catch {
  console.error('playwright-core is not installed. Run: npm i --no-save playwright-core');
  process.exit(1);
}

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_EXT = join(HERE, '..', 'extension');
const WORK = join(HERE, '.smoke-work');
const EXT = join(WORK, 'extension-testbuild');
const TSA = join(WORK, 'tsa');
const OUT = join(WORK, 'out');

const CHROME = process.env.WN_CHROME
  ?? ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome']
    .find((p) => existsSync(p));
if (!CHROME) {
  console.error('No Chromium binary found. Set WN_CHROME=/path/to/chrome');
  process.exit(1);
}

rmSync(WORK, { recursive: true, force: true });
for (const d of [WORK, TSA, OUT]) mkdirSync(d, { recursive: true });
const log = (...a) => console.log('[smoke]', ...a);

// 1. Test build ------------------------------------------------------------
cpSync(REPO_EXT, EXT, { recursive: true });
const manifest = JSON.parse(readFileSync(join(EXT, 'manifest.json'), 'utf8'));
manifest.host_permissions = ['<all_urls>'];
writeFileSync(join(EXT, 'manifest.json'), JSON.stringify(manifest, null, 2));
log('test build ready (host_permissions = <all_urls>)');

// 2. Local TSA + test page -------------------------------------------------
const openssl = (args, opts = {}) => execFileSync('openssl', args, { cwd: TSA, ...opts });
writeFileSync(join(TSA, 'tsa_ext.cnf'), 'basicConstraints=CA:FALSE\nextendedKeyUsage=critical,timeStamping\nsubjectKeyIdentifier=hash\n');
writeFileSync(join(TSA, 'tsa.cnf'), [
  '[tsa]', 'default_tsa = tsa_config1', '[tsa_config1]',
  `serial = ${join(TSA, 'tsaserial')}`,
  'default_policy = 1.3.6.1.4.1.55555.1.1',
  'digests = sha256, sha384, sha512',
  'accuracy = secs:1', 'ordering = no', 'tsa_name = no',
  'ess_cert_id_chain = no', 'ess_cert_id_alg = sha256', 'signer_digest = sha256',
].join('\n') + '\n');
openssl(['req', '-x509', '-newkey', 'rsa:2048', '-sha256', '-keyout', 'ca.key', '-out', 'ca.crt', '-days', '3', '-nodes', '-subj', '/CN=Smoke Root CA/O=WebNotary Smoke']);
openssl(['req', '-newkey', 'rsa:2048', '-sha256', '-keyout', 'tsa.key', '-out', 'tsa.csr', '-nodes', '-subj', '/CN=Smoke TSA/O=WebNotary Smoke']);
openssl(['x509', '-req', '-in', 'tsa.csr', '-CA', 'ca.crt', '-CAkey', 'ca.key', '-CAcreateserial', '-out', 'tsa.crt', '-days', '2', '-sha256', '-extfile', 'tsa_ext.cnf']);
log('local TSA certs ready');

const PAGE_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Acme Widgets — Refund Policy</title>
<meta name="description" content="Acme Widgets refund policy page used for the WebNotary smoke test.">
<style>body{font:16px/1.6 Georgia,serif;max-width:720px;margin:40px auto;color:#222}h1{color:#16294a}</style>
</head><body>
<h1>Acme Widgets — Refund Policy</h1>
<p id="claim"><strong>Lifetime money-back guarantee:</strong> any widget, any time, no questions asked.</p>
<img src="/logo.png" width="120" height="40" alt="logo">
<iframe src="/frame.html" width="400" height="60" title="terms"></iframe>
<p>Effective date: January 1, 2026. This page intentionally left evidentiary.</p>
</body></html>`;
const FRAME_HTML = '<!DOCTYPE html><body style="font:12px sans-serif">Embedded terms iframe — v3.2</body>';
const LOGO_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

let tsaHits = 0;
const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/tsr') {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        tsaHits++;
        const q = join(TSA, `q${tsaHits}.tsq`);
        const r = join(TSA, `r${tsaHits}.tsr`);
        writeFileSync(q, Buffer.concat(chunks));
        openssl(['ts', '-reply', '-queryfile', q, '-signer', 'tsa.crt', '-inkey', 'tsa.key', '-chain', 'ca.crt', '-out', r, '-config', 'tsa.cnf'], { stdio: 'pipe' });
        res.writeHead(200, { 'Content-Type': 'application/timestamp-reply' });
        res.end(readFileSync(r));
      } catch (e) {
        console.error('TSA error', e.message);
        res.writeHead(500).end();
      }
    });
    return;
  }
  if (req.url === '/') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(PAGE_HTML); return; }
  if (req.url === '/frame.html') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(FRAME_HTML); return; }
  if (req.url === '/logo.png') { res.writeHead(200, { 'Content-Type': 'image/png' }); res.end(LOGO_PNG); return; }
  res.writeHead(404).end();
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;
const PAGE_URL = `http://127.0.0.1:${PORT}/`;
const TSA_URL = `http://127.0.0.1:${PORT}/tsr`;
log(`server on ${PAGE_URL}`);

// 3. Chromium + extension --------------------------------------------------
const context = await chromium.launchPersistentContext(join(WORK, 'profile'), {
  headless: true,
  executablePath: CHROME,
  args: [
    `--disable-extensions-except=${EXT}`,
    `--load-extension=${EXT}`,
    '--no-sandbox',
    '--disable-dev-shm-usage',
  ],
});

let [sw] = context.serviceWorkers();
if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 30000 });
const EXT_ID = new URL(sw.url()).host;
log('extension loaded, id =', EXT_ID);

// 4. Capture ---------------------------------------------------------------
const target = await context.newPage();
await target.goto(PAGE_URL, { waitUntil: 'networkidle' });

// All chrome.* calls run from an extension page: Playwright's service-worker
// evaluate context does not expose the full extension API surface.
const extPage = await context.newPage();
await extPage.goto(`chrome-extension://${EXT_ID}/verify/verify.html`);
await extPage.evaluate(async (tsaUrl) => {
  await chrome.storage.sync.set({
    wn_settings: {
      operatorName: 'Jordan Rivera',
      organization: 'Rivera & Associates LLP',
      screenshotMode: 'fullpage',
      tsaEnabled: { freetsa: false, digicert: false, sectigo: false, certum: false },
      customTsa: { enabled: true, url: tsaUrl },
    },
  });
}, TSA_URL);
await extPage.evaluate(() => {
  window.__events = [];
  chrome.runtime.onMessage.addListener((m) => { window.__events.push(m); });
});
const tabId = await extPage.evaluate(async (pageUrl) => {
  const tabs = await chrome.tabs.query({ url: pageUrl + '*' });
  return tabs[0]?.id;
}, PAGE_URL);
if (!tabId) throw new Error('could not find target tab');
log('capturing tab', tabId);

await extPage.evaluate((id) => chrome.runtime.sendMessage({
  type: 'wn-capture', tabId: id, matter: 'SMOKE-2026-001', notes: 'Automated end-to-end smoke test', trigger: 'popup',
}), tabId);

const done = await extPage.waitForFunction(() => {
  const ev = window.__events.find((e) => e.type === 'wn-done' || e.type === 'wn-error');
  return ev ? JSON.stringify(ev) : null;
}, null, { timeout: 90000 }).then((h) => h.jsonValue()).then(JSON.parse);

if (done.type === 'wn-error') throw new Error(`capture failed: ${done.error}`);
log('capture done:', done.entry.fileName, `${done.entry.size} bytes`);
if (done.noTimestamp) throw new Error('no timestamp obtained from local TSA');

const dl = await extPage.evaluate(async () => {
  for (let i = 0; i < 60; i++) {
    const items = await chrome.downloads.search({});
    const it = items.find((d) => d.filename.includes('WebNotary'));
    if (it && it.state === 'complete') return { filename: it.filename, state: it.state };
    await new Promise((r) => setTimeout(r, 500));
  }
  const items = await chrome.downloads.search({});
  return { filename: items[0]?.filename ?? null, state: items[0]?.state ?? 'none', error: items[0]?.error ?? null };
});
if (dl.state !== 'complete') throw new Error(`download did not complete: ${JSON.stringify(dl)}`);
const bundleBytes = new Uint8Array(readFileSync(dl.filename));
writeFileSync(join(OUT, 'sample-bundle.zip'), bundleBytes);
log('bundle saved,', bundleBytes.length, 'bytes');

// 5. Verify the bundle with the extension's own code -----------------------
const { readZip } = await import(`file://${join(REPO_EXT, 'lib', 'zip.js')}`);
const { sha256, bytesToHex, textOf } = await import(`file://${join(REPO_EXT, 'lib', 'hash.js')}`);
const { verifyToken, parseTimeStampReq } = await import(`file://${join(REPO_EXT, 'lib', 'rfc3161.js')}`);

const map = await readZip(bundleBytes);
log('bundle entries:', [...map.keys()].join(', '));
const manifestJson = JSON.parse(textOf(map.get('evidence-manifest.json')));
for (const [name, expected] of Object.entries(manifestJson.files)) {
  const actual = bytesToHex(await sha256(map.get(name)));
  if (actual !== expected) throw new Error(`digest mismatch for ${name}`);
}
const mh = await sha256(map.get('evidence-manifest.json'));
const tsrName = [...map.keys()].find((k) => k.endsWith('.tsr'));
const req = parseTimeStampReq(map.get(tsrName.replace(/\.tsr$/, '.tsq')));
if (bytesToHex(req.imprintHash) !== bytesToHex(mh)) throw new Error('tsq imprint != manifest hash');
const verdict = await verifyToken(map.get(tsrName), { expectedImprint: mh, expectedNonceHex: req.nonceHex });
if (!verdict.ok) throw new Error('token verification failed: ' + JSON.stringify(verdict.checks.filter((c) => !c.ok)));
log('BUNDLE VERIFIED ✓  attested:', verdict.tstInfo.genTime.iso, '| signer:', verdict.signerCert.subject.text);

writeFileSync(join(TSA, 'bundle-manifest.json'), map.get('evidence-manifest.json'));
writeFileSync(join(TSA, 'bundle.tsr'), map.get(tsrName));
writeFileSync(join(TSA, 'bundle-certs.pem'), map.get(tsrName.replace(/\.tsr$/, '-certs.pem')));
const osslOut = openssl(['ts', '-verify', '-data', 'bundle-manifest.json', '-in', 'bundle.tsr', '-CAfile', 'ca.crt', '-untrusted', 'bundle-certs.pem'], { stdio: 'pipe' }).toString();
if (!osslOut.includes('Verification: OK')) throw new Error('openssl ts -verify failed on the real bundle');
log('openssl ts -verify on the captured bundle: OK');

await context.close();
server.close();
log('SMOKE TEST: ALL OK');
