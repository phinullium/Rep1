from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
FONTS = ROOT / "fonts"


def log(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


def run(cmd: list[str], **kw) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, check=True, **kw)


def ffprobe(path: Path) -> dict:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)],
        check=True, capture_output=True, text=True,
    ).stdout
    return json.loads(out)


def video_info(path: Path) -> dict:
    p = ffprobe(path)
    v = next(s for s in p["streams"] if s["codec_type"] == "video")
    num, den = (int(x) for x in v.get("avg_frame_rate", v["r_frame_rate"]).split("/"))
    fps = num / den if den else 30.0
    return {
        "width": int(v["width"]),
        "height": int(v["height"]),
        "fps": fps,
        "duration": float(p["format"]["duration"]),
        "has_audio": any(s["codec_type"] == "audio" for s in p["streams"]),
    }


def decode_audio(path: Path, sr: int = 16000, start: float | None = None, dur: float | None = None) -> np.ndarray:
    """Mono float32 PCM via FFmpeg."""
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error"]
    if start is not None:
        cmd += ["-ss", f"{start:.3f}"]
    if dur is not None:
        cmd += ["-t", f"{dur:.3f}"]
    cmd += ["-i", str(path), "-vn", "-ac", "1", "-ar", str(sr), "-f", "f32le", "-"]
    raw = subprocess.run(cmd, check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32)


def which(*names: str) -> str | None:
    for n in names:
        p = shutil.which(n)
        if p:
            return p
    return None


def read_json(p: Path):
    return json.loads(Path(p).read_text())


def write_json(p: Path, data) -> None:
    Path(p).write_text(json.dumps(data, indent=2, ensure_ascii=False))
