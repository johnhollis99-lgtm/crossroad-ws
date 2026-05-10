// One-off: apply 20260504000019_narration_audio_bucket.sql and verify.
//
// Run from: scripts/poi-import/
//   node apply-narration-bucket.mjs

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
  '../../supabase/migrations/20260504000019_narration_audio_bucket.sql',
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

  console.log('▶ Applying migration 20260504000019_narration_audio_bucket.sql...');
  await pool.query(sql);
  console.log('  ✓ migration applied');

  console.log('\n=== Verifications ===');

  // (a) Direct SELECT on storage.buckets
  const a = await pool.query(
    `SELECT id, name, public, file_size_limit, allowed_mime_types
       FROM storage.buckets
      WHERE id = 'narration-audio'`,
  );
  if (a.rows.length === 0) {
    console.log('(a) FAIL: storage.buckets has no row for narration-audio');
    process.exitCode = 2;
  } else {
    const row = a.rows[0];
    console.log('(a) storage.buckets row:');
    console.log(`     id:                 ${row.id}`);
    console.log(`     name:               ${row.name}`);
    console.log(`     public:             ${row.public}`);
    console.log(`     file_size_limit:    ${row.file_size_limit}`);
    console.log(`     allowed_mime_types: ${JSON.stringify(row.allowed_mime_types)}`);
  }

  // (b) Authoritative listBuckets() via @supabase/supabase-js admin client.
  // The recon noted that storage.from(...).list() can return OK on a
  // non-existent bucket; listBuckets() is the trustworthy check.
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
      if (found) {
        console.log(`(b) listBuckets() includes narration-audio: ${JSON.stringify({
          id: found.id, name: found.name, public: found.public,
          file_size_limit: found.file_size_limit,
          allowed_mime_types: found.allowed_mime_types,
        })}`);
      } else {
        console.log('(b) FAIL: listBuckets() did not return narration-audio');
        console.log(`    Found buckets: ${data.map(b => b.id).join(', ') || '(none)'}`);
        process.exitCode = 2;
      }
    }
  }

  if (process.exitCode) {
    console.log('\nFAILED — at least one verification did not pass.');
  } else {
    console.log('\nBucket creation verified.');
  }
}

main()
  .catch(err => {
    console.error('ERROR:', err.message ?? err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
