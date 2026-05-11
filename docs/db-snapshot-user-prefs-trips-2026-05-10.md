# Xroad DB schema snapshot

_Generated 2026-05-11T00:32:27.322Z · db=`postgres` · user=`postgres`_

## Tables


### Table: `user_preferences`

| Column | Type | Null | Default |
|---|---|---|---|
| `user_id` | uuid | NOT NULL |  |
| `default_audience_mode` | text | NOT NULL | 'family'::text |
| `default_depth` | text | NOT NULL | 'ride_along'::text |
| `offline_cache_budget_mb` | integer | NOT NULL | 250 |
| `age_verified_at` | timestamp with time zone | · |  |
| `unfiltered_mode_enabled` | boolean | NOT NULL | false |
| `kids_mode_pin_hash` | text | · |  |
| `created_at` | timestamp with time zone | NOT NULL | now() |
| `updated_at` | timestamp with time zone | NOT NULL | now() |

**Indexes:**
- `user_preferences_pkey` — `CREATE UNIQUE INDEX user_preferences_pkey ON public.user_preferences USING btree (user_id)`

**Constraints:**
- `CHECK` `audience_mode_valid`: `CHECK ((default_audience_mode = ANY (ARRAY['family'::text, 'kids'::text, 'unfiltered'::text, 'local'::text])))`
- `CHECK` `cache_budget_sane`: `CHECK (((offline_cache_budget_mb >= 50) AND (offline_cache_budget_mb <= 2000)))`
- `CHECK` `depth_valid`: `CHECK ((default_depth = ANY (ARRAY['glance'::text, 'ride_along'::text, 'deep_dive'::text])))`
- `CHECK` `unfiltered_requires_age`: `CHECK (((NOT unfiltered_mode_enabled) OR (age_verified_at IS NOT NULL)))`
- `FK` `user_preferences_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`
- `PK` `user_preferences_pkey`: `PRIMARY KEY (user_id)`

**Triggers:**
- `user_preferences_updated_at` — BEFORE UPDATE

### Table: `trips`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | NOT NULL | gen_random_uuid() |
| `user_id` | uuid | · |  |
| `route_id` | text | · |  |
| `route_name` | text | · |  |
| `origin` | text | · |  |
| `destination` | text | · |  |
| `distance_mi` | double precision | · |  |
| `duration_min` | integer | · |  |
| `narrator_id` | uuid | · |  |
| `user_narrator_id` | uuid | · |  |
| `narrator_name` | text | · |  |
| `depth` | text | NOT NULL | 'ride_along'::text |
| `category_filter` | _text | NOT NULL | '{}'::text[] |
| `poi_distance_m` | integer | NOT NULL | 500 |
| `status` | text | NOT NULL | 'pending'::text |
| `started_at` | timestamp with time zone | · |  |
| `completed_at` | timestamp with time zone | · |  |
| `created_at` | timestamp with time zone | NOT NULL | now() |

**Indexes:**
- `trips_pkey` — `CREATE UNIQUE INDEX trips_pkey ON public.trips USING btree (id)`
- `trips_status_idx` — `CREATE INDEX trips_status_idx ON public.trips USING btree (status)`
- `trips_user_id_idx` — `CREATE INDEX trips_user_id_idx ON public.trips USING btree (user_id)`

**Constraints:**
- `CHECK` `trips_depth_check`: `CHECK ((depth = ANY (ARRAY['glance'::text, 'ride_along'::text, 'deep_dive'::text])))`
- `CHECK` `trips_status_check`: `CHECK ((status = ANY (ARRAY['pending'::text, 'active'::text, 'completed'::text, 'abandoned'::text])))`
- `FK` `trips_narrator_id_fkey`: `FOREIGN KEY (narrator_id) REFERENCES narrators(id) ON DELETE SET NULL`
- `FK` `trips_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL`
- `FK` `trips_user_narrator_id_fkey`: `FOREIGN KEY (user_narrator_id) REFERENCES user_narrators(id) ON DELETE SET NULL`
- `PK` `trips_pkey`: `PRIMARY KEY (id)`

## Functions (\df)

