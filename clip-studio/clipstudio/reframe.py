"""03 OpenCV + 12 Norfair + 11 Supervision -> tracking, crop logic, punch-in.

Builds a per-frame crop path for turning 16:9 into 9:16 (or any aspect):
  face    follow the dominant face (Haar detector -> Norfair tracker)
  motion  follow where the action is (frame-difference centroid) — good for gameplay
  center  fixed centre crop
  blur    no crop: full frame on a blurred, zoomed copy of itself
  split   facecam on top, gameplay below (auto-detected or --cam x,y,w,h)

The virtual camera is a critically damped follower with a dead zone, so it
moves like an operator instead of jittering with every detection.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

from .util import log

SAMPLE_FPS = 5.0


@dataclass
class Track:
    t: np.ndarray  # sample times (s, clip-relative)
    cx: np.ndarray  # target centre x (source px)
    cy: np.ndarray  # target centre y (source px)
    found: np.ndarray  # detection present
    cam_box: tuple[int, int, int, int] | None = None  # facecam rect for split mode (x, y, w, h)
    debug_frames: list | None = None


def _sample_frames(src: Path, start: float, dur: float, width: int = 640):
    """Yield (t, frame_bgr_small, scale) at SAMPLE_FPS using PyAV."""
    import av  # BSD-3, https://github.com/PyAV-Org/PyAV

    with av.open(str(src)) as c:
        vs = c.streams.video[0]
        vs.thread_type = "AUTO"
        c.seek(int(max(0, start - 1) / vs.time_base), stream=vs, backward=True, any_frame=False)
        next_t = start
        for frame in c.decode(vs):
            ts = float(frame.pts * vs.time_base) if frame.pts is not None else None
            if ts is None or ts < next_t - 1e-3:
                continue
            if ts >= start + dur:
                break
            img = frame.to_ndarray(format="bgr24")
            scale = width / img.shape[1]
            small = cv2.resize(img, (width, int(img.shape[0] * scale)), interpolation=cv2.INTER_AREA)
            yield ts - start, small, scale
            next_t += 1.0 / SAMPLE_FPS


def detect_track(src: Path, start: float, dur: float, mode: str, src_w: int, src_h: int, debug: bool = False) -> Track:
    times, cxs, cys, found, boxes_all = [], [], [], [], []
    dbg = [] if debug else None
    if mode in ("face", "split"):
        from norfair import Detection, Tracker  # BSD-3, https://github.com/tryolabs/norfair

        cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
        tracker = Tracker(distance_function="mean_euclidean", distance_threshold=80, hit_counter_max=8, initialization_delay=2)
        life: dict[int, int] = {}
        for t, img, s in _sample_frames(src, start, dur):
            g = cv2.equalizeHist(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY))
            faces = cascade.detectMultiScale(g, scaleFactor=1.1, minNeighbors=6, minSize=(int(img.shape[0] * 0.06),) * 2)
            dets = [Detection(points=np.array([[x + w / 2, y + h / 2]]), data=(x, y, w, h)) for (x, y, w, h) in faces]
            objs = tracker.update(detections=dets)
            best = None
            for o in objs:
                life[o.id] = life.get(o.id, 0) + 1
                if o.last_detection is None:
                    continue
                x, y, w, h = o.last_detection.data
                # Prefer the longest-lived track, then the biggest face.
                key = (life[o.id], w * h)
                if best is None or key > best[0]:
                    best = (key, (x, y, w, h))
            times.append(t)
            if best:
                x, y, w, h = best[1]
                cxs.append((x + w / 2) / s)
                cys.append((y + h / 2) / s)
                found.append(True)
                boxes_all.append((x / s, y / s, w / s, h / s))
            else:
                cxs.append(np.nan)
                cys.append(np.nan)
                found.append(False)
            if dbg is not None and len(dbg) < 12 and int(t * SAMPLE_FPS) % 10 == 0:
                dbg.append((t, img.copy(), [(int(x), int(y), int(w), int(h)) for (x, y, w, h) in faces], [o.id for o in objs]))
    elif mode == "motion":
        prev = None
        for t, img, s in _sample_frames(src, start, dur, width=320):
            g = cv2.GaussianBlur(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY), (7, 7), 0)
            times.append(t)
            if prev is None:
                cxs.append(np.nan)
                cys.append(np.nan)
                found.append(False)
            else:
                diff = cv2.absdiff(g, prev).astype(np.float32)
                diff[diff < 12] = 0
                m = diff.sum()
                if m > diff.size * 0.4:
                    ys, xs = np.indices(diff.shape)
                    cxs.append(float((xs * diff).sum() / m) / s)
                    cys.append(float((ys * diff).sum() / m) / s)
                    found.append(True)
                else:
                    cxs.append(np.nan)
                    cys.append(np.nan)
                    found.append(False)
            prev = g
    else:
        n = max(2, int(dur * SAMPLE_FPS))
        times = list(np.linspace(0, dur, n))
        cxs = [src_w / 2] * n
        cys = [src_h / 2] * n
        found = [True] * n

    t = np.array(times, dtype=float)
    cx = np.array(cxs, dtype=float)
    cy = np.array(cys, dtype=float)
    f = np.array(found, dtype=bool)
    hit = f.mean() if len(f) else 0
    if mode in ("face", "motion"):
        log(f"  {mode} tracking: subject found in {hit:.0%} of samples")
    # Fill gaps: hold last known position; if nothing ever found, centre.
    for arr, default in ((cx, src_w / 2), (cy, src_h / 2)):
        if np.all(np.isnan(arr)):
            arr[:] = default
        else:
            idx = np.where(~np.isnan(arr))[0]
            arr[: idx[0]] = arr[idx[0]]
            for i in range(1, len(arr)):
                if np.isnan(arr[i]):
                    arr[i] = arr[i - 1]

    cam_box = None
    if mode == "split" and boxes_all:
        # Facecam = median face box, expanded to a 16:9-ish window around it.
        bx = np.median(np.array(boxes_all), axis=0)
        fx, fy, fw, fh = bx
        w = min(src_w, fw * 3.2)
        h = min(src_h, w * 9 / 16 * 1.25)
        x = float(np.clip(fx + fw / 2 - w / 2, 0, src_w - w))
        y = float(np.clip(fy + fh / 2 - h / 2.4, 0, src_h - h))
        cam_box = (int(x), int(y), int(w), int(h))
        log(f"  split: facecam box {cam_box}")
    return Track(t=t, cx=cx, cy=cy, found=f, cam_box=cam_box, debug_frames=dbg)


def camera_path(track: Track, fps: float, n_frames: int, crop_w: float, src_w: int, deadzone: float = 0.08, response: float = 0.9) -> np.ndarray:
    """Critically damped follow of the target x with a dead zone. Returns crop-centre x per output frame."""
    tt = np.arange(n_frames) / fps
    target = np.interp(tt, track.t, track.cx) if len(track.t) > 1 else np.full(n_frames, track.cx[0])
    w = 2 * np.pi / response
    x, v = target[0], 0.0
    out = np.empty(n_frames)
    dt = 1.0 / fps
    dz = deadzone * crop_w
    goal = x
    for i in range(n_frames):
        if abs(target[i] - goal) > dz:  # re-aim only when the subject leaves the dead zone
            goal = target[i]
        # semi-implicit Euler on a critically damped spring (ζ = 1)
        a = w * w * (goal - x) - 2 * w * v
        v += a * dt
        x += v * dt
        out[i] = x
    half = crop_w / 2
    return np.clip(out, half, src_w - half)


def zoom_curve(n_frames: int, fps: float, punch_at: float | None, amount: float) -> np.ndarray:
    """Punch-in: fast push to (1+amount) at the reaction, hold ~1.4 s, ease back."""
    z = np.ones(n_frames)
    if punch_at is None or amount <= 0:
        return z
    t = np.arange(n_frames) / fps - punch_at
    up = np.clip(t / 0.08, 0, 1)
    down = np.clip((t - 1.4) / 0.5, 0, 1)
    ease = lambda x: x * x * (3 - 2 * x)  # noqa: E731
    return 1 + amount * ease(up) * (1 - ease(down))


def debug_sheet(track: Track, out: Path) -> None:
    """Supervision overlay of detections + tracker IDs (QC image)."""
    if not track.debug_frames:
        return
    import supervision as sv  # MIT, https://github.com/roboflow/supervision

    annot = sv.BoxAnnotator(thickness=3, color_lookup=sv.ColorLookup.INDEX)  # boxes carry no class_id
    tiles = []
    for t, img, faces, _ids in track.debug_frames:
        if faces:
            xyxy = np.array([[x, y, x + w, y + h] for (x, y, w, h) in faces], dtype=float)
            img = annot.annotate(scene=img, detections=sv.Detections(xyxy=xyxy))
        cv2.putText(img, f"{t:.1f}s", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 0, 255), 2)
        tiles.append(img)
    while len(tiles) % 4:
        tiles.append(np.zeros_like(tiles[0]))
    rows = [np.hstack(tiles[i : i + 4]) for i in range(0, len(tiles), 4)]
    cv2.imwrite(str(out), np.vstack(rows))
