// Builds the chain-of-custody PDF report and the plain-text VERIFY.txt that
// ship inside every evidence bundle.

import { PdfDoc } from './pdf.js';

const NAVY = [0.07, 0.13, 0.26];
const WHITE = [1, 1, 1];
const LIGHT = [0.78, 0.83, 0.92];
const GREEN = [0.09, 0.42, 0.22];
const RED = [0.64, 0.11, 0.11];
const MUTED = [0.42, 0.45, 0.5];

const fmtBytes = (n) => n == null ? '—'
  : n < 1024 ? `${n} B`
  : n < 1048576 ? `${(n / 1024).toFixed(1)} KB`
  : `${(n / 1048576).toFixed(2)} MB`;

export function buildReportPdf(m) {
  const doc = new PdfDoc({
    title: `WebNotary evidence report — ${m.captureId}`,
    producer: `WebNotary ${m.tool.version}`,
    created: new Date(m.times.completedUtc),
    footerLeft: `WebNotary evidence report — capture ${m.captureId}`,
  });

  doc.rect(0, 0, doc.pageW, 80, NAVY);
  doc.drawText('WEBNOTARY', doc.margin, 34, { font: 'F2', size: 16, color: WHITE });
  doc.drawText('EVIDENCE CAPTURE & CHAIN-OF-CUSTODY REPORT', doc.margin, 52, { font: 'F1', size: 9.5, color: LIGHT });
  doc.drawTextRight(`Capture ${m.captureId}`, doc.pageW - doc.margin, 34, { font: 'F3', size: 7.6, color: LIGHT });
  doc.drawTextRight(m.times.completedUtc, doc.pageW - doc.margin, 46, { font: 'F3', size: 7.6, color: LIGHT });
  doc.cursor = 98;

  doc.heading('Capture summary');
  doc.kv('Capture ID', m.captureId, { mono: true });
  doc.kv('Captured URL', m.url, { mono: true });
  if (m.finalUrl && m.finalUrl !== m.url) doc.kv('Final URL (after redirects)', m.finalUrl, { mono: true });
  doc.kv('Page title', m.title || '—');
  doc.kv('Capture started (UTC)', m.times.startedUtc);
  doc.kv('Capture completed (UTC)', m.times.completedUtc);
  if (m.times.timezone) {
    doc.kv('Operator time zone', `${m.times.timezone.timeZone ?? '—'} (UTC${m.times.timezone.offsetMinutes >= 0 ? '+' : ''}${(m.times.timezone.offsetMinutes ?? 0) / 60})`);
  }
  doc.kv('Operator', m.operator.name || '—');
  doc.kv('Organization', m.operator.organization || '—');
  doc.kv('Matter / case reference', m.operator.matter || '—');
  if (m.operator.notes) doc.kv('Notes', m.operator.notes);

  doc.heading('Trusted timestamps (RFC 3161)');
  const okTs = m.timestamps.filter((t) => t.ok);
  if (!okTs.length) {
    doc.para('NO TRUSTED TIMESTAMP WAS OBTAINED FOR THIS CAPTURE.', { font: 'F2', size: 10, color: RED });
    doc.para('All configured time-stamping authorities failed at capture time (details below). The SHA-256 digests in this report still fix the content of every artifact, but the capture time rests on the operator’s system clock alone.', { color: RED });
    doc.vspace(4);
  } else {
    doc.para(`The SHA-256 digest of evidence-manifest.json was submitted to ${okTs.length} independent time-stamping authorit${okTs.length === 1 ? 'y' : 'ies'}. Each signed token below attests that this exact digest existed no later than the attested time.`, { color: MUTED });
    doc.vspace(4);
  }
  for (const t of m.timestamps) {
    if (t.ok) {
      doc.ensure(30);
      doc.para(`${t.name} — GRANTED`, { font: 'F2', size: 9.8, color: GREEN });
      doc.kv('Attested time (UTC)', `${t.genTime}${t.accuracy?.seconds != null ? `  (accuracy ±${t.accuracy.seconds}s)` : ''}`);
      doc.kv('TSA URL', t.url, { mono: true });
      doc.kv('Token serial', t.serialHex, { mono: true });
      doc.kv('Policy OID', t.policyOid, { mono: true });
      doc.kv('Signer', t.signerSubject || '—');
      doc.kv('Signer issuer', t.signerIssuer || '—');
      doc.kv('Signature check', t.signatureVerified
        ? 'Verified at capture against the TSA certificate embedded in the token'
        : 'Not verified in-extension — run the OpenSSL command in VERIFY.txt');
      doc.kv('Token files', `timestamps/${t.id}.tsr (request: ${t.id}.tsq)`, { mono: true });
    } else {
      doc.ensure(16);
      doc.para(`${t.name} — FAILED: ${t.error}`, { font: 'F2', size: 9.2, color: RED });
      doc.kv('TSA URL', t.url, { mono: true });
    }
    doc.vspace(3);
  }
  doc.kv('Timestamped digest', `SHA-256(evidence-manifest.json) = ${m.manifestSha256}`, { mono: true });

  doc.heading('Artifact digests (SHA-256)');
  for (const a of m.artifacts) {
    doc.kv(`${a.name}  (${fmtBytes(a.size)})`, a.sha256, { mono: true });
  }
  doc.kv('evidence-manifest.json', m.manifestSha256, { mono: true });
  doc.para('Any alteration of an artifact changes its SHA-256 digest; any alteration of the digest list changes the manifest digest that the timestamp tokens cover.', { size: 8.2, color: MUTED });

  doc.heading('Capture environment');
  const e = m.environment;
  doc.kv('Browser', e.userAgent || '—');
  if (e.platform) doc.kv('Platform', e.platform);
  doc.kv('WebNotary version', m.tool.version);
  doc.kv('Viewport', e.viewport || '—');
  doc.kv('Full page size (CSS px)', e.pageDims || '—');
  if (e.devicePixelRatio != null) doc.kv('Device pixel ratio', String(e.devicePixelRatio));
  doc.kv('Screenshot', e.screenshotDesc || 'not captured');
  if (e.contentType) doc.kv('Document content type', `${e.contentType}${e.charset ? `; charset ${e.charset}` : ''}`);
  if (e.lastModified) doc.kv('Document lastModified', e.lastModified);
  if (e.referrer) doc.kv('Referrer', e.referrer, { mono: true });
  if (e.protocol) doc.kv('Network protocol', e.protocol);
  if (e.transferSize != null) doc.kv('Main document transfer size', fmtBytes(e.transferSize));
  if (e.resourceCount != null) doc.kv('Subresources recorded', `${e.resourceCount}${e.resourcesTruncated ? ' (list truncated in metadata.json)' : ''}`);
  if (e.frameCount != null) doc.kv('Iframes on page', String(e.frameCount));

  doc.heading('How to verify this capture');
  doc.para('1.  Recompute each artifact digest and compare with the table above and with evidence-manifest.json:');
  doc.mono(`sha256sum ${m.artifacts.map((a) => a.name).join(' ')}`);
  doc.para('2.  Recompute the manifest digest — it must equal the timestamped value:');
  doc.mono('sha256sum evidence-manifest.json');
  doc.mono(`expected: ${m.manifestSha256}`);
  doc.para('3.  Inspect and cryptographically verify each RFC 3161 token (example for the first TSA):');
  if (okTs.length) {
    doc.mono(`openssl ts -reply -in timestamps/${okTs[0].id}.tsr -text`);
    doc.mono(`openssl ts -verify -data evidence-manifest.json -in timestamps/${okTs[0].id}.tsr \\`);
    doc.mono(`  -untrusted timestamps/${okTs[0].id}-certs.pem -CAfile <TSA root CA .pem>`);
  } else {
    doc.mono('(no tokens present in this bundle)');
  }
  doc.para('4.  Or open the WebNotary "Verify bundle" page and drop the entire .zip — hashes and tokens are re-checked locally.');

  doc.heading('Scope & limitations');
  doc.para('This capture was performed client-side from the operator’s own browser session. The artifacts reflect what that browser received and rendered at capture time, including any session state or personalization in effect.');
  doc.para('The RFC 3161 tokens prove that these exact bytes existed, unaltered, no later than the attested times (existence and integrity). They do not by themselves prove that a remote server transmitted the content; the MHTML archive and metadata.json record source URLs and network characteristics in support of that inference.');
  doc.para('Times labeled UTC in the capture summary come from the operator’s system clock and are informational. The TSA-attested times are the authoritative time anchors.');
  doc.para('These materials are designed to support authentication of electronic evidence — e.g., testimony describing this automated process (FRE 901(b)(9)) and self-authentication of records generated by an electronic process or system (FRE 902(13)) or of copies of electronic data authenticated by a process of digital identification such as hashing (FRE 902(14)). Admissibility is always determined by the tribunal; nothing in this report is legal advice.');

  doc.heading('Operator declaration');
  doc.para('I declare that I initiated this capture with WebNotary, that the artifacts listed above were produced by the automated process described in this report without modification, and that this bundle has remained in my custody or in unaltered storage since capture.');
  doc.ensure(64);
  doc.vspace(34);
  const y = doc.cursor;
  doc.line(doc.margin, y, doc.margin + 220, y, [0.3, 0.3, 0.35], 0.8);
  doc.line(doc.margin + 280, y, doc.margin + 420, y, [0.3, 0.3, 0.35], 0.8);
  doc.drawText('Operator signature', doc.margin, y + 11, { size: 7.6, color: MUTED });
  doc.drawText('Date', doc.margin + 280, y + 11, { size: 7.6, color: MUTED });
  doc.vspace(20);

  if (m.preview) {
    doc.newPage();
    doc.heading('Captured page preview');
    doc.addImage(m.preview, {
      maxH: 560,
      caption: `Downscaled preview of ${m.screenshotName ?? 'the captured screenshot'}. The PNG artifact and its SHA-256 digest are authoritative.${m.screenshotTruncated ? ' Note: the page exceeded the maximum capture height; the screenshot covers the top portion (see metadata.json).' : ''}`,
    });
  }

  return doc.finish();
}