- **detect_venue_at_location(p_lat double precision, p_lon double precision)** → `TABLE(id uuid, name text, venue_type text, polygon_area_m2 double precision)`  ·  STABLE · SECURITY INVOKER
- **get_corridor_pois(route_geom text, corridor_width_miles double precision, category_filter text[], mode_filter text)** → `TABLE(id text, name text, category text, lat double precision, lng double precision, tags text[], dist_from_route_m double precision)`  ·  STABLE · SECURITY INVOKER
- **get_nearby_pois(user_lat double precision, user_lng double precision, radius_m double precision, categories text[], mode_filter text, p_include_children boolean)** → `TABLE(id text, name text, category text, lat double precision, lng double precision, tags text[], distance_m double precision)`  ·  STABLE · SECURITY INVOKER
- **get_venue_tour_pois(p_parent_poi_id uuid, p_user_lat double precision, p_user_lon double precision)** → `TABLE(id uuid, name text, category text, lat double precision, lng double precision, significance_score numeric, distance_meters double precision)`  ·  STABLE · SECURITY INVOKER

## `SELECT DISTINCT category FROM pois ORDER BY category;`

_(query failed: column "category" does not exist)_

Columns on `pois` that look category-related:
- `category_id`

From `poi_categories` (canonical category list):
| slug | display_name |
|---|---|
| `alpine` | Alpine Features |
| `bridges` | Bridges & Tunnels |
| `history` | History |
| `volcanic` | Volcanic Features |
| `dams` | Dams & Aqueducts |
| `geology` | Geology |
| `hot_springs` | Hot Springs |
| `architecture` | Architecture |
| `wind_solar` | Wind & Solar |
| `mining` | Mining History |
| `nature` | Nature & Wildlife |
| `food_drink` | Food & Drink |
| `native_history` | Native American |
| `art` | Art & Culture |
| `engineering` | Engineering & Infrastructure |
| `viewpoint` | Scenic Viewpoint |
| `local_culture` | Local Culture |
| `recreation` | Recreation |
| `legends` | Legends & Lore |
| `hidden_gems` | Hidden Gems |

## RLS policies (`pg_policies`)

| schema | table | policy | cmd | permissive | roles |
|---|---|---|---|---|---|
| public | `badge_definitions` | `Public read badge_definitions` | SELECT | PERMISSIVE | {public} |
| public | `contribution_rewards` | `cr_user_own` | ALL | PERMISSIVE | {public} |
| public | `corridors` | `Public read corridors` | SELECT | PERMISSIVE | {public} |
| public | `llm_calls` | `service_role_full_access` | ALL | PERMISSIVE | {public} |
| public | `narration_audio` | `na_private_read` | SELECT | PERMISSIVE | {public} |
| public | `narration_audio` | `na_shared_read` | SELECT | PERMISSIVE | {public} |
| public | `narrative_documents` | `anon_select_narrative_documents` | SELECT | PERMISSIVE | {anon} |
| public | `narrators` | `narrators_public_read` | SELECT | PERMISSIVE | {public} |
| public | `poi_categories` | `Public read poi_categories` | SELECT | PERMISSIVE | {public} |
| public | `pois` | `Public read pois` | SELECT | PERMISSIVE | {public} |
| public | `routes` | `Routes are public` | ALL | PERMISSIVE | {public} |
| public | `trips` | `trips_anon_insert` | INSERT | PERMISSIVE | {public} |
| public | `trips` | `trips_anon_select` | SELECT | PERMISSIVE | {public} |
| public | `trips` | `trips_user_own` | ALL | PERMISSIVE | {public} |
| public | `user_badges` | `ub_user_read` | SELECT | PERMISSIVE | {public} |
| public | `user_contributions` | `uc_user_own` | ALL | PERMISSIVE | {public} |
| public | `user_narrators` | `user_narrators_delete_own` | DELETE | PERMISSIVE | {public} |
| public | `user_narrators` | `user_narrators_insert_own` | INSERT | PERMISSIVE | {public} |
| public | `user_narrators` | `user_narrators_select_own` | SELECT | PERMISSIVE | {public} |
| public | `user_narrators` | `user_narrators_update_own` | UPDATE | PERMISSIVE | {public} |
| public | `user_preferences` | `user reads own preferences` | SELECT | PERMISSIVE | {public} |
| public | `user_preferences` | `user updates own preferences` | UPDATE | PERMISSIVE | {public} |
| public | `user_preferences` | `user upserts own preferences` | INSERT | PERMISSIVE | {public} |
| public | `voice_configs` | `anon_select_active_voice_configs` | SELECT | PERMISSIVE | {anon} |
| public | `voice_configs` | `service_role_full_access` | ALL | PERMISSIVE | {public} |

## Row counts

| table | count |
|---|---|
| `user_preferences` | 0 |
| `trips` | 32 |
