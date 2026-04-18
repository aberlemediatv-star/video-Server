# Video-Server

VOD/Live-Streaming-Stack mit **HLS + MPEG-DASH (CMAF)**, Multi-Audio, Multi-Angle, 180°/360°-Playback und Platzhalter-Feldern für Apple Vision Pro (Spatial). **Open-Source-Pipeline**: FFmpeg, Shaka Packager, Nginx, MediaMTX, MinIO, Postgres, Redis. **Ohne DRM** (bewusste Entscheidung).

Repo: **https://github.com/aberlemediatv-star/video-Server**

## Bestandteile

- `services/control-api` — Fastify-API + Worker (FFmpeg + Shaka via Docker-Socket)
- `apps/admin-web` — React-Admin (MUI): Assets, Presign, Jobs, Projektion/Stereo/Spatial
- `apps/player-web` — React-Player (Shaka + Three.js): HLS/DASH, Multi-Audio, Multi-Angle, 360°/180°, Stereo SBS/TB, Untertitel
- `scripts/` — FFmpeg-Ladder (SD/HD), Shaka-Packaging (CMAF), **HDR (HEVC Main10)**, **AV1 (SVT-AV1)**, **Multi-Audio**, **WebVTT-Untertitel**
- `nginx/` — VOD-Origin, Live-HLS-Proxy, Cache-Feinschliff
- `mediamtx/` — Live-Ingest (SRT/RTMP/RTSP/WebRTC)
- `.github/workflows/ci.yml` — Build-Check für API + beide Web-Apps

## Schnellstart

```bash
cp .env.example .env   # optional: ADMIN_API_KEY setzen!
docker compose up -d --build
```

URLs:

- VOD-Origin: `http://localhost:8080/vod/<slug>/`
- Live-HLS-Proxy: `http://localhost:8080/live/hls/index.m3u8`
- API: `http://localhost:3000` oder über Nginx: `http://localhost:8080/api/`
- Admin: `apps/admin-web` lokal (`npm run dev`) auf `http://localhost:5174`
- Player: `apps/player-web` lokal (`npm run dev`) auf `http://localhost:5173`
- MinIO-Konsole: `http://localhost:9001` (Default `minio`/`minio12345`)

MinIO-Buckets **`incoming`** und **`assets`** werden beim Start **automatisch** angelegt (`minio-init`-Service).

## Admin-Auth

`ADMIN_API_KEY` setzen (Umgebungsvariable oder `.env`). Alle **POST**-Routen verlangen dann Header **`X-Admin-Key`**. Ohne Key sind POSTs **offen** — nur für lokale Entwicklung.

## VOD-Workflow

1. Eingangsdatei nach `data/incoming/meinfilm.mp4` legen (oder per Presign hochladen).
2. Im Admin „Worker-Job“ mit Typ **`vod_phase_a`**:
   ```json
   { "inputRelativePath": "incoming/meinfilm.mp4", "outputSlug": "meinfilm", "title": "Mein Film" }
   ```
3. Worker führt aus: **FFmpeg ABR-Ladder** → **Shaka Packager (HLS + DASH)** → kopiert nach `data/vod/<slug>/` → aktualisiert Asset.
4. Im Player Asset wählen und **Laden**.

## Weitere Skripte

- **Multi-Audio (2 Sprachen):** Job-Typ `vod_multi_audio` (Quelle braucht zwei Audio-Streams).
- **Immersive Audio bis 22.2:** Job-Typ `vod_immersive_audio` — erzeugt je nach Quelle:
  - **AAC-LC Stereo** (immer)
  - **AAC-LC 5.1** (bei ≥6 Kanälen)
  - **AAC-LC 7.1** (bei ≥8 Kanälen)
  - **Opus 22.2 (24 ch)** (bei ≥24 Kanälen, NHK Super Hi-Vision)
  - **Opus Multichannel-Fallback** sonst
  Player-/Geräte-Hinweis: AAC-LC wird breit ≤7.1 unterstützt; **22.2** läuft in Chrome/Firefox über **Opus-in-MP4** (DASH) — Safari/iOS/tvOS unterstützen das i. d. R. **nicht**; dort Fallback auf 7.1/5.1/Stereo.
- **Multi-Angle (Stufe 1):** je Winkel eigener `vod_angle`-Job; im Asset `angles`-JSON setzen.
- **HDR:** `./scripts/transcode_hdr_hevc_1080p.sh` (HEVC Main10, HDR10/PQ).
- **AV1:** `./scripts/transcode_av1_1080p.sh` (SVT-AV1).
- **Untertitel:** `./scripts/package_cmaf_with_subs.sh` (Sidecar-WebVTT).

## 360°, 180°, 3D (SBS/TB)

Asset-Felder in DB/Admin:

- `projection`: `none` | `equirect180` | `equirect360` | `apmp_180` | `apmp_360`
- `stereo`: `mono` | `sbs` | `tb`
- `spatial`: `boolean` (Platzhalter für Apple MV-HEVC)

Player zeigt den passenden Modus:

- **360/180** → Three.js-Rendering auf Halb-/Vollkugel
- **SBS/TB** → CSS-Crop auf eine Augenhälfte (Fallback-Rendering)
- **spatial** → Hinweis, dass natives Playback Apple Vision Pro vorbehalten ist

## Nicht enthalten / bewusst weggelassen

- **DRM** (Widevine/FairPlay/ClearKey/PlayReady).
- **Apple Vision Pro / MV-HEVC / APMP** — Felder sind vorbereitet, Encoding nicht. Benötigt Apple-Tooling oder experimentelle x265-Patches.
- **Produktive Auth** (OAuth/OIDC), **SSAI**, **Smart-TV-Apps**, **Analytics/Observability** — siehe Plan Phase H+.

## CI

GitHub Actions (`.github/workflows/ci.yml`) prüft `services/control-api`, `apps/admin-web`, `apps/player-web` via `npm ci && npm run build` und läuft `shellcheck` über `scripts/*.sh`.

## Lizenz

MIT — siehe `LICENSE`.
