#!/usr/bin/env node
// Beat + peak analysis for a client-supplied (licensed) soundtrack.
// Usage: node scripts/analyze-beats.mjs path/to/track.mp3 > campaigns/x/audio/beats.json
// Method: decode to mono PCM with FFmpeg -> onset-strength envelope (positive
// energy flux, 256-sample hop) -> tempo by autocorrelation (70-180 BPM) ->
// beat phase by comb scoring -> loudest peaks for "hit" events.
import {execFileSync} from 'node:child_process';

const file = process.argv[2];
if (!file) {
  console.error('usage: analyze-beats.mjs <audio file>');
  process.exit(2);
}
const SR = 22050;
const HOP = 256;
const WIN = 1024;
const pcm = execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', file, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], {maxBuffer: 1 << 30});
const x = new Float32Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.byteLength / 4));
const frames = Math.max(0, Math.floor((x.length - WIN) / HOP));
const energy = new Float64Array(frames);
for (let f = 0; f < frames; f++) {
  let s = 0;
  for (let i = 0; i < WIN; i++) s += x[f * HOP + i] ** 2;
  energy[f] = Math.log1p(1000 * Math.sqrt(s / WIN));
}
const onset = new Float64Array(frames);
for (let f = 1; f < frames; f++) onset[f] = Math.max(0, energy[f] - energy[f - 1]);
// Remove local mean (adaptive threshold).
const W = 8;
const env = onset.map((v, f) => {
  let m = 0;
  let n = 0;
  for (let k = Math.max(0, f - W); k < Math.min(frames, f + W); k++) (m += onset[k]), n++;
  return Math.max(0, v - m / n);
});
const fps = SR / HOP;
// Linear interpolation so tempo resolution is not limited to whole-frame lags.
const at = (pos) => {
  const i = Math.floor(pos);
  const fr = pos - i;
  return (env[i] || 0) * (1 - fr) + (env[i + 1] || 0) * fr;
};
let best = {bpm: 120, score: -1};
for (let bpm = 70; bpm <= 180; bpm += 0.25) {
  const lag = (60 / bpm) * fps;
  let s = 0;
  for (let f = 0; f + lag * 4 < frames; f++) {
    s += env[f] * (at(f + lag) + 0.5 * at(f + 2 * lag) + 0.25 * at(f + 4 * lag));
  }
  if (s > best.score) best = {bpm, score: s};
}
const period = (60 / best.bpm) * fps;
let bestPhase = 0;
let bestPhaseScore = -1;
for (let p = 0; p < period; p += 0.25) {
  let s = 0;
  for (let f = p; f < frames; f += period) s += at(f);
  if (s > bestPhaseScore) (bestPhaseScore = s), (bestPhase = p);
}
const beats = [];
for (let f = bestPhase; f < frames; f += period) beats.push(Number(((f * HOP) / SR).toFixed(4)));
// Top peaks, at least 0.75 s apart.
const idx = [...env.keys()].sort((a, b) => env[b] - env[a]);
const peaks = [];
for (const f of idx) {
  const t = (f * HOP) / SR;
  if (peaks.every((p) => Math.abs(p - t) > 0.75)) peaks.push(t);
  if (peaks.length >= 12) break;
}
console.log(
  JSON.stringify(
    {source: file, bpm: best.bpm, beats, downbeats: beats.filter((_, i) => i % 4 === 0), peaks: peaks.sort((a, b) => a - b).map((t) => Number(t.toFixed(3)))},
    null,
    2,
  ),
);
