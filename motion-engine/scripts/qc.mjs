#!/usr/bin/env node
// Quality controller for rendered exports.
//   node scripts/qc.mjs campaigns/nova-launch
// For every MP4 in out/<project>/exports it produces:
//   - a 5x5 contact sheet (1 frame/s)                                     -> qc/<name>/contact.png
//   - frames just before / at / after every scene transition               -> qc/<name>/transitions.png
//   - a phone-size copy of the contact sheet (feed size, ~360 px wide)      -> qc/<name>/phone.png
//   - automated checks: duration, resolution, fps, pixel format, audio
//     present + in sync length, integrated loudness, black frames, frozen
//     frames, layout warnings captured during render
// and writes out/<project>/qc/review-report.md with a human sign-off section.
// "Never trust a statement such as 'the animation looks great' from an agent
// that has not inspected the rendered output."
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {FORMATS, loadCampaign} from './lib/campaign.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = process.argv[2] || 'campaigns/nova-launch';
const {campaign: c, errors} = loadCampaign(path.resolve(target));
if (errors.length) {
  console.error('campaign invalid; run validate first');
  process.exit(1);
}
const outDir = path.join(root, 'out', c.project);
const manifestPath = path.join(outDir, 'manifest.json');
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {outputs: []};
const exportsDir = path.join(outDir, 'exports');
const files = fs.existsSync(exportsDir) ? fs.readdirSync(exportsDir).filter((f) => f.endsWith('.mp4')).sort() : [];
if (!files.length) {
  console.error(`no exports in ${exportsDir}; run the renderer first`);
  process.exit(1);
}
const qcDir = path.join(outDir, 'qc');
fs.mkdirSync(qcDir, {recursive: true});

const ff = (args) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args]);
// Filters that report via stderr (ebur128, blackdetect, freezedetect).
const ffInfo = (args) => spawnSync('ffmpeg', ['-hide_banner', '-nostats', ...args, '-f', 'null', '-'], {encoding: 'utf8', maxBuffer: 1 << 28}).stderr;
const probe = (f) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', f]).toString());

const transitions = c.scenes.slice(1).map((s) => s.start);
const frameDur = 1 / c.fps;
const report = [];
let failures = 0;

