#!/usr/bin/env bash
# Packt eine bereits MV-HEVC-encodierte Datei (rend/spatial.mp4) nach HLS + DASH (CMAF).
# Keine ABR-Ladder — Spatial ist eine eigene High-Quality-Variante. Für Fallback
# separat eine Mono-2D-Variante encoden und als eigenes Asset/Angle hinterlegen.
#
# Usage: ./scripts/package_cmaf_spatial.sh <renditions_dir> <package_out_dir>
set -euo pipefail

REND="${1:?renditions dir}"
PKG="${2:?package out dir}"
SEG="${SEG:-4}"

mkdir -p "$PKG"
REND_ABS="$(cd "$REND" && pwd)"
PKG_ABS="$(cd "$PKG" && pwd)"

if [[ ! -f "${REND_ABS}/spatial.mp4" ]]; then
  echo "Erwartet: ${REND_ABS}/spatial.mp4" >&2
  exit 1
fi

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

mkdir -p "${PKG_ABS}/video_spatial" "${PKG_ABS}/audio"

streams=(
  'in=/rend/spatial.mp4,stream=video,init_segment=/out/video_spatial/init.mp4,segment_template=/out/video_spatial/seg_$Number$.m4s'
  'in=/rend/spatial.mp4,stream=audio,init_segment=/out/audio/init.mp4,segment_template=/out/audio/seg_$Number$.m4s'
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
  :
else
  echo "HINWEIS: Shaka Packager kennt MV-HEVC unter Umständen nicht; für Vision-Pro-Auslieferung ist aktuell ein spezialisiertes Tool nötig (Apple HLS Tools / kommerzieller Packager)." >&2
  exit 1
fi

echo "Packaged (spatial) to: $PKG_ABS (HLS + DASH). Apple Vision Pro: HLS bevorzugen."
