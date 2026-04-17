#!/usr/bin/env bash
# Wie package_cmaf.sh, zusätzlich zweite Audiospur (audio_1.m4a).
set -euo pipefail

REND="${1:?renditions dir}"
PKG="${2:?package out dir}"
SEG="${3:-4}"

mkdir -p "$PKG"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
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

if [[ "${SKIP_DOCKER_PULL:-}" != "1" ]]; then
  docker pull "$SHAKA_IMAGE" >/dev/null
fi

mkdir -p "${PKG_ABS}/video_1080" "${PKG_ABS}/video_720" "${PKG_ABS}/video_480" "${PKG_ABS}/audio_0" "${PKG_ABS}/audio_1"

streams=(
  'in=/rend/1080p.mp4,stream=video,init_segment=/out/video_1080/init.mp4,segment_template=/out/video_1080/seg_$Number$.m4s'
  'in=/rend/720p.mp4,stream=video,init_segment=/out/video_720/init.mp4,segment_template=/out/video_720/seg_$Number$.m4s'
  'in=/rend/480p.mp4,stream=video,init_segment=/out/video_480/init.mp4,segment_template=/out/video_480/seg_$Number$.m4s'
  'in=/rend/audio_0.mp4,stream=audio,init_segment=/out/audio_0/init.mp4,segment_template=/out/audio_0/seg_$Number$.m4s'
  'in=/rend/audio_1.mp4,stream=audio,init_segment=/out/audio_1/init.mp4,segment_template=/out/audio_1/seg_$Number$.m4s'
)
opts=(
  --segment_duration="${SEG}"
  --mpd_output /out/manifest.mpd
  --hls_master_playlist_output /out/master.m3u8
  --hls_playlist_type VOD
)

if run_packager "${streams[@]}" "${opts[@]}"; then
  :
elif run_packager packager "${streams[@]}" "${opts[@]}"; then
  echo "(Hinweis: Shaka-Image benötigte explizites Subkommando 'packager'.)" >&2
else
  exit 1
fi

echo "Packaged (multi-audio) to: $PKG_ABS"
