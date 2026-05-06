-- ============================================================
-- Community contribution and rewards system
-- Creates: user_contributions, user_badges, contribution_rewards
-- RPCs:    submit_contribution, get_user_contribution_stats, redeem_reward
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. ENUMs
-- ────────────────────────────────────────────────────────────

CREATE TYPE contribution_type_enum AS ENUM (
  'poi_verification',
  'poi_correction',
  'poi_addition',
  'narration_rating',
  'photo_upload',
  'trail_addition'
);

CREATE TYPE contribution_status_enum AS ENUM (
  'pending',
  'approved',
  'rejected'
);

CREATE TYPE reward_type_enum AS ENUM (
  'free_month',
  'discount_month',
  'premium_narrator_unlock',
  'early_access'
);

-- ────────────────────────────────────────────────────────────
-- 2. user_contributions
-- ────────────────────────────────────────────────────────────

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
-- Composite index for anti-spam duplicate check (covered by single query)
CREATE INDEX IF NOT EXISTS uc_dedup_idx      ON user_contributions (user_id, poi_id, contribution_type, created_at DESC)
  WHERE poi_id IS NOT NULL;

ALTER TABLE user_contributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "uc_user_own"
  ON user_contributions FOR ALL
  USING (auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────
-- 3. user_badges
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_badges (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_slug  text        NOT NULL,
  earned_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, badge_slug)
);

CREATE INDEX IF NOT EXISTS ub_user_id_idx ON user_badges (user_id);

ALTER TABLE user_badges ENABLE ROW LEVEL SECURITY;

