// Minimal PDF 1.4 writer — multi-page flowing text, rules, filled rectangles,
// and embedded JPEG images. Uses only the core-14 fonts (Helvetica,
// Helvetica-Bold, Courier, Courier-Bold) so nothing needs embedding and the
// output stays small with zero dependencies.

import { concatBytes } from './hash.js';

// Helvetica AFM widths for chars 32..126 (units per 1000 em).
const HELV_WIDTHS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
  278, 278, 584, 584, 584, 556, 1015,
  667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667,
  778, 722, 667, 611, 722, 667, 944, 667, 667, 611,
  278, 278, 278, 469, 556, 333,
  556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556,
  556, 333, 500, 278, 556, 500, 722, 500, 500, 500,
  334, 260, 334, 584,
];

// Unicode → CP1252 (WinAnsi) for the typographic range 0x80–0x9F.
const CP1252 = {
  0x20ac: 128, 0x201a: 130, 0x0192: 131, 0x201e: 132, 0x2026: 133, 0x2020: 134,
  0x2021: 135, 0x02c6: 136, 0x2030: 137, 0x0160: 138, 0x2039: 139, 0x0152: 140,
  0x017d: 142, 0x2018: 145, 0x2019: 146, 0x201c: 147, 0x201d: 148, 0x2022: 149,
  0x2013: 150, 0x2014: 151, 0x02dc: 152, 0x2122: 153, 0x0161: 154, 0x203a: 155,
  0x0153: 156, 0x017e: 158, 0x0178: 159,
};

function toWinAnsi(str) {
  const out = [];
  for (const ch of String(str)) {
    const code = ch.codePointAt(0);
    if (code === 0x0a || code === 0x0d || code === 0x09) out.push(32);
    else if (code < 0x80) out.push(code);
    else if (CP1252[code] !== undefined) out.push(CP1252[code]);
    else if (code >= 0xa0 && code <= 0xff) out.push(code);
    else out.push(63); // '?'
  }
  return out;
}

function escapeLiteral(codes) {
  let s = '';
  for (const c of codes) {
    if (c === 0x28 || c === 0x29 || c === 0x5c) s += '\\' + String.fromCharCode(c);
    else s += String.fromCharCode(c);
  }
  return s;
}

// Content streams and object bodies use WinAnsi/Latin-1 code points that must be
// written as single bytes — UTF-8 would double-encode 0x80–0xFF.
function latin1(str) {
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) out[i] = str.charCodeAt(i) & 0xff;
  return out;
}

const num = (v) => String(Math.round(v * 100) / 100);

const FONTS = { F1: 'Helvetica', F2: 'Helvetica-Bold', F3: 'Courier', F4: 'Courier-Bold' };

export class PdfDoc {
  constructor({ title = 'Report', producer = 'WebNotary', created = new Date(0), footerLeft = '' } = {}) {
    this.title = title;
    this.producer = producer;
    this.created = created;
    this.footerLeft = footerLeft;
    this.pageW = 612; // US Letter
    this.pageH = 792;
    this.margin = 54;
    this.footerZone = 40;
    this.pages = [];
    this.imageObjs = []; // { bytes, w, h }
    this.newPage();
  }

  get contentWidth() { return this.pageW - 2 * this.margin; }
  get maxY() { return this.pageH - this.margin - this.footerZone; }

  newPage() {
    this.page = { ops: [], images: new Set() };
    this.pages.push(this.page);
    this.cursor = this.margin;
  }

  ensure(h) {
    if (this.cursor + h > this.maxY) this.newPage();
  }

  moveDown(h) { this.cursor += h; }

  widthOf(str, font = 'F1', size = 10) {
    const codes = toWinAnsi(str);
    let w = 0;
    if (font === 'F3' || font === 'F4') {
      w = codes.length * 600;
    } else {
      for (const c of codes) w += (c >= 32 && c <= 126) ? HELV_WIDTHS[c - 32] : 556;
      if (font === 'F2') w *= 1.06; // bold approximation; layout is left-aligned
    }
    return (w / 1000) * size;
  }

