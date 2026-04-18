import cors from "@fastify/cors";
import Fastify from "fastify";
import { readFile } from "node:fs/promises";
import { adminConfigured, requireAdmin } from "./auth.js";
import {
  insertJob,
  insertJobDirect,
  listAssets,
  listJobs,
  migrate,
  upsertAsset,
} from "./db.js";
import {
  httpDuration,
  httpRequests,
  jobsEnqueued,
  registry,
} from "./metrics.js";
import { oidcPublicConfig } from "./oidc.js";
import { presignPut } from "./presign.js";

const vodBase = process.env.VOD_PUBLIC_BASE?.replace(/\/$/, "") ?? "http://localhost:8080/vod";

function rowToAsset(row: Awaited<ReturnType<typeof listAssets>>[0]) {
  return {
    slug: row.slug,
    title: row.title,
    manifestHls: row.manifest_hls ?? undefined,
    manifestDash: row.manifest_dash ?? undefined,
    projection: row.projection,
    spatial: row.spatial,
    stereo: row.stereo,
    audioLanguages: row.audio_languages,
    angles: row.angles,
    createdAt: row.created_at.toISOString(),
  };
}

function rowToJob(row: Awaited<ReturnType<typeof listJobs>>[0]) {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    payload: row.payload,
    message: row.message ?? undefined,
    assetSlug: row.asset_slug ?? undefined,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

await migrate();

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: [
    process.env.ADMIN_DEV_ORIGIN ?? "http://localhost:5174",
    process.env.PLAYER_DEV_ORIGIN ?? "http://localhost:5173",
    /^https?:\/\/localhost(:\d+)?$/,
  ],
});

app.addHook("onRequest", async (req) => {
  (req as { _tsNs?: bigint })._tsNs = process.hrtime.bigint();
});

app.addHook("onResponse", async (req, reply) => {
  const route =
    (req.routeOptions && req.routeOptions.url) ||
    req.url.split("?")[0] ||
    "other";
  const status = String(reply.statusCode);
  const labels = { method: req.method, route, status };
  httpRequests.inc(labels, 1);
  const start = (req as { _tsNs?: bigint })._tsNs;
  if (start) {
    const dt = Number(process.hrtime.bigint() - start) / 1e9;
    httpDuration.observe(labels, dt);
  }
});

app.addHook("preHandler", async (req, reply) => {
  if (
    req.method === "GET" ||
    req.method === "HEAD" ||
    req.method === "OPTIONS"
  )
    return;
  if (req.url === "/health") return;
  await requireAdmin(req, reply);
  if (reply.sent) return;
});

app.get("/health", async () => ({
  ok: true as const,
  adminAuth: adminConfigured(),
  oidc: oidcPublicConfig(),
}));

app.get("/metrics", async (_req, reply) => {
  reply.header("Content-Type", registry.contentType);
  return registry.metrics();
});

app.get("/api/assets", async () => {
  const rows = await listAssets();
  return { assets: rows.map(rowToAsset) };
});

app.post("/api/assets", async (req, reply) => {
  const body = req.body as Record<string, unknown>;
  if (!body?.slug || !body?.title) {
    reply.code(400);
    return { error: "slug and title required" };
  }
  const slug = String(body.slug).replace(/[^a-zA-Z0-9-_]/g, "");
  if (!slug) {
    reply.code(400);
    return { error: "invalid slug after normalization" };
  }
  const manifestFromBody = (v: unknown) =>
    typeof v === "string" && v.trim() ? v.trim() : undefined;
  const manifestHls =
    manifestFromBody(body.manifestHls) ??
    `${vodBase}/${encodeURIComponent(slug)}/master.m3u8`;
  const manifestDash =
    manifestFromBody(body.manifestDash) ??
    `${vodBase}/${encodeURIComponent(slug)}/manifest.mpd`;
  const row = await upsertAsset({
    slug,
    title: String(body.title),
    manifestHls,
    manifestDash,
    projection: (body.projection as string) ?? "none",
    spatial: Boolean(body.spatial),
    stereo: ((body.stereo as string) ?? "mono").toLowerCase(),
    audioLanguages: body.audioLanguages,
    angles: body.angles,
  });
  reply.code(201);
  return { asset: rowToAsset(row) };
});

