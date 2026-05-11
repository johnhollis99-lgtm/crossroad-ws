# Audit — `poi_categories` coverage (Track B / 5.23)

**Status:** implemented 2026-05-11 (Prompt 07). See drift catalog 5.23.

**Date:** 2026-05-10
**Question:** 9 of 20 `poi_categories` slugs have zero rows. Drop, populate, or both?
**Decision:** Mixed — 5 wired up (importer route changes), 2 dropped, 2 kept aspirational.

---

## B1 — Current coverage

```sql
SELECT pc.slug, pc.display_name, count(p.id) AS poi_count
FROM poi_categories pc
LEFT JOIN pois p ON p.category_id = pc.id AND p.merged_into IS NULL
GROUP BY pc.slug, pc.display_name
ORDER BY poi_count DESC, pc.slug;
```

| slug             | display_name                   | count   |
|------------------|--------------------------------|---------|
| nature           | Nature & Wildlife              | 11982   |
| architecture     | Architecture                   | 4356    |
| history          | History                        | 3543    |
| art              | Art & Culture                  | 1162    |
| hidden_gems      | Hidden Gems                    | 721     |
| local_culture    | Local Culture                  | 61      |
| geology          | Geology                        | 58      |
| food_drink       | Food & Drink                   | 14      |
| viewpoint        | Scenic Viewpoint               | 5       |
| engineering      | Engineering & Infrastructure   | 3       |
| recreation       | Recreation                     | 1       |
| **alpine**       | Alpine Features                | **0**   |
| **bridges**      | Bridges & Tunnels              | **0**   |
| **dams**         | Dams & Aqueducts               | **0**   |
| **hot_springs**  | Hot Springs                    | **0**   |
| **legends**      | Legends & Lore                 | **0**   |
| **mining**       | Mining History                 | **0**   |
| **native_history** | Native American              | **0**   |
| **volcanic**     | Volcanic Features              | **0**   |
| **wind_solar**   | Wind & Solar                   | **0**   |

Confirmed: 9 empty slugs match the prompt's expected list.

---

## B2 — category-map.ts inspection

