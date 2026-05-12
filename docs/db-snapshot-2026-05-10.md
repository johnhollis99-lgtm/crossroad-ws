# Xroad DB schema snapshot

_Generated 2026-05-11T00:18:49.725Z · db=`postgres` · user=`postgres`_

## Tables


### Table: `pois`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | NOT NULL | gen_random_uuid() |
| `name` | text | NOT NULL |  |
| `subtitle` | text | · |  |
| `description` | text | · |  |
| `location` | geography | NOT NULL |  |
| `category_id` | uuid | · |  |
| `poi_type` | text | NOT NULL | 'point'::text |
| `visibility_radius_miles` | numeric | NOT NULL | 1.0 |
| `significance_score` | numeric | NOT NULL | 5.0 |
| `source` | text | NOT NULL | 'curated'::text |
| `editorial_status` | text | NOT NULL | 'draft'::text |
| `tags` | _text | NOT NULL | '{}'::text[] |
| `created_at` | timestamp with time zone | NOT NULL | now() |
| `updated_at` | timestamp with time zone | NOT NULL | now() |
| `trip_mode` | text | NOT NULL | 'all'::text |
| `source_type` | text | NOT NULL | 'editorial'::text |
| `source_id` | text | NOT NULL |  |
| `source_citation` | text | · |  |
| `confidence_score` | real | NOT NULL | 1.0 |
| `verified` | boolean | NOT NULL | false |
| `additional_sources` | _text | NOT NULL | '{}'::text[] |
| `merged_into` | uuid | · |  |
| `imported_at` | timestamp with time zone | NOT NULL | now() |
| `significance_breakdown` | jsonb | · |  |
| `narration_cache` | jsonb | NOT NULL | '{}'::jsonb |
| `parent_poi_id` | uuid | · |  |
| `is_venue` | boolean | NOT NULL | false |
| `venue_polygon` | geography | · |  |
| `venue_type` | text | · |  |
| `venue_metadata` | jsonb | · |  |

**Indexes:**
- `idx_pois_is_venue` — `CREATE INDEX idx_pois_is_venue ON public.pois USING btree (is_venue) WHERE (is_venue = true)`
- `idx_pois_location_active` — `CREATE INDEX idx_pois_location_active ON public.pois USING gist (location) WHERE (merged_into IS NULL)`
- `idx_pois_parent_poi_id` — `CREATE INDEX idx_pois_parent_poi_id ON public.pois USING btree (parent_poi_id) WHERE (parent_poi_id IS NOT NULL)`
- `idx_pois_venue_polygon` — `CREATE INDEX idx_pois_venue_polygon ON public.pois USING gist (venue_polygon) WHERE (venue_polygon IS NOT NULL)`
- `idx_pois_venue_type` — `CREATE INDEX idx_pois_venue_type ON public.pois USING btree (venue_type) WHERE (venue_type IS NOT NULL)`
- `pois_category_id_idx` — `CREATE INDEX pois_category_id_idx ON public.pois USING btree (category_id)`
- `pois_editorial_idx` — `CREATE INDEX pois_editorial_idx ON public.pois USING btree (editorial_status)`
- `pois_location_idx` — `CREATE INDEX pois_location_idx ON public.pois USING gist (location)`
- `pois_merged_into_idx` — `CREATE INDEX pois_merged_into_idx ON public.pois USING btree (merged_into) WHERE (merged_into IS NOT NULL)`
- `pois_narration_cache_gin_idx` — `CREATE INDEX pois_narration_cache_gin_idx ON public.pois USING gin (narration_cache)`
- `pois_pkey` — `CREATE UNIQUE INDEX pois_pkey ON public.pois USING btree (id)`
- `pois_significance_idx` — `CREATE INDEX pois_significance_idx ON public.pois USING btree (significance_score DESC)`
- `pois_source_type_idx` — `CREATE INDEX pois_source_type_idx ON public.pois USING btree (source_type)`
- `pois_source_unique_idx` — `CREATE UNIQUE INDEX pois_source_unique_idx ON public.pois USING btree (source_type, source_id) WHERE (merged_into IS NULL)`

