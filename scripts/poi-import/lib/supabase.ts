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

export async function getCategoryIdMap(): Promise<Record<string, string>> {
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from('poi_categories')
    .select('id, slug');
  if (error) throw new Error(`getCategoryIdMap: ${error.message}`);
  const map: Record<string, string> = {};
  for (const row of data ?? []) map[row.slug as string] = row.id as string;
  return map;
}
