import cors from "@fastify/cors";
import Fastify from "fastify";
import { adminConfigured, requireAdmin } from "./auth.js";
import {
  insertJob,
  insertJobDirect,
  listAssets,
  listJobs,
  migrate,
  upsertAsset,
} from "./db.js";
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

app.addHook("preHandler", async (req, reply) => {
  if (
    req.method === "GET" ||
    req.method === "HEAD" ||
    req.method === "OPTIONS"
  )
    return;
  if (req.url === "/health") return;
  requireAdmin(req, reply);
  if (reply.sent) return;
});

app.get("/health", async () => ({
  ok: true as const,
  adminAuth: adminConfigured(),
}));

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
