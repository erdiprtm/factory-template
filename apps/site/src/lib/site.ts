import product from "../../../../product.config";

export { product };

const idr = (n: number) => `Rp${n.toLocaleString("id-ID")}`;
export const formatIdr = idr;

/** Where "Masuk" / "Mulai" buttons go. CI sets PUBLIC_APP_URL; falls back to the configured domain. */
export const appUrl: string =
  import.meta.env.PUBLIC_APP_URL ??
  (product.domain.app ? `https://${product.domain.app}` : "https://factory-template.erdiprtm.workers.dev");

/** "production" only on the production build; previews and local show the legal TEMPLATE banner. */
export const isProduction = import.meta.env.PUBLIC_APP_ENV === "production";

/** OpenPanel client ID, only on production builds: previews and dev send nothing. */
export const analyticsClientId = (isProduction && product.analytics.openpanelClientId) || undefined;

/** Legal pages show the TEMPLATE banner until a lawyer reviewed them AND it's a production build. */
export const showLegalBanner = !(isProduction && product.legal.reviewed);

/** Fills {{placeholders}} in legal/SEO content from product.config.ts. */
export function fillPlaceholders(text: string): string {
  const values: Record<string, string> = {
    name: product.name,
    companyName: product.legal.companyName,
    contactEmail: product.legal.contactEmail,
    trialDays: String(product.trial.days),
    planList: product.plans.map((p) => `${p.label} (${idr(p.priceIdr)})`).join(", "),
    refundPolicy: product.legal.refundPolicy,
    productDataDescription: product.legal.productDataDescription,
  };
  return text.replace(/\{\{(\w+)\}\}/g, (match, key: string) => values[key] ?? match);
}

export const faqs = [
  {
    q: "Apakah langganan diperpanjang otomatis?",
    a: "Tidak. Kamu membayar sekali di muka untuk 6 atau 12 bulan. Perpanjangan adalah pembelian baru, dan kami mengingatkan sebelum masa aktif habis.",
  },
  {
    q: "Kalau saya memperpanjang lebih awal, sisa hari hangus?",
    a: "Tidak. Masa baru dimulai setelah masa aktif sekarang berakhir, jadi tidak ada hari yang hilang.",
  },
  {
    q: "Bisa bayar pakai apa?",
    a: "QRIS, e-wallet (seperti DANA, ShopeePay, OVO), dan virtual account bank.",
  },
  {
    q: "Ada masa coba gratis?",
    a: `Ada, ${product.trial.days} hari, satu kali per akun. Tidak perlu kartu kredit.`,
  },
  {
    q: "Bagaimana dengan data saya?",
    a: "Data kamu dilindungi sesuai UU Pelindungan Data Pribadi. Kamu bisa mengunduh atau menghapus data kapan saja dari menu Akun.",
  },
];
