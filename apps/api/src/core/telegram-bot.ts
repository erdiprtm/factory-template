import { config } from "@factory/config/product";
import { loadDashboard, loadFeed } from "@factory/core/admin/dashboard";
import { biggestDrop, jakartaDay, loadEconomics } from "@factory/core/economics";
import { telegramCall } from "@factory/core/notify";
import {
  funnelText,
  helpText,
  kpiText,
  lastPaymentsText,
  OWNER_COMMANDS,
  parseCommand,
  sameSecret,
  sourcesText,
} from "@factory/core/notify/commands";
import { schema } from "@factory/db";
import { drizzle } from "drizzle-orm/d1";
import type { Bindings } from "../index";
import { funnelSteps } from "./admin";
import type { NotifyEnv } from "./notify";

// The owner's two-way bot (D-114): Telegram calls POST /api/telegram/webhook with our secret in
// X-Telegram-Bot-Api-Secret-Token. Only TELEGRAM_CHAT_ID gets answers, read-only, from the same
// queries as /admin's dashboard (D-113). Any other chat is ignored without a word.

export type BotEnv = NotifyEnv & { TELEGRAM_WEBHOOK_SECRET?: string };

/** The bot is on: the product asked for commands and all three secrets exist; never in dev or tests. */
export function botReady(env: BotEnv): boolean {
  return Boolean(
    config.notifications.telegram?.commands &&
      env.TELEGRAM_BOT_TOKEN &&
      env.TELEGRAM_CHAT_ID &&
      env.TELEGRAM_WEBHOOK_SECRET &&
      env.APP_ENV !== "development",
  );
}

export const verifiedWebhook = (env: BotEnv, header: string | null | undefined) =>
  Boolean(env.TELEGRAM_WEBHOOK_SECRET) && sameSecret(header, env.TELEGRAM_WEBHOOK_SECRET as string);

type Update = { message?: { chat?: { id?: number | string }; text?: string } };

/** The answer to an update, or null when there's nothing to say (another chat, not a command). */
export async function answerUpdate(env: Bindings & BotEnv, update: Update, now = new Date()): Promise<string | null> {
  const chat = update.message?.chat?.id;
  if (chat === undefined || String(chat) !== String(env.TELEGRAM_CHAT_ID)) return null;
  const command = parseCommand(update.message?.text);
  if (!command) return null;
  const db = drizzle(env.DB, { schema });
  const name = config.name;
  switch (command) {
    case "hari_ini":
      return kpiText(name, "hari ini", (await loadDashboard(db, "today", now)).kpis);
    case "minggu":
      return kpiText(name, "7 hari", (await loadDashboard(db, "7d", now)).kpis);
    case "bulan":
      return kpiText(name, "30 hari", (await loadDashboard(db, "30d", now)).kpis);
    case "funnel": {
      const e = await loadEconomics(db, {
        from: jakartaDay(new Date(now.getTime() - 6 * 86_400_000)),
        to: jakartaDay(now),
        plans: config.plans,
        steps: funnelSteps(),
        benchmarks: config.economics.benchmarks,
        now,
      });
      return funnelText(name, e.funnel, biggestDrop(e.funnel));
    }
    case "sumber":
      return sourcesText(name, (await loadDashboard(db, "7d", now)).sources);
    case "terakhir":
      return lastPaymentsText(
        name,
        (await loadFeed(db, 50)).flatMap((i) => (i.kind === "payment" ? [i] : [])).slice(0, 5),
      );
    default:
      return helpText(name);
  }
}

/**
 * /admin's "Hubungkan bot" (D-114): points Telegram at this Worker with our secret and lists the
 * commands in the owner's chat menu. The token never leaves the Worker.
 */
export async function connectBot(env: BotEnv, origin: string) {
  const token = env.TELEGRAM_BOT_TOKEN as string;
  const hook = await telegramCall(token, "setWebhook", {
    url: `${origin}/api/telegram/webhook`,
    secret_token: env.TELEGRAM_WEBHOOK_SECRET,
    allowed_updates: ["message"],
    drop_pending_updates: true,
  });
  if (!hook.ok) return { ok: false as const, step: "setWebhook" as const, description: hook.description ?? null };
  const menu = await telegramCall(token, "setMyCommands", {
    commands: OWNER_COMMANDS,
    scope: { type: "chat", chat_id: env.TELEGRAM_CHAT_ID },
  });
  if (!menu.ok) return { ok: false as const, step: "setMyCommands" as const, description: menu.description ?? null };
  return { ok: true as const };
}
