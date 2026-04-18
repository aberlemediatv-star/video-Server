#!/usr/bin/env bash
# Video-Ladder (wie in transcode_abr.sh) + mehrere Audio-Layouts als fragmentierte MP4:
#   - AAC-LC 2.0 (Kompatibilität, Pflicht)
#   - AAC-LC 5.1 (falls Quelle ≥6 Kanäle)
#   - AAC-LC 7.1 (falls Quelle ≥8 Kanäle)
#   - Opus 22.2 / 24ch (falls Quelle ≥24 Kanäle)  -- NHK Super Hi-Vision
#   - Opus N-Kanal-Copy (wenn nichts oben zutrifft, aber >2 Kanäle vorhanden)
# AAC-LC ist spec-tech bis 48 Kanäle, aber Player-Kompatibilität praktisch ≤8; für 22.2
# nutzen wir daher Opus (RFC 6716, multichannel mapping), breit in DASH/Web-Playern.
#
# Usage: ./scripts/transcode_immersive_audio.sh <input> <output_dir>
set -euo pipefail

INPUT="${1:?input file}"
OUT="${2:?output dir}"
mkdir -p "$OUT"

command -v ffmpeg >/dev/null 2>&1 || { echo "ffmpeg missing" >&2; exit 1; }
command -v ffprobe >/dev/null 2>&1 || { echo "ffprobe missing" >&2; exit 1; }

SRC_CH="$(ffprobe -v error -select_streams a:0 -show_entries stream=channels -of default=nw=1:nk=1 "$INPUT" || echo "")"
SRC_CH="${SRC_CH:-0}"
echo "Quelle hat $SRC_CH Audiokanäle"

video_only() {
  local height="$1" name="$2"
  ffmpeg -y -hide_banner -loglevel error -stats \
    -i "$INPUT" -map 0:v:0 -an \
    -c:v libx264 -preset veryfast -profile:v high -pix_fmt yuv420p \
    -vf "scale=-2:${height}" \
    -movflags +frag_keyframe+empty_moov+default_base_moof \
    -f mp4 "${OUT}/${name}.mp4"
}

audio_aac() {
  local layout="$1" chans="$2" bitrate="$3" out="$4"
  ffmpeg -y -hide_banner -loglevel error -stats \
    -i "$INPUT" -map 0:a:0 -vn \
    -c:a aac -ac "$chans" -channel_layout "$layout" -b:a "$bitrate" \
    -movflags +frag_keyframe+empty_moov+default_base_moof \
    -f mp4 "${OUT}/${out}"
}

audio_opus() {
  local chans="$1" bitrate="$2" out="$3"
  # Opus in MP4 (ISOBMFF) wird von Shaka Packager unterstützt (Opus-in-mp4).
  ffmpeg -y -hide_banner -loglevel error -stats \
    -i "$INPUT" -map 0:a:0 -vn \
    -c:a libopus -ac "$chans" -mapping_family 1 -b:a "$bitrate" \
    -movflags +frag_keyframe+empty_moov+default_base_moof \
    -f mp4 "${OUT}/${out}"
}

# Video
video_only 1080 "1080p"
video_only 720 "720p"
video_only 480 "480p"

# Audio ladder
audio_aac "stereo" 2 128k "audio_aac_stereo.mp4"

if [[ "$SRC_CH" -ge 6 ]]; then
  audio_aac "5.1" 6 384k "audio_aac_51.mp4"
fi
if [[ "$SRC_CH" -ge 8 ]]; then
  audio_aac "7.1" 8 512k "audio_aac_71.mp4"
fi
if [[ "$SRC_CH" -ge 24 ]]; then
  # 22.2 = 22 main + 2 LFE = 24 Kanäle (NHK SHV)
  audio_opus 24 1024k "audio_opus_222.mp4"
elif [[ "$SRC_CH" -gt 2 ]]; then
  audio_opus "$SRC_CH" 512k "audio_opus_multich.mp4"
fi

echo "Wrote renditions under: $OUT (Quelle $SRC_CH ch)"
