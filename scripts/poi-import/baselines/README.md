# POI Significance Regression Baselines

Pinned snapshots of the 4-county SoCal bbox top-25 POIs by `significance_score`.
Each baseline is a frozen capture of the leaderboard at a known-good point in
time. New imports, dedup runs, classifier changes, or recompute logic should be
followed by a fresh capture — diffing the new capture against the most recent
baseline surfaces unexpected score movements.

## Bbox

```
minLat: 32.5295236
minLon: -120.734382
maxLat: 35.114665
maxLon: -116.0810941
```
Covers Los Angeles, Orange, San Diego, and San Luis Obispo counties (and parts
of adjacent counties spilling into the bbox).

## Filter

- `merged_into IS NULL` (active rows only)
- Includes children — they appear with `role: 'c'` so unexpected child rises in
  the leaderboard are visible. Venues are `role: 'V'`, standalone is `role: '-'`.

## Captured fields per entry

- `rank`, `score`, `source_type`
- `role` ('V' venue, 'c' child, '-' standalone)
- `venue_type`, `qid`, `name`, `id`, `parent_poi_id`
- `breakdown` — `source_base`, `cross_source`, `pageviews`, `route_adjacency`,
  `total`

## How to use

1. Identify the most recent baseline file — `top25-bbox-YYYY-MM-DD.json`.
2. Run `node capture-top25-baseline.mjs cache/top25-current.json` to take a
   fresh snapshot to a working file.
3. Diff the two JSONs (any tool — `jd`, `git diff --no-index`, a hand-rolled
   script). For sanity checks the diff against baseline should be small and
   explainable: name changes from upstream sources, score drift from refreshed
   pageviews, or expected effects of the change you just made.

## Adding a new baseline

Run a fresh capture, save to `top25-bbox-<today>.json`, commit it. Keep older
baselines — they're the regression trail. Don't delete or rewrite past
baselines.

```
node capture-top25-baseline.mjs baselines/top25-bbox-$(date +%Y-%m-%d).json
git add baselines/top25-bbox-*.json
```

## When to re-baseline

After any of:
- A full-corpus `recompute-significance` run that changes the scoring formula
  or its components
- A dedup pass that merges or unmerges meaningful numbers of rows
- A schema migration that affects POI ranking (significance_breakdown shape,
  filter changes, etc.)
- A POI import covering new geography inside the bbox

Capturing the baseline immediately after a known-good state means future
unexpected drift is detectable quickly.
