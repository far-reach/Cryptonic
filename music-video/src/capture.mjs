// Capture veil_video.html frame-by-frame at 24fps and pipe into ffmpeg,
// muxing veil.wav, producing the final H.264 master.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SRC = dirname(fileURLToPath(import.meta.url));
const FPS = 24, TOTAL = 180.0, FRAMES = Math.round(TOTAL * FPS);
const FFMPEG = process.env.FFMPEG || '/usr/local/lib/python3.11/dist-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2';
const OUT = join(SRC, '..', 'veil_master.mp4');

const ff = spawn(FFMPEG, [
  '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
  '-i', join(SRC, '..', 'veil.wav'),
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-shortest', OUT,
], { stdio: ['pipe', 'inherit', 'pipe'] });
let ffErr = '';
ff.stderr.on('data', d => { ffErr = (ffErr + d.toString()).slice(-4000); });

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto('file://' + join(SRC, 'veil_video.html') + '?capture=1');
await page.evaluate(() => window.ready);

const t0 = Date.now();
for (let i = 0; i < FRAMES; i++) {
  await page.evaluate((f) => window.renderFrame(f), i);
  const buf = await page.screenshot({ type: 'jpeg', quality: 95, clip: { x: 0, y: 0, width: 1920, height: 1080 } });
  if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
  if (i % 240 === 0) {
    const el = (Date.now() - t0) / 1000;
    console.log(`frame ${i}/${FRAMES} (${(i / FRAMES * 100).toFixed(1)}%) elapsed ${el.toFixed(0)}s eta ${(el / Math.max(i, 1) * (FRAMES - i)).toFixed(0)}s`);
  }
}
ff.stdin.end();
await new Promise((res, rej) => ff.on('exit', c => c === 0 ? res() : rej(new Error('ffmpeg exit ' + c + '\n' + ffErr))));
await browser.close();
console.log('DONE', OUT, ((Date.now() - t0) / 1000).toFixed(0) + 's total');
