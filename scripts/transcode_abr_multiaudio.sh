#!/usr/bin/env bash
# Video-only ABR ladder + zwei AAC-Spuren (Stream 0 und 1) als fragmentierte MP4.
# Quelle muss mindestens zwei Audio-Streams haben.
# Usage: ./scripts/transcode_abr_multiaudio.sh <input.mp4> <output_dir>
set -euo pipefail

if [[ "${1:-}" == "" || "${2:-}" == "" ]]; then
  echo "Usage: $0 <input.mp4> <output_dir>" >&2
  exit 1
fi

INPUT="$1"
OUT="$2"
mkdir -p "$OUT"

video_only() {
  local height="$1"
  local name="$2"
  ffmpeg -y -hide_banner -loglevel error -stats \
    -i "$INPUT" \
    -map 0:v:0 \
    -an \
    -c:v libx264 -preset veryfast -profile:v high -pix_fmt yuv420p \
    -vf "scale=-2:${height}" \
    -movflags +frag_keyframe+empty_moov+default_base_moof \
    -f mp4 "${OUT}/${name}.mp4"
}

video_only 1080 "1080p"
video_only 720 "720p"
video_only 480 "480p"

ffmpeg -y -hide_banner -loglevel error -stats \
  -i "$INPUT" -map 0:a:0 -c:a aac -ac 2 -b:a 128k \
  -movflags +frag_keyframe+empty_moov+default_base_moof \
  -f mp4 "${OUT}/audio_0.mp4"

ffmpeg -y -hide_banner -loglevel error -stats \
  -i "$INPUT" -map 0:a:1 -c:a aac -ac 2 -b:a 128k \
  -movflags +frag_keyframe+empty_moov+default_base_moof \
  -f mp4 "${OUT}/audio_1.mp4"

echo "Wrote video renditions + audio_0.mp4 + audio_1.mp4 under: $OUT"
