CREATE TABLE IF NOT EXISTS assets (
  slug TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  manifest_hls TEXT,
  manifest_dash TEXT,
  projection TEXT NOT NULL DEFAULT 'none',
  audio_languages JSONB NOT NULL DEFAULT '[]'::jsonb,
  angles JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  message TEXT,
  asset_slug TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS jobs_status_created ON jobs (status, created_at);
