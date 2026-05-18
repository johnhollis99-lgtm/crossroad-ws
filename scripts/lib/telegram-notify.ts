/**
 * Telegram notification helper (curator-only, Flavor-1 notifications).
 *
 * Reads TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID from env. Posts to
 * api.telegram.org/bot<TOKEN>/sendMessage. Fire-and-forget: silent on
 * success, logs error on failure, NEVER throws — Telegram failures must
 * not break the precache pipeline.
 *
 * Every message gets a `[RoadStory] ` prefix for readability.
 *
 * Usage:
 *   import { notifyTelegram } from './lib/telegram-notify.js';
 *   notifyTelegram('Region narration precache dry-run ready.');  // no await needed if fire-and-forget
 *
 * Or with await if the caller wants to know it landed (still won't throw):
 *   await notifyTelegram('Precache complete.');
 */

const TELEGRAM_API_BASE = 'https://api.telegram.org';
const MESSAGE_PREFIX = '[RoadStory] ';
const REQUEST_TIMEOUT_MS = 8000;

export async function notifyTelegram(message: string): Promise<void> {
  const token = process.env['TELEGRAM_BOT_TOKEN'];
  const chatId = process.env['TELEGRAM_CHAT_ID'];

  // Silent no-op if credentials are missing — Telegram is optional infra,
  // the precache pipeline must keep running even when not configured.
  if (!token || !chatId) {
    return;
  }

  const text = MESSAGE_PREFIX + message;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const res = await fetch(`${TELEGRAM_API_BASE}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const errText = await res.text().catch(() => '<unreadable>');
      console.error(`[telegram-notify] sendMessage failed: HTTP ${res.status} ${errText.slice(0, 200)}`);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[telegram-notify] sendMessage error: ${msg}`);
  }
}
