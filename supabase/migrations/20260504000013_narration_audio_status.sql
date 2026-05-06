-- Atomic write ordering for narration generation.
-- status column: pending (being generated) → ready (fully written) / failed (error)
-- audio_url becomes nullable so the row can be inserted before the upload completes.
-- mode column added to enable Storage path reconstruction in the orphan sweeper.

ALTER TABLE narration_audio
  ALTER COLUMN audio_url DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ready'
    CONSTRAINT na_status_check CHECK (status IN ('pending', 'ready', 'failed')),
  ADD COLUMN IF NOT EXISTS mode   text NOT NULL DEFAULT 'driving'
    CONSTRAINT na_mode_check  CHECK (mode IN ('driving', 'hiking', 'city'));

-- Backfill: every existing row was fully generated
UPDATE narration_audio SET status = 'ready' WHERE status IS NULL OR status != 'ready';

-- Sweeper index: find stale pending/failed rows by age
CREATE INDEX IF NOT EXISTS na_status_generated_idx
  ON narration_audio (status, generated_at);

COMMENT ON COLUMN narration_audio.status IS
  'pending=inserting before generation, ready=audio available, failed=generation error';
COMMENT ON COLUMN narration_audio.mode IS
  'Trip mode at generation time — needed to reconstruct the Storage path during orphan sweep.';
