# Video-Server

VOD/Live-Streaming-Stack mit **HLS + MPEG-DASH (CMAF)**, Multi-Audio (bis **22.2 Opus**), Multi-Angle, 180°/360°-Playback, **Stereo 3D (SBS/TB)** und Spatial-Packaging-Pfad für Apple Vision Pro. **Open-Source-Pipeline**: FFmpeg, Shaka Packager, Nginx, MediaMTX, MinIO, Postgres, Redis. Optional **Observability** (Prometheus/Grafana) und **OIDC-Auth**. **Ohne DRM** (bewusste Entscheidung).

Repo: https://github.com/aberlemediatv-star/video-Server

## Struktur

- `services/control-api` — Fastify-API (**/metrics**, **OIDC-optional**, **SSAI-Demo**) + Worker
- `apps/admin-web` — React-Admin (MUI)
- `apps/player-web` — React-Player (Shaka + Three.js)
- `apps/player-tv` — **Tizen / webOS**-Verpackung für `player-web` (Build separat nötig)
- `scripts/` — FFmpeg/Shaka/MV-HEVC/Untertitel/AV1/Immersive-Audio
- `observability/` — Prometheus-Config; Grafana kommt aus Compose
- `nginx/`, `mediamtx/`, `data/`, `.github/workflows/ci.yml`

## Schnellstart

```bash
cp .env.example .env   # ADMIN_API_KEY setzen, optional OIDC_*
docker compose up -d --build
```

- VOD: `http://localhost:8080/vod/<slug>/`
- Live-HLS-Proxy: `http://localhost:8080/live/hls/index.m3u8`
- API: `http://localhost:3000` oder `http://localhost:8080/api/`
- MinIO: `http://localhost:9001` (Buckets `incoming`/`assets` werden automatisch angelegt)

**Observability** optional (Profile):

```bash
docker compose --profile observability up -d prometheus grafana
# Prometheus http://localhost:9090   Grafana http://localhost:3001 (admin/admin)
```

## Auth-Matrix

Reihenfolge: **OIDC** > **`ADMIN_API_KEY`** > offen (nur Dev).

- **OIDC (Produktion):** `OIDC_ISSUER_URL`, optional `OIDC_AUDIENCE`, `OIDC_CLIENT_ID`. Clients senden `Authorization: Bearer <JWT>`; die API verifiziert via `.well-known/openid-configuration` + JWKS.
- **API-Key (lokal):** `ADMIN_API_KEY` setzen, Admin-UI speichert den Key, Header `X-Admin-Key` wird gesendet.
- Ohne beides sind POSTs **offen** — nur Entwicklung.

## Jobs

| Typ | Zweck |
|-----|------|
| `vod_phase_a` | ABR-Ladder (1080/720/480 AVC + AAC) → HLS/DASH |
| `vod_angle` | weiterer Winkel als eigener Slug (Stufe-1-Multi-Angle) |
| `vod_multi_audio` | zwei Audio-Sprachen |
| `vod_immersive_audio` | Stereo/5.1/7.1 (AAC) + 22.2 (Opus), je nach Quelle |
| `vod_spatial_package` | packaging-only für bereits MV-HEVC-encodierte Datei |

Payload (bis auf `vod_spatial_package` identisch):

```json
{ "inputRelativePath": "incoming/meinfilm.mp4", "outputSlug": "meinfilm", "title": "Mein Film" }
```

## Spatial / Apple Vision Pro

- **Encoding**: FFmpeg-Mainline kann **kein** MV-HEVC. Host-Helper `scripts/transcode_mv_hevc_macos.sh` prüft nur die Voraussetzungen und verweist auf Apples **AVFoundation** (Xcode 15+, „Authoring Spatial Video“). Fertige MV-HEVC-Datei anschließend nach `data/incoming/` legen.
- **Packaging**: `vod_spatial_package` → `scripts/package_cmaf_spatial.sh`. Shaka Packager kennt MV-HEVC aktuell nicht vollständig; für produktive Apple-HLS-Auslieferung kann ein **Apple HLS Tools** oder kommerzieller Packager nötig sein.
- DB-Felder `projection` (`apmp_180`/`apmp_360`) und `spatial: boolean` sind für Asset-Katalog/Player vorgesehen.

## SSAI (Demo)

`GET /api/ssai/:slug/master.m3u8` liest das gebaute HLS-Master und prependet Pre-Roll-Hinweise. **Kein** echter Ad-Decision-Flow — produktiv braucht man **SCTE-35**, VAST/VMAP, per-Variant Rewrite. Siehe Plan „Phase H+“.

## Observability

- `GET /metrics` liefert Prometheus-Metriken: Default-Node-Metriken, `http_requests_total`, `http_request_duration_seconds`, `jobs_enqueued_total`, `jobs_finished_total`, `job_duration_seconds`.
- Worker-Logs sind strukturiert (JSON, `service="worker"`, `jobId`).
- Prometheus + Grafana starten optional per Profile `observability`.

## Smart-TV

- **Tizen (Samsung)** und **webOS (LG)**: `apps/player-tv/` enthält `config.xml` / `appinfo.json`. Build von `apps/player-web/dist` hineinkopieren und mit dem jeweiligen SDK packen. Siehe `apps/player-tv/README.md`.
- **tvOS** (Apple): keine Web-App-Plattform — eigenes Xcode-Projekt nötig, nicht enthalten.
- **Android TV**: das bestehende `player-web` funktioniert im TV-Browser/WebView.

## CI

`.github/workflows/ci.yml` — `npm ci && npm run build` für API + beide Web-Apps; `shellcheck` für Skripte.

## Bewusst nicht enthalten

- **DRM** (Widevine/FairPlay/ClearKey/PlayReady).
- **MV-HEVC-Encoding im Repo** (benötigt Apple-Tooling).
- **Vollständige SSAI** (nur Demo-Endpoint).
- **tvOS-App** (braucht nativen Xcode-Stack).