for (const file of files) {
  const f = path.join(exportsDir, file);
  const name = file.replace(/\.mp4$/, '');
  const dir = path.join(qcDir, name);
  fs.mkdirSync(dir, {recursive: true});
  const issues = [];
  const notes = [];
  const p = probe(f);
  const v = p.streams.find((s) => s.codec_type === 'video');
  const a = p.streams.find((s) => s.codec_type === 'audio');
  const fmt = Object.entries(FORMATS).find(([, d]) => d.width === v.width && d.height === v.height)?.[0];
  const expectedFormat = Object.entries(FORMATS).find(([, d]) => file.includes(`_${d.slug}_`))?.[0];

  // --- Technical checks
  const dur = Number(p.format.duration);
  if (Math.abs(dur - c.duration) > frameDur * 1.5) issues.push(`duration ${dur.toFixed(3)}s, expected ${c.duration}s`);
  if (!fmt || fmt !== expectedFormat) issues.push(`resolution ${v.width}x${v.height} does not match ${expectedFormat}`);
  const [num, den] = v.r_frame_rate.split('/').map(Number);
  if (Math.abs(num / den - c.fps) > 0.01) issues.push(`fps ${v.r_frame_rate}, expected ${c.fps}`);
  if (v.pix_fmt !== 'yuv420p') issues.push(`pixel format ${v.pix_fmt} (platforms expect yuv420p)`);
  if (v.color_range && v.color_range !== 'tv') issues.push(`colour range ${v.color_range} (expected tv/limited)`);
  if (v.color_space && v.color_space !== 'bt709') issues.push(`colour space ${v.color_space} (expected bt709)`);
  if (v.codec_name !== 'h264') issues.push(`video codec ${v.codec_name} (h264 is the safest upload codec)`);
  if (!a) issues.push('no audio stream');
  else {
    const vd = Number(v.duration ?? dur);
    const ad = Number(a.duration ?? dur);
    if (Math.abs(vd - ad) > 0.1) issues.push(`audio/video length mismatch: video ${vd.toFixed(3)}s, audio ${ad.toFixed(3)}s`);
    const eb = ffInfo(['-i', f, '-map', '0:a', '-af', 'ebur128=peak=true']);
    const summary = eb.slice(eb.lastIndexOf('Summary:')); // per-frame lines start at -70 LUFS; only the summary is final
    const I = Number(summary.match(/I:\s+(-?[\d.]+) LUFS/)?.[1]);
    const TP = Number(summary.match(/Peak:\s+(-?[\d.]+) dBFS/)?.[1]);
    notes.push(`loudness ${I} LUFS, true peak ${TP} dBTP`);
    if (!(I > -20 && I < -9)) issues.push(`integrated loudness ${I} LUFS is outside -20..-9 (platforms normalise around -14)`);
    if (TP > -0.5) issues.push(`true peak ${TP} dBTP risks clipping after platform transcoding`);
  }
  const bd = ffInfo(['-i', f, '-map', '0:v', '-vf', 'blackdetect=d=0.1:pix_th=0.1']);
  const blacks = [...bd.matchAll(/black_start:([\d.]+) black_end:([\d.]+)/g)].map((m) => `${m[1]}-${m[2]}s`);
  if (blacks.length) issues.push(`black frames at ${blacks.join(', ')}`);
  const fd = ffInfo(['-i', f, '-map', '0:v', '-vf', 'freezedetect=n=0.0005:d=1.0']);
  const freezes = [...fd.matchAll(/freeze_start: ([\d.]+)/g)].map((m) => Number(m[1]));
  if (freezes.length) issues.push(`frozen (static) picture for >1s starting at ${freezes.map((x) => x.toFixed(2)).join(', ')}s`);
  const layout = manifest.outputs.find((o) => o.file.endsWith(file))?.qcWarnings ?? [];
  if (layout.length) issues.push(`${layout.length} layout warnings during render (overflow / safe zone): ${layout.slice(0, 3).join(' | ')}`);

  // --- Visual review material
  const tile = v.width > v.height ? '4x4' : '5x5';
  ff(['-i', f, '-vf', `fps=1,scale=${v.width > v.height ? 360 : 270}:-1,tile=${tile}:padding=4:color=white`, '-frames:v', '1', path.join(dir, 'contact.png')]);
  // Timing pass: before / at / after each transition (a broken transition can hide between 1 fps samples).
  const times = transitions.flatMap((t) => [t - 0.2, t - 0.07, t, t + 0.1, t + 0.25]);
  times.forEach((t, i) => ff(['-ss', t.toFixed(3), '-i', f, '-frames:v', '1', '-vf', `scale=${v.width > v.height ? 360 : 240}:-1`, path.join(dir, `t${String(i).padStart(2, '0')}.png`)]));
  ff(['-pattern_type', 'glob', '-i', path.join(dir, 't*.png'), '-vf', `tile=5x${transitions.length}:padding=4:color=white`, '-frames:v', '1', path.join(dir, 'transitions.png')]);
  fs.readdirSync(dir).filter((x) => /^t\d+\.png$/.test(x)).forEach((x) => fs.rmSync(path.join(dir, x)));
  // Phone-size pass: how it reads in a feed.
  ff(['-i', f, '-vf', `fps=1/3,scale=${v.width > v.height ? 360 : 202}:-1:flags=area,tile=${Math.ceil(c.duration / 3)}x1:padding=6:color=white`, '-frames:v', '1', path.join(dir, 'phone.png')]);

  if (issues.length) failures++;
  report.push({file, issues, notes, inspected: {transitions: times.map((t) => Number(t.toFixed(3))), contactSheetFps: 1, phoneSampleEvery: 3}});
  console.log(`${issues.length ? '✗' : '✓'} ${file}${issues.length ? `\n    - ${issues.join('\n    - ')}` : ''}  (${notes.join('; ')})`);
}

const md = [
  `# Review report: ${c.project}`,
  '',
  `Generated ${new Date().toISOString()} by scripts/qc.mjs. Template ${manifest.template?.version ?? '?'} (${manifest.template?.git ?? 'no git'}), Remotion ${manifest.template?.remotion ?? '?'}.`,
  '',
  `UI data source: **${c.product.ui.dataSource}**${c.product.ui.dataSource === 'demo-data' ? ' (deliver as a concept/demo, or replace with client-approved screens/numbers)' : ''}.`,
  '',
  '## Automated checks',
  '',
  '| Export | Result | Notes |',
  '|---|---|---|',
  ...report.map((r) => `| ${r.file} | ${r.issues.length ? `✗ ${r.issues.join('; ')}` : '✓ pass'} | ${r.notes.join('; ')} |`),
  '',
  '## Timestamps inspected',
  '',
  `- Contact sheet: every 1 s (qc/<export>/contact.png)`,
  `- Transitions: ${report[0].inspected.transitions.join(', ')} s (qc/<export>/transitions.png)`,
  `- Phone-size: every 3 s at feed size (qc/<export>/phone.png)`,
  '',
  '## Issues found / fixes applied',
  '',
  '- _fill in during review_',
  '',
  '## Remaining concerns',
  '',
  '- _fill in during review_',
  '',
  '## Human approval',
  '',
  '- [ ] Storyboard approved',
  '- [ ] Brand (logo, font, colours) checked against the approved kit',
  '- [ ] Every on-screen claim matches approvedClaims in campaign.json',
  '- [ ] Watched at least one export per format end-to-end with sound',
  '- [ ] Approved for delivery — name / date:',
  '',
];
fs.writeFileSync(path.join(qcDir, 'review-report.md'), md.join('\n'));
console.log(`\n${failures ? `✗ ${failures}/${files.length} exports have issues` : `✓ all ${files.length} exports passed automated checks`}. Report: ${path.relative(root, path.join(qcDir, 'review-report.md'))}`);
process.exit(failures ? 1 : 0);