export function buildVerifyTxt(m) {
  const okTs = m.timestamps.filter((t) => t.ok);
  const lines = [];
  const push = (...ls) => lines.push(...ls);
  push(
    '================================================================',
    ' WEBNOTARY EVIDENCE BUNDLE — VERIFICATION GUIDE',
    '================================================================',
    '',
    `Capture ID:        ${m.captureId}`,
    `Captured URL:      ${m.url}`,
    `Capture completed: ${m.times.completedUtc}`,
    `WebNotary version: ${m.tool.version}`,
    '',
    'This bundle is self-verifying. Anyone with standard tools can',
    'confirm (a) the artifacts are unaltered and (b) they existed no',
    'later than the TSA-attested times. No WebNotary software needed.',
    '',
    '----------------------------------------------------------------',
    '1. VERIFY ARTIFACT DIGESTS',
    '----------------------------------------------------------------',
    'Expected SHA-256 digests (also listed in evidence-manifest.json):',
    '',
  );
  for (const a of m.artifacts) push(`  ${a.sha256}  ${a.name}`);
  push(
    '',
    `  $ sha256sum ${m.artifacts.map((a) => a.name).join(' ')}`,
    '',
    '----------------------------------------------------------------',
    '2. VERIFY THE MANIFEST DIGEST (the timestamped value)',
    '----------------------------------------------------------------',
    '  $ sha256sum evidence-manifest.json',
    `  expected: ${m.manifestSha256}`,
    '',
    '----------------------------------------------------------------',
    '3. VERIFY THE RFC 3161 TIMESTAMP TOKEN(S)',
    '----------------------------------------------------------------',
  );
  if (!okTs.length) {
    push('  (No tokens were obtained for this capture — all configured', '  TSAs failed. See report.pdf for details.)');
  }
  for (const t of okTs) {
    push(
      '',
      `  ${t.name} — attested ${t.genTime}`,
      `    token:   timestamps/${t.id}.tsr`,
      `    request: timestamps/${t.id}.tsq (contains the nonce)`,
      `    TSA URL: ${t.url}`,
      '',
      `    $ openssl ts -reply -in timestamps/${t.id}.tsr -text`,
      `    $ openssl ts -verify -data evidence-manifest.json \\`,
      `        -in timestamps/${t.id}.tsr \\`,
      `        -untrusted timestamps/${t.id}-certs.pem \\`,
      `        -CAfile <root CA for ${t.name}>`,
      ...(t.caNote ? [`    Root CA: ${t.caNote}`] : []),
    );
  }
  push(
    '',
    '  The -CAfile root certificate is published by each TSA. The',
    '  intermediate/signing certificates extracted from each token are',
    '  included as timestamps/<tsa>-certs.pem.',
    '',
    '----------------------------------------------------------------',
    '4. WHAT THIS PROVES',
    '----------------------------------------------------------------',
    '  * Integrity: any change to an artifact changes its SHA-256',
    '    digest and breaks step 1 or 2.',
    '  * Existence by a fixed time: each valid RFC 3161 token is a',
    '    TSA’s signature over the manifest digest plus the attested',
    '    time, so the artifacts existed in exactly this form no later',
    '    than that time.',
    '  * report.pdf and VERIFY.txt are generated after timestamping',
    '    and are therefore documentation, not timestamped artifacts.',
    '',
    'Generated by WebNotary. All processing occurred locally in the',
    'operator’s browser; only the 32-byte manifest digest (plus a',
    'random nonce) was sent to the TSA(s) above.',
    '',
  );
  return lines.join('\n');
}
