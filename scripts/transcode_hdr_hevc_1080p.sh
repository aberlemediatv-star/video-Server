#!/usr/bin/env bash
# Eine HDR-fähige 1080p-HEVC-Rendition (Main 10, PQ) + AAC — als fragmentierte MP4.
# Hinweis: Wiedergabe/HDR-Metadaten je nach Player und Display; für Produktion mit ffprobe prüfen.
# Usage: ./scripts/transcode_hdr_hevc_1080p.sh <input.mp4> <output.mp4>
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
  -c:v libx265 -preset medium -crf 22 \
  -pix_fmt yuv420p10le \
  -profile:v main10 \
  -x265-params "hdr10=1:repeat-hdr=1:colorprim=bt2020:transfer=smpte2084:colormatrix=bt2020nc" \
  -tag:v hvc1 \
  -c:a aac -ac 2 -b:a 192k \
  -movflags +frag_keyframe+empty_moov+default_base_moof \
  -f mp4 "$OUT"

echo "Wrote HDR HEVC sample: $OUT"
