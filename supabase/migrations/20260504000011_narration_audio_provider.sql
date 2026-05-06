-- Track which TTS provider generated each cached narration, plus cost and quality metadata.
alter table narration_audio
  add column if not exists provider        text          not null default 'google',
  add column if not exists character_count int,
  add column if not exists duration_ms     int,
  add column if not exists cost_usd        numeric(10,6),
  add column if not exists prompt_version  int           not null default 1;

comment on column narration_audio.prompt_version is
  'Increment when narration prompt templates change to allow targeted cache invalidation.';