app.get("/api/jobs", async () => {
  const rows = await listJobs(200);
  return { jobs: rows.map(rowToJob) };
});

app.post("/api/jobs", async (req, reply) => {
  const body = req.body as {
    type?: string;
    payload?: unknown;
    assetSlug?: string;
  };
  if (!body?.type) {
    reply.code(400);
    return { error: "type required" };
  }
  const allowed = new Set([
    "vod_phase_a",
    "vod_angle",
    "vod_multi_audio",
    "vod_immersive_audio",
    "vod_spatial_package",
  ]);
  if (!allowed.has(body.type)) {
    reply.code(400);
    return { error: "unsupported job type" };
  }
  const row = await insertJob({
    type: body.type,
    payload: body.payload ?? {},
    assetSlug: body.assetSlug,
  });
  jobsEnqueued.inc({ type: body.type }, 1);
  reply.code(201);
  return { job: rowToJob(row) };
});

/** Demo-Job ohne Payload (nur DB-Eintrag) — für UI-Smoke. */
app.post("/api/jobs/demo", async (_req, reply) => {
  const row = await insertJobDirect({
    type: "demo_stub",
    status: "succeeded",
    payload: { note: "Kein Worker-Schritt; nur UI-Test." },
  });
  reply.code(201);
  return { job: rowToJob(row) };
});

/**
 * SSAI-Demo: liest den gebauten HLS-Master eines Assets aus dem VOD-Volume
 * und fügt eine Pre-Roll-Variante (via Diskontinuität) voran.
 *
 * HINWEIS: Dies ist ein *Demo-Stub*. Produktives SSAI benötigt SCTE-35-Marker,
 * einen Ad-Decision-Server (VAST/VMAP) und Manifest-Manipulation pro Varianten-Playlist.
 * Der Stub manipuliert nur das Master-Manifest und fügt Hinweiskommentare hinzu.
 *
 * Konfig: SSAI_VOD_ROOT (Default /usr/share/nginx/html/vod im Nginx-Container,
 * lokal meist ./data/vod).
 */
app.get("/api/ssai/:slug/master.m3u8", async (req, reply) => {
  const slug = (req.params as { slug: string }).slug.replace(
    /[^a-zA-Z0-9-_]/g,
    "",
  );
  const vodRoot = process.env.SSAI_VOD_ROOT ?? "/data/vod";
  const path = `${vodRoot}/${slug}/master.m3u8`;
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch {
    reply.code(404);
    return { error: "master.m3u8 not found for slug", slug };
  }
  const preroll = process.env.SSAI_PREROLL_NOTE ?? "AD-BREAK placeholder";
  const injected = [
    "#EXTM3U",
    "## SSAI-DEMO — not production SSAI",
    `## pre-roll: ${preroll}`,
    "## Real SSAI requires SCTE-35 + ad decision server + per-variant rewrite.",
    text.replace(/^#EXTM3U\r?\n/, ""),
  ].join("\n");
  reply.header("Content-Type", "application/vnd.apple.mpegurl");
  reply.header("Cache-Control", "public, max-age=5");
  return injected;
});

app.post("/api/uploads/presign", async (req, reply) => {
  const body = req.body as { bucket?: string; key?: string; contentType?: string };
  if (!body?.bucket || !body?.key || !body?.contentType) {
    reply.code(400);
    return { error: "bucket, key, contentType required" };
  }
  const rawTtl = Number(process.env.PRESIGN_TTL_SEC ?? "900");
  const expiresSec =
    Number.isFinite(rawTtl) && rawTtl > 0 ? Math.min(rawTtl, 604800) : 900;
  const out = await presignPut({
    bucket: body.bucket,
    key: body.key,
    contentType: body.contentType,
    expiresSec,
  });
  return out;
});

const port = Number(process.env.PORT ?? "3000");
const host = process.env.HOST ?? "127.0.0.1";

await app.listen({ port, host });