  wrap(str, font, size, maxWidth) {
    const lines = [];
    for (const paragraph of String(str).split(/\n/)) {
      const words = paragraph.split(/\s+/).filter(Boolean);
      if (!words.length) { lines.push(''); continue; }
      let line = '';
      for (const word of words) {
        let w = word;
        if (this.widthOf(w, font, size) > maxWidth) {
          // Token alone is wider than the column (URL, hash): hard-split it.
          if (line) { lines.push(line); line = ''; }
          while (this.widthOf(w, font, size) > maxWidth) {
            let cut = 1;
            while (cut < w.length && this.widthOf(w.slice(0, cut + 1), font, size) <= maxWidth) cut++;
            lines.push(w.slice(0, cut));
            w = w.slice(cut);
          }
          line = w;
          continue;
        }
        const candidate = line ? `${line} ${w}` : w;
        if (this.widthOf(candidate, font, size) <= maxWidth) line = candidate;
        else { lines.push(line); line = w; }
      }
      if (line) lines.push(line);
    }
    return lines.length ? lines : [''];
  }

  _color(rgb, stroke = false) {
    const [r, g, b] = rgb;
    return `${num(r)} ${num(g)} ${num(b)} ${stroke ? 'RG' : 'rg'}`;
  }

  // All y coordinates in the public API are measured from the TOP of the page.
  rect(x, yTop, w, h, rgb) {
    this.page.ops.push(`${this._color(rgb)} ${num(x)} ${num(this.pageH - yTop - h)} ${num(w)} ${num(h)} re f`);
  }

  line(x1, yTop1, x2, yTop2, rgb = [0, 0, 0], width = 0.75) {
    this.page.ops.push(
      `${this._color(rgb, true)} ${num(width)} w ${num(x1)} ${num(this.pageH - yTop1)} m ${num(x2)} ${num(this.pageH - yTop2)} l S`,
    );
  }

  drawText(str, x, yTop, { font = 'F1', size = 10, color = [0, 0, 0] } = {}) {
    const lit = escapeLiteral(toWinAnsi(str));
    this.page.ops.push(
      `BT ${this._color(color)} /${font} ${num(size)} Tf 1 0 0 1 ${num(x)} ${num(this.pageH - yTop)} Tm (${lit}) Tj ET`,
    );
  }

  drawTextRight(str, xRight, yTop, opts = {}) {
    this.drawText(str, xRight - this.widthOf(str, opts.font, opts.size), yTop, opts);
  }

  // ---- flow helpers (cursor-based) ----

  heading(text, { color = [0.09, 0.16, 0.29] } = {}) {
    this.ensure(40);
    this.moveDown(16);
    this.drawText(text.toUpperCase(), this.margin, this.cursor + 10, { font: 'F2', size: 10.5, color });
    this.moveDown(14);
    this.line(this.margin, this.cursor, this.margin + this.contentWidth, this.cursor, [0.72, 0.75, 0.8], 0.8);
    this.moveDown(9);
  }

  para(text, { font = 'F1', size = 9.3, color = [0.15, 0.15, 0.17], lineH = null, indent = 0 } = {}) {
    const lh = lineH ?? size * 1.38;
    const lines = this.wrap(text, font, size, this.contentWidth - indent);
    for (const line of lines) {
      this.ensure(lh);
      this.drawText(line, this.margin + indent, this.cursor + size, { font, size, color });
      this.moveDown(lh);
    }
  }

  kv(label, value, { mono = false, labelW = 148, valueColor = [0.1, 0.1, 0.12] } = {}) {
    const vFont = mono ? 'F3' : 'F1';
    const vSize = mono ? 8.2 : 9.3;
    const lh = Math.max(vSize, 9.3) * 1.42;
    const lines = this.wrap(String(value ?? '—'), vFont, vSize, this.contentWidth - labelW);
    this.ensure(lh * lines.length + 2);
    this.drawText(label, this.margin, this.cursor + 9.3, { font: 'F2', size: 8.3, color: [0.38, 0.41, 0.47] });
    for (const line of lines) {
      this.drawText(line, this.margin + labelW, this.cursor + vSize, { font: vFont, size: vSize, color: valueColor });
      this.moveDown(lh);
    }
    this.moveDown(1.5);
  }

  mono(text, { size = 8, color = [0.12, 0.12, 0.14], indent = 10 } = {}) {
    this.para(text, { font: 'F3', size, color, indent });
  }

  vspace(h) { this.moveDown(h); }

