-- Extend the narration-audio bucket's allowed_mime_types to accept the
-- parameterised 'audio/ogg; codecs=opus' MIME string in addition to the
-- bare 'audio/ogg' / 'audio/opus' variants.
--
-- Why: storage.buckets.allowed_mime_types does exact-string matching, not
-- RFC 7231 parameter-aware comparison. The Google Cloud TTS wrapper at
-- scripts/lib/tts/providers/google.ts returns `mimeType: 'audio/ogg; codecs=opus'`
-- on every OGG_OPUS synthesis (see provider.ts). Both writers
-- (server/routes/narration.js + scripts/precache-popular-routes.ts) pass
-- that string verbatim as the upload Content-Type. Without this entry,
-- every narration upload errored:
--   "Storage upload failed: mime type audio/ogg; codecs=opus is not supported"
--
-- Decision: extend the allow-list rather than strip the `; codecs=opus`
-- parameter from the upload calls. The parameter is semantically useful
-- (informs Opus decoders explicitly) and keeping it in the stored
-- Content-Type metadata helps clients on playback. The bucket's job is to
-- allow narration audio; accepting both parameterless and parameterised
-- forms is in scope.
--
-- Discovered: 2026-05-10 during the LA→Cambria smoke batch (PR I). 28 POIs
-- burned Claude + Google TTS spend before the upload error surfaced.

UPDATE storage.buckets
SET allowed_mime_types = ARRAY['audio/ogg', 'audio/opus', 'audio/ogg; codecs=opus']
WHERE id = 'narration-audio';
