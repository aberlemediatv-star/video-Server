#!/usr/bin/env bash
# Wie package_cmaf.sh, zusätzlich ein WebVTT-Subtitle-Track (sidecar input.vtt).
# Usage: ./scripts/package_cmaf_with_subs.sh <renditions_dir> <package_out_dir> <subtitles.vtt> [lang] [label]
set -euo pipefail

REND="${1:?renditions dir}"
PKG="${2:?package out dir}"
VTT="${3:?subtitles.vtt path (absolute or under renditions_dir)}"
LANG_CODE="${4:-en}"
LABEL="${5:-English}"
SEG="${SEG:-4}"

mkdir -p "$PKG"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REND_ABS="$(cd "$REND" && pwd)"
PKG_ABS="$(cd "$PKG" && pwd)"

if [[ ! -f "$VTT" ]]; then
  echo "VTT nicht gefunden: $VTT" >&2
  exit 1
fi
VTT_DIR="$(cd "$(dirname "$VTT")" && pwd)"
VTT_NAME="$(basename "$VTT")"

SHAKA_IMAGE="${SHAKA_PACKAGER_IMAGE:-google/shaka-packager:latest}"

run_packager() {
  docker run --rm \
    -v "${REND_ABS}:/rend:ro" \
    -v "${VTT_DIR}:/subs:ro" \
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

mkdir -p "${PKG_ABS}/video_1080" "${PKG_ABS}/video_720" "${PKG_ABS}/video_480" "${PKG_ABS}/audio" "${PKG_ABS}/subs"

streams=(
  'in=/rend/1080p.mp4,stream=video,init_segment=/out/video_1080/init.mp4,segment_template=/out/video_1080/seg_$Number$.m4s'
  'in=/rend/720p.mp4,stream=video,init_segment=/out/video_720/init.mp4,segment_template=/out/video_720/seg_$Number$.m4s'
  'in=/rend/480p.mp4,stream=video,init_segment=/out/video_480/init.mp4,segment_template=/out/video_480/seg_$Number$.m4s'
  'in=/rend/1080p.mp4,stream=audio,init_segment=/out/audio/init.mp4,segment_template=/out/audio/seg_$Number$.m4s'
  "in=/subs/${VTT_NAME},stream=text,language=${LANG_CODE},hls_name=${LABEL},segment_template=/out/subs/seg_\$Number\$.vtt"
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

echo "Packaged (with subs) to: $PKG_ABS"