-- Users can read their own badges; insert is service-role only (via SECURITY DEFINER RPC)
CREATE POLICY "ub_user_read"
  ON user_badges FOR SELECT
  USING (auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────
-- 4. contribution_rewards
-- ────────────────────────────────────────────────────────────

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

CREATE POLICY "cr_user_own"
  ON contribution_rewards FOR ALL
  USING (auth.uid() = user_id);


-- ============================================================
-- RPCs
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- RPC: submit_contribution
--
-- Called from the Node server after anti-spam validation.
-- Inserts the contribution, auto-approves low-risk types, and
-- checks whether the user crossed any new badge thresholds.
--
-- Returns: { contribution_id, points_earned, total_points, new_badges[] }
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION submit_contribution(
  p_user_id uuid,
  p_type    text,
  p_poi_id  uuid  DEFAULT NULL,
  p_details jsonb DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_points          integer;
  v_auto_approve    boolean;
  v_contribution_id uuid;
  v_total_points    bigint;
  v_new_badges      text[] := ARRAY[]::text[];

  -- Badge tiers: slug, minimum cumulative approved points
  v_badge_slugs     text[]    := ARRAY['contributor', 'ranger', 'trailblazer', 'legend'];
  v_badge_pts       integer[] := ARRAY[50, 200, 500, 1000];
  i                 integer;
BEGIN
  -- Validate contribution type
  IF p_type NOT IN (
    'poi_verification', 'poi_correction', 'poi_addition',
    'narration_rating', 'photo_upload', 'trail_addition'
  ) THEN
    RAISE EXCEPTION 'invalid_contribution_type: %', p_type;
  END IF;

  -- Points per type
  v_points := CASE p_type
    WHEN 'poi_verification' THEN 5
    WHEN 'poi_correction'   THEN 10
    WHEN 'poi_addition'     THEN 25
    WHEN 'narration_rating' THEN 2
    WHEN 'photo_upload'     THEN 10
    WHEN 'trail_addition'   THEN 30
    ELSE 0
  END;

  -- Low-friction types are auto-approved; heavier additions need review
  v_auto_approve := p_type IN ('poi_verification', 'narration_rating');

  INSERT INTO user_contributions (
    user_id, contribution_type, poi_id, details, points_earned, status
  ) VALUES (
    p_user_id,
    p_type::contribution_type_enum,
    p_poi_id,
    p_details,
    v_points,
    CASE WHEN v_auto_approve THEN 'approved'::contribution_status_enum
         ELSE                     'pending'::contribution_status_enum
    END
  )
  RETURNING id INTO v_contribution_id;

  -- Badge checks only matter once points are approved
  IF v_auto_approve THEN
    SELECT COALESCE(SUM(points_earned), 0)
    INTO   v_total_points
    FROM   user_contributions
    WHERE  user_id = p_user_id AND status = 'approved';

    FOR i IN 1 .. array_length(v_badge_slugs, 1) LOOP
      IF v_total_points >= v_badge_pts[i] THEN
        IF NOT EXISTS (
          SELECT 1 FROM user_badges
          WHERE  user_id = p_user_id AND badge_slug = v_badge_slugs[i]
        ) THEN
          INSERT INTO user_badges (user_id, badge_slug)
          VALUES (p_user_id, v_badge_slugs[i]);
          v_new_badges := array_append(v_new_badges, v_badge_slugs[i]);
        END IF;
      END IF;
    END LOOP;
  ELSE
    -- Pending contribution: report current approved total without new badge check
    SELECT COALESCE(SUM(points_earned), 0)
    INTO   v_total_points
    FROM   user_contributions
    WHERE  user_id = p_user_id AND status = 'approved';
  END IF;

  RETURN jsonb_build_object(
    'contribution_id', v_contribution_id,
    'points_earned',   CASE WHEN v_auto_approve THEN v_points ELSE 0 END,
    'points_pending',  CASE WHEN v_auto_approve THEN 0 ELSE v_points END,
    'total_points',    v_total_points,
    'new_badges',      to_jsonb(v_new_badges)
  );
END;
$$;

-- ────────────────────────────────────────────────────────────
-- RPC: approve_contribution (admin helper)
--
-- Called by admins to approve a pending contribution.
-- Awards points and checks badge thresholds, identical to
-- the auto-approve path in submit_contribution.
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION approve_contribution(
  p_contribution_id uuid,
  p_reviewer_id     uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id      uuid;
  v_points       integer;
  v_total_points bigint;
  v_new_badges   text[] := ARRAY[]::text[];

  v_badge_slugs  text[]    := ARRAY['contributor', 'ranger', 'trailblazer', 'legend'];
  v_badge_pts    integer[] := ARRAY[50, 200, 500, 1000];
  i              integer;
BEGIN
  UPDATE user_contributions
  SET    status      = 'approved',
         reviewed_by = p_reviewer_id
  WHERE  id     = p_contribution_id
    AND  status = 'pending'
  RETURNING user_id, points_earned
  INTO   v_user_id, v_points;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'contribution_not_found_or_not_pending: %', p_contribution_id;
  END IF;

  SELECT COALESCE(SUM(points_earned), 0)
  INTO   v_total_points
  FROM   user_contributions
  WHERE  user_id = v_user_id AND status = 'approved';

  FOR i IN 1 .. array_length(v_badge_slugs, 1) LOOP
    IF v_total_points >= v_badge_pts[i] THEN
      IF NOT EXISTS (
        SELECT 1 FROM user_badges
        WHERE  user_id = v_user_id AND badge_slug = v_badge_slugs[i]
      ) THEN
        INSERT INTO user_badges (user_id, badge_slug)
        VALUES (v_user_id, v_badge_slugs[i]);
        v_new_badges := array_append(v_new_badges, v_badge_slugs[i]);
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'contribution_id', p_contribution_id,
    'user_id',         v_user_id,
    'points_awarded',  v_points,
    'total_points',    v_total_points,
    'new_badges',      to_jsonb(v_new_badges)
  );
END;
$$;

-- ────────────────────────────────────────────────────────────
-- RPC: get_user_contribution_stats
--
-- Returns a single jsonb row with:
--   total_points, current_badge, next_badge, next_badge_at,
--   points_to_next, progress_pct (0-100),
--   counts_by_type, earned_badges[]
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_user_contribution_stats(
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_total        bigint  := 0;
  v_counts       jsonb   := '{}'::jsonb;
  v_badges       jsonb   := '[]'::jsonb;

  -- Tiers in ascending order
  v_slugs        text[]    := ARRAY['contributor', 'ranger', 'trailblazer', 'legend'];
  v_thresholds   integer[] := ARRAY[50, 200, 500, 1000];

  v_current_slug text    := NULL;
  v_current_pts  integer := 0;
  v_next_slug    text    := NULL;
  v_next_pts     integer := NULL;
  v_prev_pts     integer := 0;
  i              integer;
BEGIN
  -- Total approved points
  SELECT COALESCE(SUM(points_earned), 0)
  INTO   v_total
  FROM   user_contributions
  WHERE  user_id = p_user_id AND status = 'approved';

  -- Contribution counts by type (approved only)
  SELECT COALESCE(jsonb_object_agg(contribution_type::text, cnt), '{}'::jsonb)
  INTO   v_counts
  FROM (
    SELECT contribution_type, COUNT(*) AS cnt
    FROM   user_contributions
    WHERE  user_id = p_user_id AND status = 'approved'
    GROUP  BY contribution_type
  ) t;

  -- Earned badge slugs
  SELECT COALESCE(jsonb_agg(badge_slug ORDER BY earned_at), '[]'::jsonb)
  INTO   v_badges
  FROM   user_badges
  WHERE  user_id = p_user_id;

  -- Walk tiers to find current and next
  FOR i IN 1 .. array_length(v_slugs, 1) LOOP
    IF v_total >= v_thresholds[i] THEN
      v_current_slug := v_slugs[i];
      v_current_pts  := v_thresholds[i];
    ELSIF v_next_slug IS NULL THEN
      -- First tier not yet reached is the next target
      v_next_slug := v_slugs[i];
      v_next_pts  := v_thresholds[i];
      -- The floor for progress calculation is the previous tier threshold
      v_prev_pts  := CASE WHEN i > 1 THEN v_thresholds[i - 1] ELSE 0 END;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'total_points',    v_total,
    'current_badge',   v_current_slug,
    'next_badge',      v_next_slug,
    'next_badge_at',   v_next_pts,
    'points_to_next',  CASE WHEN v_next_pts IS NULL THEN 0
                            ELSE GREATEST(0, v_next_pts - v_total)
                       END,
    'progress_pct',    CASE
                         WHEN v_next_pts IS NULL THEN 100   -- already at legend
                         WHEN v_next_pts = v_prev_pts THEN 100
                         ELSE LEAST(100, ROUND(
                           (v_total - v_prev_pts)::numeric /
                           (v_next_pts  - v_prev_pts) * 100
                         ))
                       END,
    'counts_by_type',  v_counts,
    'earned_badges',   v_badges
  );
END;
$$;

-- ────────────────────────────────────────────────────────────
-- RPC: redeem_reward
--
-- Checks the user's available point balance (total earned minus
-- previously redeemed), deducts the cost, and records the reward.
--
-- Reward costs:
--   free_month              → 500 pts  (1 free Road Pass month)
--   discount_month          → 200 pts  (50% off Road Pass month)
--   premium_narrator_unlock → 150 pts  (one premium narrator slot)
--   early_access            → 100 pts  (early feature access)
--
-- Returns: { reward_id, reward_type, points_spent, remaining_balance, expires_at }
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION redeem_reward(
  p_user_id     uuid,
  p_reward_type text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Redemption costs (points)
  v_costs        jsonb := '{
    "free_month":              500,
    "discount_month":          200,
    "premium_narrator_unlock": 150,
    "early_access":            100
  }'::jsonb;

  v_cost         integer;
  v_earned       bigint;
  v_redeemed     bigint;
  v_balance      bigint;
  v_expires_at   timestamptz;
  v_reward_id    uuid;
BEGIN
  IF NOT (v_costs ? p_reward_type) THEN
    RAISE EXCEPTION 'invalid_reward_type: %', p_reward_type;
  END IF;

  v_cost := (v_costs ->> p_reward_type)::integer;

  -- Total approved points ever earned
  SELECT COALESCE(SUM(points_earned), 0)
  INTO   v_earned
  FROM   user_contributions
  WHERE  user_id = p_user_id AND status = 'approved';

  -- Total points already spent on rewards
  SELECT COALESCE(SUM(points_redeemed), 0)
  INTO   v_redeemed
  FROM   contribution_rewards
  WHERE  user_id = p_user_id;

  v_balance := v_earned - v_redeemed;

  IF v_balance < v_cost THEN
    RAISE EXCEPTION 'insufficient_points: need %, have %', v_cost, v_balance;
  END IF;

  v_expires_at := CASE p_reward_type
    WHEN 'free_month'     THEN now() + INTERVAL '30 days'
    WHEN 'discount_month' THEN now() + INTERVAL '30 days'
    ELSE NULL
  END;

  INSERT INTO contribution_rewards (user_id, reward_type, points_redeemed, expires_at)
  VALUES (p_user_id, p_reward_type::reward_type_enum, v_cost, v_expires_at)
  RETURNING id INTO v_reward_id;

  RETURN jsonb_build_object(
    'reward_id',         v_reward_id,
    'reward_type',       p_reward_type,
    'points_spent',      v_cost,
    'remaining_balance', v_balance - v_cost,
    'expires_at',        v_expires_at
  );
END;
$$;
