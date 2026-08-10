// X.509 certificate parsing — just the fields needed to identify a TSA signer,
// check its validity window, and hand its public key to WebCrypto.

import { parseDer, oidToString, intBytes, parseTime, decodeString, TAG } from './asn1.js';
import { bytesToHex, bytesToBase64 } from './hash.js';

export const NAME_OIDS = {
  '2.5.4.3': 'CN',
  '2.5.4.10': 'O',
  '2.5.4.11': 'OU',
  '2.5.4.6': 'C',
  '2.5.4.7': 'L',
  '2.5.4.8': 'ST',
  '2.5.4.5': 'serialNumber',
  '1.2.840.113549.1.9.1': 'emailAddress',
};

// Name ::= RDNSequence ::= SEQUENCE OF SET OF AttributeTypeAndValue
export function parseName(node) {
  const map = {};
  const parts = [];
  for (const rdn of node.children ?? []) {
    for (const atv of rdn.children ?? []) {
      try {
        const oidStr = oidToString(atv.children[0]);
        const label = NAME_OIDS[oidStr] || oidStr;
        const value = decodeString(atv.children[1]);
        if (!(label in map)) map[label] = value;
        parts.push(`${label}=${value}`);
      } catch { /* skip attributes we can't decode; identification only */ }
    }
  }
  return { map, text: parts.join(', '), raw: node.raw };
}

export function parseCertificate(derBytes) {
  const cert = derBytes instanceof Uint8Array ? parseDer(derBytes) : derBytes;
  const [tbs, sigAlg] = cert.children;
  const t = tbs.children;
  let i = 0;
  if (t[0].cls === 2 && t[0].tagNum === 0) i = 1; // [0] EXPLICIT version
  const serial = t[i++];
  i++; // inner signature AlgorithmIdentifier (must match outer; not used here)
  const issuer = t[i++];
  const validity = t[i++];
  const subject = t[i++];
  const spki = t[i++];

  const spkiAlgSeq = spki.children[0];
  const spkiAlgOid = oidToString(spkiAlgSeq.children[0]);
  let curveOid = null;
  if (spkiAlgSeq.children.length > 1 && spkiAlgSeq.children[1].tag === TAG.OID) {
    curveOid = oidToString(spkiAlgSeq.children[1]);
  }

  let ski = null;
  for (; i < t.length; i++) {
    if (t[i].cls === 2 && t[i].tagNum === 3) { // [3] EXPLICIT Extensions
      for (const ext of t[i].children[0].children) {
        try {
          if (oidToString(ext.children[0]) === '2.5.29.14') {
            // extnValue OCTET STRING wraps SubjectKeyIdentifier ::= OCTET STRING
            const extnValue = ext.children[ext.children.length - 1];
            ski = parseDer(extnValue.content).content;
          }
        } catch { /* ignore malformed extension */ }
      }
    }
  }

  return {
    raw: cert.raw,
    tbsRaw: tbs.raw,
    serialBytes: intBytes(serial),
    serialHex: bytesToHex(intBytes(serial)),
    issuer: parseName(issuer),
    subject: parseName(subject),
    issuerRaw: issuer.raw,
    notBefore: parseTime(validity.children[0]),
    notAfter: parseTime(validity.children[1]),
    spkiRaw: spki.raw,
    spkiAlgOid,
    curveOid,
    ski,
    sigAlgOid: oidToString(sigAlg.children[0]),
  };
}

export function certToPem(derBytes, label = 'CERTIFICATE') {
  const b64 = bytesToBase64(derBytes);
  const lines = b64.match(/.{1,64}/g).join('\n');
  return `-----BEGIN ${label}-----\n${lines}\n-----END ${label}-----\n`;
}
