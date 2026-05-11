/**
 * Read-only schema snapshot. Reproduces psql \d / \df / \dp via pg_catalog
 * + information_schema queries so we don't need psql on PATH.
 *
 * Usage (Windows / PowerShell or Git Bash):
 *   cd scripts/admin
 *   node dump-schema-snapshot.mjs                  > snapshot.md
 *   node dump-schema-snapshot.mjs --tables=pois   > pois.md
 *
 * No writes. Reads DATABASE_URL from the repo-root .env automatically.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ENV_PATH   = resolve(SCRIPT_DIR, '..', '..', '.env');

// ── Env bootstrap ──────────────────────────────────────────────────────────────
for (const line of readFileSync(ENV_PATH, 'utf8').split('\n')) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const eq = t.indexOf('=');
  if (eq === -1) continue;
  const k = t.slice(0, eq).trim();
  let v = t.slice(eq + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  if (k && !(k in process.env)) process.env[k] = v;
}

const DEFAULT_TABLES = ['pois', 'narration_audio', 'voice_configs', 'trips', 'llm_calls'];
const DEFAULT_FNS    = ['get_nearby_pois', 'get_corridor_pois', 'get_venue_tour_pois', 'detect_venue_at_location'];

const argv = process.argv.slice(2);
function flag(name, fallback) {
  const arg = argv.find(a => a.startsWith(`--${name}=`));
  if (!arg) return fallback;
  return arg.slice(name.length + 3);
}
const TABLES = (flag('tables', DEFAULT_TABLES.join(','))).split(',').map(s => s.trim()).filter(Boolean);
const FNS    = (flag('fns',    DEFAULT_FNS.join(','))).split(',').map(s => s.trim()).filter(Boolean);

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

function pad(s, n) { return String(s).padEnd(n, ' '); }
function md(title) { console.log(`\n## ${title}\n`); }
function h3(title) { console.log(`\n### ${title}\n`); }

async function describeTable(name) {
  h3(`Table: \`${name}\``);

  const cols = (await pool.query(`
    SELECT column_name, data_type, udt_name, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1
    ORDER BY ordinal_position
  `, [name])).rows;

  if (cols.length === 0) {
    console.log(`_(no table named \`${name}\` in public)_`);
    return;
  }

  console.log('| Column | Type | Null | Default |');
  console.log('|---|---|---|---|');
  for (const c of cols) {
    const type = c.data_type === 'USER-DEFINED' || c.data_type === 'ARRAY' ? c.udt_name : c.data_type;
    console.log(`| \`${c.column_name}\` | ${type} | ${c.is_nullable === 'YES' ? '·' : 'NOT NULL'} | ${c.column_default ?? ''} |`);
  }

  const idx = (await pool.query(`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = $1
    ORDER BY indexname
  `, [name])).rows;
  if (idx.length) {
    console.log('\n**Indexes:**');
    for (const i of idx) console.log(`- \`${i.indexname}\` — \`${i.indexdef}\``);
  }

  const cons = (await pool.query(`
    SELECT conname,
           CASE contype
             WHEN 'p' THEN 'PK'
             WHEN 'u' THEN 'UNIQUE'
             WHEN 'f' THEN 'FK'
             WHEN 'c' THEN 'CHECK'
             ELSE contype::text
           END AS kind,
           pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE conrelid = ('public.' || $1)::regclass
    ORDER BY contype, conname
  `, [name])).rows;
  if (cons.length) {
    console.log('\n**Constraints:**');
    for (const c of cons) console.log(`- \`${c.kind}\` \`${c.conname}\`: \`${c.def}\``);
  }

  const triggers = (await pool.query(`
    SELECT trigger_name, event_manipulation, action_timing
    FROM information_schema.triggers
    WHERE event_object_schema = 'public' AND event_object_table = $1
    ORDER BY trigger_name
  `, [name])).rows;
  if (triggers.length) {
    console.log('\n**Triggers:**');
    for (const t of triggers) console.log(`- \`${t.trigger_name}\` — ${t.action_timing} ${t.event_manipulation}`);
  }
}

async function describeFunctions(names) {
  md('Functions (\\df)');
  const rows = (await pool.query(`
    SELECT n.nspname AS schema,
           p.proname AS name,
           pg_get_function_identity_arguments(p.oid) AS args,
           pg_get_function_result(p.oid) AS result_type,
           CASE p.provolatile
             WHEN 'i' THEN 'IMMUTABLE'
             WHEN 's' THEN 'STABLE'
             WHEN 'v' THEN 'VOLATILE'
           END AS volatility,
           CASE p.prosecdef WHEN true THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END AS secdef
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = ANY($1) AND n.nspname = 'public'
    ORDER BY p.proname, args
  `, [names])).rows;

  if (rows.length === 0) {
    console.log('_(no matching functions found in public)_');
    return;
  }

  for (const r of rows) {
    console.log(`- **${r.name}(${r.args})** → \`${r.result_type}\`  ·  ${r.volatility} · ${r.secdef}`);
  }
}

async function distinctPoiCategory() {
  md('`SELECT DISTINCT category FROM pois ORDER BY category;`');
  try {
    const r = await pool.query(`SELECT DISTINCT category FROM pois ORDER BY category NULLS LAST`);
    if (r.rowCount === 0) console.log('_(empty)_');
    else r.rows.forEach(row => console.log(`- \`${row.category}\``));
  } catch (e) {
    console.log(`_(query failed: ${e.message})_`);
    // pois may not have a 'category' column — most likely it lives via category_id FK.
    // Show what's actually there for category-like columns:
    const fallback = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='pois' AND column_name ILIKE 'categor%'
      ORDER BY column_name
    `);
    if (fallback.rowCount) {
      console.log('\nColumns on `pois` that look category-related:');
      for (const r of fallback.rows) console.log(`- \`${r.column_name}\``);
    }
    // And the canonical lookup:
    const cats = await pool.query(`SELECT slug, display_name FROM poi_categories ORDER BY sort_order, slug`);
    if (cats.rowCount) {
      console.log('\nFrom `poi_categories` (canonical category list):');
      console.log('| slug | display_name |');
      console.log('|---|---|');
      for (const r of cats.rows) console.log(`| \`${r.slug}\` | ${r.display_name} |`);
    }
  }
}

async function policies() {
  md('RLS policies (`pg_policies`)');
  const r = (await pool.query(`
    SELECT schemaname, tablename, policyname, cmd, permissive, roles, qual, with_check
    FROM pg_policies
    WHERE schemaname IN ('public','storage')
    ORDER BY schemaname, tablename, policyname
  `)).rows;
  if (r.length === 0) {
    console.log('_(no policies)_');
    return;
  }
  console.log('| schema | table | policy | cmd | permissive | roles |');
  console.log('|---|---|---|---|---|---|');
  for (const p of r) {
    const roles = Array.isArray(p.roles) ? p.roles.join(', ') : String(p.roles);
    console.log(`| ${p.schemaname} | \`${p.tablename}\` | \`${p.policyname}\` | ${p.cmd} | ${p.permissive} | ${roles} |`);
  }
}

async function rowCounts(tables) {
  md('Row counts');
  console.log('| table | count |');
  console.log('|---|---|');
  for (const t of tables) {
    try {
      const r = await pool.query(`SELECT count(*)::int AS n FROM ${t.replace(/[^a-z_]/gi, '')}`);
      console.log(`| \`${t}\` | ${r.rows[0].n} |`);
    } catch (e) {
      console.log(`| \`${t}\` | _err: ${e.message}_ |`);
    }
  }
}

(async () => {
  const dbName = (await pool.query(`SELECT current_database() AS db, current_user AS usr`)).rows[0];
  console.log(`# Xroad DB schema snapshot`);
  console.log(`\n_Generated ${new Date().toISOString()} · db=\`${dbName.db}\` · user=\`${dbName.usr}\`_`);

  md('Tables');
  for (const t of TABLES) await describeTable(t);

  await describeFunctions(FNS);

  await distinctPoiCategory();

  await policies();

  await rowCounts(TABLES);

  await pool.end();
})().catch(e => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
