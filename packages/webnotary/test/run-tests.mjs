// WebNotary library test suite. Runs under plain Node (>= 20) with no deps.
// The RFC 3161 tests build a real local TSA with OpenSSL (CA + RSA/EC signers),
// answer our own TimeStampReq with `openssl ts -reply`, and verify the token
// end-to-end with the extension's verifier — the same code the browser runs.

import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { utf8, textOf, bytesToHex, hexToBytes, crc32, sha256, stableStringify, bytesEqual } from '../extension/lib/hash.js';
import * as der from '../extension/lib/asn1.js';
import { parseCertificate, certToPem } from '../extension/lib/x509.js';
import { buildTimeStampReq, parseTimeStampReq, parseTimeStampResp, parseToken, verifyToken } from '../extension/lib/rfc3161.js';
import { createZip, readZip } from '../extension/lib/zip.js';
import { PdfDoc } from '../extension/lib/pdf.js';
import { buildReportPdf, buildVerifyTxt } from '../extension/lib/report.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, 'fixtures');
rmSync(FIX, { recursive: true, force: true });
mkdirSync(FIX, { recursive: true });

let passed = 0;
const failures = [];
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    failures.push([name, e]);
    console.error(`FAIL ${name}\n     ${e?.stack ?? e}`);
  }
}

function openssl(args, input = null) {
  return execFileSync('openssl', args, { input, cwd: FIX });
}

// ---------------------------------------------------------------------------
// asn1 / hash primitives
// ---------------------------------------------------------------------------

await test('crc32 known vector', () => {
  assert.equal(crc32(utf8('123456789')), 0xcbf43926);
});

await test('stableStringify is order-independent', () => {
  const a = stableStringify({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: 2 } });
  const b = stableStringify({ a: { c: 2, d: [3, { y: 2, z: 1 }] }, b: 1 });
  assert.equal(a, b);
});

await test('DER OID encode/decode round trip', () => {
  for (const oid of ['2.16.840.1.101.3.4.2.1', '1.2.840.113549.1.1.11', '1.3.132.0.34', '1.2.840.113549.1.9.16.1.4', '0.9.2342.19200300.100.1.25']) {
    const node = der.parseDer(der.oid(oid));
    assert.equal(der.oidToString(node), oid);
  }
});

await test('DER INTEGER encode/decode round trip', () => {
  for (const n of [0, 1, 127, 128, 255, 256, 65535, 1234567]) {
    const node = der.parseDer(der.int(n));
    assert.equal(der.intNumber(node), n);
  }
  // magnitude with high bit set gets a sign pad that decode strips
  const mag = hexToBytes('ff00aa');
  const node = der.parseDer(der.int(mag));
  assert.equal(bytesToHex(der.intBytes(node)), 'ff00aa');
});

await test('DER long-form lengths', () => {
  const big = new Uint8Array(300).fill(0x41);
  const node = der.parseDer(der.octet(big));
  assert.equal(node.content.length, 300);
  const bigger = new Uint8Array(70000).fill(0x42);
  assert.equal(der.parseDer(der.octet(bigger)).content.length, 70000);
});

await test('DER rejects trailing garbage and indefinite length', () => {
  const seq = der.seq(der.int(1));
  assert.throws(() => der.parseDer(new Uint8Array([...seq, 0x00])));
  assert.throws(() => der.parseDer(new Uint8Array([0x30, 0x80, 0x00, 0x00])));
});

await test('GeneralizedTime and UTCTime parsing', () => {
  const gt = der.parseDer(der.tlv(der.TAG.GENERALIZED_TIME, utf8('20260810173015Z')));
  assert.equal(der.parseTime(gt).iso, '2026-08-10T17:30:15Z');
  const ut = der.parseDer(der.tlv(der.TAG.UTC_TIME, utf8('260810173015Z')));
  assert.equal(der.parseTime(ut).iso, '2026-08-10T17:30:15Z');
  const old = der.parseDer(der.tlv(der.TAG.UTC_TIME, utf8('970810173015Z')));
  assert.equal(der.parseTime(old).iso, '1997-08-10T17:30:15Z');
});

