# Tool catalog

Every tool from both posts, sorted by the stage it serves, plus how this repo uses it.
Licences were read from each repository's LICENSE/COPYING file on 2026-11-21 (shallow clone of the default branch).

**Status key**
- **wired**: called automatically by `clip-studio` or `motion-engine`
- **optional**: wired, but only runs after you install it (`clip-studio/install.sh <tier>`)
- **manual**: a desktop or web app you operate yourself; the pipeline hands files to it

## Post 2: the "clips studio" (22 repos), by pipeline stage

`VOD → find the reaction → cut → punch in → caption → ship`

### 1. Ingest
| # | Tool | Role here | Status | Licence |
|---|---|---|---|---|
| 01 | [yt-dlp](https://github.com/yt-dlp/yt-dlp) | `clipstudio fetch <url>`: best ≤1080p MP4 plus info JSON | wired (core) | Unlicense |
| 04 | [OBS Studio](https://github.com/obsproject/obs-studio) | Record your own gameplay and facecam: the cleanest-rights source | manual | GPL-2.0 |

### 2. Understand (speech)
| # | Tool | Role here | Status | Licence |
|---|---|---|---|---|
| 08 | [whisper.cpp](https://github.com/ggml-org/whisper.cpp) | Default ASR. Fast on CPU, word-level segments (`-ml 1 -sow -oj`). Built from source by `install.sh whispercpp` | optional (recommended) | MIT |
| 07 | [Whisper](https://github.com/openai/whisper) | Python ASR fallback (`word_timestamps=True`) | optional | MIT |
| 09 | [stable-ts](https://github.com/jianfch/stable-ts) | More stable word timestamps, so captions land on the beat | optional | MIT |
| 10 | [pyannote.audio](https://github.com/pyannote/pyannote-audio) | `--diarize`: labels who speaks when (`speaker-diarization-community-1`; needs `HF_TOKEN`) | optional | MIT (code); model gated on Hugging Face |

### 3. Find highlights
| # | Tool | Role here | Status | Licence |
|---|---|---|---|---|
| 05 | [AI Shorts Generator](https://github.com/Anil-matcha/AI-Youtube-Shorts-Generator) | Alternative LLM-ranked clipper. Its **default mode calls the paid MuAPI service**; `--mode local` still needs an OpenAI or Gemini key. `clipstudio analyze` ranks offline instead, and Claude re-ranks via the `clip-studio` skill | optional (`install.sh vendor`) | MIT |

### 4. Track, reframe, punch in
| # | Tool | Role here | Status | Licence |
|---|---|---|---|---|
| 03 | [OpenCV](https://github.com/opencv/opencv) | Face detection (Haar), motion energy, crops and resizes. Pinned `<5`: OpenCV 5.x wheels no longer ship the Haar cascades | wired (core) | Apache-2.0 |
| 12 | [Norfair](https://github.com/tryolabs/norfair) | Keeps one identity per face across frames, so the camera follows the main subject | wired (core) | BSD-3-Clause |
| 11 | [Supervision](https://github.com/roboflow/supervision) | `--debug`: detection overlays written to `*_tracking.jpg` for QC | wired (core) | MIT |

### 5. Audio
| # | Tool | Role here | Status | Licence |
|---|---|---|---|---|
| 13 | [DeepFilterNet](https://github.com/Rikorose/DeepFilterNet) | `--denoise`: cleans noisy mics | optional (`install.sh audio`) | MIT or Apache-2.0 |
| 14 | [Demucs](https://github.com/facebookresearch/demucs) | `--music duck|remove`: splits voice from music, to cut Content ID risk from game soundtracks | optional (`install.sh audio`) | MIT |

### 6. Captions
| # | Tool | Role here | Status | Licence |
|---|---|---|---|---|
| 15 | [pysubs2](https://github.com/tkarabela/pysubs2) | Builds the ASS captions: 1–3 words at a time, spoken word highlighted, pop-in, inside the safe area | wired (core) | MIT |
| 16 | [libass](https://github.com/libass/libass) | Burns the ASS captions in through FFmpeg's `ass` filter, using the bundled Inter Black font | wired (via FFmpeg) | ISC |

### 7. Enhance
| # | Tool | Role here | Status | Licence |
|---|---|---|---|---|
| 20 | [Real-ESRGAN](https://github.com/xinntao/Real-ESRGAN) | Upscale low-res sources before reframing (a 9:16 crop of 720p is soft). `install.sh enhance` fetches the ncnn-vulkan binary (needs a Vulkan GPU) | optional | BSD-3-Clause |
| 21 | [RIFE](https://github.com/hzwer/ECCV2022-RIFE) | Frame interpolation for slow-mo replays (`inference_video.py --exp=1`). Weights are a manual download, per its README | optional | MIT |

### 8. Assemble and export
| # | Tool | Role here | Status | Licence |
|---|---|---|---|---|
| 22 | [PyAV](https://github.com/PyAV-Org/PyAV) | Frame-accurate decoding of the clip range for reframing | wired (core) | BSD-3-Clause |
| 17 | [Editly](https://github.com/mifi/editly) | `clipstudio editly`: writes a "Top N moments" montage spec; render with `npx editly` | optional | MIT |
| 06 | [Mediabunny](https://github.com/Vanilagy/mediabunny) | `clip-studio/web/index.html`: trim, reframe and export MP4 in the browser, no install (tested: H.264 1080×1920 output) | wired (web) | MPL-2.0 |
| 02 | [OpenCut](https://github.com/OpenCut-app/OpenCut) | Open-source timeline editor for hand touch-ups | manual | MIT |
| 18 | [Kdenlive](https://github.com/KDE/kdenlive) | Final cut and keyframes on long-form or compilations | manual | GPL-3.0 (COPYING) |
| 19 | [Shotcut](https://github.com/mltframework/shotcut) | Mix tracks and apply filters | manual | GPL-3.0 |

Run `clip-studio/.venv/bin/python -m clipstudio doctor` to see which of the 22 are ready on your machine.

## Post 1: the article's motion-design stack

| Tool | Role here | Licence |
|---|---|---|
| Claude (via Claude Code) | Writes and maintains the templates; inspects rendered frames during QC | n/a |
| [Remotion](https://github.com/remotion-dev/remotion) | React compositions, parameterised by `campaign.json`, rendered with `@remotion/renderer` | **Custom.** Free for individuals, non-profits and for-profit orgs with **≤3 employees**; larger teams need a Company License ([terms](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md)) |
| [Remotion Agent Skills](https://github.com/remotion-dev/skills) | Installed in `.agents/skills/remotion-*` (symlinked into `.claude/skills/`) with `npx remotion skills add` | see repo |
| Playwright + FFmpeg | `motion-engine/seek-demo/render-seek.mjs`: Chromium calls `seek(t)` and PNGs stream into FFmpeg's stdin | Apache-2.0 / LGPL-GPL |
| [HyperFrames](https://github.com/heygen-com/hyperframes) | Optional HTML-first alternative renderer. Documented, not used: the article recommends running only one renderer | Apache-2.0 |
