/**
 * scripts/sweep-orphaned-narration.ts
 *
 * Cleans up stale and failed narration_audio rows and their Storage objects.
 * Run hourly via cron or manually after an incident.
 *
 *   cd scripts
 *   npx tsx sweep-orphaned-narration.ts
 *   npx tsx sweep-orphaned-narration.ts --dry-run
 *
 * Rules:
 *   pending rows older than 1 hour  → generation never completed; audio_url is
 *     NULL so no Storage object exists. Delete DB row only.
 *   failed rows older than 24 hours → may have a Storage object if the upload
 *     succeeded but the ready-update failed. Attempt Storage delete then delete row.
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { getAdminClient } from './lib/tts/supabase-admin.js';

const SCRIPT_DIR    = dirname(fileURLToPath(import.meta.url));
const STORAGE_BUCKET = 'narration-audio';

function loadEnv(): void {
  try {
    const raw = readFileSync(resolve(SCRIPT_DIR, '..', '.env'), 'utf8');
    for (const line of raw.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq === -1) continue;
      const k = t.slice(0, eq).trim();
      let v = t.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
        v = v.slice(1, -1);
      if (k && !(k in process.env)) process.env[k] = v;
    }
  } catch { /* rely on process.env already set */ }
}

// Storage path mirrors the generation path in narration.js
function storagePath(poiId: string, mode: string, depth: string, narratorSlug: string): string {
  return `${poiId}/${mode}/${depth}/${narratorSlug}.opus`;
}

async function tryDeleteStorage(
  poiId: string, mode: string, depth: string, narratorSlug: string,
  dryRun: boolean,
): Promise<void> {
  const path = storagePath(poiId, mode, depth, narratorSlug);
  if (dryRun) {
    console.log(`  [dry-run] would delete Storage: ${path}`);
    return;
  }
  const { error } = await getAdminClient().storage.from(STORAGE_BUCKET).remove([path]);
  // 404 is fine — the file may never have been uploaded
  if (error && !error.message.includes('Not Found') && !error.message.includes('404')) {
    console.warn(`  [sweep] Storage delete failed for ${path}:`, error.message);
  }
}

interface NarrationRow {
  id: string;
  poi_id: string;
  narrator_slug: string;
  depth: string;
  mode: string;
}

async function main(): Promise<void> {
  loadEnv();
  const dryRun = process.argv.includes('--dry-run');
  const sb     = getAdminClient();

  console.log(`\n[sweep] Starting${dryRun ? ' (dry-run)' : ''}`);

  // ── Stale pending rows (> 1 hour) ─────────────────────────────────────────
  // audio_url is NULL for pending rows so there is no Storage object to clean up.
  const pendingCutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  let stalePending: NarrationRow[] = [];
  if (!dryRun) {
    const { data, error } = await sb
      .from('narration_audio')
      .delete()
      .eq('status', 'pending')
      .lt('generated_at', pendingCutoff)
      .select('id, poi_id, narrator_slug, depth, mode');

    if (error) {
      console.error('[sweep] Failed to delete stale pending rows:', error.message);
    } else {
      stalePending = (data ?? []) as NarrationRow[];
    }
  } else {
    const { data, error } = await sb
      .from('narration_audio')
      .select('id, poi_id, narrator_slug, depth, mode')
      .eq('status', 'pending')
      .lt('generated_at', pendingCutoff);

    if (error) console.error('[sweep] dry-run pending query failed:', error.message);
    stalePending = (data ?? []) as NarrationRow[];
    for (const row of stalePending) {
      console.log(`  [dry-run] would delete pending row: ${row.id} (poi ${row.poi_id})`);
    }
  }

  // ── Old failed rows (> 24 hours) ───────────────────────────────────────────
  // May have a Storage object if the upload succeeded but the ready-update failed.
  const failedCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  let oldFailed: NarrationRow[] = [];
  if (!dryRun) {
    const { data, error } = await sb
      .from('narration_audio')
      .delete()
      .eq('status', 'failed')
      .lt('generated_at', failedCutoff)
      .select('id, poi_id, narrator_slug, depth, mode');

    if (error) {
      console.error('[sweep] Failed to delete old failed rows:', error.message);
    } else {
      oldFailed = (data ?? []) as NarrationRow[];
    }
  } else {
    const { data, error } = await sb
      .from('narration_audio')
      .select('id, poi_id, narrator_slug, depth, mode')
      .eq('status', 'failed')
      .lt('generated_at', failedCutoff);

    if (error) console.error('[sweep] dry-run failed query failed:', error.message);
    oldFailed = (data ?? []) as NarrationRow[];
    for (const row of oldFailed) {
      console.log(`  [dry-run] would delete failed row: ${row.id} (poi ${row.poi_id})`);
    }
  }

  // Attempt Storage cleanup for failed rows (no-op for pending since audio_url was NULL)
  for (const row of oldFailed) {
    await tryDeleteStorage(row.poi_id, row.mode, row.depth, row.narrator_slug, dryRun);
  }

  console.log(
    `[sweep] Done — pending deleted: ${stalePending.length}  failed deleted: ${oldFailed.length}`,
  );
}

main().catch(err => { console.error('[sweep] Fatal:', err); process.exit(1); });
