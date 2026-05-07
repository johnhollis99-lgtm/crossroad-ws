-- =============================================================
-- XRoad: Apply pending migrations 000002 → 000014
-- Generated 2026-05-05
--
-- HOW TO RUN:
--   Supabase Dashboard → SQL Editor → paste this file → Run
--   OR: npx supabase db query -f supabase/apply_pending_migrations.sql --db-url "postgresql://postgres:[DB_PASSWORD]@db.eusozlexmllovlmngmug.supabase.co:5432/postgres"
--
-- SAFE TO RE-RUN: All DDL uses IF NOT EXISTS / IF EXISTS guards.
-- Migration 000004 (trips_anon_select) is skipped — already applied
-- out-of-band. Its watermark row is inserted at the end instead.
-- =============================================================


-- ─────────────────────────────────────────────────────────────
-- 000002: Community contributions
-- ─────────────────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contribution_type_enum') THEN
    CREATE TYPE contribution_type_enum AS ENUM (
      'poi_verification','poi_correction','poi_addition',
      'narration_rating','photo_upload','trail_addition'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contribution_status_enum') THEN
    CREATE TYPE contribution_status_enum AS ENUM ('pending','approved','rejected');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reward_type_enum') THEN
    CREATE TYPE reward_type_enum AS ENUM (
      'free_month','discount_month','premium_narrator_unlock','early_access'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS user_contributions (
  id                uuid                     PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid                     NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contribution_type contribution_type_enum   NOT NULL,
  poi_id            uuid                     REFERENCES pois(id) ON DELETE SET NULL,
  details           jsonb                    NOT NULL DEFAULT '{}',
  points_earned     integer                  NOT NULL DEFAULT 0
                      CONSTRAINT contributions_points_non_negative CHECK (points_earned >= 0),
  status            contribution_status_enum NOT NULL DEFAULT 'pending',
  reviewed_by       uuid                     REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz              NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS uc_user_id_idx    ON user_contributions (user_id);
CREATE INDEX IF NOT EXISTS uc_type_idx       ON user_contributions (contribution_type);
CREATE INDEX IF NOT EXISTS uc_status_idx     ON user_contributions (status);
CREATE INDEX IF NOT EXISTS uc_poi_id_idx     ON user_contributions (poi_id) WHERE poi_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS uc_created_idx    ON user_contributions (created_at DESC);
CREATE INDEX IF NOT EXISTS uc_dedup_idx      ON user_contributions (user_id, poi_id, contribution_type, created_at DESC)
  WHERE poi_id IS NOT NULL;

ALTER TABLE user_contributions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='user_contributions' AND policyname='uc_user_own'
  ) THEN
    CREATE POLICY "uc_user_own" ON user_contributions FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS user_badges (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_slug  text        NOT NULL,
  earned_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, badge_slug)
);

CREATE INDEX IF NOT EXISTS ub_user_id_idx ON user_badges (user_id);

ALTER TABLE user_badges ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='user_badges' AND policyname='ub_user_read'
  ) THEN
    CREATE POLICY "ub_user_read" ON user_badges FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS contribution_rewards (
  id              uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid             NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reward_type     reward_type_enum NOT NULL,
  points_redeemed integer          NOT NULL DEFAULT 0
                    CONSTRAINT rewards_points_positive CHECK (points_redeemed > 0),
  granted_at      timestamptz      NOT NULL DEFAULT now(),
  expires_at      timestamptz
);

CREATE INDEX IF NOT EXISTS cr_user_id_idx ON contribution_rewards (user_id);

