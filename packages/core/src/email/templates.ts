import type { Email } from "./index";

// Transactional email copy. Bahasa Indonesia by default (product locale); English secondary.
export function magicLinkEmail(to: string, url: string, appName: string, locale: "id" | "en" = "id"): Email {
  if (locale === "en") {
    return {
      to,
      subject: `Sign in to ${appName}`,
      text: `Open this link to sign in to ${appName}:\n\n${url}\n\nThe link works once and expires in 15 minutes. If you didn't ask for it, ignore this email.`,
    };
  }
  return {
    to,
    subject: `Masuk ke ${appName}`,
    text: `Buka tautan ini untuk masuk ke ${appName}:\n\n${url}\n\nTautan hanya bisa dipakai sekali dan berlaku 15 menit. Kalau kamu tidak memintanya, abaikan email ini.`,
  };
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
