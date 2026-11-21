# clip-studio

Wires the second post's 22 open-source repos into one command-line pipeline:

```
VOD ──fetch──▶ transcribe ──▶ analyze ──▶ (Claude review) ──▶ render ──▶ exports/<platform>/*.mp4
     yt-dlp    whisper.cpp    loudness +      selection.json     PyAV decode → OpenCV/Norfair camera →
     OBS file  stable-ts      motion +                           punch-in → pysubs2 captions → libass burn →
               pyannote       reaction words                     DeepFilterNet / Demucs → loudnorm → x264
```

## Install
```bash
./install.sh core          # required: yt-dlp, OpenCV 4.x, PyAV, pysubs2, Norfair, Supervision (+ ffmpeg with libass)
./install.sh whispercpp    # recommended ASR (builds whisper.cpp from source, downloads ggml-small.en)
./install.sh audio         # optional: DeepFilterNet + Demucs
./install.sh enhance       # optional: Real-ESRGAN binary + RIFE source
.venv/bin/python -m clipstudio doctor   # which of the 22 tools are ready
```

## Use
```bash
PY=.venv/bin/python
$PY -m clipstudio run "https://www.youtube.com/watch?v=…" -w work/ep1 --top 3 --platforms tiktok,reels,shorts --mode split
# or step by step:
$PY -m clipstudio fetch my_obs_recording.mkv -w work/ep1
$PY -m clipstudio transcribe -w work/ep1 --model small.en
$PY -m clipstudio analyze -w work/ep1 --count 15
$PY -m clipstudio render -w work/ep1 --top 3 --platforms tiktok,reels,shorts,x
$PY -m clipstudio editly -w work/ep1 --top 5           # "Top 5 moments" montage spec → npx editly work/ep1/montage.editly.json
```
In Claude Code, the `clip-studio` skill (`.claude/skills/clip-studio`) adds a review step. Claude reads the candidates,
writes `selection.json` with better titles and cut points, renders, and inspects the frames before handing anything over.

### Render options
| Flag | Effect |
|---|---|
| `--mode face\|motion\|center\|blur\|split` | Reframing: follow a face / follow the action / centre / full frame on a blurred fill / facecam on top + gameplay below (`--cam x,y,w,h` to set the cam box) |
| `--punch-in 0.12` | Zoom amount on the reaction peak |
| `--cold-open auto\|on\|off` | Show the 3 s peak first (auto: when the peak is >4 s in) |
| `--title auto\|none\|"text"` | Hook title bar for the whole clip |
| `--short-tiktok` | Don't extend TikTok exports to ≥61 s (Creator Rewards minimum) |
| `--denoise`, `--music duck\|remove` | DeepFilterNet / Demucs |
| `--debug` | Tracking QC sheet (Supervision overlays) |

### Browser version (no install)
`web/index.html` (Mediabunny): trim, reframe to 9:16 / 1:1 / 16:9 and export MP4 locally in the browser.
Serve it with `npx serve web` or `python3 -m http.server -d web`.

## What was tested here, and what wasn't
Tested in this build environment (Linux, 4 vCPU, no GPU) on the synthetic VOD from `tests/make_test_vod.py`:
- `analyze` ranked the planted reaction (52–56 s) first. Its signals were loudness, motion, reaction words and pace.
  The cut starts on the setup sentence and ends right after the payoff.
- `render` for TikTok, Reels, Shorts, X and YouTube, run from a **fresh `./install.sh core`**: exact durations;
  1080×1920 (YouTube 1920×1080) yuv420p at 30 fps; captions burned with Inter Black; loudness −14.2 to −14.6 LUFS
  (target −14); a 3 s cold open with a flash cut. TikTok was extended to 71.1 s, the others are 22.1 s.
- `face` (Norfair) and `split` modes run and fall back correctly when no face is present. `motion` and `blur` modes were checked visually.
- `web/index.html` exported an H.264 1080×1920 MP4 in headless Chromium.

**Not tested here:** real speech recognition and diarisation, because the network blocks Hugging Face model
downloads. The transcript was a fixture. The test VOD also has no real faces. DeepFilterNet, Demucs, Real-ESRGAN, RIFE
and Editly were not installed or tested here (each is too heavy or GPU-bound for this build). The desktop apps
(OBS, Kdenlive, Shotcut, OpenCut) are used by hand. yt-dlp's download path was also untested, since YouTube is blocked here.
Run `tests/make_test_vod.py`, then the commands above, on your machine to verify end to end.
