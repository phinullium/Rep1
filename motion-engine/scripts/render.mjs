#!/usr/bin/env node
// Renderer + variant generator + delivery manifest.
//
//   node scripts/render.mjs campaigns/nova-launch --preview            # storyboard + transition frames (no MP4s)
//   node scripts/render.mjs campaigns/nova-launch                      # all 18 exports
//   node scripts/render.mjs campaigns/nova-launch --formats 9:16 --hooks A --ctas A,B
//
// Validation runs first; a campaign with errors never reaches the renderer.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {bundle} from '@remotion/bundler';
import {renderMedia, renderStill, selectComposition} from '@remotion/renderer';
import {spawnSync} from 'node:child_process';
import {FORMATS, loadCampaign, sha256File, variantMatrix} from './lib/campaign.mjs';

// Two-pass EBU R128 loudness normalisation (audio only; video stream is copied untouched).
// Platforms normalise playback around -14 LUFS; a quieter master sounds weak in the feed.
function normalizeLoudness(file, I = -14, TP = -1.5, LRA = 11) {
  const err = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', `loudnorm=I=${I}:TP=${TP}:LRA=${LRA}:print_format=json`, '-f', 'null', '-'], {encoding: 'utf8'}).stderr;
  const m = JSON.parse(err.slice(err.lastIndexOf('{'), err.lastIndexOf('}') + 1));
  const tmp = file.replace(/\.mp4$/, '.norm.mp4');
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', file, '-map', '0', '-c:v', 'copy',
    '-af', `loudnorm=I=${I}:TP=${TP}:LRA=${LRA}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`,
    '-ar', '48000', '-c:a', 'aac', '-b:a', '320k', '-movflags', '+faststart', tmp]);
  fs.renameSync(tmp, file);
  return {inputLUFS: Number(m.input_i), inputTruePeak: Number(m.input_tp), targetLUFS: I, targetTruePeak: TP};
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = (k) => argv.includes(`--${k}`);
const opt = (k) => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const list = (k) => opt(k)?.split(',').map((s) => s.trim());
const target = argv.find((a, i) => !a.startsWith('--') && !argv[i - 1]?.startsWith('--')) || 'campaigns/nova-launch';

const {campaign: c, dir, file, errors, warnings} = loadCampaign(path.resolve(target));
warnings.forEach((w) => console.log(`  warn  ${w}`));
if (errors.length) {
  errors.forEach((e) => console.log(`  FAIL  ${e}`));
  console.error(`\n✗ validation failed (${errors.length}). Nothing rendered.`);
  process.exit(1);
}

// Use a locally installed Chrome Headless Shell when present (offline/CI); otherwise Remotion downloads its own.
const browserExecutable =
  process.env.REMOTION_BROWSER ||
  ['/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell'].find((p) => fs.existsSync(p)) ||
  null;

const outDir = path.resolve(opt('out') || path.join(root, 'out', c.project));
fs.mkdirSync(outDir, {recursive: true});
const beats = c.assets.beats ? JSON.parse(fs.readFileSync(path.join(dir, c.assets.beats), 'utf8')).beats : undefined;
const compId = (format) => `Campaign-${FORMATS[format].slug}`;

console.log(`• bundling template (public dir: ${path.relative(root, dir)})`);
const serveUrl = await bundle({entryPoint: path.join(root, 'src/index.ts'), publicDir: dir, onProgress: () => {}});

