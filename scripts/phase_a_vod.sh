#!/usr/bin/env bash
# Phase A — VOD E2E: Transcode (ABR) → Package (HLS+DASH) → Publish nach data/vod/demo → Demo-Asset in Control-API.
# Usage: ./scripts/phase_a_vod.sh <input.mp4>
# Env: CONTROL_API_URL (default http://127.0.0.1:3000), SKIP_DOCKER_PULL=1, VOD_PUBLIC_BASE
set -euo pipefail

if [[ "${1:-}" == "" ]]; then
  echo "Usage: $0 <input.mp4>" >&2
  exit 1
fi

INPUT="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
if [[ ! -f "$INPUT" ]]; then
  echo "Datei nicht gefunden: $INPUT" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REND="${ROOT}/data/work/rend"
PKG="${ROOT}/data/work/pkg"
DEMO="${ROOT}/data/vod/demo"
CONTROL_API_URL="${CONTROL_API_URL:-http://127.0.0.1:3000}"
VOD_PUBLIC_BASE="${VOD_PUBLIC_BASE:-http://localhost:8080/vod}"

command -v ffmpeg >/dev/null 2>&1 || {
  echo "ffmpeg nicht im PATH." >&2
  exit 1
}

echo "== Phase A: Transcode → $REND"
mkdir -p "$REND"
"${ROOT}/scripts/transcode_abr.sh" "$INPUT" "$REND"

echo "== Phase A: Package → $PKG"
mkdir -p "$PKG"
"${ROOT}/scripts/package_cmaf.sh" "$REND" "$PKG"

echo "== Phase A: Publish → $DEMO (Nginx /vod/demo/)"
mkdir -p "$DEMO"
rsync -a --delete "${PKG}/" "${DEMO}/"

echo "== Phase A: Demo-Asset in Control-API registrieren ($CONTROL_API_URL)"
CURL_AUTH=()
if [[ -n "${ADMIN_API_KEY:-}" ]]; then
  CURL_AUTH=(-H "X-Admin-Key: ${ADMIN_API_KEY}")
fi
if curl -sfS -X POST "${CONTROL_API_URL%/}/api/assets" \
  "${CURL_AUTH[@]}" \
  -H "Content-Type: application/json" \
  -d "{\"slug\":\"demo\",\"title\":\"Phase-A Demo\",\"manifestHls\":\"${VOD_PUBLIC_BASE}/demo/master.m3u8\",\"manifestDash\":\"${VOD_PUBLIC_BASE}/demo/manifest.mpd\"}"; then
  echo "(API: OK)"
else
  echo "Hinweis: Control-API nicht erreichbar — später Admin „Demo-Asset“ oder POST manuell." >&2
fi
echo ""

echo "Phase A fertig."
echo "  DASH:  ${VOD_PUBLIC_BASE}/demo/manifest.mpd"
echo "  HLS:   ${VOD_PUBLIC_BASE}/demo/master.m3u8"
echo "  Player: npm run dev in apps/player-web, Asset „demo“ wählen."
