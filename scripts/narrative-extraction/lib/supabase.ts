import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;

export function getAdminClient(): SupabaseClient {
  if (cached) return cached;

  const url        = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url)        throw new Error('SUPABASE_URL not set in environment');
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY not set in environment');

  cached = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    db:   { schema: 'public' },
  });
  return cached;
}
