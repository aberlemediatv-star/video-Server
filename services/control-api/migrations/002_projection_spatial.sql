ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS spatial BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stereo TEXT NOT NULL DEFAULT 'mono';
-- stereo: 'mono' | 'sbs' | 'tb'
-- projection (bestehend): 'none' | 'equirect360' | 'equirect180' | 'apmp_180' | 'apmp_360'
