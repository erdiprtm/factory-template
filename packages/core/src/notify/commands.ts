// The owner's Telegram commands (D-114): read-only answers from the same numbers as /admin's
// dashboard (D-113). Pure text here; the API wires the data. Indonesian, like the alerts (D-112).

export type BotCommand = { command: string; description: string };

/** Registered with setMyCommands for the owner's chat only, so the menu shows them there. */
export const OWNER_COMMANDS: BotCommand[] = [
  { command: "hari_ini", description: "Angka hari ini vs kemarin" },
  { command: "minggu", description: "7 hari terakhir vs 7 hari sebelumnya" },
  { command: "bulan", description: "30 hari terakhir vs 30 hari sebelumnya" },
  { command: "funnel", description: "Funnel 7 hari dan penurunan terbesar" },
  { command: "sumber", description: "Sumber dan kampanye teratas, 7 hari" },
  { command: "terakhir", description: "5 pembayaran terakhir" },
  { command: "bantuan", description: "Daftar perintah" },
];

/** "/minggu", "/minggu@MynaFitBot extra" → "minggu"; anything that isn't a command → null. */
export function parseCommand(text: string | undefined): string | null {
  const m = /^\/([a-z0-9_]{1,32})(?:@\S+)?(?:\s|$)/i.exec(text?.trim() ?? "");
  return m ? (m[1] as string).toLowerCase() : null;
}

const idr = (n: number) => `Rp${n.toLocaleString("id-ID")}`;
const pct = (n: number | null) => (n === null ? "–" : `${Math.round(n * 1000) / 10}%`);
const arrow = (t: number | null) => (t === null ? "" : ` (${t > 0 ? "▲" : t < 0 ? "▼" : "•"} ${pct(Math.abs(t))})`);

type Kpi = { value: number | null; trend: number | null };
export type KpiSet = {
  revenueIdr: Kpi;
  buyers: Kpi;
  renewals: Kpi;
  visitors: Kpi;
  conversion: Kpi;
  activePaid: Kpi;
};

/** /hari_ini, /minggu, /bulan. */
export function kpiText(product: string, title: string, k: KpiSet): string {
  return [
    `📈 ${product} · ${title}`,
    `Pendapatan bersih: ${idr(k.revenueIdr.value ?? 0)}${arrow(k.revenueIdr.trend)}`,
    `Pembeli baru: ${k.buyers.value ?? 0}${arrow(k.buyers.trend)}`,
    `Perpanjangan: ${k.renewals.value ?? 0}${arrow(k.renewals.trend)}`,
    `Pengunjung: ${k.visitors.value ?? 0}${arrow(k.visitors.trend)}`,
    `Kunjungan → beli: ${pct(k.conversion.value)}${arrow(k.conversion.trend)}`,
    `Pelanggan aktif: ${k.activePaid.value ?? 0}`,
    "(vs periode sebelumnya)",
  ].join("\n");
}

const STEP_LABELS: Record<string, string> = {
  lp_view: "Lihat landing page",
  cta_tap: "Klik tombol",
  quiz_start: "Mulai kuis",
  quiz_complete: "Selesai kuis",
  first_result: "Hasil pertama",
  paywall_view: "Lihat paket",
  checkout_start: "Mulai bayar",
  purchase: "Beli",
};

/** /funnel: each step's visitors and step rate, the biggest drop marked. */
export function funnelText(
  product: string,
  steps: { step: string; visitors: number; rate: number | null }[],
  drop: string | null,
): string {
  return [
    `🔻 ${product} · funnel 7 hari`,
    ...steps.map(
      (s) =>
        `${STEP_LABELS[s.step] ?? s.step}: ${s.visitors}${s.rate === null ? "" : ` (${pct(s.rate)})`}${s.step === drop ? " ← penurunan terbesar" : ""}`,
    ),
  ].join("\n");
}

/** /sumber: the top sources and campaigns by revenue, then visitors. */
export function sourcesText(
  product: string,
  rows: {
    source: string | null;
    campaign: string | null;
    visitors: number;
    buyers: number;
    revenueIdr: number;
    roas: number | null;
  }[],
  limit = 5,
): string {
  if (rows.length === 0) return `🧭 ${product} · sumber 7 hari\nBelum ada data.`;
  return [
    `🧭 ${product} · sumber 7 hari`,
    ...rows.slice(0, limit).map((r) => {
      const name = r.source || r.campaign ? [r.source, r.campaign].filter(Boolean).join(" / ") : "Langsung";
      return `${name}: ${r.visitors} pengunjung · ${r.buyers} pembeli · ${idr(r.revenueIdr)}${r.roas === null ? "" : ` · ROAS ${r.roas.toFixed(2)}×`}`;
    }),
  ].join("\n");
}

/** "2026-10-31T03:05:00.000Z" → "31-10 10:05 WIB". */
const wib = (iso: string) => {
  const d = new Date(Date.parse(iso) + 7 * 3_600_000).toISOString();
  return `${d.slice(8, 10)}-${d.slice(5, 7)} ${d.slice(11, 16)} WIB`;
};

const STATUS: Record<string, string> = {
  paid: "Berhasil",
  pending: "Menunggu",
  failed: "Gagal",
  expired: "Kedaluwarsa",
  refunded: "Dikembalikan",
};

/** /terakhir: the last payments, with emails already masked by the caller. */
export function lastPaymentsText(
  product: string,
  items: { status: string; planId: string; amountIdr: number; who: string; at: string }[],
): string {
  if (items.length === 0) return `🧾 ${product} · pembayaran terakhir\nBelum ada pembayaran.`;
  return [
    `🧾 ${product} · pembayaran terakhir`,
    ...items.map(
      (p) => `${wib(p.at)} · ${STATUS[p.status] ?? p.status} · ${p.planId} · ${idr(p.amountIdr)} · ${p.who}`,
    ),
  ].join("\n");
}

export function helpText(product: string): string {
  return [`🤖 ${product} · perintah`, ...OWNER_COMMANDS.map((c) => `/${c.command}: ${c.description}`)].join("\n");
}

/** Constant-time comparison of the webhook's secret header (no early exit on the first difference). */
export function sameSecret(a: string | null | undefined, b: string): boolean {
  if (typeof a !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
