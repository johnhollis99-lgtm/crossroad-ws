import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CostRecord } from './types.js';

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (_client) return _client;
  const url = process.env['SUPABASE_URL'];
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  if (!url || !key) {
    throw new Error(
      'cost-tracker: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set',
    );
  }
  _client = createClient(url, key, { auth: { persistSession: false } });
  return _client;
}

/**
 * Logs one TTS or Claude call to the llm_calls table.
 * Call fire-and-forget from hot paths — catch the returned Promise.
 */
export async function logCost(record: CostRecord): Promise<void> {
  const { error } = await getClient()
    .from('llm_calls')
    .insert({
      call_type:      record.callType,
      provider:       record.provider,
      model_or_voice: record.modelOrVoice,
      input_chars:    record.inputChars ?? null,
      input_tokens:   record.inputTokens ?? null,
      output_tokens:  record.outputTokens ?? null,
      cost_usd:       record.costUsd,
      related_id:     record.relatedId ?? null,
    });
  if (error) throw new Error(`logCost: DB insert failed — ${error.message}`);
}
