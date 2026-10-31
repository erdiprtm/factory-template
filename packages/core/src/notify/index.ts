// Owner alerts on Telegram (D-112): a ping on the owner's phone when someone pays, gets refunded, or
// a forged webhook is rejected, plus an optional daily summary. Server-side only, from the paths that
// grant or end access. Minimal data (UU PDP): a masked email or none, never health data. Telegram
// Bot API, sendMessage (core.telegram.org/bots/api, read 2026-10-31): plain text, 1–4096 chars.

export type TelegramConfig = { token: string; chatId: string };
export type EmailMode = "masked" | "omit";

/** "erdi@gmail.com" → "er***@gmail.com"; anything that isn't an email → "***". */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 1) return "***";
  return `${email.slice(0, Math.min(2, at))}***${email.slice(at)}`;
}

const idr = (n: number) => `Rp${n.toLocaleString("id-ID")}`;

/** A purchase or renewal, confirmed by the provider. */
export function paidText(p: {
  event: "purchase" | "renewal";
  product: string;
  plan: string;
  amountIdr: number;
  provider: string;
  paymentId: string;
  email?: string | null;
  emailMode: EmailMode;
  campaign?: string | null;
  source?: string | null;
}): string {
  const lines = [
    `${p.event === "purchase" ? "💰 Pembelian baru" : "🔁 Perpanjangan"} · ${p.product}`,
    `${p.plan} · ${idr(p.amountIdr)} · ${p.provider}`,
  ];
  if (p.campaign || p.source) lines.push(`Iklan: ${[p.source, p.campaign].filter(Boolean).join(" / ")}`);
  if (p.emailMode === "masked" && p.email) lines.push(`Pembeli: ${maskEmail(p.email)}`);
  lines.push(`ID: ${p.paymentId}`);
  return lines.join("\n");
}

export function refundText(p: { product: string; plan: string; amountIdr: number; paymentId: string }): string {
  return `↩️ Refund · ${p.product}\n${p.plan} · ${idr(p.amountIdr)}\nID: ${p.paymentId}`;
}

export function webhookRejectedText(p: { product: string; provider: string }): string {
  return `⚠️ Webhook ditolak · ${p.product}\nTanda tangan ${p.provider} tidak cocok. Kalau berulang, cek secret webhook-nya.`;
}

export type DailySummary = {
  day: string;
  purchases: number;
  renewals: number;
  revenueIdr: number;
  refunds: number;
  quizStarts: number;
  firstResults: number;
};

export function dailySummaryText(product: string, s: DailySummary): string {
  return [
    `📊 ${product} · ${s.day}`,
    `Pembelian ${s.purchases} · perpanjangan ${s.renewals} · ${idr(s.revenueIdr)}`,
    ...(s.refunds > 0 ? [`Refund ${s.refunds}`] : []),
    `Mulai kuis ${s.quizStarts} → hasil pertama ${s.firstResults}`,
  ].join("\n");
}

/**
 * Sends one message. Never throws and gives up after `timeoutMs`: a Telegram outage must not fail
 * or slow a webhook. Returns whether Telegram accepted it.
 */
export async function sendTelegram(
  cfg: TelegramConfig,
  text: string,
  opts: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<boolean> {
  const send = opts.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  try {
    const res = await send(`https://api.telegram.org/bot${cfg.token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: cfg.chatId,
        text: text.slice(0, 4096),
        link_preview_options: { is_disabled: true },
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 3000),
    });
    const body = (await res.json().catch(() => null)) as { ok?: boolean } | null;
    return res.ok && body?.ok === true;
  } catch {
    return false;
  }
}
