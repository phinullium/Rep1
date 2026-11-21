"""01 yt-dlp -> download source videos (or import a local OBS recording)."""
from __future__ import annotations

import shutil
from pathlib import Path

from .util import log, video_info, write_json


def fetch(src: str, work: Path, max_height: int = 1080) -> Path:
    work.mkdir(parents=True, exist_ok=True)
    local = Path(src).expanduser()
    if local.exists():
        dst = work / f"source{local.suffix.lower()}"
        if dst.resolve() != local.resolve():
            shutil.copy2(local, dst)
        log(f"✓ imported local file -> {dst}")
    else:
        import yt_dlp  # Unlicense, https://github.com/yt-dlp/yt-dlp

        opts = {
            # Best video <= max_height + best audio, merged to MP4.
            "format": f"bv*[height<={max_height}][ext=mp4]+ba[ext=m4a]/bv*[height<={max_height}]+ba/b[height<={max_height}]/b",
            "merge_output_format": "mp4",
            "outtmpl": str(work / "source.%(ext)s"),
            "writeinfojson": True,
            "noplaylist": True,
            "quiet": True,
            "no_warnings": True,
        }
        with yt_dlp.YoutubeDL(opts) as ydl:
            ydl.download([src])
        dst = next(p for p in work.glob("source.*") if p.suffix not in {".json", ".part"})
        log(f"✓ downloaded {src} -> {dst}")
    info = video_info(dst)
    write_json(work / "source.meta.json", {"source": src, "file": dst.name, **info})
    return dst


def source_path(work: Path) -> Path:
    cands = [p for p in work.glob("source.*") if p.suffix not in {".json", ".part", ".wav"} and not p.name.endswith(".meta.json")]
    if not cands:
        raise SystemExit(f"no source video in {work}; run `clipstudio fetch` first")
    return cands[0]
