/**
 * Batch upsert helpers for the regions table.
 *
 * Uses direct pg connection (not Supabase JS client) because the polygon
 * column is geography(MultiPolygon, 4326) and PostgREST's schema cache
 * structurally excludes geography-typed columns.
 *
 * Idempotency: ON CONFLICT (source, source_id) DO UPDATE …
 *
 *   ⚠️ This requires a UNIQUE constraint on (source, source_id) on the
 *   regions table. Migration 20260514000005_regions.sql did NOT add this
 *   constraint (and the addendum §3.1 schema doesn't specify one). A
 *   prerequisite migration must add it before this upsert helper can
 *   execute idempotently. See README.md "Prerequisites" section.
 *
 *   Without the unique constraint, ON CONFLICT (source, source_id) fails
 *   with "there is no unique or exclusion constraint matching the
 *   ON CONFLICT specification".
 *
 * `region_review_queue` table:
 *
 *   The user spec for E1d (named valleys) and the addendum §3 anticipate
 *   logging missing-polygon candidates to a review queue. This table also
 *   doesn't exist yet. See README.md "Prerequisites" for the proposed shape.
 */
import chalk from 'chalk';
import type { NormalizedRegion, ReviewQueueEntry } from './types.js';
import { geoJsonToEwktMultiPolygon } from './polygons.js';
import { getPgPool } from './supabase.js';

const BATCH_SIZE = 50; // regions are large rows (description + polygon WKT); keep batches small

export interface UpsertResult {
  inserted: number;
  updated: number;
  errors: number;
}

/**
 * Upsert a batch of regions into public.regions.
 *
 * Returns counts of inserted vs updated. Errors are logged via console.error
 * and counted but do not abort the batch.
 */
export async function upsertRegions(
  regions: NormalizedRegion[],
  opts: { dryRun: boolean },
): Promise<UpsertResult> {
  if (regions.length === 0) return { inserted: 0, updated: 0, errors: 0 };

  if (opts.dryRun) {
    console.log(chalk.gray(`  [dry-run] would upsert ${regions.length} regions`));
    for (const r of regions.slice(0, 5)) {
      console.log(chalk.gray(`    - ${r.region_type}: ${r.name} (${r.source}:${r.source_id ?? 'null'})`));
    }
    if (regions.length > 5) console.log(chalk.gray(`    … and ${regions.length - 5} more`));
    return { inserted: 0, updated: 0, errors: 0 };
  }

  const pool = getPgPool();
  let inserted = 0;
  let updated = 0;
  let errors = 0;

  for (let i = 0; i < regions.length; i += BATCH_SIZE) {
    const batch = regions.slice(i, i + BATCH_SIZE);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const r of batch) {
        try {
          const ewkt = geoJsonToEwktMultiPolygon(r.polygon_geojson, r.polygon_srid);
          // ON CONFLICT predicate must match the partial unique index
          // `regions_source_source_id_unique` (WHERE source_id IS NOT NULL),
          // added by migration 20260514000008. Rows with source_id IS NULL
          // are skipped by the index, so this upsert path never updates
          // them — they always INSERT. Editorial regions per Phase E1d
          // get a non-null `valley-<kebab>` source_id specifically so they
          // participate in this upsert.
          //
          // ST_Transform(ST_GeomFromEWKT($5), 4326)::geography handles
          // both native-4326 sources (CGS E1a) and non-4326 sources (EPA
          // E1b's EPSG:5070 shapefile). For 4326 input the transform is
          // a no-op; for 5070 input PostGIS reprojects server-side.
          const res = await client.query(
            `
              INSERT INTO public.regions (
                region_type, name, display_name, description,
                polygon, significance_tier, source, source_id, parent_region_id,
                metadata
              ) VALUES (
                $1, $2, $3, $4,
                ST_Transform(ST_GeomFromEWKT($5), 4326)::geography,
                $6, $7, $8, $9,
                $10::jsonb
              )
              ON CONFLICT (source, source_id) WHERE source_id IS NOT NULL DO UPDATE SET
                region_type       = EXCLUDED.region_type,
                name              = EXCLUDED.name,
                display_name      = EXCLUDED.display_name,
                description       = EXCLUDED.description,
                polygon           = EXCLUDED.polygon,
                significance_tier = EXCLUDED.significance_tier,
                parent_region_id  = EXCLUDED.parent_region_id,
                metadata          = EXCLUDED.metadata,
                updated_at        = now()
              RETURNING (xmax = 0) AS is_insert
            `,
            [
              r.region_type,
              r.name,
              r.display_name,
              r.description,
              ewkt,
              r.significance_tier,
              r.source,
              r.source_id,
              r.parent_region_id ?? null,
              JSON.stringify(r.metadata ?? {}),
            ],
          );
          const isInsert = res.rows[0]?.is_insert === true;
          if (isInsert) inserted++;
          else updated++;
        } catch (err: unknown) {
          errors++;
          const msg = err instanceof Error ? err.message : String(err);
          console.error(chalk.red(`  upsert error: ${r.source}:${r.source_id ?? 'null'} (${r.name}) — ${msg}`));
        }
      }
      await client.query('COMMIT');
    } catch (err: unknown) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  return { inserted, updated, errors };
}

/**
 * Log a region candidate that couldn't be loaded (no polygon, ambiguous, etc.)
 * to region_review_queue. Mirrors the pattern from venue_classification_review.
 *
 * Returns the number of rows actually inserted (0 if dryRun).
 */
export async function logReviewQueue(
  entries: ReviewQueueEntry[],
  opts: { dryRun: boolean },
): Promise<number> {
  if (entries.length === 0) return 0;

  if (opts.dryRun) {
    console.log(chalk.gray(`  [dry-run] would log ${entries.length} review queue entries`));
    for (const e of entries.slice(0, 5)) {
      console.log(chalk.gray(`    - ${e.candidate_name} (${e.reason})`));
    }
    return 0;
  }

  const pool = getPgPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let n = 0;
    for (const e of entries) {
      await client.query(
        `INSERT INTO public.region_review_queue
          (candidate_name, proposed_type, source, source_id, reason, source_hint)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          e.candidate_name,
          e.proposed_type,
          e.source,
          e.source_id,
          e.reason,
          e.source_hint ? JSON.stringify(e.source_hint) : null,
        ],
      );
      n++;
    }
    await client.query('COMMIT');
    return n;
  } catch (err: unknown) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
