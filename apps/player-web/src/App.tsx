import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import shaka from "shaka-player";
import { Immersive360 } from "./Immersive360";
import "./App.css";

const apiBase = import.meta.env.VITE_API_URL ?? "";

type Angle = {
  id: string;
  label: string;
  manifestHls?: string;
  manifestDash?: string;
};

type Asset = {
  slug: string;
  title: string;
  manifestHls?: string;
  manifestDash?: string;
  projection?: string;
  audioLanguages?: unknown;
  angles?: Angle[];
};

export default function App() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [videoForImmersive, setVideoForImmersive] =
    useState<HTMLVideoElement | null>(null);
  const playerRef = useRef<shaka.Player | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string>("");
  const [format, setFormat] = useState<"dash" | "hls">("dash");
  const [manualUrl, setManualUrl] = useState("");
  const [error, setError] = useState<string | null>(() =>
    shaka.Player.isBrowserSupported()
      ? null
      : "Browser wird von Shaka Player nicht unterstützt.",
  );
  const [tracks, setTracks] = useState<shaka.extern.Track[]>([]);
  const [audios, setAudios] = useState<shaka.extern.AudioTrack[]>([]);
  const [immersiveOn, setImmersiveOn] = useState(false);
  const [angleId, setAngleId] = useState<string>("");

  const selectedAsset = useMemo(
    () => assets.find((a) => a.slug === selectedSlug),
    [assets, selectedSlug],
  );

  const activeAngle = useMemo(() => {
    const list = selectedAsset?.angles ?? [];
    if (!angleId) return undefined;
    return list.find((x) => x.id === angleId);
  }, [angleId, selectedAsset?.angles]);

  const manifestUrl = useMemo(() => {
    const trimmed = manualUrl.trim();
    if (trimmed) return trimmed;
    if (!selectedAsset) return "";
    if (activeAngle) {
      return format === "dash"
        ? (activeAngle.manifestDash ?? "")
        : (activeAngle.manifestHls ?? "");
    }
    return format === "dash"
      ? (selectedAsset.manifestDash ?? "")
      : (selectedAsset.manifestHls ?? "");
  }, [activeAngle, format, manualUrl, selectedAsset]);

  const loadAssets = useCallback(async () => {
    const res = await fetch(`${apiBase}/api/assets`);
    if (!res.ok) return;
    const data = (await res.json()) as { assets: Asset[] };
    const list = data.assets ?? [];
    setAssets(list);
    setSelectedSlug((prev) => {
      const stillThere = Boolean(prev && list.some((a) => a.slug === prev));
      if (stillThere) return prev;
      if (list.some((a) => a.slug === "demo")) return "demo";
      return list[0]?.slug ?? "";
    });
  }, []);

  useEffect(() => {
    startTransition(() => {
      void loadAssets();
    });
  }, [loadAssets]);

  /** Slug aus API gefallen → Auswahl zurücksetzen (vermeidet leeres Manifest / kaputtes <select>). */
  useEffect(() => {
    if (!selectedSlug) return;
    if (assets.some((a) => a.slug === selectedSlug)) return;
    startTransition(() => {
      setSelectedSlug("");
      setAngleId("");
      setImmersiveOn(false);
    });
  }, [assets, selectedSlug]);

  /** Winkel-ID nicht mehr im aktuellen Asset → Haupt-Manifest nutzen. */
  useEffect(() => {
    const angles = selectedAsset?.angles ?? [];
    if (!angleId) return;
    if (angles.some((a) => a.id === angleId)) return;
    startTransition(() => setAngleId(""));
  }, [angleId, selectedAsset?.angles]);

  const selectAssetSlug = useCallback((slug: string) => {
    setSelectedSlug(slug);
    setAngleId("");
    setImmersiveOn(false);
  }, []);

  const bindVideoRef = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
    setVideoForImmersive(el);
  }, []);

  const destroyPlayer = useCallback(() => {
    playerRef.current?.destroy().catch(() => undefined);
    playerRef.current = null;
  }, []);

  const attachPlayer = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !manifestUrl) return;
    if (shaka.Player.isBrowserSupported()) setError(null);
    destroyPlayer();
    const player = new shaka.Player(video);
    playerRef.current = player;
    player.addEventListener("error", (event) => {
      const detail = (event as CustomEvent<{ message?: string }>).detail;
      const msg =
        detail && typeof detail === "object" && "message" in detail
          ? String((detail as { message?: string }).message)
          : "Unbekannter Shaka-Fehler";
      setError(msg);
    });
    try {
      await player.load(manifestUrl);
      setTracks(player.getVariantTracks());
      setAudios(player.getAudioTracks());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [destroyPlayer, manifestUrl]);

  useEffect(() => {
    return () => {
      destroyPlayer();
    };
  }, [destroyPlayer]);

  return (
    <div className="page">
      <header className="header">
        <h1>Streaming-Player</h1>
        <p className="muted">
          HLS / DASH über Shaka. API:{" "}
          <code>{apiBase || "(Vite-Proxy /api)"}</code>
        </p>
      </header>

      <section className="panel">
        <div className="row">
          <label>
            Asset
            <select
              value={selectedSlug}
              onChange={(e) => selectAssetSlug(e.target.value)}
            >
              <option value="">— wählen —</option>
              {assets.map((a) => (
                <option key={a.slug} value={a.slug}>
                  {a.title} ({a.slug})
                </option>
              ))}
            </select>
          </label>
          {!!selectedAsset?.angles?.length && (
            <label>
              Kamerawinkel
              <select
                value={angleId}
                onChange={(e) => setAngleId(e.target.value)}
              >
                <option value="">— Haupt —</option>
                {selectedAsset.angles!.map((an) => (
                  <option key={an.id} value={an.id}>
                    {an.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            Format
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as "dash" | "hls")}
            >
              <option value="dash">DASH (MPD)</option>
              <option value="hls">HLS (M3U8)</option>
            </select>
          </label>
          <button type="button" onClick={() => void loadAssets()}>
            Assets neu laden
          </button>
        </div>
        <label className="block">
          Manifest-URL (optional, überschreibt Auswahl)
          <input
            value={manualUrl}
            onChange={(e) => setManualUrl(e.target.value)}
            placeholder="https://…/manifest.mpd oder …/master.m3u8"
          />
        </label>
        <div className="row">
          <button type="button" onClick={() => void attachPlayer()}>
            Laden
          </button>
          {(selectedAsset?.projection === "equirect360" ||
            selectedAsset?.projection === "equirect180") && (
            <button
              type="button"
              onClick={() => setImmersiveOn((v) => !v)}
            >
              {immersiveOn ? "360°/180° aus" : "360°/180°-Ansicht"}
            </button>
          )}
        </div>
        {error && <p className="error">{error}</p>}
      </section>

      <section
        className={`videoWrap${immersiveOn ? " immersiveActive" : ""}`}
      >
        <video ref={bindVideoRef} controls playsInline className="video" />
        {immersiveOn &&
          (selectedAsset?.projection === "equirect360" ||
            selectedAsset?.projection === "equirect180") && (
            <Immersive360
              video={videoForImmersive}
              active={immersiveOn}
              mode={
                selectedAsset.projection === "equirect180"
                  ? "equirect180"
                  : "equirect360"
              }
            />
          )}
      </section>

      <section className="panel">
        <h2>Qualität (Video-Renditions)</h2>
        <ul className="list">
          {tracks.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => {
                  playerRef.current?.selectVariantTrack(t, true);
                  setTracks(playerRef.current?.getVariantTracks() ?? []);
                }}
              >
                {t.height}p · {(t.bandwidth / 1e6).toFixed(2)} Mb/s
              </button>
            </li>
          ))}
          {!tracks.length && <li className="muted">Noch keine Spur geladen.</li>}
        </ul>
        <h2>Audio</h2>
        <ul className="list">
          {audios.map((a, i) => (
            <li key={`${a.language}-${i}`}>
              <button
                type="button"
                onClick={() => {
                  playerRef.current?.selectAudioTrack(a, 0.1);
                  setAudios(playerRef.current?.getAudioTracks() ?? []);
                }}
              >
                {a.label || a.language}
                {a.roles?.length ? ` · ${a.roles.join(", ")}` : ""}
              </button>
            </li>
          ))}
          {!audios.length && <li className="muted">—</li>}
        </ul>
      </section>
    </div>
  );
}
