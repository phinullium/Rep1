"""05 Highlight finder: "VOD -> find the reaction".

Scores every 0.5 s of the source on four signals, then cuts candidate clips
around the strongest peaks, snapped to word boundaries so no clip starts or
ends mid-word:

  loud    audio level surprise vs. the surrounding 60 s (shouts, laughs, hype)
  motion  frame-difference energy (OpenCV) — action, explosions, fast camera
  words   reaction lexicon / exclamations / questions in the transcript
  pace    speech rate jump (people talk fast when something happens)

Output: candidates.json, ranked. Every number is reproducible from the source.
"""
from __future__ import annotations

import re
import subprocess
from pathlib import Path

import cv2
import numpy as np

from .fetch import source_path
from .util import decode_audio, log, read_json, video_info, write_json

BIN = 0.5  # seconds per analysis bin

REACTION = {
    # phrase: weight
    "no way": 3, "oh my god": 3, "omg": 2.5, "what the": 2.5, "wtf": 2.5, "let's go": 3, "lets go": 3, "let's gooo": 3,
    "bro": 1.2, "dude": 1.2, "wait": 1.5, "hold on": 1.5, "look at": 1.2, "did you see": 2, "are you serious": 2.5,
    "insane": 2, "crazy": 2, "unbelievable": 2, "holy": 2, "clutch": 2, "noo": 2, "nooo": 2.5, "yes": 1, "yeah": 0.5,
    "haha": 2, "hahaha": 2.5, "lmao": 2, "lol": 1.5, "run": 1, "help": 1.2, "behind you": 2, "watch this": 2, "how": 0.8,
}


def _z(x: np.ndarray, win: int) -> np.ndarray:
    """Robust local z-score: (x - rolling median) / rolling MAD."""
    pad = win // 2
    xp = np.pad(x, pad, mode="edge")
    med = np.array([np.median(xp[i : i + win]) for i in range(len(x))])
    mad = np.array([np.median(np.abs(xp[i : i + win] - med[i])) for i in range(len(x))]) + 1e-6
    return (x - med) / (1.4826 * mad)


def _smooth(x: np.ndarray, n: int) -> np.ndarray:
    if n <= 1:
        return x
    k = np.hanning(n + 2)[1:-1]
    return np.convolve(x, k / k.sum(), mode="same")


def audio_curve(src: Path, nbins: int) -> np.ndarray:
    sr = 16000
    a = decode_audio(src, sr)
    hop = int(BIN * sr)
    db = np.full(nbins, -90.0)
    for i in range(nbins):
        seg = a[i * hop : (i + 1) * hop]
        if len(seg):
            db[i] = 20 * np.log10(np.sqrt(np.mean(seg.astype(np.float64) ** 2)) + 1e-9)
    return db


def motion_curve(src: Path, nbins: int, fps: float = 4.0) -> np.ndarray:
    """Mean absolute frame difference at 4 fps on a 160 px grayscale proxy (OpenCV)."""
    w, h = 160, 90
    proc = subprocess.Popen(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(src), "-vf", f"fps={fps},scale={w}:{h},format=gray", "-f", "rawvideo", "-"],
        stdout=subprocess.PIPE,
    )
    prev, vals = None, []
    while True:
        buf = proc.stdout.read(w * h)
        if len(buf) < w * h:
            break
        f = cv2.GaussianBlur(np.frombuffer(buf, np.uint8).reshape(h, w), (5, 5), 0)
        vals.append(0.0 if prev is None else float(cv2.absdiff(f, prev).mean()))
        prev = f
    proc.wait()
    v = np.array(vals or [0.0])
    t = np.arange(len(v)) / fps
    return np.interp(np.arange(nbins) * BIN + BIN / 2, t, v)


