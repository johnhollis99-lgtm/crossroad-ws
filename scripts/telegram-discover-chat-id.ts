#!/usr/bin/env node
/**
 * Telegram chat_id discovery script.
 *
 * Reads TELEGRAM_BOT_TOKEN from .env at the project root, polls
 * api.telegram.org/bot<TOKEN>/getUpdates until the first message arrives,
 * extracts the sender's chat_id, prints it to stdout, and writes it back
 * to .env as the value of TELEGRAM_CHAT_ID.
 *
 * Curator runs this ONCE after pasting the bot token:
 *   npx tsx scripts/telegram-discover-chat-id.ts
 * Then sends any message to their bot from their phone (e.g. /start).
 * The script picks up the chat_id and exits cleanly.
 *
 * Polling cadence: 2 seconds between getUpdates calls. Telegram's
 * long-poll timeout=10 reduces request count but the script still
 * checks every cycle.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = resolve(__dirname, '..', '.env');
const POLL_INTERVAL_MS = 2000;
const TELEGRAM_LONG_POLL_TIMEOUT_S = 10;

// ── Manual dotenv parse — only need TELEGRAM_BOT_TOKEN, avoids dep on
// any specific dotenv version across the script-package zoo ──────────────
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

if (!token) {
  console.error('Error: TELEGRAM_BOT_TOKEN not found in .env or environment.');
  console.error('  Paste your bot token into .env as TELEGRAM_BOT_TOKEN=<token>, then re-run.');
  process.exit(1);
}

console.log('Telegram chat_id discovery starting...');
console.log(`Bot token: ${token.slice(0, 10)}... (verified loaded from .env)`);
console.log('');
console.log('Now: open Telegram on your phone, find your bot, and send any message (e.g. /start).');
console.log('This script will pick up the chat_id from your first incoming message.');
console.log('');

let lastUpdateId = 0;

async function pollOnce(): Promise<{ chatId: number; senderName: string; messageText: string } | null> {
  const url =
    `https://api.telegram.org/bot${token}/getUpdates` +
    `?timeout=${TELEGRAM_LONG_POLL_TIMEOUT_S}` +
    (lastUpdateId > 0 ? `&offset=${lastUpdateId + 1}` : '');

  const res = await fetch(url);
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`getUpdates HTTP ${res.status}: ${errText.slice(0, 200)}`);
  }

  type Update = {
    update_id: number;
    message?: {
      chat?: { id?: number };
      from?: { first_name?: string; username?: string };
      text?: string;
    };
  };
  const data = (await res.json()) as { ok: boolean; result: Update[] };
  if (!data.ok) throw new Error(`Telegram API error: ${JSON.stringify(data).slice(0, 200)}`);

  for (const u of data.result) {
    lastUpdateId = Math.max(lastUpdateId, u.update_id);
    const chatId = u.message?.chat?.id;
    if (typeof chatId === 'number') {
      const from = u.message?.from ?? {};
      const senderName = from.first_name ?? from.username ?? 'unknown';
      const text = u.message?.text ?? '<no text>';
      return { chatId, senderName, messageText: text };
    }
  }
  return null;
}

function updateEnvChatId(path: string, chatId: number): void {
  const raw = readFileSync(path, 'utf-8');
  const lines = raw.split('\n');
  let found = false;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]?.trimStart().startsWith('TELEGRAM_CHAT_ID=')) {
      lines[i] = `TELEGRAM_CHAT_ID=${chatId}`;
      found = true;
      break;
    }
  }
  if (!found) {
    // Append at top (after any leading comment block) or just at the start
    lines.unshift(`TELEGRAM_CHAT_ID=${chatId}`);
  }
  writeFileSync(path, lines.join('\n'));
}

// Polling loop wrapped in async main() — tsx treats this .ts under
// scripts/ as CommonJS (no local package.json with "type": "module"),
// and CJS cannot use top-level await.
async function main(): Promise<void> {
  process.stdout.write('Polling');
  while (true) {
    process.stdout.write('.');
    try {
      const found = await pollOnce();
      if (found) {
        console.log('');
        console.log('');
        console.log(`✓ Received message from ${found.senderName}: "${found.messageText}"`);
        console.log(`  chat_id: ${found.chatId}`);
        console.log('');
        updateEnvChatId(ENV_PATH, found.chatId);
        console.log(`✓ Wrote TELEGRAM_CHAT_ID=${found.chatId} to ${ENV_PATH}`);
        console.log('');
        console.log('Discovery complete. The bot now knows where to send notifications.');
        console.log('Next: run "npx tsx scripts/telegram-test.ts" to confirm end-to-end works.');
        process.exit(0);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log('');
      console.error(`Polling error: ${msg}`);
      console.error(`Retrying in ${POLL_INTERVAL_MS / 1000}s...`);
    }
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`Fatal: ${msg}`);
  process.exit(1);
});
