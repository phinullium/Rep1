"""clipstudio — VOD -> find the reaction -> cut -> punch in -> caption -> ship.

  python -m clipstudio doctor
  python -m clipstudio fetch  <url|file> -w work/ep1
  python -m clipstudio transcribe -w work/ep1 [--backend auto|whispercpp|stable-ts|whisper] [--model small] [--diarize]
  python -m clipstudio analyze -w work/ep1 [--count 10 --min 18 --max 45]
  python -m clipstudio render  -w work/ep1 [--top 3 | --clips 1,4] [--platforms tiktok,reels,shorts] [--mode face|motion|center|blur|split]
  python -m clipstudio run <url|file> -w work/ep1 --top 3 --platforms tiktok,shorts
  python -m clipstudio editly -w work/ep1 --top 5      # montage spec for 17 Editly
"""
from __future__ import annotations

import argparse
import importlib
import json
from pathlib import Path

from . import platforms as plat
from .util import log, read_json, which


def _clips(work: Path, top: int | None, ids: str | None) -> list[dict]:
    sel = work / "selection.json"
    if sel.exists():
        data = read_json(sel)
        log(f"• using {sel} ({len(data['clips'])} clips chosen in review)")
        clips = data["clips"]
    else:
        cpath = work / "candidates.json"
        if not cpath.exists():
            raise SystemExit("no candidates.json — run `analyze` first")
        clips = read_json(cpath)["candidates"]
    if ids:
        want = {int(x) for x in ids.split(",")}
        clips = [c for c in clips if c["id"] in want]
    elif top:
        clips = clips[:top]
    return clips


def doctor() -> None:
    """Show which of the 22 tools are ready on this machine."""
    rows = []

    def mod(name):
        try:
            m = importlib.import_module(name)
            return getattr(m, "__version__", "installed")
        except Exception:
            return None

    checks = [
        ("01", "yt-dlp", lambda: mod("yt_dlp") and importlib.import_module("yt_dlp.version").__version__, "core"),
        ("02", "OpenCut", lambda: None, "GUI/web app — manual (see TOOLS.md)"),
        ("03", "OpenCV", lambda: mod("cv2"), "core"),
        ("04", "OBS Studio", lambda: which("obs"), "desktop app — record source"),
        ("05", "AI Shorts Generator", lambda: (Path(__file__).resolve().parent.parent / "vendor" / "AI-Youtube-Shorts-Generator").exists() or None, "optional: ./install.sh vendor"),
        ("06", "Mediabunny", lambda: (Path(__file__).resolve().parent.parent / "web" / "node_modules" / "mediabunny").exists() or None, "optional: ./install.sh web"),
        ("07", "Whisper", lambda: mod("whisper"), "optional: ./install.sh whisper"),
        ("08", "whisper.cpp", lambda: which("whisper-cli") or ((Path(__file__).resolve().parent.parent / "bin" / "whisper-cli").exists() and "bin/whisper-cli"), "recommended: ./install.sh whispercpp"),
        ("09", "stable-ts", lambda: mod("stable_whisper"), "optional: ./install.sh asr"),
        ("10", "pyannote.audio", lambda: mod("pyannote.audio"), "optional: ./install.sh diarize (+HF_TOKEN)"),
        ("11", "Supervision", lambda: mod("supervision"), "core"),
        ("12", "Norfair", lambda: mod("norfair") or (importlib.util.find_spec("norfair") and "installed"), "core"),
        ("13", "DeepFilterNet", lambda: which("deepFilter"), "optional: ./install.sh audio"),
        ("14", "Demucs", lambda: mod("demucs"), "optional: ./install.sh audio"),
        ("15", "pysubs2", lambda: mod("pysubs2"), "core"),
        ("16", "libass", lambda: _ffmpeg_has_libass() or None, "via FFmpeg (--enable-libass)"),
        ("17", "Editly", lambda: which("editly"), "optional: npm i -g editly"),
        ("18", "Kdenlive", lambda: which("kdenlive"), "desktop app — final edit"),
        ("19", "Shotcut", lambda: which("shotcut"), "desktop app — final edit"),
        ("20", "Real-ESRGAN", lambda: which("realesrgan-ncnn-vulkan") or ((Path(__file__).resolve().parent.parent / "bin" / "realesrgan-ncnn-vulkan").exists() and "bin/"), "optional: ./install.sh enhance"),
        ("21", "RIFE", lambda: (Path(__file__).resolve().parent.parent / "vendor" / "ECCV2022-RIFE").exists() or which("rife-ncnn-vulkan"), "optional: ./install.sh enhance"),
        ("22", "PyAV", lambda: mod("av"), "core"),
    ]
    for num, name, fn, how in checks:
        try:
            v = fn()
        except Exception:
            v = None
        rows.append((num, name, "✓ " + str(v) if v else "·", how))
    ff = which("ffmpeg")
    print(f"ffmpeg: {'✓ ' + ff if ff else '✗ missing (required)'}")
    w = max(len(r[1]) for r in rows)
    for num, name, status, how in rows:
        print(f"  {num}  {name:<{w}}  {status:<22} {how}")


def _ffmpeg_has_libass() -> bool:
    import subprocess

    try:
        out = subprocess.run(["ffmpeg", "-hide_banner", "-filters"], capture_output=True, text=True).stdout
        return " ass " in out
    except FileNotFoundError:
        return False


