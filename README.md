# Video-Server (ohne DRM)

Docker-Stack: **Nginx** (VOD + Live-HLS-Proxy + `/api`), **Control-API** (Fastify + **Postgres**), **Worker** (FFmpeg + Shaka per Docker-Socket), **MediaMTX**, **MinIO**, **Redis**, **Postgres**.

## Schnellstart

```bash
cd "/Users/christianaberle/video server"
docker compose up -d --build
```

- VOD: `http://localhost:8080/vod/<slug>/`
- Live-HLS (MediaMTX-Pfad `live`): `http://localhost:8080/live/hls/index.m3u8` (Publisher nach `rtmp://localhost:1935/live` oder RTSP)
- API: `http://localhost:3000` oder `http://localhost:8080/api/`
- MinIO-Konsole: `http://localhost:9001` — Bucket z. B. **`incoming`** anlegen, damit Presign-Uploads funktionieren.

### Admin-API-Key (empfohlen)

Setze in `.env` oder Shell:

```bash
export ADMIN_API_KEY=ein-geheimer-wert
docker compose up -d --build
```

Ohne Key sind **POST**-Routen (Assets, Jobs, Presign) offen (nur für lokale Entwicklung gedacht).

Admin-Web (`apps/admin-web`): Feld **ADMIN_API_KEY** ausfüllen und speichern — alle Mutationen senden `X-Admin-Key`.

## Worker & Datenbank

Jobs (`vod_phase_a`, `vod_angle`, `vod_multi_audio`) werden in **Postgres** gequeued; der **Worker**-Container:

- liest `inputRelativePath` relativ zu **`/data`** (Host: `./data`),
- führt Skripte unter **`/scripts`** aus,
- schreibt fertige Pakete nach **`/data/vod/<outputSlug>/`**,
- aktualisiert Manifest-URLs im Asset.

**Beispiel:** Datei auf den Host legen: `data/incoming/meinfilm.mp4`, dann per Admin „Worker-Job“ oder:

```bash
curl -sS -X POST "http://localhost:3000/api/jobs" \
  -H "Content-Type: application/json" \
  -H "X-Admin-Key: $ADMIN_API_KEY" \
  -d '{"type":"vod_phase_a","payload":{"inputRelativePath":"incoming/meinfilm.mp4","outputSlug":"meinfilm","title":"Mein Film"}}'
```

## Phase A lokal (Skript)

```bash
make scripts-executable
# API läuft; bei ADMIN_API_KEY:
export ADMIN_API_KEY=…
make phase-a INPUT=/pfad/zum/video.mp4
```

## Multi-Audio

Quelle mit **mindestens zwei Audio-Streams**. Job-Typ **`vod_multi_audio`** (gleiches Payload wie `vod_phase_a`). Skripte: `transcode_abr_multiaudio.sh`, `package_cmaf_multiaudio.sh`.

## Multi-Angle (Stufe 1)

Pro Winkel eigener **`outputSlug`** (eigenes Manifest), z. B. zweiter Job `vod_angle` mit `outputSlug: "live_side"`. Im Asset **`angles`** setzen (JSON), damit der Player die Manifeste wählen kann:

```json
"angles": [
  {
    "id": "side",
    "label": "Seitenkamera",
    "manifestHls": "http://localhost:8080/vod/side/master.m3u8",
    "manifestDash": "http://localhost:8080/vod/side/manifest.mpd"
  }
]
```

## HDR (Beispiel)

Ein HDR-HEVC-1080p-File erzeugen (nicht automatisch in der Standard-Ladder):

```bash
./scripts/transcode_hdr_hevc_1080p.sh eingang.mp4 data/work/hdr1080.mp4
```

## 360° / 180° im Player

Asset-Feld **`projection`**: `none` | `equirect360` | `equirect180`. Admin-Button „Demo-Asset 360°“ legt nur Metadaten an — für echtes Bild zuerst VOD encoden und Manifeste setzen.

## Web-Apps (Dev)

```bash
cd services/control-api && npm run dev
cd apps/player-web && npm run dev
cd apps/admin-web && npm run dev
```

## MinIO Presign

Admin → **Presigned PUT**: liefert URL; Upload z. B. mit `curl -X PUT --upload-file … "<url>"`.

## Nginx-Cache

Manifeste (`m3u8`/`mpd`) kurz cachebar, Segmente (`m4s`/`mp4`) länger — siehe `map` in `nginx/nginx.conf`.

## Nicht enthalten (bewusst)

- **DRM** (Widevine/FairPlay/ClearKey) — separat nachrüstbar.
- Produktions-harte **Auth** (OAuth), **Observability**, **SSAI** — siehe Plan Phase H+.
