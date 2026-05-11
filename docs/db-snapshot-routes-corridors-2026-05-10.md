# Xroad DB schema snapshot

_Generated 2026-05-11T00:24:14.760Z · db=`postgres` · user=`postgres`_

## Tables


### Table: `routes`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | NOT NULL | gen_random_uuid() |
| `user_id` | text | · |  |
| `destination` | text | NOT NULL |  |
| `origin_lat` | double precision | · |  |
| `origin_lng` | double precision | · |  |
| `dest_lat` | double precision | · |  |
| `dest_lng` | double precision | · |  |
| `distance_mi` | double precision | · |  |
| `duration_min` | integer | · |  |
| `filter_snapshot` | jsonb | · | '{}'::jsonb |
| `created_at` | timestamp with time zone | · | now() |

**Indexes:**
- `routes_created_idx` — `CREATE INDEX routes_created_idx ON public.routes USING btree (created_at DESC)`
- `routes_pkey` — `CREATE UNIQUE INDEX routes_pkey ON public.routes USING btree (id)`
- `routes_user_idx` — `CREATE INDEX routes_user_idx ON public.routes USING btree (user_id)`

**Constraints:**
- `PK` `routes_pkey`: `PRIMARY KEY (id)`

### Table: `corridors`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | NOT NULL | gen_random_uuid() |
| `name` | text | NOT NULL |  |
| `subtitle` | text | · |  |
| `path` | geography | NOT NULL |  |
| `region_type` | text | NOT NULL | 'rural'::text |
| `region_context` | jsonb | · |  |
| `estimated_minutes` | integer | · |  |
| `editorial_status` | text | NOT NULL | 'draft'::text |
| `created_at` | timestamp with time zone | NOT NULL | now() |

**Indexes:**
- `corridors_path_idx` — `CREATE INDEX corridors_path_idx ON public.corridors USING gist (path)`
- `corridors_pkey` — `CREATE UNIQUE INDEX corridors_pkey ON public.corridors USING btree (id)`

**Constraints:**
- `PK` `corridors_pkey`: `PRIMARY KEY (id)`

## Functions (\df)

_(no matching functions found in public)_

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
| `routes` | 5 |
| `corridors` | 6 |
