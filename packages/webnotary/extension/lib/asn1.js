// Minimal DER encoder/decoder — just enough ASN.1 for RFC 3161 (TSQ/TSR), CMS
// SignedData, and X.509 certificates. Definite-length encodings only: RFC 3161
// requests are DER by definition and every mainstream TSA replies in DER;
// indefinite-length BER is rejected loudly rather than silently misparsed.

export const TAG = {
  BOOLEAN: 0x01,
  INTEGER: 0x02,
  BIT_STRING: 0x03,
  OCTET_STRING: 0x04,
  NULL: 0x05,
  OID: 0x06,
  UTF8_STRING: 0x0c,
  PRINTABLE_STRING: 0x13,
  T61_STRING: 0x14,
  IA5_STRING: 0x16,
  UTC_TIME: 0x17,
  GENERALIZED_TIME: 0x18,
  BMP_STRING: 0x1e,
  SEQUENCE: 0x30,
  SET: 0x31,
};

// ---------------------------------------------------------------------------
// Encoding
// ---------------------------------------------------------------------------

export function encodeLength(n) {
  if (n < 0x80) return Uint8Array.of(n);
  const bytes = [];
  let v = n;
  while (v > 0) { bytes.unshift(v & 0xff); v = Math.floor(v / 256); }
  return Uint8Array.from([0x80 | bytes.length, ...bytes]);
}

export function tlv(tagByte, ...parts) {
  let len = 0;
  for (const p of parts) len += p.length;
  const lenBytes = encodeLength(len);
  const out = new Uint8Array(1 + lenBytes.length + len);
  out[0] = tagByte;
  out.set(lenBytes, 1);
  let off = 1 + lenBytes.length;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

export const seq = (...parts) => tlv(TAG.SEQUENCE, ...parts);
export const set = (...parts) => tlv(TAG.SET, ...parts);
export const octet = (bytes) => tlv(TAG.OCTET_STRING, bytes);
export const nullDer = () => tlv(TAG.NULL);
export const bool = (v) => tlv(TAG.BOOLEAN, Uint8Array.of(v ? 0xff : 0x00));
// Constructed context-specific tag [n]
export const ctx = (n, ...parts) => tlv(0xa0 | n, ...parts);

// INTEGER from a non-negative JS number or an unsigned big-endian magnitude.
export function int(value) {
  let mag;
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value < 0) throw new Error('int(): non-negative integers only');
    const bytes = [];
    let v = value;
    do { bytes.unshift(v & 0xff); v = Math.floor(v / 256); } while (v > 0);
    mag = Uint8Array.from(bytes);
  } else {
    mag = Uint8Array.from(value);
    let i = 0;
    while (i < mag.length - 1 && mag[i] === 0) i++;
    mag = mag.subarray(i);
  }
  // DER INTEGER is two's-complement: prepend 0x00 when the magnitude's MSB is set.
  if (mag.length === 0 || (mag[0] & 0x80)) mag = Uint8Array.from([0, ...mag]);
  return tlv(TAG.INTEGER, mag);
}

export function oid(dotted) {
  const parts = dotted.split('.').map(Number);
  if (parts.length < 2) throw new Error(`bad OID: ${dotted}`);
  const bytes = [40 * parts[0] + parts[1]];
  for (let i = 2; i < parts.length; i++) {
    let v = parts[i];
    const chunk = [v & 0x7f];
    v = Math.floor(v / 128);
    while (v > 0) { chunk.unshift((v & 0x7f) | 0x80); v = Math.floor(v / 128); }
    bytes.push(...chunk);
  }
  return tlv(TAG.OID, Uint8Array.from(bytes));
}

// ---------------------------------------------------------------------------
// Decoding
// ---------------------------------------------------------------------------
// parseDer returns a node tree. Each node:
//   { tag, cls (0 universal / 2 context ...), constructed, tagNum,
//     raw (whole TLV bytes), content (value bytes), children (array | null) }

