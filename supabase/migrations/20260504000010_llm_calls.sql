-- Audit table for every LLM and TTS call made by the narration pipeline.
-- Covers both Claude (call_type='claude') and TTS providers (call_type='tts').
create table if not exists llm_calls (
  id              uuid          primary key default gen_random_uuid(),
  call_type       text          not null check (call_type in ('claude', 'tts')),
  provider        text          not null,                         -- 'google', 'elevenlabs', 'anthropic', etc.
  model_or_voice  text          not null,                         -- voice_id for tts, model name for claude
  input_chars     int,                                            -- character count (tts only)
  input_tokens    int,                                            -- prompt tokens (claude only)
  output_tokens   int,                                            -- completion tokens (claude only)
  cost_usd        numeric(10,6) not null,
  related_id      uuid,                                           -- narration_audio.id, poi_review_queue.id, etc.
  created_at      timestamptz   not null default now()
);

create index llm_calls_created_at_idx on llm_calls (created_at);
create index llm_calls_related_id_idx on llm_calls (related_id) where related_id is not null;
create index llm_calls_provider_idx   on llm_calls (provider, call_type);

-- Cost data is internal — only service role may read or write.
alter table llm_calls enable row level security;

create policy "service_role_full_access" on llm_calls
  using     (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
