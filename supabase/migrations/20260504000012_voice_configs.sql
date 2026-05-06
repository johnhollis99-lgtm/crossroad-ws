create table voice_configs (
  id             uuid        primary key default gen_random_uuid(),
  mode           text        not null check (mode in ('family', 'kids', 'unfiltered', 'local')),
  provider       text        not null default 'google',
  voice_id       text        not null,
  voice_settings jsonb       not null default '{}',
  display_name   text,
  description    text,
  is_active      boolean     not null default true,
  version        int         not null default 1,
  created_at     timestamptz not null default now()
);

-- Only one active voice per mode at a time.
create unique index idx_voice_configs_active_mode
  on voice_configs (mode)
  where is_active = true;

-- Service-role only (populated by migration + voice-audition tooling, not by app clients).
alter table voice_configs enable row level security;

create policy "service_role_full_access" on voice_configs
  using     (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

comment on table voice_configs is
  'Active TTS voice per audience mode. Exactly one is_active row per mode (enforced by partial unique index).';
comment on column voice_configs.voice_settings is
  'Provider-specific overrides: speakingRate, pitch, etc. Merged with provider defaults at call time.';
comment on column voice_configs.version is
  'Increment when voice or settings change to allow targeted narration_audio cache invalidation.';
