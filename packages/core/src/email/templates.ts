import type { Email } from "./index";

// Transactional email copy. Bahasa Indonesia by default (product locale); English secondary.

const esc = (v: string) =>
  v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

/**
 * The sign-in email: the magic link and, with `code` (auth.emailCode, D-079), the 6-digit code for
 * the same sign-in, so someone who opened the link in another app (an email app's browser) can type
 * the code where they started. One email, never two.
 */
export function magicLinkEmail(
  to: string,
  url: string,
  appName: string,
  locale: "id" | "en" = "id",
  code?: string,
  /** The button colour: the product's primary (brand.tokens.colors.light.primary). */
  accent = "#2563eb",
): Email {
  const en = locale === "en";
  const subject = en ? `Sign in to ${appName}` : `Masuk ke ${appName}`;
  const lead = code
    ? en
      ? `Tap the link to sign in to ${appName}, or enter code ${code} on the sign-in page.`
      : `Ketuk tautan ini untuk masuk ke ${appName}, atau masukkan kode ${code} di halaman masuk.`
    : en
      ? `Open this link to sign in to ${appName}:`
      : `Buka tautan ini untuk masuk ke ${appName}:`;
  const rules = code
    ? en
      ? "The link works once and expires in 15 minutes; the code expires in 5 minutes. Using one cancels the other. If you didn't ask for it, ignore this email."
      : "Tautan hanya bisa dipakai sekali dan berlaku 15 menit; kode berlaku 5 menit. Kalau salah satunya sudah dipakai, yang lain tidak berlaku lagi. Kalau kamu tidak memintanya, abaikan email ini."
    : en
      ? "The link works once and expires in 15 minutes. If you didn't ask for it, ignore this email."
      : "Tautan hanya bisa dipakai sekali dan berlaku 15 menit. Kalau kamu tidak memintanya, abaikan email ini.";
  const text = `${lead}\n\n${url}\n\n${code ? `${en ? "Code" : "Kode"}: ${code}\n\n` : ""}${rules}`;
  if (!code) return { to, subject, text };
  const button = en ? "Sign in" : "Masuk";
  const html = [
    `<p>${esc(lead)}</p>`,
    `<p><a href="${esc(url)}" style="display:inline-block;padding:12px 20px;border-radius:8px;background:${esc(accent)};color:#ffffff;text-decoration:none;font-weight:600">${button}</a></p>`,
    `<p style="font-size:32px;font-weight:700;letter-spacing:8px;font-family:monospace">${esc(code)}</p>`,
    `<p style="color:#64748b">${esc(rules)}</p>`,
  ].join("");
  return { to, subject, text, html };
}

const idr = (n: number) => `Rp${n.toLocaleString("id-ID")}`;
const jakartaDate = (d: Date) =>
  d.toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "long", year: "numeric" });

export function receiptEmail(
  to: string,
  data: { appName: string; planLabel: string; amountIdr: number; paymentId: string; expiresAt: Date },
): Email {
  return {
    to,
    subject: `Pembayaran ${data.appName} berhasil`,
    text: [
      `Terima kasih! Pembayaran kamu sudah kami terima.`,
      ``,
      `Paket: ${data.planLabel}`,
      `Jumlah: ${idr(data.amountIdr)}`,
      `Akses aktif sampai: ${jakartaDate(data.expiresAt)} (WIB)`,
      `Nomor pembayaran: ${data.paymentId}`,
      ``,
      `Langganan ini tidak diperpanjang otomatis. Kami akan mengingatkan sebelum masa aktif habis.`,
    ].join("\n"),
  };
}

export function reminderEmail(
  to: string,
  data: { appName: string; kind: "d7" | "d1" | "expired"; expiresAt: Date; renewUrl: string },
): Email {
  const when = jakartaDate(data.expiresAt);
  const subject =
    data.kind === "expired"
      ? `Akses ${data.appName} kamu sudah berakhir`
      : data.kind === "d1"
        ? `Akses ${data.appName} berakhir besok`
        : `Akses ${data.appName} berakhir dalam 7 hari`;
  const lead = data.kind === "expired" ? `Akses kamu berakhir pada ${when}.` : `Akses kamu akan berakhir pada ${when}.`;
  return {
    to,
    subject,
    text: `${lead}\n\nPerpanjang sekarang (sisa hari tidak hangus):\n${data.renewUrl}\n\nKalau sudah memperpanjang, abaikan email ini.`,
  };
}