def word_curves(words: list[dict], nbins: int) -> tuple[np.ndarray, np.ndarray]:
    kw = np.zeros(nbins)
    rate = np.zeros(nbins)
    for w in words:
        i = int(((w["s"] + w["e"]) / 2) // BIN)
        if 0 <= i < nbins:
            rate[i] += 1
    text = [(w["w"].lower(), w["s"]) for w in words]
    joined = ""
    starts = []
    for t, s in text:
        starts.append((len(joined), s))
        joined += t
    for phrase, wt in REACTION.items():
        for m in re.finditer(r"\b" + re.escape(phrase) + r"\b", joined):
            # time of the word containing the match start
            s = max((st for pos, st in starts if pos <= m.start()), default=0.0)
            i = int(s // BIN)
            if 0 <= i < nbins:
                kw[i] += wt
    for w in words:
        if w["w"].strip().endswith(("!", "?!", "!!")):
            i = int(w["s"] // BIN)
            if 0 <= i < nbins:
                kw[i] += 1.0
    return kw, rate


def boundaries(words: list[dict]) -> np.ndarray:
    """Safe cut points: gaps between words (midpoints) and sentence ends."""
    if not words:
        return np.array([])
    b = [max(0.0, words[0]["s"] - 0.15)]
    for a, c in zip(words, words[1:]):
        if c["s"] - a["e"] > 0.12 or a["w"].strip().endswith((".", "!", "?", ",")):
            b.append((a["e"] + c["s"]) / 2)
    b.append(words[-1]["e"] + 0.25)
    return np.array(b)


def snap(t: float, bounds: np.ndarray, direction: int, limit: float) -> float:
    if len(bounds) == 0:
        return t
    if direction < 0:
        c = bounds[(bounds <= t) & (bounds >= t - limit)]
        return float(c.max()) if len(c) else t
    c = bounds[(bounds >= t) & (bounds <= t + limit)]
    return float(c.min()) if len(c) else t


def analyze(work: Path, count: int = 10, min_len: float = 18, max_len: float = 45, min_gap: float = 40) -> Path:
    src = source_path(work)
    info = video_info(src)
    dur = info["duration"]
    nbins = max(1, int(np.ceil(dur / BIN)))
    tpath = work / "transcript.json"
    tr = read_json(tpath) if tpath.exists() else {"words": [], "segments": []}
    words, segments = tr["words"], tr.get("segments", [])
    if not words:
        log("! no transcript.json — ranking on audio + motion only (run `clipstudio transcribe` for better picks)")

    log("• audio loudness…")
    db = audio_curve(src, nbins)
    log("• motion (OpenCV)…")
    mo = motion_curve(src, nbins)
    kw, rate = word_curves(words, nbins)
    for ev in tr.get("events", []):  # laughter / cheering / screaming markers from the ASR
        if re.search(r"laugh|cheer|applause|scream|shout|gasp", ev["tag"]):
            k = int(ev["s"] // BIN)
            if 0 <= k < nbins:
                kw[k] += 2.5

    win = int(60 / BIN)
    loud = np.clip(_z(db, win), 0, 6)
    motion = np.clip(_z(mo, win), 0, 6)
    pace = np.clip(_z(_smooth(rate, 6), win), 0, 4) if words else np.zeros(nbins)
    words_s = np.clip(_smooth(kw, 4) * 2, 0, 6)
    excite = _smooth(1.0 * loud + 0.6 * motion + 0.9 * words_s + 0.4 * pace, 3)
    silent = db < (np.percentile(db, 20) + 3)

    bounds = boundaries(words)
    order = np.argsort(-excite)
    taken: list[float] = []
    cands = []
    for i in order:
        peak = (i + 0.5) * BIN
        if any(abs(peak - p) < min_gap for p in taken):
            continue
        if excite[i] <= 0.5:
            break
        length = float(np.clip(0.5 * (min_len + max_len), min_len, max_len))
        # Start ON the setup sentence (speech in the first second = no dead air before the hook):
        # the sentence start 3-15 s before the peak that is closest to 7 s before it.
        seg_starts = np.array([sg["s"] for sg in segments]) if segments else np.array([])
        ok = seg_starts[(seg_starts >= peak - 15) & (seg_starts <= peak - 3)]
        if len(ok):
            start = float(ok[np.argmin(np.abs(ok - (peak - 7)))]) - 0.15
        else:
            start = snap(max(0.0, peak - float(np.clip(0.4 * length, 4, 15))), bounds, -1, 3.0)
        start = max(0.0, start)
        # End on the FIRST sentence end after the reaction has resolved: >= peak + 4 s, long enough,
        # and the next 3 s are calm (< 35% of the peak). Tight endings loop better on short-form feeds.
        seg_ends = np.array([sg["e"] for sg in segments]) if segments else np.array([])
        ok = seg_ends[(seg_ends >= max(peak + 4, start + min_len)) & (seg_ends <= start + max_len)]
        calm = [e for e in ok if excite[int((e + 0.5) / BIN) : int((e + 3) / BIN) + 1].max(initial=0) < 0.35 * excite[i]]
        if calm:
            end = float(min(calm)) + 0.35
        elif len(ok):
            end = float(ok[np.argmin(np.abs(ok - (start + length)))]) + 0.35
        else:
            end = snap(min(dur, start + length), bounds, +1, 3.0)
        end = min(dur, end)
        if end - start < min_len:
            end = min(dur, start + min_len)
        a, b = int(start / BIN), max(int(start / BIN) + 1, int(end / BIN))
        reasons = []
        for name, arr, thr in (("loud", loud, 2), ("motion", motion, 2), ("reaction words", words_s, 2), ("fast talk", pace, 1.5)):
            if arr[max(0, i - 2) : i + 3].max() >= thr:
                reasons.append(name)
        early = excite[a : a + int(3 / BIN)].mean() if b > a else 0
        first_word = min((w["s"] for w in words if w["s"] >= start), default=start) - start
        dead_air = max(0.0, first_word - 1.0)  # seconds of silence before anyone speaks
        score = float(excite[i] + 0.5 * excite[a:b].mean() + 0.3 * early - 2.0 * silent[a:b].mean() - 0.5 * dead_air)
        text = "".join(w["w"] for w in words if start <= w["s"] < end).strip()
        cands.append({
            "start": round(start, 2), "end": round(end, 2), "duration": round(end - start, 2), "peak": round(peak, 2),
            "score": round(score, 3), "reasons": reasons or ["overall energy"],
            "hook_suggestion": _hook_line(words, start, end, peak), "text": text,
        })
        taken.append(peak)
        if len(cands) >= count:
            break
    cands.sort(key=lambda c: -c["score"])
    for k, c in enumerate(cands, 1):
        c["id"] = k
    out = work / "candidates.json"
    write_json(out, {"source": src.name, "duration": dur, "bin": BIN, "candidates": cands})
    np.savez_compressed(work / "signals.npz", loud=loud, motion=motion, words=words_s, pace=pace, excite=excite, db=db)
    log(f"✓ {len(cands)} candidates -> {out}")
    for c in cands[:5]:
        log(f"  #{c['id']} {c['start']:.1f}-{c['end']:.1f}s score {c['score']:.2f} ({', '.join(c['reasons'])}) “{c['hook_suggestion']}”")
    return out


def _hook_line(words: list[dict], start: float, end: float, peak: float) -> str:
    """Most reaction-heavy short sentence near the peak (Claude can rewrite it via the skill)."""
    near = [w for w in words if peak - 6 <= w["s"] <= peak + 4]
    if not near:
        return ""
    sents, cur = [], []
    for w in near:
        cur.append(w["w"])
        if w["w"].strip().endswith((".", "!", "?")):
            sents.append("".join(cur).strip())
            cur = []
    if cur:
        sents.append("".join(cur).strip())

    def score(s: str) -> float:
        low = s.lower()
        return sum(wt for p, wt in REACTION.items() if p in low) + s.count("!") + 0.5 * s.count("?") - 0.05 * len(s)

    best = max(sents, key=score)
    toks = best.split()
    return " ".join(toks[:9]) + ("…" if len(toks) > 9 else "")
