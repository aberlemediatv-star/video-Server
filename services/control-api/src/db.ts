import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;

const connectionString =
  process.env.DATABASE_URL ??
  "postgres://app:app@127.0.0.1:5432/video_server";

export const pool = new Pool({ connectionString, max: 10 });

export async function migrate(): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url));
  const dir = join(here, "..", "migrations");
  for (const name of ["001_init.sql", "002_projection_spatial.sql"]) {
    const sql = readFileSync(join(dir, name), "utf8");
    await pool.query(sql);
  }
}

export type AssetRow = {
  slug: string;
  title: string;
  manifest_hls: string | null;
  manifest_dash: string | null;
  projection: string;
  spatial: boolean;
  stereo: string;
  audio_languages: unknown;
  angles: unknown;
  created_at: Date;
  updated_at: Date;
};

export type JobRow = {
  id: string;
  type: string;
  status: string;
  payload: unknown;
  message: string | null;
  asset_slug: string | null;
  created_at: Date;
  updated_at: Date;
};

export async function listAssets(): Promise<AssetRow[]> {
  const r = await pool.query<AssetRow>(
    `SELECT slug, title, manifest_hls, manifest_dash, projection, spatial, stereo, audio_languages, angles, created_at, updated_at
     FROM assets ORDER BY updated_at DESC LIMIT 500`,
  );
  return r.rows;
}

export async function upsertAsset(params: {
  slug: string;
  title: string;
  manifestHls?: string;
  manifestDash?: string;
  projection?: string;
  spatial?: boolean;
  stereo?: string;
  audioLanguages?: unknown;
  angles?: unknown;
}): Promise<AssetRow> {
  const r = await pool.query<AssetRow>(
    `INSERT INTO assets (slug, title, manifest_hls, manifest_dash, projection, spatial, stereo, audio_languages, angles, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb, now())
     ON CONFLICT (slug) DO UPDATE SET
       title = EXCLUDED.title,
       manifest_hls = COALESCE(EXCLUDED.manifest_hls, assets.manifest_hls),
       manifest_dash = COALESCE(EXCLUDED.manifest_dash, assets.manifest_dash),
       projection = EXCLUDED.projection,
       spatial = EXCLUDED.spatial,
       stereo = EXCLUDED.stereo,
       audio_languages = EXCLUDED.audio_languages,
       angles = EXCLUDED.angles,
       updated_at = now()
     RETURNING slug, title, manifest_hls, manifest_dash, projection, spatial, stereo, audio_languages, angles, created_at, updated_at`,
    [
      params.slug,
      params.title,
      params.manifestHls ?? null,
      params.manifestDash ?? null,
      params.projection ?? "none",
      params.spatial ?? false,
      params.stereo ?? "mono",
      JSON.stringify(params.audioLanguages ?? []),
      JSON.stringify(params.angles ?? []),
    ],
  );
  return r.rows[0]!;
}

export async function setAssetManifests(params: {
  slug: string;
  title: string;
  manifestHls: string;
  manifestDash: string;
}): Promise<void> {
  await pool.query(
    `INSERT INTO assets (slug, title, manifest_hls, manifest_dash, projection, spatial, stereo, audio_languages, angles, updated_at)
     VALUES ($1,$2,$3,$4,'none', false, 'mono', '[]', '[]', now())
     ON CONFLICT (slug) DO UPDATE SET
       title = EXCLUDED.title,
       manifest_hls = EXCLUDED.manifest_hls,
       manifest_dash = EXCLUDED.manifest_dash,
       updated_at = now()`,
    [params.slug, params.title, params.manifestHls, params.manifestDash],
  );
}

export async function listJobs(limit = 100): Promise<JobRow[]> {
  const r = await pool.query<JobRow>(
    `SELECT id, type, status, payload, message, asset_slug, created_at, updated_at
     FROM jobs ORDER BY created_at DESC LIMIT $1`,
    [limit],
  );
  return r.rows;
}

export async function insertJob(params: {
  type: string;
  payload: unknown;
  assetSlug?: string;
}): Promise<JobRow> {
  const r = await pool.query<JobRow>(
    `INSERT INTO jobs (type, status, payload, asset_slug, updated_at)
     VALUES ($1, 'queued', $2::jsonb, $3, now())
     RETURNING id, type, status, payload, message, asset_slug, created_at, updated_at`,
    [params.type, JSON.stringify(params.payload ?? {}), params.assetSlug ?? null],
  );
  return r.rows[0]!;
}

export async function insertJobDirect(params: {
  type: string;
  status: string;
  payload: unknown;
}): Promise<JobRow> {
  const r = await pool.query<JobRow>(
    `INSERT INTO jobs (type, status, payload, updated_at)
     VALUES ($1, $2, $3::jsonb, now())
     RETURNING id, type, status, payload, message, asset_slug, created_at, updated_at`,
    [params.type, params.status, JSON.stringify(params.payload ?? {})],
  );
  return r.rows[0]!;
}

export async function updateJob(
  id: string,
  patch: { status?: string; message?: string | null },
): Promise<void> {
  const vals: unknown[] = [];
  const sets = ["updated_at = now()"];
  if (patch.status !== undefined) {
    vals.push(patch.status);
    sets.push(`status = $${vals.length}`);
  }
  if (patch.message !== undefined) {
    vals.push(patch.message);
    sets.push(`message = $${vals.length}`);
  }
  vals.push(id);
  await pool.query(
    `UPDATE jobs SET ${sets.join(", ")} WHERE id = $${vals.length}`,
    vals,
  );
}

export async function claimNextJob(): Promise<JobRow | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const sel = await client.query<{ id: string }>(
      `SELECT id FROM jobs
       WHERE status = 'queued'
         AND type IN ('vod_phase_a', 'vod_angle', 'vod_multi_audio')
       ORDER BY created_at ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED`,
    );
    if (!sel.rows[0]) {
      await client.query("ROLLBACK");
      return null;
    }
    const id = sel.rows[0].id;
    const upd = await client.query<JobRow>(
      `UPDATE jobs SET status = 'running', updated_at = now() WHERE id = $1
       RETURNING id, type, status, payload, message, asset_slug, created_at, updated_at`,
      [id],
    );
    await client.query("COMMIT");
    return upd.rows[0] ?? null;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
