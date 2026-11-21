"""Builds a reproducible 90 s 16:9 test "stream VOD" + an aligned transcript fixture.

  .venv/bin/python tests/make_test_vod.py work/test

Video: a subject that drifts slowly, then moves fast with flashes at ~52-58 s.
Audio: low ambience + speech (FFmpeg flite TTS); the reaction line at 52 s is loud.
transcript.json is a FIXTURE (word times spread by character count inside each
TTS line) so the pipeline can be tested without downloading a Whisper model.
Expected result: `analyze` ranks a clip containing ~52-56 s first.
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import cv2
import numpy as np

W, H, FPS, DUR = 1280, 720, 30, 90
LINES = [
    (3, "Alright chat, we are finally in the city.", 1.0),
    (12, "Let me grab a car and head downtown.", 1.0),
    (22, "This traffic is honestly kind of slow today.", 1.0),
    (33, "Okay where is the mission marker, I think it is over here.", 1.0),
    (44, "Wait, hold on, what is that guy doing?", 1.3),
    (52, "No way! Oh my god! Let's go! That was insane!", 4.0),
    (60, "Did you see that? Are you serious right now?", 1.6),
    (70, "Okay okay, back to the mission.", 1.0),
    (80, "Thanks for watching, see you next stream.", 1.0),
]


def main(work: Path) -> None:
    work.mkdir(parents=True, exist_ok=True)
    tmp = work / "_tts"
    tmp.mkdir(exist_ok=True)
    words, inputs, filters = [], [], []
    for k, (t, text, gain) in enumerate(LINES):
        wav = tmp / f"l{k}.wav"
        safe = text.replace("'", "").replace(":", "")
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", f"flite=text='{safe}':voice=slt", "-ar", "48000", "-ac", "1", str(wav)], check=True)
        d = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(wav)], capture_output=True, text=True).stdout)
        toks = text.split()
        total = sum(len(x) + 1 for x in toks)
        cur = t + 0.08
        speak = d - 0.16
        for tok in toks:
            dd = speak * (len(tok) + 1) / total
            words.append({"w": " " + tok, "s": round(cur, 3), "e": round(cur + dd * 0.9, 3), "p": None})
            cur += dd
        inputs += ["-i", str(wav)]
        filters.append(f"[{k + 1}:a]volume={gain},adelay={int(t * 1000)}:all=1[s{k}]")
    # Ambience + a crowd/explosion burst at the reaction.
    amb = f"anoisesrc=d={DUR}:c=brown:a=0.03:seed=3"
    burst = "anoisesrc=d=3:c=white:a=0.25:seed=9,afade=t=out:st=0.2:d=2.8,adelay=52500:all=1"
    mix = ";".join(filters) + f";{amb}[amb];{burst}[b];[amb][b]" + "".join(f"[s{k}]" for k in range(len(LINES))) + f"amix=inputs={len(LINES) + 2}:normalize=0,apad=whole_dur={DUR}[a]"

    proc = subprocess.Popen(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-", *inputs,
         "-filter_complex", mix, "-map", "0:v", "-map", "[a]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
         "-c:a", "aac", "-b:a", "160k", "-t", str(DUR), str(work / "source.mp4")],
        stdin=subprocess.PIPE,
    )
    rng = np.random.default_rng(1)
    stars = rng.integers(0, [W, H], size=(160, 2))
    for f in range(DUR * FPS):
        t = f / FPS
        img = np.full((H, W, 3), (40, 32, 26), np.uint8)
        # parallax "city" blocks
        for i in range(12):
            x = int((i * 140 - t * 40) % (W + 200)) - 100
            cv2.rectangle(img, (x, 380 - (i * 37) % 160), (x + 90, H), (70 + i * 5, 60, 55), -1)
        for sx, sy in stars:
            img[sy % 300, (sx - int(t * 10)) % W] = (200, 200, 200)
        action = 52 <= t <= 58
        speed = 6.0 if action else 0.6
        x = int(W / 2 + (W * 0.32) * np.sin(t * speed * 0.35))
        y = int(H * 0.55 + 40 * np.sin(t * speed * 0.8))
        cv2.circle(img, (x, y), 46, (60, 200, 255), -1)
        cv2.putText(img, "PLAYER", (x - 46, y - 60), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
        if action and int(t * 6) % 3 == 0:
            img = cv2.addWeighted(img, 0.5, np.full_like(img, 255), 0.5, 0)
        cv2.putText(img, f"{t:05.2f}", (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
        proc.stdin.write(img.tobytes())
    proc.stdin.close()
    proc.wait()
    segs = [{"s": w0["s"], "e": w1["e"], "text": t} for (t0, t, _), w0, w1 in _seg_bounds(words)]
    (work / "transcript.json").write_text(json.dumps({"backend": "fixture", "model": None, "language": "en", "words": words, "segments": segs}, indent=2))
    json.dump({"source": "tests/make_test_vod.py", "file": "source.mp4"}, open(work / "source.meta.json", "w"))
    print(f"✓ {work / 'source.mp4'} + transcript fixture ({len(words)} words)")


def _seg_bounds(words):
    i = 0
    for t0, text, g in LINES:
        n = len(text.split())
        yield (t0, text, g), words[i], words[i + n - 1]
        i += n


if __name__ == "__main__":
    main(Path(sys.argv[1] if len(sys.argv) > 1 else "work/test"))