// ---------------------------------------------------------------------------
// ZIP
// ---------------------------------------------------------------------------

const binary = new Uint8Array(4096);
for (let i = 0; i < binary.length; i++) binary[i] = i & 0xff;

await test('zip write → own reader round trip', async () => {
  const entries = [
    { name: 'report.pdf', data: utf8('%PDF-1.4 fake'), date: new Date('2026-08-10T12:00:00Z') },
    { name: 'timestamps/freetsa.tsr', data: binary, date: new Date('2026-08-10T12:00:00Z') },
    { name: 'metadata.json', data: utf8('{"a":1}'), date: new Date('2026-08-10T12:00:00Z') },
  ];
  const zip = createZip(entries);
  writeFileSync(join(FIX, 'roundtrip.zip'), zip);
  const map = await readZip(zip);
  assert.equal(map.size, 3);
  assert.ok(bytesEqual(map.get('timestamps/freetsa.tsr'), binary));
  assert.equal(textOf(map.get('metadata.json')), '{"a":1}');
});

await test('zip validates with unzip and python zipfile', () => {
  execFileSync('unzip', ['-t', join(FIX, 'roundtrip.zip')], { stdio: 'pipe' });
  const out = execFileSync('python3', ['-c', `
import zipfile
z = zipfile.ZipFile(${JSON.stringify(join(FIX, 'roundtrip.zip'))})
assert z.testzip() is None
assert sorted(z.namelist()) == ['metadata.json', 'report.pdf', 'timestamps/freetsa.tsr']
assert z.read('metadata.json') == b'{"a":1}'
print('python-ok')
`]);
  assert.ok(out.toString().includes('python-ok'));
});

await test('zip reader handles deflated archives from the zip CLI', async () => {
  const dir = join(FIX, 'rezip');
  mkdirSync(join(dir, 'timestamps'), { recursive: true });
  writeFileSync(join(dir, 'evidence-manifest.json'), '{"files":{}}');
  writeFileSync(join(dir, 'timestamps', 'a.tsr'), binary);
  execFileSync('zip', ['-r', '-q', join(FIX, 'deflated.zip'), '.'], { cwd: dir });
  const map = await readZip(new Uint8Array(readFileSync(join(FIX, 'deflated.zip'))));
  assert.equal(textOf(map.get('evidence-manifest.json')), '{"files":{}}');
  assert.ok(bytesEqual(map.get('timestamps/a.tsr'), binary));
});

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

function checkPdfStructure(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  assert.ok(s.startsWith('%PDF-1.4'), 'PDF header');
  assert.ok(s.endsWith('%%EOF\n'), 'PDF EOF');
  const m = s.match(/startxref\n(\d+)\n%%EOF\n$/);
  assert.ok(m, 'startxref present');
  const xrefPos = Number(m[1]);
  assert.ok(s.slice(xrefPos).startsWith('xref\n'), 'xref at declared offset');
  const lines = s.slice(xrefPos).split('\n');
  const count = Number(lines[1].split(' ')[1]);
  for (let i = 1; i < count; i++) {
    const off = Number(lines[2 + i].slice(0, 10));
    assert.ok(s.slice(off).startsWith(`${i} 0 obj`), `object ${i} at xref offset`);
  }
  return count;
}

