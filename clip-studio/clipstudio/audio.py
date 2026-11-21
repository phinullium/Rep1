"""13 DeepFilterNet -> clean noisy mics;  14 Demucs -> split voice from music.

Both are optional heavy installs (`./install.sh audio`). The final loudness
normalisation (EBU R128, -14 LUFS) always runs in FFmpeg at render time.
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

from .util import log, which


def extract(src: Path, start: float, dur: float, out: Path) -> Path:
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-ss", f"{start:.3f}", "-t", f"{dur:.3f}", "-i", str(src), "-vn", "-ac", "2", "-ar", "48000", "-c:a", "pcm_s16le", str(out)], check=True)
    return out


def denoise(wav: Path) -> Path:
    exe = which("deepFilter")
    if not exe:
        log("  ! DeepFilterNet not installed (./install.sh audio) — skipping denoise")
        return wav
    outdir = wav.parent / "df"
    outdir.mkdir(exist_ok=True)
    subprocess.run([exe, str(wav), "-o", str(outdir)], check=True, capture_output=True)
    cands = sorted(outdir.glob(wav.stem + "*.wav"))
    if not cands:
        log("  ! DeepFilterNet produced no output — keeping original")
        return wav
    log("  ✓ denoised (DeepFilterNet)")
    return cands[-1]


def music(wav: Path, mode: str) -> Path:
    """mode: keep | duck (music -12 dB under voice) | remove (voice only)."""
    if mode == "keep":
        return wav
    try:
        import demucs  # noqa: F401  MIT, https://github.com/facebookresearch/demucs
    except ImportError:
        log("  ! Demucs not installed (./install.sh audio) — keeping original mix")
        return wav
    outdir = wav.parent / "demucs"
    subprocess.run([sys.executable, "-m", "demucs", "--two-stems=vocals", "-n", "htdemucs", "-o", str(outdir), str(wav)], check=True, capture_output=True)
    stem_dir = outdir / "htdemucs" / wav.stem
    vocals, rest = stem_dir / "vocals.wav", stem_dir / "no_vocals.wav"
    out = wav.with_name(wav.stem + f"_{mode}.wav")
    if mode == "remove":
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(vocals), str(out)], check=True)
    else:
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(vocals), "-i", str(rest), "-filter_complex", "[1:a]volume=-12dB[m];[0:a][m]amix=inputs=2:normalize=0", str(out)], check=True)
    log(f"  ✓ music {mode} (Demucs htdemucs)")
    return out