function parseNode(bytes, off, depth) {
  if (depth > 48) throw new Error('DER: nesting too deep');
  if (off + 2 > bytes.length) throw new Error('DER: truncated header');
  const tag = bytes[off];
  const cls = tag >> 6;
  const constructed = (tag & 0x20) !== 0;
  const tagNum = tag & 0x1f;
  if (tagNum === 0x1f) throw new Error('DER: high-tag-number form not supported');
  let p = off + 1;
  let len = bytes[p++];
  if (len === 0x80) throw new Error('DER: indefinite length not supported (BER?)');
  if (len & 0x80) {
    const n = len & 0x7f;
    if (n > 4) throw new Error('DER: length too large');
    len = 0;
    for (let i = 0; i < n; i++) len = len * 256 + bytes[p++];
  }
  const end = p + len;
  if (end > bytes.length) throw new Error('DER: value overruns buffer');
  const node = {
    tag, cls, constructed, tagNum,
    raw: bytes.subarray(off, end),
    content: bytes.subarray(p, end),
    children: null,
  };
  if (constructed) {
    node.children = [];
    let q = p;
    while (q < end) {
      const [child, next] = parseNode(bytes, q, depth + 1);
      node.children.push(child);
      q = next;
    }
    if (q !== end) throw new Error('DER: constructed value has trailing bytes');
  }
  return [node, end];
}

export function parseDer(bytes, { allowTrailing = false } = {}) {
  const [node, end] = parseNode(bytes, 0, 0);
  if (!allowTrailing && end !== bytes.length) throw new Error('DER: trailing bytes after element');
  return node;
}

export function oidToString(nodeOrBytes) {
  const b = nodeOrBytes.content ?? nodeOrBytes;
  if (b.length === 0) throw new Error('empty OID');
  const parts = [Math.floor(b[0] / 40), b[0] % 40];
  let v = 0;
  for (let i = 1; i < b.length; i++) {
    v = v * 128 + (b[i] & 0x7f);
    if (!(b[i] & 0x80)) { parts.push(v); v = 0; }
  }
  return parts.join('.');
}

// Unsigned magnitude of an INTEGER (sign-padding byte stripped).
export function intBytes(node) {
  let b = node.content;
  let i = 0;
  while (i < b.length - 1 && b[i] === 0) i++;
  return b.subarray(i);
}

export function intNumber(node) {
  const b = intBytes(node);
  if (b.length > 6) throw new Error('INTEGER too large for Number');
  let v = 0;
  for (const byte of b) v = v * 256 + byte;
  return v;
}

export function bitStringBytes(node) {
  const b = node.content;
  if (b.length === 0) return new Uint8Array(0);
  const unused = b[0];
  if (unused !== 0) throw new Error(`BIT STRING with ${unused} unused bits not supported`);
  return b.subarray(1);
}

// UTCTime (YYMMDDHHMMSSZ) and GeneralizedTime (YYYYMMDDHHMMSS[.f]Z) → { iso, date }.
export function parseTime(node) {
  const s = new TextDecoder().decode(node.content);
  let m;
  if (node.tag === TAG.UTC_TIME) {
    m = s.match(/^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?Z$/);
    if (!m) throw new Error(`bad UTCTime: ${s}`);
    const yy = parseInt(m[1], 10);
    const year = yy < 50 ? 2000 + yy : 1900 + yy;
    const iso = `${year}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] || '00'}Z`;
    return { iso, date: new Date(iso), raw: s };
  }
  m = s.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\.(\d+))?Z$/);
  if (!m) throw new Error(`bad GeneralizedTime: ${s}`);
  const frac = m[7] ? `.${m[7]}` : '';
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${frac}Z`;
  return { iso, date: new Date(iso), raw: s };
}

export function decodeString(node) {
  switch (node.tag) {
    case TAG.UTF8_STRING:
    case TAG.PRINTABLE_STRING:
    case TAG.IA5_STRING:
    case TAG.T61_STRING:
      return new TextDecoder().decode(node.content);
    case TAG.BMP_STRING: {
      // UTF-16BE
      let out = '';
      const b = node.content;
      for (let i = 0; i + 1 < b.length; i += 2) out += String.fromCharCode((b[i] << 8) | b[i + 1]);
      return out;
    }
    default:
      throw new Error(`unsupported string tag 0x${node.tag.toString(16)}`);
  }
}
