#!/usr/bin/env bash
# Install / build the 22 clip-studio tools in tiers. Run from clip-studio/.
#
#   ./install.sh core        # yt-dlp, OpenCV, PyAV, pysubs2, Norfair, Supervision (required, ~200 MB)
#   ./install.sh whispercpp  # build whisper.cpp from source + download a ggml model (recommended ASR, CPU-fast)
#   ./install.sh asr         # stable-ts (+ openai-whisper, PyTorch) — word-timestamp refinement
#   ./install.sh whisper     # openai-whisper only
#   ./install.sh diarize     # pyannote.audio (needs HF_TOKEN + accepting model terms)
#   ./install.sh audio       # DeepFilterNet + Demucs
#   ./install.sh enhance     # Real-ESRGAN (ncnn-vulkan binary) + RIFE (source; weights are a manual download)
#   ./install.sh vendor      # AI-Youtube-Shorts-Generator source (alternative LLM-ranked clipper)
#   ./install.sh web         # Mediabunny for the in-browser cutter (web/index.html)
#   ./install.sh all         # everything above
#
# Desktop apps (OBS Studio, Kdenlive, Shotcut) and OpenCut are installed from their
# own sites/package managers — see TOOLS.md.
set -euo pipefail
cd "$(dirname "$0")"
PY=${PYTHON:-python3}
VENV=.venv
WHISPER_MODEL=${WHISPER_MODEL:-small.en}   # tiny|base|small|medium|large-v3 (+ .en variants)

venv() {
  [ -x "$VENV/bin/python" ] || "$PY" -m venv "$VENV"
  "$VENV/bin/pip" install -q --upgrade pip
}

core() {
  venv
  # OpenCV is pinned <5: OpenCV 5.x wheels no longer ship the Haar face cascades used by face tracking.
  "$VENV/bin/pip" install -q "yt-dlp" "av>=13" "opencv-python-headless>=4.10,<5" "numpy" "pysubs2>=1.7" "norfair>=2.2" "supervision>=0.25"
  command -v ffmpeg >/dev/null || { echo "! ffmpeg is required (apt install ffmpeg / brew install ffmpeg / winget install ffmpeg)"; exit 1; }
  ffmpeg -hide_banner -filters 2>/dev/null | grep -q " ass " || echo "! your ffmpeg lacks libass (--enable-libass): captions cannot be burned in"
  echo "✓ core"
}

whispercpp() {
  mkdir -p vendor bin models
  if [ ! -d vendor/whisper.cpp ]; then git clone --depth 1 https://github.com/ggml-org/whisper.cpp vendor/whisper.cpp; fi
  cmake -S vendor/whisper.cpp -B vendor/whisper.cpp/build -DCMAKE_BUILD_TYPE=Release -DWHISPER_BUILD_TESTS=OFF >/dev/null
  cmake --build vendor/whisper.cpp/build -j"$(nproc 2>/dev/null || sysctl -n hw.ncpu)" --config Release --target whisper-cli >/dev/null
  ln -sf "$(pwd)/vendor/whisper.cpp/build/bin/whisper-cli" bin/whisper-cli
  echo "✓ built bin/whisper-cli  (add $(pwd)/bin to PATH, or set WHISPER_CPP_BIN)"
  if [ ! -f "models/ggml-$WHISPER_MODEL.bin" ]; then
    bash vendor/whisper.cpp/models/download-ggml-model.sh "$WHISPER_MODEL" models \
      || echo "! model download failed (needs huggingface.co). Get ggml-$WHISPER_MODEL.bin manually into clip-studio/models/"
  fi
}

asr() { venv; "$VENV/bin/pip" install -q stable-ts; echo "✓ stable-ts (+ openai-whisper, torch)"; }
whisper() { venv; "$VENV/bin/pip" install -q openai-whisper; echo "✓ openai-whisper"; }
diarize() { venv; "$VENV/bin/pip" install -q pyannote.audio; echo "✓ pyannote.audio — export HF_TOKEN=... and accept hf.co/pyannote/speaker-diarization-community-1"; }
audio() { venv; "$VENV/bin/pip" install -q deepfilternet demucs; echo "✓ DeepFilterNet (deepFilter) + Demucs"; }

enhance() {
  mkdir -p vendor bin
  case "$(uname -s)" in
    Linux) zip=realesrgan-ncnn-vulkan-20220424-ubuntu.zip ;;
    Darwin) zip=realesrgan-ncnn-vulkan-20220424-macos.zip ;;
    *) zip=realesrgan-ncnn-vulkan-20220424-windows.zip ;;
  esac
  if [ ! -d vendor/realesrgan ]; then
    curl -fL -o "vendor/$zip" "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/$zip"
    mkdir -p vendor/realesrgan && (cd vendor/realesrgan && unzip -q "../$zip") && rm "vendor/$zip"
    chmod +x vendor/realesrgan/realesrgan-ncnn-vulkan 2>/dev/null || true
    ln -sf "$(pwd)/vendor/realesrgan/realesrgan-ncnn-vulkan" bin/realesrgan-ncnn-vulkan
  fi
  [ -d vendor/ECCV2022-RIFE ] || git clone --depth 1 https://github.com/hzwer/ECCV2022-RIFE vendor/ECCV2022-RIFE
  echo "✓ Real-ESRGAN (bin/realesrgan-ncnn-vulkan, needs a Vulkan GPU)"
  echo "✓ RIFE source in vendor/ECCV2022-RIFE — download the trained model per its README into vendor/ECCV2022-RIFE/train_log/"
}

vendor_() { mkdir -p vendor; [ -d vendor/AI-Youtube-Shorts-Generator ] || git clone --depth 1 https://github.com/Anil-matcha/AI-Youtube-Shorts-Generator vendor/AI-Youtube-Shorts-Generator; echo "✓ vendor/AI-Youtube-Shorts-Generator (default mode uses the paid MuAPI service; --mode local needs an OpenAI or Gemini key)"; }
web() { (cd web && npm install --silent); echo "✓ web/ — serve it: npx serve web  (or python3 -m http.server -d web)"; }

case "${1:-core}" in
  core) core ;;
  whispercpp) whispercpp ;;
  asr) asr ;;
  whisper) whisper ;;
  diarize) diarize ;;
  audio) audio ;;
  enhance) enhance ;;
  vendor) vendor_ ;;
  web) web ;;
  all) core; whispercpp; asr; audio; enhance; vendor_; web; echo "(diarize skipped: needs HF_TOKEN — run ./install.sh diarize)";;
  *) sed -n '2,16p' "$0"; exit 2 ;;
esac