await test('PdfDoc produces structurally valid multi-page PDF', () => {
  const doc = new PdfDoc({ title: 'Test — “smart quotes” & (parens)', created: new Date('2026-08-10T12:00:00Z'), footerLeft: 'footer' });
  doc.heading('Section one');
  doc.kv('A very long URL', 'https://example.com/' + 'x'.repeat(300), { mono: true });
  doc.kv('Hash', 'a'.repeat(64), { mono: true });
  for (let i = 0; i < 80; i++) doc.para(`Paragraph ${i} with some flowing text that wraps around the page and forces pagination sooner or later.`);
  const bytes = doc.finish();
  writeFileSync(join(FIX, 'sample.pdf'), bytes);
  const objCount = checkPdfStructure(bytes);
  assert.ok(objCount > 8, 'has objects');
  assert.ok(doc.pages.length > 1, 'paginated');
});

const fakeTs = (id, ok) => ok ? {
  id, name: id, url: `https://tsa.example/${id}`, caNote: 'https://tsa.example/ca.pem', ok: true,
  genTime: '2026-08-10T12:00:05Z', serialHex: '0102ab', policyOid: '1.3.6.1.4.1.55555.1.1',
  accuracy: { seconds: 1 }, signerSubject: 'CN=Test TSA, O=Test', signerIssuer: 'CN=Test Root, O=Test',
  signatureVerified: true, allChecksOk: true, ms: 350,
} : { id, name: id, url: `https://tsa.example/${id}`, caNote: null, ok: false, error: 'HTTP 503', ms: 120 };

const reportModel = {
  captureId: 'e6c1a2b3-1111-2222-3333-444455556666',
  tool: { name: 'WebNotary', version: '0.1.0' },
  url: 'https://example.com/some/long/path?query=1',
  finalUrl: 'https://example.com/some/long/path?query=1',
  title: 'Example page — evidence',
  times: { startedUtc: '2026-08-10T12:00:00Z', completedUtc: '2026-08-10T12:00:04Z', timezone: { timeZone: 'America/Chicago', offsetMinutes: -300 } },
  operator: { name: 'Jordan Rivera', organization: 'Rivera LLP', matter: '2026-CV-0412', notes: 'Homepage claim capture' },
  artifacts: [
    { name: 'capture.mhtml', size: 123456, sha256: 'a'.repeat(64) },
    { name: 'screenshot-fullpage.png', size: 234567, sha256: 'b'.repeat(64) },
    { name: 'metadata.json', size: 4567, sha256: 'c'.repeat(64) },
  ],
  manifestSha256: 'd'.repeat(64),
  timestamps: [fakeTs('freetsa', true), fakeTs('digicert', false)],
  environment: {
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/139.0.0.0 Safari/537.36',
    platform: 'Linux', viewport: '1280 × 800 CSS px', pageDims: '1280 × 4200 CSS px', devicePixelRatio: 2,
    screenshotDesc: 'Full page, 1280 × 4200 px PNG', contentType: 'text/html', charset: 'UTF-8',
    lastModified: '08/10/2026 11:59:31', referrer: null, protocol: 'h2', transferSize: 51234,
    resourceCount: 42, resourcesTruncated: false, frameCount: 1,
  },
  preview: null,
  screenshotName: 'screenshot-fullpage.png',
  screenshotTruncated: false,
};

await test('buildReportPdf renders the chain-of-custody report', () => {
  const bytes = buildReportPdf(reportModel);
  writeFileSync(join(FIX, 'report.pdf'), bytes);
  checkPdfStructure(bytes);
});

await test('buildVerifyTxt includes digests and commands', () => {
  const txt = buildVerifyTxt(reportModel);
  assert.ok(txt.includes('d'.repeat(64)));
  assert.ok(txt.includes('openssl ts -verify -data evidence-manifest.json'));
  assert.ok(txt.includes('capture.mhtml'));
});

// ---------------------------------------------------------------------------
// RFC 3161 against a real OpenSSL TSA (RSA + ECDSA)
// ---------------------------------------------------------------------------

const SUBJ_CA = '/CN=WebNotary Test Root CA/O=WebNotary Test';