**Constraints:**
- `CHECK` `child_cannot_be_venue`: `CHECK ((NOT ((parent_poi_id IS NOT NULL) AND (is_venue = true))))`
- `CHECK` `pois_confidence_score_range`: `CHECK (((confidence_score >= (0.0)::double precision) AND (confidence_score <= (1.0)::double precision)))`
- `CHECK` `pois_source_type_check`: `CHECK ((source_type = ANY (ARRAY['osm'::text, 'wikidata'::text, 'nrhp'::text, 'state_landmark'::text, 'gnis'::text, 'narrative_extracted'::text, 'editorial'::text, 'user_contributed'::text])))`
- `CHECK` `pois_trip_mode_check`: `CHECK ((trip_mode = ANY (ARRAY['driving'::text, 'hiking'::text, 'city'::text, 'all'::text])))`
- `CHECK` `venue_polygon_requires_is_venue`: `CHECK (((venue_polygon IS NULL) OR (is_venue = true)))`
- `CHECK` `venue_type_requires_is_venue`: `CHECK (((venue_type IS NULL) OR (is_venue = true)))`
- `CHECK` `venue_type_valid`: `CHECK (((venue_type IS NULL) OR (venue_type = ANY (ARRAY['theme_park'::text, 'campus'::text, 'national_park'::text, 'state_park'::text, 'historic_district'::text, 'museum_complex'::text, 'mission'::text, 'cemetery'::text, 'zoo_aquarium'::text, 'estate'::text, 'shopping_district'::text, 'fairground'::text, 'religious_complex'::text, 'industrial_complex'::text]))))`
- `FK` `pois_category_id_fkey`: `FOREIGN KEY (category_id) REFERENCES poi_categories(id) ON DELETE SET NULL`
- `FK` `pois_merged_into_fkey`: `FOREIGN KEY (merged_into) REFERENCES pois(id) ON DELETE SET NULL`
- `FK` `pois_parent_poi_id_fkey`: `FOREIGN KEY (parent_poi_id) REFERENCES pois(id) ON DELETE SET NULL`
- `PK` `pois_pkey`: `PRIMARY KEY (id)`

### Table: `narration_audio`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | NOT NULL | gen_random_uuid() |
| `poi_id` | uuid | NOT NULL |  |
| `narrator_slug` | text | NOT NULL |  |
| `depth` | text | NOT NULL |  |
| `audio_url` | text | · |  |
| `is_shared_cache` | boolean | NOT NULL | true |
| `user_id` | uuid | · |  |
| `generated_at` | timestamp with time zone | NOT NULL | now() |
| `provider` | text | NOT NULL | 'google'::text |
| `character_count` | integer | · |  |
| `duration_ms` | integer | · |  |
| `cost_usd` | numeric | · |  |
| `prompt_version` | integer | NOT NULL | 1 |
| `status` | text | NOT NULL | 'ready'::text |
| `mode` | text | NOT NULL | 'driving'::text |
| `narration_text` | text | · |  |

**Indexes:**
- `na_generated_at_idx` — `CREATE INDEX na_generated_at_idx ON public.narration_audio USING btree (generated_at DESC)`
- `na_narrator_depth_idx` — `CREATE INDEX na_narrator_depth_idx ON public.narration_audio USING btree (narrator_slug, depth)`
- `na_poi_id_idx` — `CREATE INDEX na_poi_id_idx ON public.narration_audio USING btree (poi_id)`
- `na_status_generated_idx` — `CREATE INDEX na_status_generated_idx ON public.narration_audio USING btree (status, generated_at)`
- `na_unique` — `CREATE UNIQUE INDEX na_unique ON public.narration_audio USING btree (poi_id, narrator_slug, depth)`
- `na_user_id_idx` — `CREATE INDEX na_user_id_idx ON public.narration_audio USING btree (user_id) WHERE (user_id IS NOT NULL)`
- `narration_audio_pkey` — `CREATE UNIQUE INDEX narration_audio_pkey ON public.narration_audio USING btree (id)`

