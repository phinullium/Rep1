#!/usr/bin/env node
// Generates an ORIGINAL, license-free soundtrack + SFX with FFmpeg (no samples, no third-party music).
// Usage: node scripts/make-audio.mjs campaigns/nova-launch [--bpm 120] [--duration 25]
// Writes audio/music.mp3, audio/{click,pop,whoosh}.wav and audio/beats.json.
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const dir = path.resolve(args.find((a) => !a.startsWith('--')) || 'campaigns/nova-launch');
const opt = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? Number(args[i + 1]) : d;
};
const campaign = JSON.parse(fs.readFileSync(path.join(dir, 'campaign.json'), 'utf8'));
const bpm = opt('bpm', 120);
const duration = opt('duration', campaign.duration);
const beat = 60 / bpm;
const out = path.join(dir, 'audio');
fs.mkdirSync(out, {recursive: true});

const ff = (...a) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...a], {stdio: 'inherit'});

// --- Music bed ------------------------------------------------------------
// Kick: pitch-swept sine on every beat. Pad: soft chord, changes every 2 bars.
const tb = `mod(t,${beat})`; // time since last beat
const kick = `0.55*sin(2*PI*(46*${tb}+2*(1-exp(-30*${tb}))))*exp(-9*${tb})`;
// Off-beat tick (bandlimited by short decay) for drive.
const tick = `0.05*sin(2*PI*5200*mod(t+${beat / 2},${beat}))*exp(-60*mod(t+${beat / 2},${beat}))`;
const bar2 = beat * 8; // two bars of 4/4
const chord = (f1, f2, f3) => `(sin(2*PI*${f1}*t)+0.8*sin(2*PI*${f2}*t)+0.6*sin(2*PI*${f3}*t))`;
const seg = `mod(floor(t/${bar2}),4)`;
const pad = `0.07*if(eq(${seg},0),${chord(220, 261.63, 329.63)},if(eq(${seg},1),${chord(174.61, 220, 261.63)},if(eq(${seg},2),${chord(196, 246.94, 293.66)},${chord(164.81, 207.65, 246.94)})))*(0.6+0.4*sin(2*PI*t/${beat * 2}))`;
// Bass on beats 1 and 3, root of the current chord.
const root = `if(eq(${seg},0),110,if(eq(${seg},1),87.31,if(eq(${seg},2),98,82.41)))`;
const tb2 = `mod(t,${beat * 2})`;
const bass = `0.18*sin(2*PI*${root}*t)*exp(-3*${tb2})`;
ff(
  '-f', 'lavfi', '-i', `aevalsrc='${kick}+${tick}+${pad}+${bass}':s=48000:d=${duration}`,
  '-af', `afade=t=in:d=0.4,afade=t=out:st=${duration - 1.8}:d=1.8,alimiter=limit=0.9,loudnorm=I=-18:TP=-2:LRA=9`,
  '-ac', '2', '-ar', '48000', '-c:a', 'libmp3lame', '-b:a', '192k', path.join(out, 'music.mp3'),
);

// --- SFX --------------------------------------------------------------------
ff('-f', 'lavfi', '-i', `aevalsrc='0.6*sin(2*PI*1900*t)*exp(-140*t)+0.3*sin(2*PI*950*t)*exp(-90*t)':s=48000:d=0.09`, '-ac', '2', path.join(out, 'click.wav'));
ff('-f', 'lavfi', '-i', `aevalsrc='0.5*sin(2*PI*(520*t+12*(1-exp(-40*t))))*exp(-22*t)':s=48000:d=0.25`, '-ac', '2', path.join(out, 'pop.wav'));
ff('-f', 'lavfi', '-i', 'anoisesrc=d=0.55:c=pink:a=0.35:seed=7', '-af', 'highpass=f=500,lowpass=f=6000,afade=t=in:d=0.3:curve=qsin,afade=t=out:st=0.3:d=0.25,volume=0.8', '-ac', '2', '-ar', '48000', path.join(out, 'whoosh.wav'));

// --- Beat grid (exact, because we synthesised the track) --------------------
const beats = [];
for (let t = 0; t < duration - 1e-9; t += beat) beats.push(Number(t.toFixed(4)));
const downbeats = beats.filter((_, i) => i % 4 === 0);
fs.writeFileSync(path.join(out, 'beats.json'), JSON.stringify({source: 'synthesised', bpm, beats, downbeats}, null, 2));
console.log(`✓ wrote ${path.relative(process.cwd(), out)}/{music.mp3,click.wav,pop.wav,whoosh.wav,beats.json} (${bpm} BPM, ${beats.length} beats)`);
