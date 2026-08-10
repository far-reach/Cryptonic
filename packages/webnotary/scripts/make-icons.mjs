// Generates the extension icons (16/32/48/128) with no image dependencies:
// renders a 384px master per-pixel (navy rounded square, ivory scalloped
// notary-seal ring, gold check mark), box-downsamples to each size, and writes
// PNGs using node:zlib for the IDAT stream.

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32 } from '../extension/lib/hash.js';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'extension', 'icons');
const MASTER = 384; // divisible by 16, 32, 48, and 128
const SIZES = [128, 48, 32, 16];

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const mix = (a, b, t) => a + (b - a) * t;

function segDist(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const t = clamp01((wx * vx + wy * vy) / (vx * vx + vy * vy));
  return Math.hypot(wx - t * vx, wy - t * vy);
}

function renderMaster() {
  const S = MASTER;
  const img = new Float64Array(S * S * 4);
  const cx = S / 2;
  const cy = S / 2;

  // Shape parameters (in master pixels)
  const half = 0.485 * S;
  const cornerR = 0.115 * S;
  const ringR = 0.305 * S;
  const scallopAmp = 0.021 * S;
  const scallops = 12;
  const ringW = 0.017 * S;
  const checkW = 0.040 * S;
  const A = [0.345 * S, 0.53 * S];
  const B = [0.455 * S, 0.635 * S];
  const C = [0.665 * S, 0.395 * S];

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const px = x + 0.5;
      const py = y + 0.5;

      // Rounded-square silhouette
      const qx = Math.abs(px - cx) - (half - cornerR);
      const qy = Math.abs(py - cy) - (half - cornerR);
      const dRect = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - cornerR;
      const aRect = clamp01(0.5 - dRect);
      if (aRect <= 0) continue;

      // Navy background with a subtle vertical gradient
      const g = py / S;
      let r = mix(0.115, 0.058, g);
      let gr = mix(0.195, 0.115, g);
      let b = mix(0.345, 0.225, g);

      // Scalloped seal ring (ivory)
      const dx = px - cx;
      const dy = py - cy;
      const dist = Math.hypot(dx, dy);
      const theta = Math.atan2(dy, dx);
      const ringRadius = ringR + scallopAmp * Math.cos(scallops * theta);
      const dRing = Math.abs(dist - ringRadius) - ringW;
      const aRing = clamp01(0.5 - dRing);
      if (aRing > 0) {
        r = mix(r, 0.957, aRing);
        gr = mix(gr, 0.925, aRing);
        b = mix(b, 0.846, aRing);
      }

      // Gold check mark
      const dCheck = Math.min(
        segDist(px, py, A[0], A[1], B[0], B[1]),
        segDist(px, py, B[0], B[1], C[0], C[1]),
      ) - checkW;
      const aCheck = clamp01(0.5 - dCheck);
      if (aCheck > 0) {
        r = mix(r, 0.855, aCheck);
        gr = mix(gr, 0.655, aCheck);
        b = mix(b, 0.182, aCheck);
      }

      const i = (y * S + x) * 4;
      img[i] = r;
      img[i + 1] = gr;
      img[i + 2] = b;
      img[i + 3] = aRect;
    }
  }
  return img;
}

function downsample(master, size) {
  const f = MASTER / size;
  const out = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < f; sy++) {
        for (let sx = 0; sx < f; sx++) {
          const i = ((y * f + sy) * MASTER + (x * f + sx)) * 4;
          const al = master[i + 3];
          r += master[i] * al;
          g += master[i + 1] * al;
          b += master[i + 2] * al;
          a += al;
        }
      }
      const o = (y * size + x) * 4;
      if (a > 0) {
        out[o] = Math.round((r / a) * 255);
        out[o + 1] = Math.round((g / a) * 255);
        out[o + 2] = Math.round((b / a) * 255);
      }
      out[o + 3] = Math.round((a / (f * f)) * 255);
    }
  }
  return out;
}

function pngChunk(type, data) {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  const crcInput = out.subarray(4, 8 + data.length);
  dv.setUint32(8 + data.length, crc32(crcInput));
  return out;
}

function encodePng(rgba, size) {
  const sig = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, size);
  dv.setUint32(4, size);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  const raw = new Uint8Array(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    raw.set(rgba.subarray(y * size * 4, (y + 1) * size * 4), y * (size * 4 + 1) + 1);
  }
  const idat = new Uint8Array(deflateSync(raw, { level: 9 }));
  const parts = [sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', new Uint8Array(0))];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

mkdirSync(OUT_DIR, { recursive: true });
const master = renderMaster();
for (const size of SIZES) {
  const png = encodePng(downsample(master, size), size);
  const file = join(OUT_DIR, `icon${size}.png`);
  writeFileSync(file, png);
  console.log(`wrote ${file} (${png.length} bytes)`);
}