The `CategorySlug` TypeScript union in [scripts/poi-import/lib/types.ts:13](scripts/poi-import/lib/types.ts#L13) only includes 8 of the 20 DB slugs: `history | nature | architecture | food_drink | local_culture | hidden_gems | art | geology`. **None of the 9 empty slugs are in the type — the importer literally cannot emit them today.** Their rows would have to come from a code change extending the type.

Existing routing for the OSM/Wikidata signals these slugs *should* own:

| slug         | currently routed to | mapping rule |
|--------------|---------------------|--------------|
| bridges      | `architecture`      | Wikidata Q12280, no OSM rule |
| dams         | `architecture`      | Wikidata Q12323, no OSM rule |
| hot_springs  | `nature` (tag `hot_spring`) | Wikidata Q191860, OSM `natural=hot_spring` (already in Overpass query) |
| volcanic     | `nature` (tag `summit`) | OSM `natural=volcano` covered by Overpass query, but rule lumped with `peak` |
| mining       | (unrouted)          | No OSM or Wikidata rule |
| alpine       | `nature` (tag `summit`) | Effectively a duplicate of `natural=peak` routing |
| native_history | (unrouted)        | No OSM/Wikidata heuristic exists |
| legends      | (unrouted)          | Folklore — narrative-extracted only |
| wind_solar   | (unrouted)          | OSM `power=generator` exists but sparse + low signal |

---

## B3 — Per-slug classification

| slug             | decision        | reasoning |
|------------------|-----------------|-----------|
| `bridges`        | **WIRE UP**     | Distinct landmark class. Wikidata Q12280 redirected from `architecture` → `bridges`. OSM rules added for `man_made=bridge` and `bridge=yes`. Notability gating depends on the importer's existing wikipedia/wikidata signal filter; not gating in category-map itself. |
| `dams`           | **WIRE UP**     | Distinct landmark class. Wikidata Q12323 redirected from `architecture` → `dams`. OSM rules added for `waterway=dam` and `man_made=dam`. |
| `hot_springs`    | **WIRE UP**     | Already a dedicated thing in the data. Wikidata Q191860 redirected from `nature` → `hot_springs`. OSM rule added for `natural=hot_spring` and `natural=geyser`. |
| `volcanic`       | **WIRE UP**     | Wikidata Q8072 (volcano) added (was missing). OSM rule split off from the bundled `peak\|volcano` so `natural=volcano` routes to `volcanic` while `peak` stays in `nature`. |
| `mining`         | **WIRE UP**     | Wikidata Q820477 added. OSM rules added for `historic=mine` (closed mines) and `landuse=quarry` (active quarries). |
| `alpine`         | **DROP**        | Semantic duplicate of `nature` peaks/summits. The `natural=peak` rule already produces a `nature` row tagged `summit`; no differentiation gained. Migration removes the row. |
| `wind_solar`     | **DROP**        | OSM `power=generator` is mappable but the signal-to-noise ratio is poor in CA, and there's no narrative/editorial path planned. Drop now; revive if a real story angle emerges. |
| `legends`        | **KEEP ASPIRATIONAL** | Folklore is by nature a narrative-extracted / editorial signal; no bulk import path will ever emit it. The slug is reserved for the admin app review queue + narrative extraction. CLAUDE.md updated to call this out. |
| `native_history` | **KEEP ASPIRATIONAL** | Tribal sites are systematically under-tagged in OSM and contested in Wikidata; bulk import is the wrong tool. Same disposition as `legends` — populated only by narrative extraction or admin curation. CLAUDE.md updated. |

---

## B4 — Actions taken

### Type extension
[scripts/poi-import/lib/types.ts:13-25](scripts/poi-import/lib/types.ts#L13-L25): added `bridges | dams | hot_springs | volcanic | mining` to `CategorySlug`.

### OSM rules
[scripts/poi-import/lib/category-map.ts](scripts/poi-import/lib/category-map.ts):
- `historic=mine` → `mining` (tags: `mine`, `historic`)
- `natural=volcano` → `volcanic` (separated from the peak/volcano combined rule)
- `natural=hot_spring | natural=geyser` → `hot_springs`
- `landuse=quarry` → `mining` (tag: `quarry`)
- `man_made=bridge | bridge=yes` → `bridges`
- `waterway=dam | man_made=dam` → `dams`

### Wikidata classes
[scripts/poi-import/lib/wikidata-types.ts](scripts/poi-import/lib/wikidata-types.ts):
- Q12280 (bridge) — slug changed `architecture` → `bridges`
- Q12323 (dam) — slug changed `architecture` → `dams`
- Q191860 (hot spring) — slug changed `nature` → `hot_springs`
- Q8072 (volcano) — newly added, slug `volcanic`, bonus 12
- Q820477 (mine) — newly added, slug `mining`, bonus 8

### Migrations
- [supabase/migrations/20260510000006_remove_unused_poi_categories.sql](supabase/migrations/20260510000006_remove_unused_poi_categories.sql) — drops `alpine` and `wind_solar`. Defensive `RAISE EXCEPTION` if any POI still references either category.

### CLAUDE.md
Hard-rules section gained two paragraphs: one defining "Aspirational poi_categories slugs" (`legends`, `native_history`) so future contributors don't try to wire them into the importer, and one telling the mobile team the chip list must be derived dynamically.

### What was deliberately NOT done
- **No re-classification of already-imported rows.** The 4,356 architecture rows include some that *should* be `bridges`/`dams` post-rule-change. The next full re-import or a separate one-off "reclassify by source_type+tags" job can move them; that's a data backfill task, not part of category wiring.
- **No Overpass query expansion.** The OSM importer's query in [scripts/poi-import/sources/osm.ts:103-119](scripts/poi-import/sources/osm.ts#L103-L119) does not currently fetch `man_made=bridge` / `landuse=quarry` / `waterway=dam` / `man_made=dam` rows. So OSM imports won't populate `bridges` or `dams` (and partially `mining`) until that query is widened. Wikidata import will populate all five wired slugs through the new class entries. Recommend widening the Overpass query in a follow-up — the cache key changes on query change so it forces a full re-fetch, which is why it's parked here.
- **No unit tests.** [scripts/poi-import/lib/__tests__/](scripts/poi-import/lib/__tests__/) exists but has no `category-map.test.ts`. Per prompt instructions, didn't invent one.

---

## ⚠️ Note for the mobile team

The UI category chip list **should be derived dynamically**, not hardcoded:

```sql
SELECT pc.slug, pc.display_name
FROM poi_categories pc
WHERE EXISTS (
  SELECT 1 FROM pois p
   WHERE p.category_id = pc.id AND p.merged_into IS NULL
)
ORDER BY pc.sort_order;
```

Today [app/customize.tsx:50-67](app/customize.tsx#L50-L67) hardcodes a 9-label `ALL_CATEGORIES` array and a `CAT_SLUG` mapping table. Empty slugs in the DB become "dead chips" that return zero results when filtered against. The hardcoding also means the chip list lags the DB by however long it takes to ship a mobile build.

Same change applies to [app/filters.tsx](app/filters.tsx) if it has its own list.

---

## Follow-up tasks

- [ ] Widen Overpass query in [scripts/poi-import/sources/osm.ts:103-119](scripts/poi-import/sources/osm.ts#L103-L119) to include `man_made=bridge`, `man_made=dam`, `waterway=dam`, `landuse=quarry`, `historic=mine`. Will invalidate `cache/osm-cells/` on next import.
- [ ] One-off backfill script to re-classify existing `architecture` rows whose tags include `bridge` or `dam` into the new slugs. Same for `nature`+`hot_spring` → `hot_springs` and `nature`+`volcano` → `volcanic`. ~50–200 rows expected; safe to do row-by-row.
- [ ] Mobile chip list dynamic-derivation work (see note above).
- [ ] Apply migration `20260510000006_remove_unused_poi_categories.sql`.