def editly_spec(work: Path, top: int, out: Path) -> None:
    """17 Editly: a "best moments" montage spec from the top clips (16:9 exports)."""
    from .fetch import source_path

    src = source_path(work)
    clips = _clips(work, top, None)
    spec = {
        "outPath": str(work / "exports" / "montage.mp4"),
        "width": 1920, "height": 1080, "fps": 30,
        "defaults": {"transition": {"name": "fade", "duration": 0.3}},
        "keepSourceAudio": True,
        "clips": [{"layers": [{"type": "title-background", "text": f"Top {len(clips)} moments", "background": {"type": "fill-color", "color": "#000000"}}], "duration": 2}]
        + [{"layers": [{"type": "video", "path": str(src), "cutFrom": c["start"], "cutTo": c["end"]},
                       {"type": "subtitle", "text": f"#{len(clips) - i}  {c.get('hook_suggestion') or ''}".strip()}]}
           for i, c in enumerate(reversed(clips))],
    }
    out.write_text(json.dumps(spec, indent=2))
    log(f"✓ editly spec -> {out}  (render: npx editly {out})")


def main() -> None:
    ap = argparse.ArgumentParser(prog="clipstudio", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("doctor")
    f = sub.add_parser("fetch")
    f.add_argument("src")
    f.add_argument("-w", "--work", required=True, type=Path)
    f.add_argument("--max-height", type=int, default=1080)
    t = sub.add_parser("transcribe")
    t.add_argument("-w", "--work", required=True, type=Path)
    t.add_argument("--backend", default="auto")
    t.add_argument("--model", default="small")
    t.add_argument("--language")
    t.add_argument("--diarize", action="store_true")
    a = sub.add_parser("analyze")
    a.add_argument("-w", "--work", required=True, type=Path)
    a.add_argument("--count", type=int, default=10)
    a.add_argument("--min", type=float, default=18)
    a.add_argument("--max", type=float, default=45)
    a.add_argument("--gap", type=float, default=40, help="min seconds between two highlight peaks")
    for name in ("render", "run"):
        r = sub.add_parser(name)
        if name == "run":
            r.add_argument("src")
            r.add_argument("--backend", default="auto")
            r.add_argument("--model", default="small")
            r.add_argument("--language")
        r.add_argument("-w", "--work", required=True, type=Path)
        r.add_argument("--top", type=int, default=3)
        r.add_argument("--clips", help="comma-separated candidate ids")
        r.add_argument("--platforms", default="tiktok,reels,shorts")
        r.add_argument("--mode", default="face", choices=["face", "motion", "center", "blur", "split"])
        r.add_argument("--cam", help="facecam box in source px for split mode: x,y,w,h")
        r.add_argument("--punch-in", type=float, default=0.12)
        r.add_argument("--title", default="auto", help='"auto" = hook suggestion, "none", or literal text')
        r.add_argument("--highlight", help="caption highlight colour, e.g. #FFE500")
        r.add_argument("--denoise", action="store_true")
        r.add_argument("--music", default="keep", choices=["keep", "duck", "remove"])
        r.add_argument("--debug", action="store_true", help="write tracking contact sheets (Supervision)")
        r.add_argument("--short-tiktok", action="store_true", help="don't extend TikTok exports to >1 min (Creator Rewards minimum)")
        r.add_argument("--cold-open", default="auto", choices=["auto", "on", "off"], help="flash the peak moment first (auto: when the peak is >4 s in)")
    e = sub.add_parser("editly")
    e.add_argument("-w", "--work", required=True, type=Path)
    e.add_argument("--top", type=int, default=5)
    args = ap.parse_args()

    if args.cmd == "doctor":
        return doctor()
    if args.cmd == "fetch":
        from .fetch import fetch

        fetch(args.src, args.work, args.max_height)
        return
    if args.cmd == "transcribe":
        from .transcribe import transcribe

        transcribe(args.work, args.backend, args.model, args.language, args.diarize)
        return
    if args.cmd == "analyze":
        from .analyze import analyze

        analyze(args.work, args.count, args.min, args.max, args.gap)
        return
    if args.cmd == "editly":
        editly_spec(args.work, args.top, args.work / "montage.editly.json")
        return
    if args.cmd == "run":
        from .analyze import analyze
        from .fetch import fetch
        from .transcribe import transcribe

        fetch(args.src, args.work)
        try:
            transcribe(args.work, args.backend, args.model, args.language)
        except SystemExit as err:
            log(f"! transcription skipped: {err}")
        analyze(args.work)
    from .render import render_clip

    cam = tuple(int(x) for x in args.cam.split(",")) if args.cam else None
    for clip in _clips(args.work, args.top, args.clips):
        title = None if args.title == "none" else (clip.get("title") or clip.get("hook_suggestion") if args.title == "auto" else args.title)
        for p in plat.get(args.platforms):
            render_clip(args.work, clip, p, mode=clip.get("mode", args.mode), punch=args.punch_in, title=title or None,
                        denoise=args.denoise, music=args.music, cam=cam, highlight=args.highlight, debug=args.debug, short=args.short_tiktok, cold_open=args.cold_open)


if __name__ == "__main__":
    main()
