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
