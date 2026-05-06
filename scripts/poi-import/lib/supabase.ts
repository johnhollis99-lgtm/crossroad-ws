import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;

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
