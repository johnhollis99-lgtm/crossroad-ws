-- 20260522000004_create_roadstories.sql
--
-- Migration Batch 1 / Migration 4 — Create the roadstories table.
--
-- Per addendum §6 RoadStories: curated long-form narrations are first-class
-- entities, anchored to (a) a POI, (b) a region, or (c) an explicit corridor
-- LineString. Each RoadStory has a single canonical text (`master_text`),
-- a status flow (draft → review → approved → published → retired), and
-- structured `sources` provenance. Audio rows for each RoadStory live in
-- the sibling table `roadstory_audio` (Migration 5).
--
-- Anchor model:
--   `anchor_type`        — which of the three kinds of anchor this RoadStory uses
--   `anchor_poi_id`      — FK to pois (anchor_type='poi')
--   `anchor_region_id`   — FK to regions (anchor_type='region')
--   `anchor_corridor`    — explicit LineString (anchor_type='corridor')
--   The `anchor_consistency` CHECK enforces "exactly one anchor populated,
--   the other two NULL, matching the anchor_type tag."
--
-- Trigger geometry:
--   `trigger_buffer_m`   — radius around the anchor (default 1000m)
--   `trigger_zone`       — pre-buffered MultiPolygon for fast PostGIS lookups
--                          (computed offline; the schema does not auto-derive
--                          it — that's a backfill job in a later phase)
--
-- Editorial workflow:
--   `status`             — 5-value flow (draft → review → approved → published → retired)
--   `curator_approved_at`— set when status transitions to 'approved'
--
-- Provenance:
--   `sources jsonb`      — structured source attribution. Schema TBD by the
--                          editorial team; defaults to '{}'::jsonb.
--
-- Q4.B — RLS: SELECT WHERE status = 'published' for anon + authenticated.
-- Writers go through service_role implicitly (no INSERT/UPDATE/DELETE policy
-- means the RLS-enabled table is invisible to client writes). Pattern follows
-- 20260514000005_regions.sql lines 124-131 with the status predicate added.
--
-- Per CLAUDE.md migration conventions:
--   * Schema-qualified table names
--   * BEGIN/COMMIT wrapped
--   * updated_at trigger via shared public.set_updated_at()
--   * Trailing verification query

BEGIN;

CREATE TABLE public.roadstories (
  id                   uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  title                text    NOT NULL,
  hook                 text,
  narrator_slug        text    NOT NULL
                       CHECK (narrator_slug IN ('narrator_a','narrator_b')),
  voice_slot           smallint
                       CHECK (voice_slot IN (1, 2)),
  anchor_type          text    NOT NULL
                       CHECK (anchor_type IN ('poi','region','corridor')),
  anchor_poi_id        uuid    REFERENCES public.pois(id) ON DELETE SET NULL,
  anchor_region_id     uuid    REFERENCES public.regions(id) ON DELETE SET NULL,
  anchor_corridor      geography(LineString, 4326),
  trigger_buffer_m     integer NOT NULL DEFAULT 1000,
  trigger_zone         geography(MultiPolygon, 4326),
  length_target_sec    integer,
  status               text    NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft','review','approved','published','retired')),
  curator_approved_at  timestamptz,
  master_text          text,
  sources              jsonb   NOT NULL DEFAULT '{}'::jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT anchor_consistency CHECK (
    (anchor_type = 'poi'      AND anchor_poi_id    IS NOT NULL
       AND anchor_region_id IS NULL AND anchor_corridor IS NULL) OR
    (anchor_type = 'region'   AND anchor_region_id IS NOT NULL
       AND anchor_poi_id    IS NULL AND anchor_corridor IS NULL) OR
    (anchor_type = 'corridor' AND anchor_corridor  IS NOT NULL
       AND anchor_poi_id    IS NULL AND anchor_region_id IS NULL)
  )
);

-- ── Indexes ────────────────────────────────────────────────────────────────
-- Each anchor flavor needs its own b-tree for fast lookups in the lookahead
-- worker (which scans roadstories by anchor identity during ranking).
CREATE INDEX idx_roadstories_anchor_poi
  ON public.roadstories (anchor_poi_id)
  WHERE anchor_poi_id IS NOT NULL;

CREATE INDEX idx_roadstories_anchor_region
  ON public.roadstories (anchor_region_id)
  WHERE anchor_region_id IS NOT NULL;

-- Spatial index for corridor anchors + trigger zone (PostGIS GiST).
CREATE INDEX idx_roadstories_anchor_corridor
  ON public.roadstories USING gist (anchor_corridor)
  WHERE anchor_corridor IS NOT NULL;

CREATE INDEX idx_roadstories_trigger_zone
  ON public.roadstories USING gist (trigger_zone)
  WHERE trigger_zone IS NOT NULL;

-- Status filter index for the RLS SELECT predicate + admin queue.
CREATE INDEX idx_roadstories_status
  ON public.roadstories (status);

-- Narrator filter index for runtime narrator-aware ranking.
CREATE INDEX idx_roadstories_narrator
  ON public.roadstories (narrator_slug);

-- ── updated_at trigger ─────────────────────────────────────────────────────
-- Reuse the shared public.set_updated_at() captured in 20260510000001
-- per CLAUDE.md "updated_at trigger reuse" rule.
DROP TRIGGER IF EXISTS set_updated_at ON public.roadstories;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.roadstories
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ── RLS (per Q4.B) ─────────────────────────────────────────────────────────
-- Read access: anon + authenticated can SELECT only `status = 'published'`.
-- Writes go through service_role implicitly (no INSERT/UPDATE/DELETE policy).
-- Pattern derived from 20260514000005_regions.sql lines 124-131 with the
-- status filter added.
ALTER TABLE public.roadstories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS roadstories_anon_select ON public.roadstories;
CREATE POLICY roadstories_anon_select
  ON public.roadstories
  FOR SELECT
  TO anon, authenticated
  USING (status = 'published');

COMMENT ON TABLE public.roadstories IS
  'Curated long-form narrations anchored to POIs, regions, or explicit corridors. '
  'Editorial workflow via status enum (draft→review→approved→published→retired). '
  'Sibling table roadstory_audio (Migration 5) carries per-narrator audio.';

COMMIT;

-- ============================================================
-- Verification (run after COMMIT):
-- ============================================================
-- (v1) Table + columns + constraints:
--   \d+ public.roadstories
--   -- Expect: 16 columns, anchor_consistency CHECK, 5 CHECKs total
--   --         (narrator_slug, voice_slot, anchor_type, status, anchor_consistency).
--
-- (v2) Indexes:
--   SELECT indexname FROM pg_indexes
--    WHERE schemaname='public' AND tablename='roadstories'
--    ORDER BY indexname;
--   -- Expect 7 entries: pkey + 6 indexes named idx_roadstories_*.
--
-- (v3) RLS policy + posture:
--   SELECT policyname, permissive, cmd, qual
--     FROM pg_policies
--    WHERE schemaname='public' AND tablename='roadstories';
--   -- Expect: roadstories_anon_select, PERMISSIVE, SELECT, "status = 'published'".
--
-- (v4) Trigger:
--   SELECT tgname FROM pg_trigger
--    WHERE tgrelid='public.roadstories'::regclass AND NOT tgisinternal;
--   -- Expect: set_updated_at
