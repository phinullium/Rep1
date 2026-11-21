"""07 Whisper / 08 whisper.cpp / 09 stable-ts -> word-level transcript.
10 pyannote.audio -> optional "who speaks when".

All backends produce the same normalised transcript.json:
  {"backend", "model", "language",
   "words":    [{"w": " word", "s": 1.23, "e": 1.48, "p": 0.97, "spk": "SPEAKER_00"?}],
   "segments": [{"s", "e", "text", "spk"?}]}
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import tempfile
from pathlib import Path

from .fetch import source_path
from .util import log, which, write_json

MODEL_DIRS = [Path(os.environ.get("WHISPER_CPP_MODELS", "")), Path(__file__).resolve().parent.parent / "models", Path.home() / ".cache" / "whisper.cpp"]


def _extract_wav(src: Path, dst: Path) -> Path:
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(src), "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", str(dst)], check=True)
    return dst


def _segments_from_words(words: list[dict], gap: float = 0.6) -> list[dict]:
    """Group words into sentence-ish segments: break on terminal punctuation or pauses."""
    segs, cur = [], []
    for i, w in enumerate(words):
        cur.append(w)
        nxt = words[i + 1] if i + 1 < len(words) else None
        end_punct = w["w"].strip().endswith((".", "!", "?"))
        pause = nxt is not None and nxt["s"] - w["e"] > gap
        if nxt is None or end_punct or pause or len(cur) >= 40:
            seg = {"s": cur[0]["s"], "e": cur[-1]["e"], "text": "".join(x["w"] for x in cur).strip()}
            if "spk" in cur[0]:
                seg["spk"] = cur[0]["spk"]
            segs.append(seg)
            cur = []
    return segs


def _whispercpp(wav: Path, model: str, language: str | None) -> tuple[list[dict], str]:
    local = Path(__file__).resolve().parent.parent / "bin" / "whisper-cli"
    binary = os.environ.get("WHISPER_CPP_BIN") or which("whisper-cli", "whisper-cpp") or (str(local) if local.exists() else None)
    if not binary:
        raise FileNotFoundError("whisper.cpp binary not found (build it with ./install.sh whispercpp)")
    mpath = Path(model)
    if not mpath.exists():
        for d in MODEL_DIRS:
            c = d / f"ggml-{model}.bin"
            if str(d) and c.exists():
                mpath = c
                break
        else:
            raise FileNotFoundError(f"whisper.cpp model ggml-{model}.bin not found in {[str(d) for d in MODEL_DIRS if str(d)]}")
    with tempfile.TemporaryDirectory() as td:
        prefix = Path(td) / "out"
        # -ml 1 -sow: one segment per word (word-level timestamps); -oj: JSON output.
        cmd = [binary, "-m", str(mpath), "-f", str(wav), "-oj", "-of", str(prefix), "-ml", "1", "-sow", "-t", str(os.cpu_count() or 4)]
        cmd += ["-l", language or "auto"]
        subprocess.run(cmd, check=True, capture_output=True)
        data = json.loads((prefix.with_suffix(".json")).read_text())
    words = []
    for seg in data.get("transcription", []):
        text = seg.get("text", "")
        if not text.strip():
            continue
        off = seg["offsets"]  # milliseconds
        words.append({"w": text if text.startswith(" ") else " " + text, "s": off["from"] / 1000, "e": off["to"] / 1000, "p": None})
    lang = data.get("result", {}).get("language", language or "auto")
    return words, lang


def _stable_ts(path: Path, model: str, language: str | None) -> tuple[list[dict], str]:
    import stable_whisper  # MIT, https://github.com/jianfch/stable-ts

    m = stable_whisper.load_model(model)
    result = m.transcribe(str(path), language=language, word_timestamps=True)
    words = []
    for seg in result.segments:
        for w in seg.words:
            words.append({"w": w.word, "s": float(w.start), "e": float(w.end), "p": float(getattr(w, "probability", 0) or 0)})
    return words, result.language or (language or "auto")


def _openai_whisper(path: Path, model: str, language: str | None) -> tuple[list[dict], str]:
    import whisper  # MIT, https://github.com/openai/whisper

    m = whisper.load_model(model)
    r = m.transcribe(str(path), language=language, word_timestamps=True)
    words = [{"w": w["word"], "s": float(w["start"]), "e": float(w["end"]), "p": float(w.get("probability", 0))} for s in r["segments"] for w in s.get("words", [])]
    return words, r.get("language", language or "auto")


def _diarize(wav: Path, words: list[dict]) -> None:
    """Label each word with the speaker active at its midpoint (pyannote community-1)."""
    from pyannote.audio import Pipeline  # MIT code; model is gated on Hugging Face

    token = os.environ.get("HF_TOKEN") or os.environ.get("HUGGINGFACE_TOKEN")
    if not token:
        raise SystemExit("diarization needs HF_TOKEN (accept the model terms at hf.co/pyannote/speaker-diarization-community-1)")
    pipeline = Pipeline.from_pretrained("pyannote/speaker-diarization-community-1", token=token)
    output = pipeline(str(wav))
    turns = [(t.start, t.end, spk) for t, spk in output.speaker_diarization]
    for w in words:
        mid = (w["s"] + w["e"]) / 2
        for s, e, spk in turns:
            if s <= mid <= e:
                w["spk"] = spk
                break


def transcribe(work: Path, backend: str = "auto", model: str = "small", language: str | None = None, diarize: bool = False) -> Path:
    src = source_path(work)
    wav = _extract_wav(src, work / "audio16k.wav")
    order = {"auto": ["whispercpp", "stable-ts", "whisper"]}.get(backend, [backend])
    errors = []
    for b in order:
        try:
            log(f"• transcribing with {b} ({model})…")
            if b == "whispercpp":
                words, lang = _whispercpp(wav, model, language)
            elif b == "stable-ts":
                words, lang = _stable_ts(wav, model, language)
            elif b == "whisper":
                words, lang = _openai_whisper(wav, model, language)
            else:
                raise SystemExit(f"unknown backend {b}")
            break
        except (ImportError, FileNotFoundError, subprocess.CalledProcessError) as e:
            errors.append(f"{b}: {e}")
            log(f"  {b} unavailable: {e}")
    else:
        raise SystemExit("no transcription backend available:\n  " + "\n  ".join(errors) + "\nInstall one: ./install.sh whispercpp   (or)   ./install.sh asr")
    # Non-speech markers ([BLANK_AUDIO], [Music], (laughs)…) are kept as events, not caption words.
    marker = re.compile(r"\s*[\[(].*[\])]\s*")
    events = [{"s": w["s"], "e": w["e"], "tag": w["w"].strip(" []()").lower()} for w in words if marker.fullmatch(w["w"])]
    words = [w for w in words if w["e"] > w["s"] and not marker.fullmatch(w["w"])]
    if diarize:
        _diarize(wav, words)
    out = work / "transcript.json"
    write_json(out, {"backend": b, "model": model, "language": lang, "words": words, "events": events, "segments": _segments_from_words(words)})
    log(f"✓ {len(words)} words -> {out}")
    return out