function setupLocalTsa() {
  writeFileSync(join(FIX, 'tsa_ext.cnf'), [
    'basicConstraints=CA:FALSE',
    'extendedKeyUsage=critical,timeStamping',
    'subjectKeyIdentifier=hash',
  ].join('\n') + '\n');
  writeFileSync(join(FIX, 'tsa.cnf'), [
    '[tsa]',
    'default_tsa = tsa_config1',
    '[tsa_config1]',
    `serial = ${join(FIX, 'tsaserial')}`,
    'default_policy = 1.3.6.1.4.1.55555.1.1',
    'digests = sha256, sha384, sha512',
    'accuracy = secs:1',
    'ordering = no',
    'tsa_name = no',
    'ess_cert_id_chain = no',
    'ess_cert_id_alg = sha256',
    'signer_digest = sha256',
  ].join('\n') + '\n');

  openssl(['req', '-x509', '-newkey', 'rsa:2048', '-sha256', '-keyout', 'ca.key', '-out', 'ca.crt',
    '-days', '3', '-nodes', '-subj', SUBJ_CA]);
  openssl(['req', '-newkey', 'rsa:2048', '-sha256', '-keyout', 'tsa-rsa.key', '-out', 'tsa-rsa.csr',
    '-nodes', '-subj', '/CN=WebNotary Test TSA RSA/O=WebNotary Test']);
  openssl(['x509', '-req', '-in', 'tsa-rsa.csr', '-CA', 'ca.crt', '-CAkey', 'ca.key', '-CAcreateserial',
    '-out', 'tsa-rsa.crt', '-days', '2', '-sha256', '-extfile', 'tsa_ext.cnf']);
  openssl(['ecparam', '-name', 'prime256v1', '-genkey', '-noout', '-out', 'tsa-ec.key']);
  openssl(['req', '-new', '-key', 'tsa-ec.key', '-out', 'tsa-ec.csr',
    '-subj', '/CN=WebNotary Test TSA EC/O=WebNotary Test']);
  openssl(['x509', '-req', '-in', 'tsa-ec.csr', '-CA', 'ca.crt', '-CAkey', 'ca.key', '-CAcreateserial',
    '-out', 'tsa-ec.crt', '-days', '2', '-sha256', '-extfile', 'tsa_ext.cnf']);
}

function tsaReply(tsqName, signer, key, outName) {
  openssl(['ts', '-reply', '-queryfile', tsqName, '-signer', signer, '-inkey', key,
    '-chain', 'ca.crt', '-out', outName, '-config', 'tsa.cnf']);
  return new Uint8Array(readFileSync(join(FIX, outName)));
}

const evidence = utf8(stableStringify({ files: { 'capture.mhtml': 'ab'.repeat(32) }, captureId: 'test' }));
const imprint = await sha256(evidence);
let tsq;
let nonceHex;

await test('TimeStampReq builds and OpenSSL accepts it', () => {
  ({ tsq, nonceHex } = buildTimeStampReq(imprint));
  writeFileSync(join(FIX, 'req.tsq'), tsq);
  const text = openssl(['ts', '-query', '-in', 'req.tsq', '-text']).toString();
  assert.ok(/sha256/i.test(text), 'imprint algorithm is sha256');
  assert.ok(text.includes(bytesToHex(imprint).toUpperCase().replace(/(..)/g, '$1 ').trim().slice(0, 20).toUpperCase())
    || /Message data/i.test(text), 'query parses');
  assert.ok(/Nonce/i.test(text), 'nonce present');
  assert.ok(/cert_req/i.test(text) || /Cert.*yes/i.test(text), 'certReq set');
});

await test('own TSQ parser recovers imprint and nonce', () => {
  const parsed = parseTimeStampReq(tsq);
  assert.equal(bytesToHex(parsed.imprintHash), bytesToHex(imprint));
  assert.equal(parsed.nonceHex, nonceHex);
  assert.equal(parsed.certReq, true);
  assert.equal(parsed.version, 1);
});

let rsaTsr;

