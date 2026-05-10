-- Create the `narration-audio` Supabase Storage bucket.
--
-- Why: server/routes/narration.js:25 and scripts/precache-popular-routes.ts:92
-- both reference this bucket as if it exists. listBuckets() previously
-- returned empty; the first narration upload would fail. This migration
-- is the canonical creation point so the bucket is reproducible across
-- environments (dev, staging, prod).
--
-- Storage path convention:  {poi_id}/{mode}/{depth}/{voice_id}.opus  (slashes)
-- Cache JSON key convention: {mode}-{depth}-{voice_id}              (dashes)
-- Both conventions are used consistently in code; this comment exists
-- to disambiguate for anyone reading later.
--
-- Bucket policy:
--   public            = TRUE          (audio URLs are not sensitive; signed
--                                      URLs add complexity without security
--                                      benefit. Precache uses getPublicUrl)
--   file_size_limit   = 10 MB         (one Deep Dive Opus is well under 1 MB;
--                                      this is generous headroom)
--   allowed_mime_types= audio/ogg + audio/opus

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'narration-audio',
  'narration-audio',
  true,
  10485760,
  ARRAY['audio/ogg', 'audio/opus']
)
ON CONFLICT (id) DO UPDATE
SET public            = EXCLUDED.public,
    file_size_limit   = EXCLUDED.file_size_limit,
    allowed_mime_types= EXCLUDED.allowed_mime_types;
