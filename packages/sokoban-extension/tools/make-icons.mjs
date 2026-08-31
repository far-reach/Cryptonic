#!/usr/bin/env node
/**
 * Generates the extension icons as PNGs with no image dependencies: the shapes
 * are rasterised here (4×4 supersampled) and written through a minimal PNG
 * encoder, so `npm run icons` works on a bare checkout.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'icons');
mkdirSync(outDir, { recursive: true });

const SIZES = [16, 32, 48, 128];
const SS = 4; // supersampling factor

/* ------------------------------------------------------------------ shapes */

const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

const BG_TOP = [79, 140, 255];
const BG_BOTTOM = [124, 92, 255];
const CRATE = [222, 150, 62];
const CRATE_DARK = [150, 92, 30];
const CARD = [245, 247, 251];

function insideRoundRect(x, y, left, top, w, h, r) {
  if (x < left || y < top || x > left + w || y > top + h) return false;
  const cx = Math.min(Math.max(x, left + r), left + w - r);
  const cy = Math.min(Math.max(y, top + r), top + h - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

/** Colour of one sample point in a unit square (0..1 in both axes). */
function sample(u, v) {
  if (!insideRoundRect(u, v, 0, 0, 1, 1, 0.22)) return null; // transparent corner

  const bg = mix(BG_TOP, BG_BOTTOM, (u + v) / 2);

  // A playing card peeking out behind the crate.
  const cardTilt = (v - 0.28) * 0.16;
  if (insideRoundRect(u - cardTilt, v, 0.52, 0.14, 0.3, 0.44, 0.05)) return CARD;

  // The crate.
  const left = 0.16;
  const top = 0.34;
  const size = 0.5;
  if (insideRoundRect(u, v, left, top, size, size, 0.07)) {
    const onDiagonal =
      Math.abs((u - left) - (v - top)) < 0.045 ||
      Math.abs((u - left) - (top + size - v)) < 0.045;
    return onDiagonal ? CRATE_DARK : CRATE;
  }

  return bg;
}

function render(size) {
  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const colour = sample((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size);
          if (!colour) continue;
          r += colour[0];
          g += colour[1];
          b += colour[2];
          a += 255;
        }
      }
      const samples = SS * SS;
      const offset = (y * size + x) * 4;
      const covered = a / 255;
      pixels[offset] = covered ? Math.round(r / covered) : 0;
      pixels[offset + 1] = covered ? Math.round(g / covered) : 0;
      pixels[offset + 2] = covered ? Math.round(b / covered) : 0;
      pixels[offset + 3] = Math.round(a / samples);
    }
  }
  return pixels;
}

/* --------------------------------------------------------------- PNG bytes */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function toPng(size, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  // 10..12 stay 0: deflate, adaptive filtering, no interlace

  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const size of SIZES) {
  const file = join(outDir, `icon${size}.png`);
  writeFileSync(file, toPng(size, render(size)));
  console.log(`wrote ${file}`);
}