await test('OpenSSL TSA (RSA) grants; verifyToken passes all checks', async () => {
  setupLocalTsa();
  rsaTsr = tsaReply('req.tsq', 'tsa-rsa.crt', 'tsa-rsa.key', 'rsa.tsr');
  const resp = parseTimeStampResp(rsaTsr);
  assert.equal(resp.granted, true);
  const verdict = await verifyToken(rsaTsr, { expectedImprint: imprint, expectedNonceHex: nonceHex });
  for (const c of verdict.checks) {
    assert.ok(c.ok || !c.critical, `check failed: ${c.id} (${c.detail})`);
  }
  assert.equal(verdict.ok, true);
  assert.ok(verdict.checks.find((c) => c.id === 'signature')?.ok, 'CMS signature verified');
  assert.ok(verdict.checks.find((c) => c.id === 'ess-cert')?.ok, 'ESS cert binding verified');
  const dt = Math.abs(verdict.tstInfo.genTime.date.getTime() - Date.now());
  assert.ok(dt < 3600_000, 'genTime is fresh');
  assert.equal(verdict.signerCert.subject.map.CN, 'WebNotary Test TSA RSA');
});

await test('OpenSSL TSA (ECDSA P-256) token verifies', async () => {
  const { tsq: tsq2, nonceHex: nonce2 } = buildTimeStampReq(imprint);
  writeFileSync(join(FIX, 'req2.tsq'), tsq2);
  const ecTsr = tsaReply('req2.tsq', 'tsa-ec.crt', 'tsa-ec.key', 'ec.tsr');
  const verdict = await verifyToken(ecTsr, { expectedImprint: imprint, expectedNonceHex: nonce2 });
  assert.equal(verdict.ok, true, JSON.stringify(verdict.checks.filter((c) => !c.ok)));
  assert.ok(verdict.checks.find((c) => c.id === 'signature')?.ok, 'ECDSA signature verified');
});

await test('wrong imprint is rejected', async () => {
  const wrong = await sha256(utf8('some other document'));
  const verdict = await verifyToken(rsaTsr, { expectedImprint: wrong, expectedNonceHex: nonceHex });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.checks.find((c) => c.id === 'imprint')?.ok, false);
});

await test('wrong nonce is rejected', async () => {
  const verdict = await verifyToken(rsaTsr, { expectedImprint: imprint, expectedNonceHex: 'deadbeefdeadbeef' });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.checks.find((c) => c.id === 'nonce')?.ok, false);
});

await test('tampered TSTInfo content breaks verification', async () => {
  const resp = parseTimeStampResp(rsaTsr);
  const token = parseToken(resp.tokenRaw);
  // eContentBytes is a live view into the tsr buffer — locate and flip one byte.
  const offset = token.eContentBytes.byteOffset - (rsaTsr.byteOffset ?? 0) + Math.floor(token.eContentBytes.length / 2);
  const tampered = Uint8Array.from(rsaTsr);
  tampered[offset] ^= 0x01;
  const verdict = await verifyToken(tampered, { expectedImprint: imprint, expectedNonceHex: nonceHex });
  assert.equal(verdict.ok, false);
});

await test('bare token (ContentInfo without TimeStampResp) verifies', async () => {
  openssl(['ts', '-reply', '-queryfile', 'req.tsq', '-signer', 'tsa-rsa.crt', '-inkey', 'tsa-rsa.key',
    '-chain', 'ca.crt', '-token_out', '-out', 'bare.token', '-config', 'tsa.cnf']);
  const bare = new Uint8Array(readFileSync(join(FIX, 'bare.token')));
  const verdict = await verifyToken(bare, { expectedImprint: imprint });
  assert.equal(verdict.ok, true, JSON.stringify(verdict.checks.filter((c) => !c.ok)));
});

