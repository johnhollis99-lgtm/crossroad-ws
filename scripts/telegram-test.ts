#!/usr/bin/env node
/**
 * Telegram end-to-end test ping.
 *
 * Fires one Telegram notification confirming the BOT_TOKEN + CHAT_ID
 * configuration is wired correctly. Curator runs after the discovery
 * script writes TELEGRAM_CHAT_ID:
 *
 *   npx tsx scripts/telegram-test.ts
 *
 * Expected outcome: the curator's phone receives "[RoadStory] Telegram
 * notification system live. ✓"
 *
 * If nothing arrives: check the .env values, re-run the discovery
 * script, or check the bot's permissions on Telegram (the bot needs
 * to have received at least one message from the chat to send to it).
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = resolve(__dirname, '..', '.env');

// Manual dotenv load — only need TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID
function loadEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  const raw = readFileSync(path, 'utf-8');
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (k) out[k] = v;
  }
  return out;
}

const env = loadEnvFile(ENV_PATH);
const token = env['TELEGRAM_BOT_TOKEN'] || process.env['TELEGRAM_BOT_TOKEN'];
const chatId = env['TELEGRAM_CHAT_ID'] || process.env['TELEGRAM_CHAT_ID'];

if (!token) {
  console.error('Error: TELEGRAM_BOT_TOKEN not found in .env or environment.');
  process.exit(1);
}
if (!chatId) {
  console.error('Error: TELEGRAM_CHAT_ID not found.');
  console.error('  Run: npx tsx scripts/telegram-discover-chat-id.ts');
  console.error('  Then send your bot a message from your phone.');
  process.exit(1);
}

const message = '[RoadStory] Telegram notification system live. ✓';

console.log(`Sending test ping to chat_id ${chatId}...`);

try {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: message }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '<unreadable>');
    console.error(`Error: sendMessage failed — HTTP ${res.status} ${errText.slice(0, 200)}`);
    process.exit(1);
  }

  const data = (await res.json()) as { ok: boolean; description?: string };
  if (!data.ok) {
    console.error(`Error: Telegram API rejected — ${data.description ?? '<no description>'}`);
    process.exit(1);
  }

  console.log('✓ Test ping sent. Check your Telegram for the message above.');
} catch (err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`Error: ${msg}`);
  process.exit(1);
}