**Constraints:**
- `CHECK` `na_depth_check`: `CHECK ((depth = ANY (ARRAY['glance'::text, 'ride_along'::text, 'deep_dive'::text])))`
- `CHECK` `na_mode_check`: `CHECK ((mode = ANY (ARRAY['driving'::text, 'hiking'::text, 'city'::text])))`
- `CHECK` `na_private_has_user`: `CHECK (((is_shared_cache = true) OR (user_id IS NOT NULL)))`
- `CHECK` `na_status_check`: `CHECK ((status = ANY (ARRAY['pending'::text, 'ready'::text, 'failed'::text])))`
- `FK` `narration_audio_poi_id_fkey`: `FOREIGN KEY (poi_id) REFERENCES pois(id) ON DELETE CASCADE`
- `FK` `narration_audio_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`
- `PK` `narration_audio_pkey`: `PRIMARY KEY (id)`
- `UNIQUE` `na_unique`: `UNIQUE (poi_id, narrator_slug, depth)`

### Table: `voice_configs`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | NOT NULL | gen_random_uuid() |
| `mode` | text | NOT NULL |  |
| `provider` | text | NOT NULL | 'google'::text |
| `voice_id` | text | NOT NULL |  |
| `voice_settings` | jsonb | NOT NULL | '{}'::jsonb |
| `display_name` | text | · |  |
| `description` | text | · |  |
| `is_active` | boolean | NOT NULL | true |
| `version` | integer | NOT NULL | 1 |
| `created_at` | timestamp with time zone | NOT NULL | now() |

**Indexes:**
- `idx_voice_configs_active_mode` — `CREATE UNIQUE INDEX idx_voice_configs_active_mode ON public.voice_configs USING btree (mode) WHERE (is_active = true)`
- `voice_configs_pkey` — `CREATE UNIQUE INDEX voice_configs_pkey ON public.voice_configs USING btree (id)`

**Constraints:**
- `CHECK` `voice_configs_mode_check`: `CHECK ((mode = ANY (ARRAY['family'::text, 'kids'::text, 'unfiltered'::text, 'local'::text])))`
- `PK` `voice_configs_pkey`: `PRIMARY KEY (id)`

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

### Table: `llm_calls`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | NOT NULL | gen_random_uuid() |
| `call_type` | text | NOT NULL |  |
| `provider` | text | NOT NULL |  |
| `model_or_voice` | text | NOT NULL |  |
| `input_chars` | integer | · |  |
| `input_tokens` | integer | · |  |
| `output_tokens` | integer | · |  |
| `cost_usd` | numeric | NOT NULL |  |
| `related_id` | uuid | · |  |
| `created_at` | timestamp with time zone | NOT NULL | now() |

**Indexes:**
- `llm_calls_created_at_idx` — `CREATE INDEX llm_calls_created_at_idx ON public.llm_calls USING btree (created_at)`
- `llm_calls_pkey` — `CREATE UNIQUE INDEX llm_calls_pkey ON public.llm_calls USING btree (id)`
- `llm_calls_provider_idx` — `CREATE INDEX llm_calls_provider_idx ON public.llm_calls USING btree (provider, call_type)`
- `llm_calls_related_id_idx` — `CREATE INDEX llm_calls_related_id_idx ON public.llm_calls USING btree (related_id) WHERE (related_id IS NOT NULL)`

**Constraints:**
- `CHECK` `llm_calls_call_type_check`: `CHECK ((call_type = ANY (ARRAY['claude'::text, 'tts'::text])))`
- `PK` `llm_calls_pkey`: `PRIMARY KEY (id)`

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
| public | `voice_configs` | `anon_select_active_voice_configs` | SELECT | PERMISSIVE | {anon} |
| public | `voice_configs` | `service_role_full_access` | ALL | PERMISSIVE | {public} |

## Row counts

| table | count |
|---|---|
| `pois` | 23922 |
| `narration_audio` | 37 |
| `voice_configs` | 1 |
| `trips` | 32 |
| `llm_calls` | 173 |