const qcLog = [];
const onBrowserLog = (log) => {
  if (/\[qc-/.test(log.text)) qcLog.push(log.text);
  else if (log.type === 'error') console.log(`  browser: ${log.text}`);
};
const base = {serveUrl, browserExecutable, onBrowserLog, logLevel: 'error'};

const formats = list('formats') || c.variants.formats;
const hookIds = list('hooks');
const ctaIds = list('ctas');

if (flag('preview')) {
  // Storyboard pass + timing pass: representative frames and frames
  // immediately before/during/after every transition and click.
  const sc = Object.fromEntries(c.scenes.map((s) => [s.id, s]));
  const storyboard = c.scenes.flatMap((s) => [s.start + (s.end - s.start) * 0.35, s.start + (s.end - s.start) * 0.8]);
  const transitions = c.scenes.slice(1).flatMap((s) => [s.start - 0.2, s.start, s.start + 0.12, s.start + 0.3]);
  const per = (sc.features.end - sc.features.start) / c.features.length;
  const keyMoments = [sc.product.start + 2.0, sc.product.start + 2.25, sc.product.start + 3.5, sc.product.start + 3.75, sc.product.start + 4.1, sc.features.start + per, sc.features.start + per * 2, sc.cta.start + 3.5, c.duration - 1 / c.fps];
  const times = [...new Set([...storyboard, ...transitions, ...keyMoments].map((t) => Math.min(c.duration - 1 / c.fps, Math.max(0, t)).toFixed(3)))].map(Number).sort((a, b) => a - b);
  const hook = hookIds?.[0] || c.hooks[0].id;
  const cta = ctaIds?.[0] || c.ctas[0].id;
  for (const format of formats) {
    const dirF = path.join(outDir, 'preview', FORMATS[format].slug);
    fs.rmSync(dirF, {recursive: true, force: true});
    fs.mkdirSync(dirF, {recursive: true});
    const inputProps = {campaign: c, hook, cta, debug: true, beats};
    const composition = await selectComposition({...base, id: compId(format), inputProps});
    for (const t of times) {
      const frame = Math.round(t * c.fps);
      await renderStill({...base, composition, inputProps, frame, output: path.join(dirF, `f${String(frame).padStart(4, '0')}.png`), imageFormat: 'png'});
    }
    // Contact sheet of the preview frames.
    const cols = format === '16:9' ? 4 : 6;
    const w = format === '16:9' ? 480 : 270;
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-pattern_type', 'glob', '-i', path.join(dirF, 'f*.png'), '-vf', `scale=${w}:-1,tile=${cols}x${Math.ceil(times.length / cols)}:padding=6:color=white`, '-frames:v', '1', path.join(outDir, 'preview', `storyboard-${FORMATS[format].slug}.png`)]);
    console.log(`✓ preview ${format}: ${times.length} frames -> ${path.relative(root, dirF)} + storyboard-${FORMATS[format].slug}.png`);
  }
  fs.writeFileSync(path.join(outDir, 'preview', 'qc-log.txt'), qcLog.join('\n'));
  console.log(qcLog.length ? `! ${qcLog.length} layout warnings (see preview/qc-log.txt)` : '✓ no overflow / safe-zone warnings in preview frames');
  process.exit(0);
}

// ---- Full campaign render ----------------------------------------------------
const matrix = variantMatrix(c, {formats, hooks: hookIds, ctas: ctaIds});
const exportsDir = path.join(outDir, 'exports');
fs.mkdirSync(exportsDir, {recursive: true});
// bt709 + yuv420p (TV range): what TikTok/Reels/Shorts/YouTube expect. Remotion's default here was full-range yuvj420p/bt470bg.
const settings = {codec: 'h264', crf: 18, pixelFormat: 'yuv420p', colorSpace: 'bt709', audioCodec: 'aac', audioBitrate: '320k', fps: c.fps, x264Preset: 'medium', loudness: '-14 LUFS / -1.5 dBTP (two-pass loudnorm)', faststart: true};
const outputs = [];
const t0 = Date.now();
for (const [i, v] of matrix.entries()) {
  const name = `${c.project}_${FORMATS[v.format].slug}_hook-${v.hook}_cta-${v.cta}.mp4`;
  const outputLocation = path.join(exportsDir, name);
  const inputProps = {campaign: c, hook: v.hook, cta: v.cta, debug: false, beats};
  const composition = await selectComposition({...base, id: compId(v.format), inputProps});
  const before = qcLog.length;
  const ts = Date.now();
  await renderMedia({
    ...base,
    composition,
    inputProps,
    codec: settings.codec,
    crf: settings.crf,
    pixelFormat: settings.pixelFormat,
    colorSpace: settings.colorSpace,
    audioCodec: settings.audioCodec,
    audioBitrate: settings.audioBitrate,
    x264Preset: settings.x264Preset,
    outputLocation,
    onProgress: ({progress}) => process.stdout.write(`\r  [${i + 1}/${matrix.length}] ${name} ${(progress * 100).toFixed(0)}%   `),
  });
  process.stdout.write('\n');
  const loudness = normalizeLoudness(outputLocation);
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', outputLocation]).toString());
  const vs = probe.streams.find((s) => s.codec_type === 'video');
  outputs.push({
    file: path.relative(outDir, outputLocation),
    ...v,
    sha256: sha256File(outputLocation),
    bytes: Number(probe.format.size),
    duration: Number(probe.format.duration),
    width: vs.width,
    height: vs.height,
    fps: vs.r_frame_rate,
    hasAudio: probe.streams.some((s) => s.codec_type === 'audio'),
    renderSeconds: Math.round((Date.now() - ts) / 1000),
    loudness,
    qcWarnings: qcLog.slice(before),
  });
}

// Poster frame per format/CTA (end card after the click).
const posters = [];
for (const format of formats) {
  for (const cta of [...new Set(matrix.map((m) => m.cta))]) {
    const inputProps = {campaign: c, hook: matrix[0].hook, cta, debug: false, beats};
    const composition = await selectComposition({...base, id: compId(format), inputProps});
    const output = path.join(exportsDir, `${c.project}_${FORMATS[format].slug}_cta-${cta}_poster.png`);
    const sc = c.scenes.find((s) => s.id === 'cta');
    await renderStill({...base, composition, inputProps, frame: Math.round((sc.start + 4.6) * c.fps), output, imageFormat: 'png'});
    posters.push(path.relative(outDir, output));
  }
}

let git = null;
try {
  git = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {cwd: root}).toString().trim();
} catch {}
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const remotionVersion = JSON.parse(fs.readFileSync(path.join(root, 'node_modules/remotion/package.json'), 'utf8')).version;
const assetFiles = [c.assets.logo, ...Object.values(c.assets.fonts), c.assets.music, ...Object.values(c.assets.sfx), c.assets.beats].filter(Boolean);
const manifest = {
  project: c.project,
  client: c.client,
  renderedAt: new Date().toISOString(),
  template: {name: pkg.name, version: pkg.version, git, remotion: remotionVersion},
  campaign: {file: path.relative(root, file), sha256: sha256File(file)},
  assets: Object.fromEntries(assetFiles.map((p) => [p, sha256File(path.join(dir, p))])),
  settings,
  dataSource: c.product.ui.dataSource,
  outputs,
  posters,
  totalRenderSeconds: Math.round((Date.now() - t0) / 1000),
};
fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`✓ ${outputs.length} exports + ${posters.length} posters in ${path.relative(root, exportsDir)} (${manifest.totalRenderSeconds}s). Manifest: ${path.relative(root, path.join(outDir, 'manifest.json'))}`);
if (qcLog.length) console.log(`! ${qcLog.length} layout warnings recorded in manifest.outputs[].qcWarnings`);
