// One-off: apply 20260504000021_narration_audio_bucket_codecs_mime.sql and verify.
//
// Run from: scripts/poi-import/
//   node apply-narration-bucket-codecs-mime.mjs

import { config } from 'dotenv';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pkg from 'pg';
import { createClient } from '@supabase/supabase-js';

const { Pool } = pkg;
const __dirname = dirname(fileURLToPath(import.meta.url));

config({ path: resolve(__dirname, '../../.env') });

const MIGRATION_PATH = resolve(
  __dirname,
  '../../supabase/migrations/20260504000021_narration_audio_bucket_codecs_mime.sql',
);

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not set in .env');
  process.exit(1);
}
if (!existsSync(MIGRATION_PATH)) {
  console.error(`Migration file not found: ${MIGRATION_PATH}`);
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

async function main() {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');
  console.log('▶ Applying migration 20260504000021_narration_audio_bucket_codecs_mime.sql...');
  await pool.query(sql);
  console.log('  ✓ migration applied');

  console.log('\n=== Verifications ===');

  // (a) Direct SELECT
  const a = await pool.query(
    `SELECT id, allowed_mime_types FROM storage.buckets WHERE id = 'narration-audio'`,
  );
  if (a.rows.length === 0) {
    console.log('(a) FAIL: storage.buckets has no narration-audio row');
    process.exitCode = 2;
  } else {
    const mimes = a.rows[0].allowed_mime_types;
    console.log(`(a) storage.buckets allowed_mime_types: ${JSON.stringify(mimes)}`);
    if (!mimes.includes('audio/ogg; codecs=opus')) {
      console.log('    FAIL: parameterised MIME type missing');
      process.exitCode = 2;
    }
  }

  // (b) listBuckets() echo
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.log('(b) SKIP: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set');
  } else {
    const sb = createClient(url, key, { auth: { persistSession: false } });
    const { data, error } = await sb.storage.listBuckets();
    if (error) {
      console.log(`(b) listBuckets error: ${error.message}`);
      process.exitCode = 2;
    } else {
      const found = data.find(b => b.id === 'narration-audio');
      if (!found) {
        console.log('(b) FAIL: listBuckets() did not return narration-audio');
        process.exitCode = 2;
      } else {
        console.log(`(b) listBuckets() narration-audio.allowed_mime_types: ${JSON.stringify(found.allowed_mime_types)}`);
        if (!found.allowed_mime_types?.includes('audio/ogg; codecs=opus')) {
          console.log('    FAIL: parameterised MIME type missing in listBuckets()');
          process.exitCode = 2;
        }
      }
    }
  }

  if (process.exitCode) console.log('\nFAILED.');
  else console.log('\nMIME allow-list extension verified.');
}

main()
  .catch(err => {
    console.error('ERROR:', err.message ?? err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
