import { config } from "@factory/config/product";
import { sendTelegram, type TelegramConfig } from "@factory/core/notify";

export type NotifyEnv = {
  APP_ENV: string;
  /** Telegram bot token from @BotFather (Worker secret, D-112). Unset = no owner alerts. */
  TELEGRAM_BOT_TOKEN?: string;
  /** The owner's chat id (Worker secret). */
  TELEGRAM_CHAT_ID?: string;
};
export type OwnerEvent = "purchase" | "renewal" | "refund" | "webhook_rejected" | "payment_rescued" | "repeat_checkout";

/** The owner's Telegram, when the product turned alerts on and both secrets are set; never in dev or tests. */
export function ownerTelegram(env: NotifyEnv): TelegramConfig | null {
  if (!config.notifications.telegram || env.APP_ENV === "development" || env.APP_ENV === "test") return null;
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return null;
  return { token: env.TELEGRAM_BOT_TOKEN, chatId: env.TELEGRAM_CHAT_ID };
}

// A flood of forged webhooks (or of rescued payments, D-128: one cause, one ping) must not become a
// flood of pings: one per 10 minutes per isolate and event.
const RATE_LIMITED: Partial<Record<OwnerEvent, number>> = { webhook_rejected: 0, payment_rescued: 0 };

/**
 * One owner alert (D-112), if the product asked for this event. Never throws, and gives up after 3 s
 * (sendTelegram), so callers can await it inside waitUntil without slowing a webhook's answer.
 */
export async function ownerAlert(env: NotifyEnv, event: OwnerEvent, text: string, now = Date.now()): Promise<void> {
  const tg = ownerTelegram(env);
  if (!tg || !config.notifications.telegram?.events.includes(event)) return;
  const last = RATE_LIMITED[event];
  if (last !== undefined) {
    if (now - last < 10 * 60_000) return;
    RATE_LIMITED[event] = now;
  }
  await sendTelegram(tg, text);
}
