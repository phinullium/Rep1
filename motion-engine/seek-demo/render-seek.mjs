#!/usr/bin/env node
// Minimal deterministic renderer: Playwright opens the page, calls
// window.seek(frame / fps) for every frame, captures the canvas and STREAMS
// PNGs into FFmpeg's stdin (no thousands of intermediate files on disk).
//
//   node seek-demo/render-seek.mjs [--fps 30] [--out out/seek-demo.mp4] [--check]
//
// --check also proves determinism: it renders frame 200 directly, then again
// after rendering other frames, and compares the bytes.
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (k, d) => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 ? argv[i + 1] : d;
};
const fps = Number(opt('fps', 30));
const out = path.resolve(opt('out', path.join(here, '..', 'out', 'seek-demo.mp4')));
fs.mkdirSync(path.dirname(out), {recursive: true});

// Uses Playwright's own Chromium (`npx playwright install chromium`); set CHROME_PATH to use another build.
const fallback = ['/opt/pw-browsers/chromium/chrome-linux/chrome', '/opt/pw-browsers/chromium'].find((p) => fs.existsSync(p) && fs.statSync(p).isFile());
let browser;
try {
  browser = await chromium.launch(process.env.CHROME_PATH ? {executablePath: process.env.CHROME_PATH} : {});
} catch (err) {
  if (!fallback) throw err;
  browser = await chromium.launch({executablePath: fallback});
}
const page = await browser.newPage({viewport: {width: 1080, height: 1920}});
await page.goto(pathToFileURL(path.join(here, 'index.html')).href);
await page.evaluate(() => document.fonts.ready); // wait for fonts/assets
const duration = await page.evaluate(() => window.DURATION);
const total = Math.round(duration * fps);

// Capture the canvas pixels directly (exact 1080x1920, independent of CSS size).
const grab = async (t) => {
  const dataUrl = await page.evaluate((tt) => {
    window.seek(tt);
    return document.getElementById('stage').toDataURL('image/png');
  }, t);
  return Buffer.from(dataUrl.split(',')[1], 'base64');
};

if (argv.includes('--check')) {
  const hash = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);
  const N = Math.min(200, total - 1);
  const direct = hash(await grab(N / fps)); // jump straight to frame N
  for (const f of [0, 45, 90, 150, total - 1]) await grab(f / fps); // draw other frames in between
  const again = hash(await grab(N / fps));
  console.log(`determinism: frame ${N} direct=${direct} after-other-frames=${again} -> ${direct === again ? 'IDENTICAL ✓' : 'DIFFERENT ✗'}`);
}

const ff = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-', '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], {stdio: ['pipe', 'inherit', 'inherit']});
const done = new Promise((res, rej) => ff.on('close', (code) => (code === 0 ? res() : rej(new Error(`ffmpeg exited ${code}`)))));
for (let f = 0; f < total; f++) {
  const png = await grab(f / fps);
  if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once('drain', r));
  if (f % fps === 0) process.stdout.write(`\r  frame ${f}/${total}`);
}
ff.stdin.end();
await done;
await browser.close();
console.log(`\r✓ ${total} frames -> ${path.relative(process.cwd(), out)}`);
