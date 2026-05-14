/**
 * Admin clients for the region-import package.
 *
 * Duplicated from scripts/poi-import/lib/supabase.ts intentionally — the two
 * packages are independent (own package.json, own node_modules). The file is
 * tiny and the dependency surface is the same.
 *
 * PostGREST cannot read or write the `polygon geography(MultiPolygon, 4326)`
 * column on `regions` — Supabase JS client must use the direct pg pool for
 * polygon writes. The Supabase admin client is kept for table reads
 * (parent_region_id resolution, etc.) and for any RPC calls we need.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import pkg from 'pg';

const { Pool } = pkg;
type PgPool = InstanceType<typeof Pool>;

let cached: SupabaseClient | null = null;
let pgPool: PgPool | null = null;

export function getAdminClient(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error('SUPABASE_URL not set in environment');
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY not set in environment');

  cached = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'public' },
  });
  return cached;
}

export function getPgPool(): PgPool {
  if (pgPool) return pgPool;
  const connectionString = process.env['DATABASE_URL'];
  if (!connectionString) throw new Error('DATABASE_URL not set in environment');
  pgPool = new Pool({ connectionString, max: 5 });
  return pgPool;
}
