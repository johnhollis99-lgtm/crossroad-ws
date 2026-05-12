// One-off TTS readiness diagnostic. Read-only.
// Run from: scripts/  → node diag-tts-readiness.mjs
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const raw = readFileSync(resolve(__dirname, '..', '..', '.env'), 'utf8');
for (const line of raw.split('\n')) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const eq = t.indexOf('=');
  if (eq === -1) continue;
  const k = t.slice(0, eq).trim();
  let v = t.slice(eq + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  if (k && !(k in process.env)) process.env[k] = v;
}

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function q(label, sql, params = []) {
  console.log(`\n=== ${label} ===`);
  const { rows } = await pool.query(sql, params);
  console.table(rows);
  return rows;
}

try {
  await q('voice_configs',
    `SELECT id::text, mode, provider, voice_id,
            voice_settings::text AS voice_settings, display_name,
            is_active, version, created_at
       FROM voice_configs
       ORDER BY mode, version DESC`);

  await q('narration_audio counts',
    `SELECT mode, depth, COUNT(*)::int AS audio_rows,
            MIN(generated_at) AS first_generated,
            MAX(generated_at) AS last_generated
       FROM narration_audio
       GROUP BY mode, depth
       ORDER BY mode, depth`);

  await q('narration_audio status counts',
    `SELECT status, COUNT(*)::int AS n
       FROM narration_audio
       GROUP BY status
       ORDER BY status`);

  await q('major-POI thresholds (active, top-level, confidence ≥ 0.5)',
    `SELECT
       COUNT(*) FILTER (WHERE significance_score >= 70)              AS gte_70,
       COUNT(*) FILTER (WHERE significance_score >= 80)              AS gte_80,
       COUNT(*) FILTER (WHERE significance_score >= 90)              AS gte_90,
       COUNT(*) FILTER (WHERE significance_score = 100)              AS at_100,
       COUNT(*) FILTER (WHERE is_venue = true
                        AND significance_score >= 80)                AS venues_gte_80,
       COUNT(*) FILTER (WHERE is_venue = true)                       AS venues_total
     FROM pois
     WHERE merged_into IS NULL
       AND parent_poi_id IS NULL
       AND confidence_score >= 0.5`);

  await q('narrators table (audience_mode rows)',
    `SELECT slug, name, audience_mode, content_rating, is_active
       FROM narrators
       WHERE is_active = true
       ORDER BY audience_mode, slug`);

  await q('significance histogram (5pt bins, 60-100)',
    `SELECT
       CASE
         WHEN significance_score >= 95 THEN '95-100'
         WHEN significance_score >= 90 THEN '90-94'
         WHEN significance_score >= 85 THEN '85-89'
         WHEN significance_score >= 80 THEN '80-84'
         WHEN significance_score >= 75 THEN '75-79'
         WHEN significance_score >= 70 THEN '70-74'
         WHEN significance_score >= 65 THEN '65-69'
         WHEN significance_score >= 60 THEN '60-64'
       END AS bin,
       COUNT(*)::int AS n
     FROM pois
     WHERE merged_into IS NULL
       AND parent_poi_id IS NULL
       AND confidence_score >= 0.5
       AND significance_score >= 60
     GROUP BY bin
     ORDER BY bin DESC`);

  await q('top 10 POIs by significance (eligible for first pass)',
    `SELECT id::text, name, significance_score::int AS score, is_venue, source_type
       FROM pois
       WHERE merged_into IS NULL
         AND parent_poi_id IS NULL
         AND confidence_score >= 0.5
       ORDER BY significance_score DESC NULLS LAST, name
       LIMIT 10`);
} catch (err) {
  console.error('FATAL:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
