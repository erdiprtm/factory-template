// Pakasir API v2 payment methods (pakasir.com/p/create-transaction, read 2026-10-19, D-092).
// Pure data: the app imports it (through @factory/core/pricing) for labels and limits.
// `payment_link` (Pakasir's hosted page) is left out: the template shows its own checkout.

export type PakasirMethod = {
  code: string;
  label: string;
  /** The bank's short name, for compact chips ("VA BRI · BNI", D-098). QRIS has none. */
  bank?: string;
  kind: "qris" | "va";
  minIdr: number;
  maxIdr: number;
};

export const PAKASIR_METHODS: readonly PakasirMethod[] = [
  { code: "qris", label: "QRIS", kind: "qris", minIdr: 500, maxIdr: 10_000_000 },
  { code: "bri_va", label: "BRI Virtual Account", bank: "BRI", kind: "va", minIdr: 10_000, maxIdr: 50_000_000 },
  { code: "bni_va", label: "BNI Virtual Account", bank: "BNI", kind: "va", minIdr: 10_000, maxIdr: 50_000_000 },
  {
    code: "cimb_niaga_va",
    label: "CIMB Niaga Virtual Account",
    bank: "CIMB Niaga",
    kind: "va",
    minIdr: 10_000,
    maxIdr: 50_000_000,
  },
  {
    code: "maybank_va",
    label: "Maybank Virtual Account",
    bank: "Maybank",
    kind: "va",
    minIdr: 10_000,
    maxIdr: 50_000_000,
  },
  {
    code: "danamon_va",
    label: "Danamon Virtual Account",
    bank: "Danamon",
    kind: "va",
    minIdr: 10_000,
    maxIdr: 50_000_000,
  },
  {
    code: "bnc_va",
    label: "Bank Neo Commerce Virtual Account",
    bank: "BNC",
    kind: "va",
    minIdr: 10_000,
    maxIdr: 50_000_000,
  },
  { code: "bsi_va", label: "BSI Virtual Account", bank: "BSI", kind: "va", minIdr: 10_000, maxIdr: 50_000_000 },
  {
    code: "muamalat_va",
    label: "Muamalat Virtual Account",
    bank: "Muamalat",
    kind: "va",
    minIdr: 10_000,
    maxIdr: 50_000_000,
  },
  { code: "ocbc_va", label: "OCBC Virtual Account", bank: "OCBC", kind: "va", minIdr: 10_000, maxIdr: 50_000_000 },
];

export const pakasirMethod = (code: string): PakasirMethod | undefined => PAKASIR_METHODS.find((m) => m.code === code);

/**
 * The configured methods that can take this amount, QRIS first, then the rest in config order
 * (D-092). Unknown codes are dropped.
 */
export function pakasirMethodsFor(codes: readonly string[], amountIdr: number): PakasirMethod[] {
  const usable: PakasirMethod[] = [];
  for (const code of codes) {
    const m = pakasirMethod(code);
    if (m && amountIdr >= m.minIdr && amountIdr <= m.maxIdr) usable.push(m);
  }
  return [...usable.filter((m) => m.kind === "qris"), ...usable.filter((m) => m.kind !== "qris")];
}
