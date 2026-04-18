#!/usr/bin/env bash
# Packt Video-Ladder + alle vorhandenen Audio-Renditions aus <renditions_dir> nach HLS + DASH (CMAF).
# Erkennt: audio_aac_stereo.mp4, audio_aac_51.mp4, audio_aac_71.mp4, audio_opus_222.mp4, audio_opus_multich.mp4
#
# Usage: ./scripts/package_cmaf_immersive.sh <renditions_dir> <package_out_dir> [segment_seconds]
set -euo pipefail

REND="${1:?renditions dir}"
PKG="${2:?package out dir}"
SEG="${3:-4}"

mkdir -p "$PKG"
REND_ABS="$(cd "$REND" && pwd)"
PKG_ABS="$(cd "$PKG" && pwd)"

SHAKA_IMAGE="${SHAKA_PACKAGER_IMAGE:-google/shaka-packager:latest}"

run_packager() {
  docker run --rm \
    -v "${REND_ABS}:/rend:ro" \
    -v "${PKG_ABS}:/out" \
    -w /out \
    "$SHAKA_IMAGE" \
    "$@"
}

if ! docker info >/dev/null 2>&1; then
  echo "Docker is not running." >&2
  exit 1
fi

[[ "${SKIP_DOCKER_PULL:-}" == "1" ]] || docker pull "$SHAKA_IMAGE" >/dev/null

mkdir -p "${PKG_ABS}/video_1080" "${PKG_ABS}/video_720" "${PKG_ABS}/video_480"

streams=(
  'in=/rend/1080p.mp4,stream=video,init_segment=/out/video_1080/init.mp4,segment_template=/out/video_1080/seg_$Number$.m4s'
  'in=/rend/720p.mp4,stream=video,init_segment=/out/video_720/init.mp4,segment_template=/out/video_720/seg_$Number$.m4s'
  'in=/rend/480p.mp4,stream=video,init_segment=/out/video_480/init.mp4,segment_template=/out/video_480/seg_$Number$.m4s'
)

add_audio() {
  local file="$1" dir="$2" lang="$3" role="$4" label="$5"
  if [[ ! -f "${REND_ABS}/${file}" ]]; then return; fi
  mkdir -p "${PKG_ABS}/${dir}"
  streams+=(
    "in=/rend/${file},stream=audio,language=${lang},hls_group_id=audio,hls_name=${label},init_segment=/out/${dir}/init.mp4,segment_template=/out/${dir}/seg_\$Number\$.m4s${role:+,roles=${role}}"
  )
}

add_audio "audio_aac_stereo.mp4"  "audio_aac_stereo" "und" "main"            "Stereo"
add_audio "audio_aac_51.mp4"      "audio_aac_51"     "und" "main"            "5.1"
add_audio "audio_aac_71.mp4"      "audio_aac_71"     "und" "main"            "7.1"
add_audio "audio_opus_222.mp4"    "audio_opus_222"   "und" "main"            "22.2 (Opus)"
add_audio "audio_opus_multich.mp4" "audio_opus_mc"   "und" "alternate"       "Multichannel (Opus)"

opts=(
  --segment_duration="${SEG}"
  --mpd_output /out/manifest.mpd
  --hls_master_playlist_output /out/master.m3u8
  --hls_playlist_type VOD
)

if run_packager "${streams[@]}" "${opts[@]}"; then
  :
elif run_packager packager "${streams[@]}" "${opts[@]}"; then
  echo "(Shaka-Image benötigte 'packager'-Subkommando.)" >&2
else
  exit 1
fi

echo "Packaged (immersive multi-audio) to: $PKG_ABS"
