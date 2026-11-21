"""15 pysubs2 -> styled ASS captions;  16 libass (via FFmpeg's `ass` filter) -> burned in.

Short-form caption style: 1-3 words at a time, heavy outline, the spoken word
highlighted, a small pop on each new chunk, placed inside the platform safe area.
"""
from __future__ import annotations

from pathlib import Path

import pysubs2  # MIT, https://github.com/tkarabela/pysubs2

from .platforms import Platform

HIGHLIGHT = "&H0000E5FF"  # ASS is &HAABBGGRR -> #FFE500 (yellow)
WHITE = "&H00FFFFFF"
BLACK = "&H00000000"


def _ass_color(hex_rgb: str) -> str:
    h = hex_rgb.lstrip("#")
    r, g, b = h[0:2], h[2:4], h[4:6]
    return f"&H00{b}{g}{r}".upper()


def chunk_words(words: list[dict], max_words: int = 3, max_chars: int = 16, gap: float = 0.35) -> list[list[dict]]:
    chunks, cur = [], []
    for i, w in enumerate(words):
        cur.append(w)
        text = "".join(x["w"] for x in cur).strip()
        nxt = words[i + 1] if i + 1 < len(words) else None
        brk = (
            nxt is None
            or len(cur) >= max_words
            or len(text) + len(nxt["w"]) > max_chars
            or w["w"].strip().endswith((".", "!", "?", ","))
            or nxt["s"] - w["e"] > gap
        )
        if brk:
            chunks.append(cur)
            cur = []
    return chunks


def build_ass(words: list[dict], clip_start: float, clip_end: float, p: Platform, out: Path, title: str | None = None,
              uppercase: bool = True, highlight: str | None = None, font: str = "Inter Black") -> Path:
    W, H = p.width, p.height
    subs = pysubs2.SSAFile()
    subs.info["PlayResX"] = str(W)
    subs.info["PlayResY"] = str(H)
    subs.info["WrapStyle"] = "0"
    subs.info["ScaledBorderAndShadow"] = "yes"
    size = round(H * (0.052 if H > W else 0.07))
    hl = _ass_color(highlight) if highlight else HIGHLIGHT
    subs.styles["Cap"] = pysubs2.SSAStyle(
        fontname=font, fontsize=size, bold=True, primarycolor=pysubs2.Color(255, 255, 255), outlinecolor=pysubs2.Color(0, 0, 0),
        backcolor=pysubs2.Color(0, 0, 0, 120), outline=max(4, round(size * 0.11)), shadow=max(2, round(size * 0.05)),
        alignment=pysubs2.Alignment.MIDDLE_CENTER, marginl=round(W * p.safe_left) + 20, marginr=round(W * p.safe_right) + 20, marginv=0,
    )
    tsize = round(H * (0.042 if H > W else 0.055))
    subs.styles["Title"] = pysubs2.SSAStyle(
        fontname=font, fontsize=tsize, bold=True, primarycolor=pysubs2.Color(0, 0, 0), outlinecolor=pysubs2.Color(255, 255, 255),
        backcolor=pysubs2.Color(255, 255, 255), borderstyle=3, outline=round(tsize * 0.35), shadow=0,
        alignment=pysubs2.Alignment.TOP_CENTER, marginl=round(W * p.safe_left) + 30, marginr=round(W * p.safe_right) + 30,
        marginv=round(H * p.safe_top) + 30,
    )
    cx = round(W * (0.5 + (p.safe_left - p.safe_right) / 2))
    cy = round(H * p.caption_y)
    clip_words = [dict(w, s=w["s"] - clip_start, e=w["e"] - clip_start) for w in words if clip_start <= (w["s"] + w["e"]) / 2 < clip_end]
    chunks = chunk_words(clip_words)
    for ci, ch in enumerate(chunks):
        chunk_end = ch[-1]["e"]
        nxt_start = chunks[ci + 1][0]["s"] if ci + 1 < len(chunks) else None
        if nxt_start is not None and nxt_start - chunk_end < 0.3:
            chunk_end = nxt_start  # no flicker between close chunks
        toks = [w["w"].strip() for w in ch]
        if uppercase:
            toks = [t.upper() for t in toks]
        for wi, w in enumerate(ch):
            s = w["s"]
            e = ch[wi + 1]["s"] if wi + 1 < len(ch) else chunk_end
            if e <= s:
                continue
            parts = [(f"{{\\c{hl}}}{t}{{\\c{WHITE}}}" if k == wi else t) for k, t in enumerate(toks)]
            pop = "{\\fscx88\\fscy88\\t(0,90,\\fscx100\\fscy100)}" if wi == 0 else ""
            text = f"{{\\pos({cx},{cy})}}{pop}" + " ".join(parts)
            subs.events.append(pysubs2.SSAEvent(start=round(max(0, s) * 1000), end=round(e * 1000), text=text, style="Cap"))
    if title:
        subs.events.append(pysubs2.SSAEvent(start=0, end=round((clip_end - clip_start) * 1000), text=title, style="Title"))
    subs.save(str(out))
    return out
