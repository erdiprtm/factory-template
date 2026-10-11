import { defineProduct } from "@factory/config";

// THE file a new product edits first. Everything that differs between products and
// isn't feature code lives here. Validated by packages/config on every build.
export default defineProduct({
  slug: "factory-template",
  name: "Factory Template",
  tagline: "Template untuk membangun produk web dengan cepat.",
  locale: { default: "id", supported: ["id", "en"] },
  domain: { app: null, site: null },
  brand: {
    tokens: {
      colors: {
        light: { background: "#ffffff", foreground: "#0f172a", primary: "#2563eb", primaryForeground: "#ffffff" },
        dark: { background: "#0b1120", foreground: "#e2e8f0", primary: "#60a5fa", primaryForeground: "#0b1120" },
      },
      radius: "0.75rem",
      fontFamily: { sans: "Inter, system-ui, sans-serif" },
    },
    logo: "/logo.svg",
    favicon: "/favicon.svg",
  },
  trial: { enabled: true, days: 7 },
  plans: [
    { id: "6m", label: "6 bulan", months: 6, priceIdr: 149000 },
    { id: "12m", label: "12 bulan", months: 12, priceIdr: 249000, highlight: true },
  ],
  payments: {
    provider: "duitku",
    methods: ["QRIS", "DANA", "SHOPEEPAY", "OVO", "VIRTUAL_ACCOUNT"],
  },
  legal: { companyName: "PT Contoh Studio", contactEmail: "halo@example.com", sensitiveDataConsent: false },
  admin: { emails: [] },
});