await test('OpenSSL cross-verifies structure of our request (ts -verify)', () => {
  const out = openssl(['ts', '-verify', '-queryfile', 'req.tsq', '-in', 'rsa.tsr',
    '-CAfile', 'ca.crt', '-untrusted', 'tsa-rsa.crt']).toString();
  assert.ok(out.includes('Verification: OK'));
});

// ---------------------------------------------------------------------------
// x509
// ---------------------------------------------------------------------------

await test('parseCertificate extracts signer identity and validity', () => {
  openssl(['x509', '-in', 'tsa-rsa.crt', '-outform', 'DER', '-out', 'tsa-rsa.der']);
  const certDer = new Uint8Array(readFileSync(join(FIX, 'tsa-rsa.der')));
  const cert = parseCertificate(certDer);
  assert.equal(cert.subject.map.CN, 'WebNotary Test TSA RSA');
  assert.equal(cert.subject.map.O, 'WebNotary Test');
  assert.equal(cert.issuer.map.CN, 'WebNotary Test Root CA');
  assert.equal(cert.spkiAlgOid, '1.2.840.113549.1.1.1');
  assert.ok(cert.notBefore.date.getTime() < Date.now());
  assert.ok(cert.notAfter.date.getTime() > Date.now());
  assert.ok(cert.ski && cert.ski.length === 20, 'SKI extension parsed');
  const pem = certToPem(certDer);
  assert.ok(pem.startsWith('-----BEGIN CERTIFICATE-----\n'));
  assert.ok(pem.trimEnd().endsWith('-----END CERTIFICATE-----'));
});

// ---------------------------------------------------------------------------
// End-to-end bundle: build like the service worker, verify like the verify page
// ---------------------------------------------------------------------------

await test('bundle round trip: manifest digests + token verify from ZIP', async () => {
  const mhtml = utf8('From: <Saved by WebNotary>\nSubject: test\n\n<html>evidence</html>');
  const meta = utf8(stableStringify({ format: 'webnotary-capture-metadata', captureId: 'e2e' }));
  const files = {};
  files['capture.mhtml'] = bytesToHex(await sha256(mhtml));
  files['metadata.json'] = bytesToHex(await sha256(meta));
  const manifestBytes = utf8(stableStringify({ format: 'webnotary-evidence-manifest', captureId: 'e2e', hashAlgorithm: 'SHA-256', files }));
  const manifestHash = await sha256(manifestBytes);

  const { tsq: tsq3, nonceHex: nonce3 } = buildTimeStampReq(manifestHash);
  writeFileSync(join(FIX, 'req3.tsq'), tsq3);
  const tsr3 = tsaReply('req3.tsq', 'tsa-rsa.crt', 'tsa-rsa.key', 'e2e.tsr');

  const zip = createZip([
    { name: 'evidence-manifest.json', data: manifestBytes },
    { name: 'capture.mhtml', data: mhtml },
    { name: 'metadata.json', data: meta },
    { name: 'timestamps/local.tsq', data: tsq3 },
    { name: 'timestamps/local.tsr', data: tsr3 },
  ]);

  // Reproduce the verify page's pipeline.
  const map = await readZip(zip);
  const manifest = JSON.parse(textOf(map.get('evidence-manifest.json')));
  for (const [name, expected] of Object.entries(manifest.files)) {
    assert.equal(bytesToHex(await sha256(map.get(name))), expected, `digest ${name}`);
  }
  const mh = await sha256(map.get('evidence-manifest.json'));
  const req = parseTimeStampReq(map.get('timestamps/local.tsq'));
  assert.equal(bytesToHex(req.imprintHash), bytesToHex(mh), 'tsq covers manifest');
  const verdict = await verifyToken(map.get('timestamps/local.tsr'), { expectedImprint: mh, expectedNonceHex: req.nonceHex });
  assert.equal(verdict.ok, true, JSON.stringify(verdict.checks.filter((c) => !c.ok)));
});

// ---------------------------------------------------------------------------

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
