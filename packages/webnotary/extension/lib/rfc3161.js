// RFC 3161 time-stamp protocol: request building, transport, response parsing,
// and token verification.
//
// Verification scope (in-extension): PKI status, TSTInfo message imprint vs the
// evidence digest, request nonce, CMS signed attributes (messageDigest,
// contentType), the ESS signingCertificate binding, and the CMS signature
// against the signer certificate embedded in the token (RSA PKCS#1 v1.5,
// RSA-PSS, ECDSA P-256/384/521). Chain-of-trust to the TSA's root CA is left to
// the OpenSSL command documented in every bundle's VERIFY.txt — a browser
// extension has no business shipping its own trust store.

import * as der from './asn1.js';
import { TAG, parseDer, oidToString, intBytes, intNumber, parseTime } from './asn1.js';
import { digestBytes, bytesToHex, bytesEqual, randomBytes, textOf } from './hash.js';
import { parseCertificate, parseName } from './x509.js';

export const OID = {
  sha1: '1.3.14.3.2.26',
  sha256: '2.16.840.1.101.3.4.2.1',
  sha384: '2.16.840.1.101.3.4.2.2',
  sha512: '2.16.840.1.101.3.4.2.3',
  signedData: '1.2.840.113549.1.7.2',
  tstInfo: '1.2.840.113549.1.9.16.1.4',
  attrContentType: '1.2.840.113549.1.9.3',
  attrMessageDigest: '1.2.840.113549.1.9.4',
  attrSigningCert: '1.2.840.113549.1.9.16.2.12',
  attrSigningCertV2: '1.2.840.113549.1.9.16.2.47',
  rsaEncryption: '1.2.840.113549.1.1.1',
  sha1Rsa: '1.2.840.113549.1.1.5',
  sha256Rsa: '1.2.840.113549.1.1.11',
  sha384Rsa: '1.2.840.113549.1.1.12',
  sha512Rsa: '1.2.840.113549.1.1.13',
  rsaPss: '1.2.840.113549.1.1.10',
  ecPublicKey: '1.2.840.10045.2.1',
  ecdsaSha256: '1.2.840.10045.4.3.2',
  ecdsaSha384: '1.2.840.10045.4.3.3',
  ecdsaSha512: '1.2.840.10045.4.3.4',
  p256: '1.2.840.10045.3.1.7',
  p384: '1.3.132.0.34',
  p521: '1.3.132.0.35',
};

const DIGEST_NAME = {
  [OID.sha1]: 'SHA-1',
  [OID.sha256]: 'SHA-256',
  [OID.sha384]: 'SHA-384',
  [OID.sha512]: 'SHA-512',
};
const CURVE_NAME = { [OID.p256]: 'P-256', [OID.p384]: 'P-384', [OID.p521]: 'P-521' };
const CURVE_BYTES = { 'P-256': 32, 'P-384': 48, 'P-521': 66 };

export const PKI_STATUS = {
  0: 'granted',
  1: 'grantedWithMods',
  2: 'rejection',
  3: 'waiting',
  4: 'revocationWarning',
  5: 'revocationNotification',
};

const FAIL_INFO = {
  0: 'badAlg', 2: 'badRequest', 5: 'badDataFormat', 14: 'timeNotAvailable',
  15: 'unacceptedPolicy', 16: 'unacceptedExtension', 17: 'addInfoNotAvailable', 25: 'systemFailure',
};

function minimalMagnitude(bytes) {
  let i = 0;
  while (i < bytes.length - 1 && bytes[i] === 0) i++;
  return bytes.subarray(i);
}

const normHex = (h) => ((h ?? '').replace(/^(00)+/, '').toLowerCase()) || null;

// ---------------------------------------------------------------------------
// Request
// ---------------------------------------------------------------------------

// TimeStampReq ::= SEQUENCE { version 1, messageImprint, nonce, certReq TRUE }
// (reqPolicy omitted — the TSA picks its default policy.)
export function buildTimeStampReq(imprint, { nonce = randomBytes(8), certReq = true } = {}) {
  const nonceMin = minimalMagnitude(nonce);
  const tsq = der.seq(
    der.int(1),
    der.seq(der.seq(der.oid(OID.sha256), der.nullDer()), der.octet(imprint)),
    der.int(nonceMin),
    der.bool(certReq),
  );
  return { tsq, nonceHex: bytesToHex(nonceMin) };
}