ALTER TABLE contribution_rewards ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='contribution_rewards' AND policyname='cr_user_own'
  ) THEN
    CREATE POLICY "cr_user_own" ON contribution_rewards FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION submit_contribution(
  p_user_id uuid, p_type text, p_poi_id uuid DEFAULT NULL, p_details jsonb DEFAULT '{}'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_points integer; v_auto_approve boolean; v_contribution_id uuid;
  v_total_points bigint; v_new_badges text[] := ARRAY[]::text[];
  v_badge_slugs text[]    := ARRAY['contributor','ranger','trailblazer','legend'];
  v_badge_pts   integer[] := ARRAY[50,200,500,1000];
  i integer;
BEGIN
  IF p_type NOT IN ('poi_verification','poi_correction','poi_addition','narration_rating','photo_upload','trail_addition') THEN
    RAISE EXCEPTION 'invalid_contribution_type: %', p_type;
  END IF;
  v_points := CASE p_type
    WHEN 'poi_verification' THEN 5  WHEN 'poi_correction'   THEN 10
    WHEN 'poi_addition'     THEN 25 WHEN 'narration_rating' THEN 2
    WHEN 'photo_upload'     THEN 10 WHEN 'trail_addition'   THEN 30
    ELSE 0 END;
  v_auto_approve := p_type IN ('poi_verification','narration_rating');
  INSERT INTO user_contributions (user_id,contribution_type,poi_id,details,points_earned,status)
  VALUES (p_user_id,p_type::contribution_type_enum,p_poi_id,p_details,v_points,
          CASE WHEN v_auto_approve THEN 'approved'::contribution_status_enum ELSE 'pending'::contribution_status_enum END)
  RETURNING id INTO v_contribution_id;
  IF v_auto_approve THEN
    SELECT COALESCE(SUM(points_earned),0) INTO v_total_points FROM user_contributions WHERE user_id=p_user_id AND status='approved';
    FOR i IN 1..array_length(v_badge_slugs,1) LOOP
      IF v_total_points >= v_badge_pts[i] THEN
        IF NOT EXISTS (SELECT 1 FROM user_badges WHERE user_id=p_user_id AND badge_slug=v_badge_slugs[i]) THEN
          INSERT INTO user_badges (user_id,badge_slug) VALUES (p_user_id,v_badge_slugs[i]);
          v_new_badges := array_append(v_new_badges, v_badge_slugs[i]);
        END IF;
      END IF;
    END LOOP;
  ELSE
    SELECT COALESCE(SUM(points_earned),0) INTO v_total_points FROM user_contributions WHERE user_id=p_user_id AND status='approved';
  END IF;
  RETURN jsonb_build_object('contribution_id',v_contribution_id,'points_earned',CASE WHEN v_auto_approve THEN v_points ELSE 0 END,'points_pending',CASE WHEN v_auto_approve THEN 0 ELSE v_points END,'total_points',v_total_points,'new_badges',to_jsonb(v_new_badges));
END; $$;

CREATE OR REPLACE FUNCTION approve_contribution(p_contribution_id uuid, p_reviewer_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid; v_points integer; v_total_points bigint; v_new_badges text[] := ARRAY[]::text[];
  v_badge_slugs text[]    := ARRAY['contributor','ranger','trailblazer','legend'];
  v_badge_pts   integer[] := ARRAY[50,200,500,1000];
  i integer;
BEGIN
  UPDATE user_contributions SET status='approved', reviewed_by=p_reviewer_id
  WHERE id=p_contribution_id AND status='pending' RETURNING user_id,points_earned INTO v_user_id,v_points;
  IF NOT FOUND THEN RAISE EXCEPTION 'contribution_not_found_or_not_pending: %', p_contribution_id; END IF;
  SELECT COALESCE(SUM(points_earned),0) INTO v_total_points FROM user_contributions WHERE user_id=v_user_id AND status='approved';
  FOR i IN 1..array_length(v_badge_slugs,1) LOOP
    IF v_total_points >= v_badge_pts[i] THEN
      IF NOT EXISTS (SELECT 1 FROM user_badges WHERE user_id=v_user_id AND badge_slug=v_badge_slugs[i]) THEN
        INSERT INTO user_badges (user_id,badge_slug) VALUES (v_user_id,v_badge_slugs[i]);
        v_new_badges := array_append(v_new_badges,v_badge_slugs[i]);
      END IF;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('contribution_id',p_contribution_id,'user_id',v_user_id,'points_awarded',v_points,'total_points',v_total_points,'new_badges',to_jsonb(v_new_badges));
END; $$;

CREATE OR REPLACE FUNCTION get_user_contribution_stats(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE AS $$
DECLARE
  v_total bigint := 0; v_counts jsonb := '{}'::jsonb; v_badges jsonb := '[]'::jsonb;
  v_slugs text[]    := ARRAY['contributor','ranger','trailblazer','legend'];
  v_thresholds integer[] := ARRAY[50,200,500,1000];
  v_current_slug text := NULL; v_current_pts integer := 0;
  v_next_slug text := NULL; v_next_pts integer := NULL; v_prev_pts integer := 0; i integer;
BEGIN
  SELECT COALESCE(SUM(points_earned),0) INTO v_total FROM user_contributions WHERE user_id=p_user_id AND status='approved';
  SELECT COALESCE(jsonb_object_agg(contribution_type::text,cnt),'{}') INTO v_counts
  FROM (SELECT contribution_type,COUNT(*) AS cnt FROM user_contributions WHERE user_id=p_user_id AND status='approved' GROUP BY contribution_type) t;
  SELECT COALESCE(jsonb_agg(badge_slug ORDER BY earned_at),'[]') INTO v_badges FROM user_badges WHERE user_id=p_user_id;
  FOR i IN 1..array_length(v_slugs,1) LOOP
    IF v_total >= v_thresholds[i] THEN v_current_slug := v_slugs[i]; v_current_pts := v_thresholds[i];
    ELSIF v_next_slug IS NULL THEN
      v_next_slug := v_slugs[i]; v_next_pts := v_thresholds[i];
      v_prev_pts := CASE WHEN i>1 THEN v_thresholds[i-1] ELSE 0 END;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('total_points',v_total,'current_badge',v_current_slug,'next_badge',v_next_slug,'next_badge_at',v_next_pts,
    'points_to_next',CASE WHEN v_next_pts IS NULL THEN 0 ELSE GREATEST(0,v_next_pts-v_total) END,
    'progress_pct',CASE WHEN v_next_pts IS NULL THEN 100 WHEN v_next_pts=v_prev_pts THEN 100
      ELSE LEAST(100,ROUND((v_total-v_prev_pts)::numeric/(v_next_pts-v_prev_pts)*100)) END,
    'counts_by_type',v_counts,'earned_badges',v_badges);
END; $$;

CREATE OR REPLACE FUNCTION redeem_reward(p_user_id uuid, p_reward_type text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_costs jsonb := '{"free_month":500,"discount_month":200,"premium_narrator_unlock":150,"early_access":100}'::jsonb;
  v_cost integer; v_earned bigint; v_redeemed bigint; v_balance bigint;
  v_expires_at timestamptz; v_reward_id uuid;
BEGIN
  IF NOT (v_costs ? p_reward_type) THEN RAISE EXCEPTION 'invalid_reward_type: %', p_reward_type; END IF;
  v_cost := (v_costs ->> p_reward_type)::integer;
  SELECT COALESCE(SUM(points_earned),0) INTO v_earned FROM user_contributions WHERE user_id=p_user_id AND status='approved';
  SELECT COALESCE(SUM(points_redeemed),0) INTO v_redeemed FROM contribution_rewards WHERE user_id=p_user_id;
  v_balance := v_earned - v_redeemed;
  IF v_balance < v_cost THEN RAISE EXCEPTION 'insufficient_points: need %, have %', v_cost, v_balance; END IF;
  v_expires_at := CASE p_reward_type WHEN 'free_month' THEN now()+INTERVAL '30 days' WHEN 'discount_month' THEN now()+INTERVAL '30 days' ELSE NULL END;
  INSERT INTO contribution_rewards (user_id,reward_type,points_redeemed,expires_at)
  VALUES (p_user_id,p_reward_type::reward_type_enum,v_cost,v_expires_at) RETURNING id INTO v_reward_id;
  RETURN jsonb_build_object('reward_id',v_reward_id,'reward_type',p_reward_type,'points_spent',v_cost,'remaining_balance',v_balance-v_cost,'expires_at',v_expires_at);
END; $$;


-- ─────────────────────────────────────────────────────────────
-- 000003: Narration audio cache
-- ─────────────────────────────────────────────────────────────

ALTER TABLE user_narrators
  ADD COLUMN IF NOT EXISTS slug text
    GENERATED ALWAYS AS ('user-' || REPLACE(id::text, '-', '')) STORED;

CREATE UNIQUE INDEX IF NOT EXISTS user_narrators_slug_idx ON user_narrators (slug);

CREATE TABLE IF NOT EXISTS narration_audio (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  poi_id          uuid        NOT NULL REFERENCES pois(id) ON DELETE CASCADE,
  narrator_slug   text        NOT NULL,
  depth           text        NOT NULL
                    CONSTRAINT na_depth_check CHECK (depth IN ('glance','ride_along','deep_dive')),
  audio_url       text        NOT NULL,
  is_shared_cache boolean     NOT NULL DEFAULT true,
  user_id         uuid        REFERENCES auth.users(id) ON DELETE CASCADE,
  generated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT na_private_has_user CHECK (is_shared_cache = true OR user_id IS NOT NULL),
  CONSTRAINT na_unique UNIQUE (poi_id, narrator_slug, depth)
);

CREATE INDEX IF NOT EXISTS na_narrator_depth_idx ON narration_audio (narrator_slug, depth);
CREATE INDEX IF NOT EXISTS na_poi_id_idx         ON narration_audio (poi_id);
CREATE INDEX IF NOT EXISTS na_user_id_idx        ON narration_audio (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS na_generated_at_idx   ON narration_audio (generated_at DESC);

ALTER TABLE narration_audio ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='narration_audio' AND policyname='na_shared_read') THEN
    CREATE POLICY "na_shared_read" ON narration_audio FOR SELECT USING (is_shared_cache = true);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='narration_audio' AND policyname='na_private_read') THEN
    CREATE POLICY "na_private_read" ON narration_audio FOR SELECT USING (is_shared_cache = false AND auth.uid() = user_id);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION get_cached_narration(
  p_poi_id uuid, p_narrator_slug text, p_depth text, p_user_id uuid DEFAULT NULL
) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT audio_url FROM narration_audio
  WHERE poi_id=p_poi_id AND narrator_slug=p_narrator_slug AND depth=p_depth
    AND generated_at > now()-INTERVAL '30 days'
    AND (is_shared_cache=true OR user_id=p_user_id)
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION cache_narration(
  p_poi_id uuid, p_narrator_slug text, p_depth text, p_audio_url text, p_user_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_is_shared boolean; v_row_id uuid;
BEGIN
  v_is_shared := EXISTS (SELECT 1 FROM narrators WHERE slug=p_narrator_slug AND is_preset=true);
  INSERT INTO narration_audio (poi_id,narrator_slug,depth,audio_url,is_shared_cache,user_id,generated_at)
  VALUES (p_poi_id,p_narrator_slug,p_depth,p_audio_url,v_is_shared,CASE WHEN v_is_shared THEN NULL ELSE p_user_id END,now())
  ON CONFLICT (poi_id,narrator_slug,depth) DO UPDATE SET audio_url=EXCLUDED.audio_url,generated_at=now()
  RETURNING id INTO v_row_id;
  RETURN v_row_id;
END; $$;


-- ─────────────────────────────────────────────────────────────
-- 000004: trips_anon_select — SKIPPED (already applied)
-- Watermark row inserted below at end of file.
-- ─────────────────────────────────────────────────────────────


-- ─────────────────────────────────────────────────────────────
-- 000005: POI source provenance
-- ─────────────────────────────────────────────────────────────

ALTER TABLE pois
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'editorial'
    CONSTRAINT pois_source_type_check CHECK (source_type IN (
      'osm','wikidata','nrhp','state_landmark','gnis',
      'narrative_extracted','editorial','user_contributed'));

ALTER TABLE pois ADD COLUMN IF NOT EXISTS source_id   text;
ALTER TABLE pois ADD COLUMN IF NOT EXISTS source_citation text;

ALTER TABLE pois
  ADD COLUMN IF NOT EXISTS confidence_score real NOT NULL DEFAULT 1.0
    CONSTRAINT pois_confidence_score_range CHECK (confidence_score BETWEEN 0.0 AND 1.0);

ALTER TABLE pois ADD COLUMN IF NOT EXISTS verified          boolean    NOT NULL DEFAULT false;
ALTER TABLE pois ADD COLUMN IF NOT EXISTS additional_sources text[]    NOT NULL DEFAULT '{}';
ALTER TABLE pois ADD COLUMN IF NOT EXISTS merged_into       uuid       REFERENCES pois(id) ON DELETE SET NULL;
ALTER TABLE pois ADD COLUMN IF NOT EXISTS imported_at       timestamptz NOT NULL DEFAULT now();

-- Backfill existing rows
UPDATE pois SET source_id=id::text, verified=true WHERE source_id IS NULL;

-- Enforce NOT NULL now that every row is populated
ALTER TABLE pois ALTER COLUMN source_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS pois_source_unique_idx ON pois (source_type, source_id) WHERE merged_into IS NULL;
CREATE INDEX IF NOT EXISTS pois_source_type_idx   ON pois (source_type);
CREATE INDEX IF NOT EXISTS pois_merged_into_idx   ON pois (merged_into) WHERE merged_into IS NOT NULL;


-- ─────────────────────────────────────────────────────────────
-- 000006: POI significance breakdown + highway_routes
-- ─────────────────────────────────────────────────────────────

ALTER TABLE pois ADD COLUMN IF NOT EXISTS significance_breakdown jsonb;

CREATE TABLE IF NOT EXISTS highway_routes (
  id             serial  PRIMARY KEY,
  ref            text    NOT NULL,
  highway_class  text    NOT NULL
    CONSTRAINT highway_routes_class_check
    CHECK (highway_class IN ('major_ca','interstate','us_highway','state_highway')),
  geom           geometry(MultiLineString, 4326) NOT NULL
);

CREATE INDEX IF NOT EXISTS highway_routes_geom_idx ON highway_routes USING gist (geom);

CREATE OR REPLACE FUNCTION batch_route_adjacency_scores(poi_ids uuid[])
RETURNS TABLE (poi_id uuid, adjacency_points int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH pts AS (SELECT p.id AS poi_id, p.location::geography AS geog FROM pois p WHERE p.id=ANY(poi_ids)),
  within_major AS (SELECT DISTINCT pt.poi_id FROM pts pt JOIN highway_routes h ON h.highway_class='major_ca' AND ST_DWithin(pt.geog,h.geom::geography,1000)),
  within_any   AS (SELECT DISTINCT pt.poi_id FROM pts pt JOIN highway_routes h ON h.highway_class IN ('interstate','us_highway') AND ST_DWithin(pt.geog,h.geom::geography,5000))
  SELECT pt.poi_id, CASE WHEN wm.poi_id IS NOT NULL THEN 10 WHEN wa.poi_id IS NOT NULL THEN 5 ELSE 0 END::int
  FROM pts pt LEFT JOIN within_major wm ON wm.poi_id=pt.poi_id LEFT JOIN within_any wa ON wa.poi_id=pt.poi_id;
$$;

CREATE OR REPLACE FUNCTION batch_update_significance(p_ids uuid[], p_scores numeric[], p_breakdowns jsonb[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE pois SET significance_score=vals.score, significance_breakdown=vals.breakdown
  FROM (SELECT unnest(p_ids) AS id, unnest(p_scores) AS score, unnest(p_breakdowns) AS breakdown) AS vals
  WHERE pois.id=vals.id;
END; $$;


-- ─────────────────────────────────────────────────────────────
-- 000007: narrative_documents
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS narrative_documents (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  source       text        NOT NULL,
  title        text        NOT NULL,
  date         date,
  url          text        NOT NULL,
  full_text    text,
  chunk_index  int         NOT NULL DEFAULT 0,
  chunk_text   text        NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, url, chunk_index)
);

CREATE INDEX IF NOT EXISTS narrative_documents_source_idx ON narrative_documents (source);
CREATE INDEX IF NOT EXISTS narrative_documents_date_idx   ON narrative_documents (date) WHERE date IS NOT NULL;
CREATE INDEX IF NOT EXISTS narrative_documents_chunk_fts_idx ON narrative_documents USING gin (to_tsvector('english', chunk_text));

ALTER TABLE narrative_documents ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='narrative_documents' AND policyname='anon_select_narrative_documents') THEN
    CREATE POLICY "anon_select_narrative_documents" ON narrative_documents FOR SELECT TO anon USING (true);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION search_narrative_documents(
  query text, p_source text DEFAULT NULL, p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL, p_limit int DEFAULT 20, p_offset int DEFAULT 0
) RETURNS TABLE (id uuid, source text, title text, date date, url text, chunk_index int, chunk_text text, rank real)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT nd.id,nd.source,nd.title,nd.date,nd.url,nd.chunk_index,nd.chunk_text,
    ts_rank(to_tsvector('english',nd.chunk_text),websearch_to_tsquery('english',query))::real AS rank
  FROM narrative_documents nd
  WHERE to_tsvector('english',nd.chunk_text) @@ websearch_to_tsquery('english',query)
    AND (p_source IS NULL OR nd.source=p_source)
    AND (p_date_from IS NULL OR nd.date>=p_date_from)
    AND (p_date_to   IS NULL OR nd.date<=p_date_to)
  ORDER BY rank DESC LIMIT p_limit OFFSET p_offset;
$$;


-- ─────────────────────────────────────────────────────────────
-- 000008: poi_review_queue
-- ─────────────────────────────────────────────────────────────

ALTER TABLE narrative_documents ADD COLUMN IF NOT EXISTS extracted_at timestamptz;

CREATE INDEX IF NOT EXISTS narrative_documents_unextracted_idx ON narrative_documents (id) WHERE extracted_at IS NULL;

CREATE TABLE IF NOT EXISTS poi_review_queue (
  id                    uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  narrative_document_id uuid         NOT NULL REFERENCES narrative_documents(id) ON DELETE CASCADE,
  name                  text         NOT NULL,
  event_summary         text         NOT NULL,
  place_name_in_source  text         NOT NULL,
  geocoding_hint        text,
  date_or_period        text,
  source_quote          text         NOT NULL,
  category_guess        text         NOT NULL,
  llm_confidence        numeric(4,3) NOT NULL CHECK (llm_confidence BETWEEN 0 AND 1),
  proposed_location     geography(Point, 4326),
  geocode_display_name  text,
  review_status         text         NOT NULL DEFAULT 'pending'
                          CHECK (review_status IN ('pending','approved','rejected','needs_human')),
  promoted_poi_id       uuid         REFERENCES pois(id) ON DELETE SET NULL,
  created_at            timestamptz  NOT NULL DEFAULT now(),
  reviewed_at           timestamptz,
  reviewed_by           text
);

CREATE INDEX IF NOT EXISTS poi_review_queue_status_idx   ON poi_review_queue (review_status);
CREATE INDEX IF NOT EXISTS poi_review_queue_document_idx ON poi_review_queue (narrative_document_id);
CREATE INDEX IF NOT EXISTS poi_review_queue_location_idx ON poi_review_queue USING gist (proposed_location) WHERE proposed_location IS NOT NULL;

ALTER TABLE poi_review_queue ENABLE ROW LEVEL SECURITY;


-- ─────────────────────────────────────────────────────────────
-- 000009: poi_review_queue verification columns
-- ─────────────────────────────────────────────────────────────

ALTER TABLE poi_review_queue
  ADD COLUMN IF NOT EXISTS verification_passed    bool NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verification_reasoning text;

CREATE INDEX IF NOT EXISTS poi_review_queue_needs_verify_idx
  ON poi_review_queue (llm_confidence)
  WHERE review_status='pending' AND verification_passed=false;


-- ─────────────────────────────────────────────────────────────
-- 000010: llm_calls
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS llm_calls (
  id             uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  call_type      text          NOT NULL CHECK (call_type IN ('claude','tts')),
  provider       text          NOT NULL,
  model_or_voice text          NOT NULL,
  input_chars    int,
  input_tokens   int,
  output_tokens  int,
  cost_usd       numeric(10,6) NOT NULL,
  related_id     uuid,
  created_at     timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS llm_calls_created_at_idx ON llm_calls (created_at);
CREATE INDEX IF NOT EXISTS llm_calls_related_id_idx ON llm_calls (related_id) WHERE related_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS llm_calls_provider_idx   ON llm_calls (provider, call_type);

ALTER TABLE llm_calls ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='llm_calls' AND policyname='service_role_full_access') THEN
    CREATE POLICY "service_role_full_access" ON llm_calls
      USING (auth.role()='service_role') WITH CHECK (auth.role()='service_role');
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────
-- 000011: narration_audio provider columns
-- ─────────────────────────────────────────────────────────────

ALTER TABLE narration_audio
  ADD COLUMN IF NOT EXISTS provider        text          NOT NULL DEFAULT 'google',
  ADD COLUMN IF NOT EXISTS character_count int,
  ADD COLUMN IF NOT EXISTS duration_ms     int,
  ADD COLUMN IF NOT EXISTS cost_usd        numeric(10,6),
  ADD COLUMN IF NOT EXISTS prompt_version  int           NOT NULL DEFAULT 1;


-- ─────────────────────────────────────────────────────────────
-- 000012: voice_configs
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS voice_configs (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  mode           text        NOT NULL CHECK (mode IN ('family','kids','unfiltered','local')),
  provider       text        NOT NULL DEFAULT 'google',
  voice_id       text        NOT NULL,
  voice_settings jsonb       NOT NULL DEFAULT '{}',
  display_name   text,
  description    text,
  is_active      boolean     NOT NULL DEFAULT true,
  version        int         NOT NULL DEFAULT 1,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_voice_configs_active_mode ON voice_configs (mode) WHERE is_active=true;

ALTER TABLE voice_configs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='voice_configs' AND policyname='service_role_full_access') THEN
    CREATE POLICY "service_role_full_access" ON voice_configs
      USING (auth.role()='service_role') WITH CHECK (auth.role()='service_role');
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────
-- 000013: narration_audio status + mode columns
-- ─────────────────────────────────────────────────────────────

ALTER TABLE narration_audio
  ALTER COLUMN audio_url DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ready'
    CONSTRAINT na_status_check CHECK (status IN ('pending','ready','failed')),
  ADD COLUMN IF NOT EXISTS mode   text NOT NULL DEFAULT 'driving'
    CONSTRAINT na_mode_check  CHECK (mode IN ('driving','hiking','city'));

-- Backfill: every existing row was fully generated
UPDATE narration_audio SET status='ready' WHERE status IS NULL OR status != 'ready';

CREATE INDEX IF NOT EXISTS na_status_generated_idx ON narration_audio (status, generated_at);


-- ─────────────────────────────────────────────────────────────
-- 000014: pois.narration_cache + update_poi_narration_cache RPC
--         + anon SELECT policy for voice_configs
-- ─────────────────────────────────────────────────────────────

ALTER TABLE pois
  ADD COLUMN IF NOT EXISTS narration_cache jsonb NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS pois_narration_cache_gin_idx ON pois USING gin (narration_cache);

CREATE OR REPLACE FUNCTION update_poi_narration_cache(
  p_poi_id    uuid,
  p_cache_key text,
  p_audio_url text
) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE pois
  SET    narration_cache = narration_cache || jsonb_build_object(p_cache_key, p_audio_url)
  WHERE  id = p_poi_id;
$$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='voice_configs' AND policyname='anon_select_active_voice_configs'
  ) THEN
    CREATE POLICY "anon_select_active_voice_configs"
      ON voice_configs FOR SELECT TO anon
      USING (is_active = true);
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────
-- Watermark rows for supabase_migrations.schema_migrations
-- (only if that table exists — created by supabase CLI on first push)
-- ─────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='supabase_migrations' AND table_name='schema_migrations'
  ) THEN
    INSERT INTO supabase_migrations.schema_migrations (version) VALUES
      ('20260504000002'),
      ('20260504000003'),
      ('20260504000004'),
      ('20260504000005'),
      ('20260504000006'),
      ('20260504000007'),
      ('20260504000008'),
      ('20260504000009'),
      ('20260504000010'),
      ('20260504000011'),
      ('20260504000012'),
      ('20260504000013'),
      ('20260504000014')
    ON CONFLICT (version) DO NOTHING;
    RAISE NOTICE 'Watermark rows inserted into supabase_migrations.schema_migrations';
  ELSE
    RAISE NOTICE 'supabase_migrations.schema_migrations does not exist — skipping watermark insert (project not CLI-managed)';
  END IF;
END $$;
