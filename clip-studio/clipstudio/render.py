"""Cut -> punch in -> caption -> ship.

22 PyAV decodes the exact frames of the clip; OpenCV crops/scales them along
the camera path; frames are piped straight into ONE FFmpeg encode that also
burns the captions with libass and loudness-normalises the audio. One encode
per output = no generational quality loss.
"""
from __future__ import annotations

import subprocess
from pathlib import Path

import cv2
import numpy as np

from . import audio as audio_mod
from .captions import build_ass
from .fetch import source_path
from .platforms import Platform
from .reframe import camera_path, debug_sheet, detect_track, zoom_curve
from .util import FONTS, log, read_json, video_info, write_json


def _frames(src: Path, start: float, dur: float):
    import av

    with av.open(str(src)) as c:
        vs = c.streams.video[0]
        vs.thread_type = "AUTO"
        c.seek(int(max(0, start - 1) / vs.time_base), stream=vs, backward=True, any_frame=False)
        for frame in c.decode(vs):
            if frame.pts is None:
                continue
            ts = float(frame.pts * vs.time_base)
            if ts < start - 1e-3:
                continue
            if ts >= start + dur - 1e-3:
                break
            yield ts - start, frame.to_ndarray(format="bgr24")


def _extend(start: float, end: float, need: float, src_dur: float, words: list[dict]) -> tuple[float, float]:
    """Grow a clip to >= need seconds: forward to the next sentence end first, then backward to a sentence start."""
    ends = sorted(w["e"] + 0.3 for w in words if w["w"].strip().endswith((".", "!", "?")))
    starts = sorted(w["s"] - 0.15 for i, w in enumerate(words) if i == 0 or words[i - 1]["w"].strip().endswith((".", "!", "?")))
    target_end = start + need
    new_end = next((e for e in ends if e >= target_end), target_end)
    if new_end <= src_dur and new_end - start <= need + 12:
        return start, new_end
    new_end = min(src_dur, max(end, target_end))
    missing = need - (new_end - start)
    if missing > 0:
        cands = [s for s in starts if s <= start - missing]
        start = max(0.0, cands[-1] if cands else start - missing)
    return start, new_end


def _compose(img: np.ndarray, p: Platform, mode: str, cx: float, zoom: float, cam_box, cy: float | None) -> np.ndarray:
    H, W = img.shape[:2]
    ow, oh = p.width, p.height
    target_ar = ow / oh
    if mode == "blur":
        bg_scale = max(ow / W, oh / H)
        bg = cv2.resize(img, (int(W * bg_scale) + 1, int(H * bg_scale) + 1), interpolation=cv2.INTER_AREA)
        y0, x0 = (bg.shape[0] - oh) // 2, (bg.shape[1] - ow) // 2
        bg = cv2.GaussianBlur(bg[y0 : y0 + oh, x0 : x0 + ow], (0, 0), 30)
        bg = (bg * 0.55).astype(np.uint8)
        fg_scale = min(ow / W, oh / H) * zoom
        fw, fh = int(W * fg_scale), int(H * fg_scale)
        fg = cv2.resize(img, (fw, fh), interpolation=cv2.INTER_AREA if fg_scale < 1 else cv2.INTER_LINEAR)
        if fw > ow:  # zoomed past the frame width: crop around centre
            x = int(np.clip(cx * fg_scale - ow / 2, 0, fw - ow))
            fg = fg[:, x : x + ow]
            fw = ow
        y, x = (oh - fh) // 2, (ow - fw) // 2
        bg[max(0, y) : max(0, y) + min(fh, oh), x : x + fw] = fg[: min(fh, oh)]
        return bg
    if mode == "split" and cam_box:
        cam_h = int(oh * 0.40)
        bx, by, bw, bh = cam_box
        cam = img[by : by + bh, bx : bx + bw]
        # Fill the top band (cover-fit).
        s = max(ow / bw, cam_h / bh)
        cam = cv2.resize(cam, (int(bw * s) + 1, int(bh * s) + 1))
        cy0, cx0 = (cam.shape[0] - cam_h) // 2, (cam.shape[1] - ow) // 2
        top = cam[cy0 : cy0 + cam_h, cx0 : cx0 + ow]
        game_h = oh - cam_h
        gw = H * ow / game_h / zoom
        gw = min(gw, W)
        gx = int(np.clip(cx - gw / 2, 0, W - gw))
        gh = gw * game_h / ow
        gy = int(np.clip(H / 2 - gh / 2, 0, H - gh))
        game = cv2.resize(img[gy : gy + int(gh), gx : gx + int(gw)], (ow, game_h), interpolation=cv2.INTER_AREA)
        return np.vstack([top, game])
    # Crop modes (face / motion / center).
    ch = H / zoom
    cw = ch * target_ar
    if cw > W:  # source narrower than target AR
        cw = W / zoom
        ch = cw / target_ar
    x = float(np.clip(cx - cw / 2, 0, W - cw))
    yc = cy if cy is not None else H / 2
    y = float(np.clip(yc - ch / 2, 0, H - ch))
    crop = img[int(y) : int(y + ch), int(x) : int(x + cw)]
    return cv2.resize(crop, (ow, oh), interpolation=cv2.INTER_AREA if crop.shape[1] > ow else cv2.INTER_CUBIC)


