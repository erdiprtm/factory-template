// Amounts are integer IDR; dates are stored in UTC and shown in Asia/Jakarta (WIB).
export const formatIdr = (n: number) => `Rp${n.toLocaleString("id-ID")}`;

export function formatDate(iso: string, locale: "id" | "en" = "id"): string {
  return new Date(iso).toLocaleDateString(locale === "id" ? "id-ID" : "en-GB", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** A number in the user's locale: "71,5" in Indonesian, "71.5" in English. */
export function formatNumber(n: number, locale: "id" | "en" = "id"): string {
  return n.toLocaleString(locale === "id" ? "id-ID" : "en-GB", { maximumFractionDigits: 2 });
}
