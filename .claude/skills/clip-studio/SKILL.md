---
name: clip-studio
description: Turn a long VOD / stream / gameplay recording into viral vertical clips for TikTok, Reels, Shorts and X with clip-studio (yt-dlp, whisper.cpp, OpenCV, Norfair, pysubs2, libass, PyAV). Use when asked to clip a stream, make shorts from a video, find highlights or reactions, or post gameplay clips.
---

# Clip Studio

`VOD → find the reaction → cut → punch in → caption → ship`. Run commands from `clip-studio/`
(`PY=.venv/bin/python`; run `./install.sh core` first if `.venv` is missing).

## 1. Check tools and rights
- `$PY -m clipstudio doctor`. If whisper.cpp is missing: `./install.sh whispercpp`.
- Ask where the footage comes from. Own recordings (OBS) or written permission only. Never re-upload
  other creators' VODs or game trailers for money. For GTA or other game footage, point the user to
  PLATFORMS.md §4 (spoilers, music Content ID → `--music remove`).

## 2. Ingest, transcribe, analyse
```bash
$PY -m clipstudio fetch "<url or file>" -w work/<name>
$PY -m clipstudio transcribe -w work/<name> --model small.en      # --diarize if 2+ speakers and HF_TOKEN set
$PY -m clipstudio analyze -w work/<name> --count 15
```

## 3. YOU review the candidates (this is the step that makes clips viral)
Read `work/<name>/candidates.json` and the matching transcript text. For each candidate judge:
- Does it make sense **without context**? Is there a clear payoff (reaction, fail, clutch, joke, reveal)?
- Does the **first sentence** hook? If not, adjust `start` to a stronger line, or rely on the cold open.
- Does it end right after the payoff (loopable)? Trim tails.
Write `work/<name>/selection.json`, best first, keeping 3–8 clips:
```json
{"clips": [
  {"id": 1, "start": 812.4, "end": 841.9, "peak": 828.1,
   "title": "He did NOT see that coming",
   "mode": "split"}
]}
```
Title rules: ≤ 7 words, a curiosity gap that the clip pays off, no lies, no spoilers of story missions,
no all-caps walls. `mode`: `split` for facecam streams, `face` for talking heads / podcasts, `motion` or `blur`
for gameplay without a cam.

## 4. Render per platform
```bash
$PY -m clipstudio render -w work/<name> --platforms tiktok,reels,shorts,x --punch-in 0.12
```
- TikTok exports auto-extend to ≥ 61 s (Creator Rewards only pays on originals > 1 min). Use `--short-tiktok` only for pure reach.
- Cold open is automatic when the peak is > 4 s in (`--cold-open on|off` to force).
- `--denoise` for bad mics, `--music remove` for licensed/in-game music, `--debug` for tracking sheets.

## 5. QC before delivery (never skip)
For every export, extract frames and LOOK at them (Read the PNGs):
```bash
ffmpeg -i work/<name>/exports/tiktok/clip01_tiktok.mp4 -vf "fps=1,scale=270:-1,tile=6x4" -frames:v 1 /tmp/sheet.png
```
Check: subject in frame (not cut off), captions inside the safe area and in sync, title readable at phone size,
no black or frozen frames, audio present (`ffmpeg -i f.mp4 -af ebur128 -f null -` ≈ −14 LUFS).

## 6. Package posts
Write `work/<name>/posts.md`: per clip and platform, a caption (first line = hook, ≤ 100 chars), 3–5 specific hashtags,
and the export path. Never claim an outcome ("guaranteed viral") — report what was produced and verified.