def render_clip(work: Path, clip: dict, p: Platform, mode: str = "face", punch: float = 0.12, title: str | None = None,
                denoise: bool = False, music: str = "keep", cam: tuple[int, int, int, int] | None = None, highlight: str | None = None,
                debug: bool = False, short: bool = False, cold_open: str = "auto") -> Path:
    src = source_path(work)
    info = video_info(src)
    start, end = float(clip["start"]), float(clip["end"])
    peak = clip.get("peak")
    tpath = work / "transcript.json"
    words = read_json(tpath)["words"] if tpath.exists() else []

    # Cold open: flash the 3 s peak moment first when the clip would otherwise take > 4 s to get there.
    teaser = None
    if peak is not None and start <= peak < end and (cold_open == "on" or (cold_open == "auto" and peak - start > 4.0)):
        teaser = (max(0.0, peak - 0.8), min(info["duration"], peak + 2.2))
    tlen = (teaser[1] - teaser[0]) if teaser else 0.0
    if p.min_seconds and not short and tlen + end - start < p.min_seconds:
        start, end = _extend(start, end, p.min_seconds - tlen, info["duration"], words)
        log(f"  {p.label}: extended to {tlen + end - start:.1f}s for monetisation eligibility (> {p.min_seconds - 1}s)")
    if p.max_seconds and tlen + end - start > p.max_seconds:
        log(f"  ! clip is {tlen + end - start:.0f}s; {p.label} limit is {p.max_seconds}s — trimming")
        end = start + p.max_seconds - tlen
    segs = ([teaser] if teaser else []) + [(start, end)]
    fps = min(info["fps"], p.fps_max)
    ns = [int(round((e - s) * fps)) for s, e in segs]
    n = sum(ns)
    dur = n / fps
    outdir = work / "exports" / p.key
    outdir.mkdir(parents=True, exist_ok=True)
    stem = f"clip{clip.get('id', 0):02d}_{p.key}"
    vertical = p.height > p.width and info["width"] > info["height"]
    eff_mode = mode if vertical else "center"
    log(f"• {stem}: {'cold open %.1f-%.1fs + ' % teaser if teaser else ''}{start:.1f}-{end:.1f}s ({dur:.1f}s) mode={eff_mode}")

    # Per-segment tracking + camera path (the camera CUTS at the join, it doesn't glide across it).
    crop_w = info["height"] * p.width / p.height
    follow = {"face": (0.08, 0.9), "motion": (0.04, 0.45)}  # gameplay moves faster than faces
    cxs, cys, zooms, cam_box = [], [], [], cam
    for (s, e), ni in zip(segs, ns):
        tr = detect_track(src, s, e - s, "face" if eff_mode == "split" and cam is None else eff_mode, info["width"], info["height"], debug=debug)
        cam_box = cam_box or tr.cam_box
        cxs.append(camera_path(tr, fps, ni, crop_w, info["width"], *follow[eff_mode]) if eff_mode in follow else np.full(ni, info["width"] / 2))
        if eff_mode == "face":  # vertical framing only matters while punched in; keep the face in frame
            raw = np.interp(np.arange(ni) / fps, tr.t, tr.cy) if len(tr.t) > 1 else np.full(ni, tr.cy[0])
            k = max(1, int(fps))
            cys.append(np.convolve(np.pad(raw, (k // 2, k - 1 - k // 2), mode="edge"), np.ones(k) / k, mode="valid"))
        zooms.append(zoom_curve(ni, fps, (peak - s) if peak is not None and s <= peak < e else None, punch))
        if debug and (s, e) == segs[-1]:
            debug_sheet(tr, outdir / f"{stem}_tracking.jpg")
    if eff_mode == "split" and not cam_box:
        log("  ! no facecam found — falling back to blur layout")
        eff_mode = "blur"
    cx_all, zoom_all = np.concatenate(cxs), np.concatenate(zooms)
    cy_all = np.concatenate(cys) if cys else None

    # Captions: words from every segment, shifted onto the output timeline.
    shifted, off = [], 0.0
    for (s, e), ni in zip(segs, ns):
        shifted += [dict(w, s=w["s"] - s + off, e=min(w["e"], e) - s + off) for w in words if s <= (w["s"] + w["e"]) / 2 < e]
        off += ni / fps
    ass = build_ass(shifted, 0.0, dur, p, outdir / f"{stem}.ass", title=title, highlight=highlight)

    # Audio: extract each segment -> concat -> optional DeepFilterNet / Demucs -> loudnorm in the final encode.
    wav = None
    if info["has_audio"]:
        parts = [audio_mod.extract(src, s, ni / fps, outdir / f"{stem}_src{k}.wav") for k, ((s, e), ni) in enumerate(zip(segs, ns))]
        if len(parts) == 1:
            wav = parts[0]
        else:
            wav = outdir / f"{stem}_src.wav"
            ins = sum([["-i", str(x)] for x in parts], [])
            graph = "".join(f"[{k}:a]afade=t=in:d=0.02,afade=t=out:st={ns[k] / fps - 0.03:.3f}:d=0.03[a{k}];" for k in range(len(parts)))
            graph += "".join(f"[a{k}]" for k in range(len(parts))) + f"concat=n={len(parts)}:v=0:a=1"
            subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *ins, "-filter_complex", graph, str(wav)], check=True)
            for x in parts:
                x.unlink()
        if denoise:
            wav = audio_mod.denoise(wav)
        wav = audio_mod.music(wav, music)

    out = outdir / f"{stem}.mp4"
    vf = f"ass={ass.as_posix()}:fontsdir={FONTS.as_posix()},format=yuv420p"
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
           "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{p.width}x{p.height}", "-r", f"{fps:.6f}", "-i", "-"]
    if wav:
        cmd += ["-i", str(wav)]
    cmd += ["-vf", vf, "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-profile:v", "high", "-r", f"{fps:.6f}", "-g", str(int(round(fps * 2)))]
    if wav:
        cmd += ["-af", f"loudnorm=I={p.lufs}:TP={p.true_peak}:LRA=11", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-shortest"]
    cmd += ["-movflags", "+faststart", str(out)]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    written, base = 0, 0
    for k, ((s, e), ni) in enumerate(zip(segs, ns)):
        last = None
        local = 0
        for ts, img in _frames(src, s, e - s):
            i = min(ni - 1, int(round(ts * fps)))
            while local <= i and local < ni:  # duplicate if source fps < output fps
                g = base + local
                frame = _compose(img, p, eff_mode, float(cx_all[g]), float(zoom_all[g]), cam_box, None if cy_all is None else float(cy_all[g]))
                if k > 0 and local < 4:  # quick white flash on the cut out of the cold open
                    a = (0.55, 0.35, 0.18, 0.07)[local]
                    frame = cv2.addWeighted(frame, 1 - a, np.full_like(frame, 255), a, 0)
                proc.stdin.write(frame.tobytes())
                local += 1
                last = frame
        while local < ni and last is not None:  # pad tail
            proc.stdin.write(last.tobytes())
            local += 1
        base += ni
        written += local
    proc.stdin.close()
    if proc.wait() != 0:
        raise SystemExit(f"ffmpeg failed for {out}")
    meta = {"platform": p.key, "file": out.name, "segments": [[round(s, 3), round(e, 3)] for s, e in segs], "cold_open": bool(teaser),
            "duration": round(dur, 3), "mode": eff_mode, "punch_in": punch, "title": title, "fps": fps, "size": [p.width, p.height],
            "monetisation_min_seconds": None if short else p.min_seconds, "notes": p.notes}
    write_json(outdir / f"{stem}.json", meta)
    log(f"  ✓ {out.relative_to(work)} ({written} frames, {dur:.1f}s)")
    return out
