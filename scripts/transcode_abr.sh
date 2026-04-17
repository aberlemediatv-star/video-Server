#!/usr/bin/env bash
# Transcode one input to multiple H.264 + AAC fragmented MP4 renditions (ABR ladder).
# Usage: ./scripts/transcode_abr.sh <input.mp4> <output_dir>
set -euo pipefail

if [[ "${1:-}" == "" || "${2:-}" == "" ]]; then
  echo "Usage: $0 <input.mp4> <output_dir>" >&2
  exit 1
fi

INPUT="$1"
OUT="$2"
mkdir -p "$OUT"

common_video() {
  local height="$1"
  local name="$2"
  ffmpeg -y -hide_banner -loglevel error -stats \
    -i "$INPUT" \
    -map 0:v:0 -map 0:a:0 \
    -c:v libx264 -preset veryfast -profile:v high -pix_fmt yuv420p \
    -vf "scale=-2:${height}" \
    -c:a aac -ac 2 -b:a 128k \
    -movflags +frag_keyframe+empty_moov+default_base_moof \
    -f mp4 "${OUT}/${name}.mp4"
}

# Core ladder (extend for 4K/8K/HDR in ops docs)
common_video 1080 "1080p"
common_video 720 "720p"
common_video 480 "480p"

echo "Wrote renditions under: $OUT"
