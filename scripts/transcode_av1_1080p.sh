#!/usr/bin/env bash
# Optional: eine AV1-Rendition (SVT-AV1) bei 1080p + AAC — als fragmentierte MP4.
# Usage: ./scripts/transcode_av1_1080p.sh <input.mp4> <output.mp4>
# Hinweis: SVT-AV1 ist langsamer als x264; für Produktion Presets/Tuning beachten.
set -euo pipefail

if [[ "${1:-}" == "" || "${2:-}" == "" ]]; then
  echo "Usage: $0 <input.mp4> <output.mp4>" >&2
  exit 1
fi

INPUT="$1"
OUT="$2"

ffmpeg -y -hide_banner -loglevel error -stats \
  -i "$INPUT" \
  -map 0:v:0 -map 0:a:0? \
  -c:v libsvtav1 -preset 8 -crf 32 -pix_fmt yuv420p \
  -vf "scale=-2:1080" \
  -c:a aac -ac 2 -b:a 128k \
  -movflags +frag_keyframe+empty_moov+default_base_moof \
  -f mp4 "$OUT"

echo "Wrote AV1 1080p rendition: $OUT"