export function parseTimeStampReq(bytes) {
  const c = parseDer(bytes).children;
  let i = 0;
  const version = intNumber(c[i++]);
  const imprintSeq = c[i++];
  const imprintAlgOid = oidToString(imprintSeq.children[0].children[0]);
  const imprintHash = imprintSeq.children[1].content;
  let nonceHex = null;
  let certReq = false;
  for (; i < c.length; i++) {
    if (c[i].tag === TAG.INTEGER) nonceHex = bytesToHex(intBytes(c[i]));
    else if (c[i].tag === TAG.BOOLEAN) certReq = c[i].content[0] !== 0;
  }
  return { version, imprintAlgOid, imprintHash, nonceHex, certReq };
}

export async function fetchTimestamp(url, tsq, { timeoutMs = 20000, fetchImpl = globalThis.fetch } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/timestamp-query' },
      body: tsq,
      signal: ctrl.signal,
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`TSA returned HTTP ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  } catch (e) {
    if (e.name === 'AbortError') throw new Error(`TSA did not respond within ${timeoutMs / 1000}s`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

function failInfoBits(node) {
  const names = [];
  const b = node.content;
  if (b.length < 1) return names;
  const bits = (b.length - 1) * 8 - b[0];
  for (let n = 0; n < bits; n++) {
    if (b[1 + (n >> 3)] & (0x80 >> (n & 7))) names.push(FAIL_INFO[n] ?? `bit${n}`);
  }
  return names;
}

// Accepts a full TimeStampResp or a bare timeStampToken (ContentInfo): the two
// are distinguished by the first child (PKIStatusInfo SEQUENCE vs OID).
export function parseTimeStampResp(bytes) {
  const top = parseDer(bytes);
  if (top.tag !== TAG.SEQUENCE || !top.children?.length) throw new Error('not a TimeStampResp');
  const first = top.children[0];
  if (first.tag === TAG.OID) {
    return { statusCode: 0, statusName: 'granted', statusStrings: [], failInfo: [], granted: true, tokenRaw: top.raw, bareToken: true };
  }
  const statusCode = intNumber(first.children[0]);
  let statusStrings = [];
  let failInfo = [];
  for (let i = 1; i < first.children.length; i++) {
    const c = first.children[i];
    if (c.tag === TAG.SEQUENCE) statusStrings = c.children.map((s) => { try { return textOf(s.content); } catch { return ''; } });
    else if (c.tag === TAG.BIT_STRING) failInfo = failInfoBits(c);
  }
  return {
    statusCode,
    statusName: PKI_STATUS[statusCode] ?? String(statusCode),
    statusStrings,
    failInfo,
    granted: statusCode === 0 || statusCode === 1,
    tokenRaw: top.children.length > 1 ? top.children[1].raw : null,
    bareToken: false,
  };
}

function parseSignerInfo(node) {
  const c = node.children;
  let i = 0;
  const version = intNumber(c[i++]);
  const sidNode = c[i++];
  let sid;
  if (sidNode.cls === 2 && sidNode.tagNum === 0) {
    sid = { type: 'ski', ski: sidNode.constructed ? sidNode.children[0].content : sidNode.content };
  } else {
    sid = { type: 'issuerSerial', issuerRaw: sidNode.children[0].raw, serial: intBytes(sidNode.children[1]) };
  }
  const digestAlgOid = oidToString(c[i++].children[0]);
  let signedAttrsNode = null;
  if (c[i]?.cls === 2 && c[i].tagNum === 0) signedAttrsNode = c[i++];
  const sigAlgSeq = c[i++];
  const sigAlgOid = oidToString(sigAlgSeq.children[0]);
  const sigAlgParams = sigAlgSeq.children[1] ?? null;
  const signature = c[i++].content;
  const attrs = [];
  if (signedAttrsNode) {
    for (const a of signedAttrsNode.children) {
      attrs.push({ oid: oidToString(a.children[0]), values: a.children[1].children });
    }
  }
  return { version, sid, digestAlgOid, signedAttrsNode, attrs, sigAlgOid, sigAlgParams, signature };
}

function ctxInt(node) {
  let v = 0;
  for (const b of node.content) v = v * 256 + b;
  return v;
}

function generalNameText(tsaNode) {
  // tsa [0] EXPLICIT GeneralName
  const gn = tsaNode.children?.[0];
  if (!gn) return null;
  if (gn.tagNum === 4) return parseName(gn.children[0]).text; // directoryName
  if (gn.tagNum === 2 || gn.tagNum === 6) return textOf(gn.content); // dNSName / URI
  return null;
}

export function parseTstInfo(bytes) {
  const c = parseDer(bytes).children;
  let i = 0;
  const version = intNumber(c[i++]);
  const policyOid = oidToString(c[i++]);
  const imprintSeq = c[i++];
  const imprintAlgOid = oidToString(imprintSeq.children[0].children[0]);
  const imprintHash = imprintSeq.children[1].content;
  const serialHex = bytesToHex(intBytes(c[i++]));
  const genTime = parseTime(c[i++]);
  let accuracy = null;
  let ordering = false;
  let nonceHex = null;
  let tsaText = null;
  for (; i < c.length; i++) {
    const n = c[i];
    if (n.tag === TAG.SEQUENCE && !accuracy) {
      accuracy = {};
      for (const a of n.children) {
        if (a.tag === TAG.INTEGER) accuracy.seconds = intNumber(a);
        else if (a.cls === 2 && a.tagNum === 0) accuracy.millis = ctxInt(a);
        else if (a.cls === 2 && a.tagNum === 1) accuracy.micros = ctxInt(a);
      }
    } else if (n.tag === TAG.BOOLEAN) {
      ordering = n.content[0] !== 0;
    } else if (n.tag === TAG.INTEGER) {
      nonceHex = bytesToHex(intBytes(n));
    } else if (n.cls === 2 && n.tagNum === 0) {
      try { tsaText = generalNameText(n); } catch { /* optional field */ }
    }
  }
  return { version, policyOid, imprintAlgOid, imprintHash, serialHex, genTime, accuracy, ordering, nonceHex, tsaText, raw: bytes };
}

export function parseToken(tokenBytes) {
  const ci = tokenBytes instanceof Uint8Array ? parseDer(tokenBytes) : tokenBytes;
  if (oidToString(ci.children[0]) !== OID.signedData) throw new Error('token is not CMS SignedData');
  const sd = ci.children[1].children[0];
  const c = sd.children;
  let i = 0;
  const version = intNumber(c[i++]);
  i++; // digestAlgorithms SET
  const eci = c[i++];
  const eContentType = oidToString(eci.children[0]);
  if (eContentType !== OID.tstInfo) throw new Error(`eContentType is ${eContentType}, expected TSTInfo`);
  const eContentOctet = eci.children[1]?.children?.[0];
  if (!eContentOctet || eContentOctet.tag !== TAG.OCTET_STRING) throw new Error('eContent missing or not an OCTET STRING');
  const eContentBytes = eContentOctet.content;
  const certificates = [];
  while (i < c.length && c[i].cls === 2) {
    if (c[i].tagNum === 0) for (const certNode of c[i].children) certificates.push(certNode.raw);
    i++; // also skips [1] crls if present
  }
  const signerInfos = c[i];
  if (!signerInfos || signerInfos.tag !== TAG.SET || !signerInfos.children.length) throw new Error('no SignerInfo in token');
  return {
    version,
    eContentBytes,
    tstInfo: parseTstInfo(eContentBytes),
    certificates,
    signerInfo: parseSignerInfo(signerInfos.children[0]),
    raw: ci.raw,
  };
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

function findSignerCert(certs, si) {
  if (si.sid.type === 'issuerSerial') {
    return certs.find((c) => bytesEqual(c.issuerRaw, si.sid.issuerRaw) && bytesEqual(c.serialBytes, si.sid.serial)) ?? null;
  }
  return certs.find((c) => c.ski && bytesEqual(c.ski, si.sid.ski)) ?? null;
}

async function checkEssCert(si, signerCert) {
  const v2 = si.attrs.find((a) => a.oid === OID.attrSigningCertV2);
  const v1 = si.attrs.find((a) => a.oid === OID.attrSigningCert);
  if (!v2 && !v1) return { present: false };
  if (!signerCert) return { present: true, ok: false, detail: 'no signer certificate to compare against' };
  try {
    if (v2) {
      // SigningCertificateV2 ::= SEQUENCE { certs SEQUENCE OF ESSCertIDv2, ... }
      // ESSCertIDv2 ::= SEQUENCE { hashAlgorithm DEFAULT sha256, certHash, issuerSerial? }
      const essCert = v2.values[0].children[0].children[0];
      let hashAlgOid = OID.sha256;
      let certHashNode = essCert.children[0];
      if (certHashNode.tag === TAG.SEQUENCE) {
        hashAlgOid = oidToString(certHashNode.children[0]);
        certHashNode = essCert.children[1];
      }
      const digestName = DIGEST_NAME[hashAlgOid];
      if (!digestName) return { present: true, ok: false, detail: `unsupported ESS hash ${hashAlgOid}` };
      const h = await digestBytes(digestName, signerCert.raw);
      return { present: true, ok: bytesEqual(h, certHashNode.content), detail: `ESSCertIDv2 (${digestName})` };
    }
    const essCert = v1.values[0].children[0].children[0];
    const h = await digestBytes('SHA-1', signerCert.raw);
    return { present: true, ok: bytesEqual(h, essCert.children[0].content), detail: 'ESSCertID (SHA-1)' };
  } catch {
    return { present: true, ok: false, detail: 'malformed signingCertificate attribute' };
  }
}

function parsePssParams(node) {
  let hash = 'SHA-1';
  let saltLength = 20;
  if (node?.children) {
    for (const p of node.children) {
      if (p.tagNum === 0) hash = DIGEST_NAME[oidToString(p.children[0].children[0])] ?? 'SHA-256';
      else if (p.tagNum === 2) saltLength = intNumber(p.children[0]);
    }
  }
  return { hash, saltLength };
}

async function importSignerKey(cert, si) {
  const sigOid = si.sigAlgOid;
  const digestFromSig = {
    [OID.sha1Rsa]: 'SHA-1', [OID.sha256Rsa]: 'SHA-256', [OID.sha384Rsa]: 'SHA-384', [OID.sha512Rsa]: 'SHA-512',
    [OID.ecdsaSha256]: 'SHA-256', [OID.ecdsaSha384]: 'SHA-384', [OID.ecdsaSha512]: 'SHA-512',
  }[sigOid];

  if (sigOid === OID.rsaPss) {
    const { hash, saltLength } = parsePssParams(si.sigAlgParams);
    const key = await crypto.subtle.importKey('spki', cert.spkiRaw, { name: 'RSA-PSS', hash }, false, ['verify']);
    return { key, verifyAlg: { name: 'RSA-PSS', saltLength }, desc: `RSA-PSS / ${hash}`, ecdsaSize: null };
  }
  if (cert.spkiAlgOid === OID.rsaEncryption) {
    const hash = digestFromSig ?? DIGEST_NAME[si.digestAlgOid] ?? 'SHA-256';
    const key = await crypto.subtle.importKey('spki', cert.spkiRaw, { name: 'RSASSA-PKCS1-v1_5', hash }, false, ['verify']);
    return { key, verifyAlg: 'RSASSA-PKCS1-v1_5', desc: `RSASSA-PKCS1-v1_5 / ${hash}`, ecdsaSize: null };
  }
  if (cert.spkiAlgOid === OID.ecPublicKey) {
    const curve = CURVE_NAME[cert.curveOid];
    if (!curve) throw new Error(`unsupported EC curve ${cert.curveOid}`);
    const hash = digestFromSig ?? 'SHA-256';
    const key = await crypto.subtle.importKey('spki', cert.spkiRaw, { name: 'ECDSA', namedCurve: curve }, false, ['verify']);
    return { key, verifyAlg: { name: 'ECDSA', hash }, desc: `ECDSA ${curve} / ${hash}`, ecdsaSize: CURVE_BYTES[curve] };
  }
  throw new Error(`unsupported signature algorithm ${sigOid}`);
}

// RFC 5652 §5.4: the signature covers signedAttrs re-tagged as an EXPLICIT
// SET OF (0x31) instead of the IMPLICIT [0] (0xA0) used inside SignerInfo.
function retagSignedAttrs(rawImplicit) {
  const out = Uint8Array.from(rawImplicit);
  out[0] = TAG.SET;
  return out;
}

function ecdsaDerToRaw(sig, size) {
  const s = parseDer(sig);
  const r = intBytes(s.children[0]);
  const sv = intBytes(s.children[1]);
  const out = new Uint8Array(size * 2);
  out.set(r, size - r.length);
  out.set(sv, size * 2 - sv.length);
  return out;
}

// Full check battery over a TSR (or bare token). Returns { ok, checks, warnings,
// tstInfo, signerCert, certificates, statusInfo } — `checks` is UI-renderable.
export async function verifyToken(tsrOrToken, { expectedImprint = null, expectedNonceHex = null } = {}) {
  const checks = [];
  const warnings = [];
  const add = (id, label, ok, detail = '', critical = true) => { checks.push({ id, label, ok: !!ok, detail, critical }); return !!ok; };
  const result = (extra = {}) => ({
    ok: checks.every((c) => c.ok || !c.critical),
    checks, warnings,
    tstInfo: extra.tst ?? null,
    signerCert: extra.signerCert ?? null,
    certificates: extra.certificates ?? [],
    statusInfo: extra.resp ?? null,
  });

  let resp;
  let token;
  try {
    resp = parseTimeStampResp(tsrOrToken);
  } catch (e) {
    add('parse', 'Response parses as RFC 3161', false, String(e.message ?? e));
    return result();
  }
  const statusDetail = resp.granted
    ? resp.statusName
    : [resp.statusName, resp.statusStrings.join('; '), resp.failInfo.join(',')].filter(Boolean).join(' — ');
  add('status', 'TSA granted the timestamp', resp.granted, statusDetail);
  if (!resp.tokenRaw) {
    add('token', 'Response contains a timestamp token', false, 'no token present');
    return result({ resp });
  }

  try {
    token = parseToken(resp.tokenRaw);
  } catch (e) {
    add('token', 'Token parses as CMS SignedData / TSTInfo', false, String(e.message ?? e));
    return result({ resp });
  }
  add('token', 'Token parses as CMS SignedData / TSTInfo', true);
  const tst = token.tstInfo;
  const si = token.signerInfo;

  const imprintDigestName = DIGEST_NAME[tst.imprintAlgOid];
  if (expectedImprint) {
    if (!imprintDigestName) {
      add('imprint', 'Message imprint matches evidence digest', false, `unsupported imprint algorithm ${tst.imprintAlgOid}`);
    } else {
      add('imprint', `Message imprint matches evidence digest (${imprintDigestName})`,
        bytesEqual(tst.imprintHash, expectedImprint), bytesToHex(tst.imprintHash));
    }
  }

  if (expectedNonceHex) {
    add('nonce', 'Nonce matches the request', normHex(tst.nonceHex) === normHex(expectedNonceHex), tst.nonceHex ?? 'absent in token');
  }

  const certificates = token.certificates;
  const parsedCerts = certificates.map((b) => { try { return parseCertificate(b); } catch { return null; } }).filter(Boolean);
  const signerCert = findSignerCert(parsedCerts, si);
  add('signer-cert', 'Signer certificate embedded in token', !!signerCert,
    signerCert ? signerCert.subject.text : 'no certificate matches the SignerInfo identifier');

  if (!si.signedAttrsNode) {
    add('signed-attrs', 'Signed attributes present (RFC 3161 requires them)', false);
    return result({ resp, tst, signerCert, certificates });
  }
  const siDigestName = DIGEST_NAME[si.digestAlgOid];
  const mdAttr = si.attrs.find((a) => a.oid === OID.attrMessageDigest);
  if (!siDigestName) {
    add('message-digest', 'Signed messageDigest covers TSTInfo', false, `unsupported digest ${si.digestAlgOid}`);
  } else {
    const eDigest = await digestBytes(siDigestName, token.eContentBytes);
    add('message-digest', `Signed messageDigest covers TSTInfo (${siDigestName})`,
      mdAttr && bytesEqual(mdAttr.values[0].content, eDigest),
      mdAttr ? undefined : 'messageDigest attribute missing');
  }
  const ctAttr = si.attrs.find((a) => a.oid === OID.attrContentType);
  add('content-type-attr', 'Signed contentType is TSTInfo',
    ctAttr && oidToString(ctAttr.values[0]) === OID.tstInfo,
    ctAttr ? undefined : 'contentType attribute missing');

  const ess = await checkEssCert(si, signerCert);
  if (!ess.present) {
    warnings.push('Token lacks the ESS signingCertificate attribute required by RFC 3161 §2.4.2; signer binding relies on the SignerInfo identifier only.');
  } else {
    add('ess-cert', 'ESS signingCertificate binds the signer certificate', ess.ok, ess.detail);
  }

  if (signerCert) {
    try {
      const { key, verifyAlg, desc, ecdsaSize } = await importSignerKey(signerCert, si);
      const data = retagSignedAttrs(si.signedAttrsNode.raw);
      let sig = si.signature;
      if (ecdsaSize) sig = ecdsaDerToRaw(sig, ecdsaSize);
      const ok = await crypto.subtle.verify(verifyAlg, key, sig, data);
      add('signature', 'CMS signature verifies with signer public key', ok, desc);
    } catch (e) {
      add('signature', 'CMS signature verifies with signer public key', false, String(e.message ?? e));
    }
    const t = tst.genTime.date.getTime();
    add('validity', 'genTime within signer certificate validity',
      t >= signerCert.notBefore.date.getTime() && t <= signerCert.notAfter.date.getTime(),
      `${signerCert.notBefore.iso} … ${signerCert.notAfter.iso}`, false);
  }

  warnings.push('Chain-of-trust to the TSA root CA is not validated inside the extension; run the OpenSSL command in VERIFY.txt for full path validation.');
  return result({ resp, tst, signerCert, certificates });
}