  addImage({ bytes, w, h }, { maxW = null, maxH = 560, caption = null } = {}) {
    const availW = maxW ?? this.contentWidth;
    const scale = Math.min(availW / w, maxH / h, 1);
    const dw = w * scale;
    const dh = h * scale;
    this.ensure(dh + (caption ? 26 : 8));
    const idx = this.imageObjs.length;
    this.imageObjs.push({ bytes, w, h });
    const x = this.margin + (this.contentWidth - dw) / 2;
    const yPdf = this.pageH - (this.cursor + dh);
    this.page.ops.push(`q ${num(dw)} 0 0 ${num(dh)} ${num(x)} ${num(yPdf)} cm /Im${idx} Do Q`);
    this.page.images.add(idx);
    this.moveDown(dh + 6);
    if (caption) {
      this.para(caption, { size: 7.8, color: [0.42, 0.45, 0.5] });
    }
  }

  // ---- assembly ----

  finish() {
    const total = this.pages.length;
    for (let i = 0; i < total; i++) {
      const save = this.page;
      this.page = this.pages[i];
      const y = this.pageH - 26;
      this.line(this.margin, y - 12, this.margin + this.contentWidth, y - 12, [0.8, 0.82, 0.86], 0.6);
      this.drawText(this.footerLeft, this.margin, y, { font: 'F1', size: 7.4, color: [0.5, 0.53, 0.58] });
      this.drawTextRight(`Page ${i + 1} of ${total}`, this.margin + this.contentWidth, y, { font: 'F1', size: 7.4, color: [0.5, 0.53, 0.58] });
      this.page = save;
    }

    // Object plan: 1 catalog, 2 pages tree, 3–6 fonts, then images, then
    // (content stream, page) per page, then Info last.
    const imgBase = 7;
    const pageBase = imgBase + this.imageObjs.length;
    const infoNum = pageBase + this.pages.length * 2;
    const objects = [];

    objects.push(latin1(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`));
    const kids = this.pages.map((_, i) => `${pageBase + i * 2 + 1} 0 R`).join(' ');
    objects.push(latin1(`2 0 obj\n<< /Type /Pages /Kids [ ${kids} ] /Count ${total} >>\nendobj\n`));
    Object.values(FONTS).forEach((base, i) => {
      objects.push(latin1(`${3 + i} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /${base} /Encoding /WinAnsiEncoding >>\nendobj\n`));
    });
    this.imageObjs.forEach((img, i) => {
      const head = latin1(`${imgBase + i} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${img.w} /Height ${img.h} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.bytes.length} >>\nstream\n`);
      objects.push(concatBytes(head, img.bytes, latin1(`\nendstream\nendobj\n`)));
    });
    this.pages.forEach((p, i) => {
      const stream = latin1(p.ops.join('\n'));
      const contentNum = pageBase + i * 2;
      objects.push(concatBytes(
        latin1(`${contentNum} 0 obj\n<< /Length ${stream.length} >>\nstream\n`),
        stream,
        latin1(`\nendstream\nendobj\n`),
      ));
      const xobjects = [...p.images].map((idx) => `/Im${idx} ${imgBase + idx} 0 R`).join(' ');
      const resources = `<< /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R /F4 6 0 R >>${xobjects ? ` /XObject << ${xobjects} >>` : ''} >>`;
      objects.push(latin1(`${contentNum + 1} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.pageW} ${this.pageH}] ` +
        `/Resources ${resources} /Contents ${contentNum} 0 R >>\nendobj\n`));
    });
    const d = this.created;
    const pad = (v) => String(v).padStart(2, '0');
    const creationDate = `D:${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
      `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
    const esc = (s) => escapeLiteral(toWinAnsi(s));
    objects.push(latin1(`${infoNum} 0 obj\n<< /Title (${esc(this.title)}) /Producer (${esc(this.producer)}) /CreationDate (${creationDate}) >>\nendobj\n`));

    const header = latin1('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n');
    const parts = [header];
    const offsets = [];
    let pos = header.length;
    for (const obj of objects) {
      offsets.push(pos);
      parts.push(obj);
      pos += obj.length;
    }
    const xrefPos = pos;
    let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const off of offsets) xref += `${String(off).padStart(10, '0')} 00000 n \n`;
    xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${infoNum} 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
    parts.push(latin1(xref));
    return concatBytes(...parts);
  }
}
