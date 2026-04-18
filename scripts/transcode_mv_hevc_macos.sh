#!/usr/bin/env bash
# Host-Helper (macOS): erzeugt eine MV-HEVC-Datei (Apple Spatial Video, Apple Vision Pro) aus
# zwei Eingängen (links/rechts) oder einem SBS-Input.
#
# ACHTUNG: MV-HEVC-Encoding ist **nicht** in FFmpeg-Mainline enthalten.
# Produktiv braucht man Apples avconvert / AVFoundation (macOS) oder
# spezielle x265-Patches. Dieses Skript ist ein Stub, der (1) prüft, ob wir
# auf macOS laufen, und (2) avconvert versucht. Wenn nicht vorhanden, gibt
# es eine klare Fehlermeldung.
#
# Ausgabe: eine .mov/.mp4, die danach per Job `vod_spatial_package` paketiert
# werden kann.
#
# Usage:
#   ./scripts/transcode_mv_hevc_macos.sh --sbs <sbs_input.mp4> <output.mov>
#   ./scripts/transcode_mv_hevc_macos.sh --lr <left.mov> <right.mov> <output.mov>
set -euo pipefail

die() { echo "$*" >&2; exit 1; }

[[ "$(uname)" == "Darwin" ]] || die "MV-HEVC-Encoding unterstützen wir nur auf macOS (Host)."

if ! command -v avconvert >/dev/null 2>&1; then
  die "avconvert nicht gefunden. Erfordert macOS 14+ oder Apple Developer Tools."
fi

MODE="${1:-}"
case "$MODE" in
  --sbs)
    SRC="${2:?SBS input}"
    OUT="${3:?output}"
    echo "avconvert --preset ... --input '$SRC' --output '$OUT'  (Stub)"
    die "Dieser Pfad ist nicht automatisiert: Apple bietet kein SBS→MV-HEVC-Direct-Convert. Bitte die Quellen getrennt als --lr angeben oder Xcode/AVFoundation-Tooling einsetzen."
    ;;
  --lr)
    LEFT="${2:?left input}"
    RIGHT="${3:?right input}"
    OUT="${4:?output}"
    # Apples `avconvert` hat in aktuellen macOS-Versionen keinen offiziellen
    # Flag für MV-HEVC-Merge. Offizieller Weg: Xcode 15+ / `AVAssetWriter`
    # mit `AVVideoCodecTypeHEVC` + `MVHEVC` Tagging. Dieses Skript ist
    # bewusst ein klarer Abbruch mit Hinweis.
    die "MV-HEVC-Merge aus L/R-Paaren ist hier nicht automatisiert. Nutze Xcode/AVFoundation-Sample-Code (Apple WWDC 2023/2024: 'Authoring Spatial Video'). Lege die fertige Datei anschließend unter data/incoming/ ab und reiche Job-Typ 'vod_spatial_package' ein."
    ;;
  *)
    die "Usage: $0 --sbs <input.mp4> <output.mov>  |  --lr <left> <right> <output.mov>"
    ;;
esac
