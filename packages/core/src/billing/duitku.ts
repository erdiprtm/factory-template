import type { CheckoutInput, PaymentProvider, ProviderStatus, WebhookResult } from "./provider";

// Duitku POP (docs.duitku.com/pop/en, /api/en, read 2026-10-11). All signatures are
// HMAC-SHA256(key = apiKey) as lowercase hex since Apr 2026; MD5/SHA256 are obsolete.

const HOSTS = {
  sandbox: {
    invoice: "https://api-sandbox.duitku.com/api/merchant/createInvoice",
    status: "https://sandbox.duitku.com/webapi/api/merchant/transactionStatus",
  },
  production: {
    invoice: "https://api-prod.duitku.com/api/merchant/createInvoice",
    status: "https://passport.duitku.com/webapi/api/merchant/transactionStatus",
  },
} as const;

/** Duitku's minimum transaction amount. */
export const DUITKU_MIN_AMOUNT_IDR = 10_000;

const encoder = new TextEncoder();

export async function hmacSha256Hex(key: string, message: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export type DuitkuConfig = {
  merchantCode: string;
  apiKey: string;
  mode: "sandbox" | "production";
  fetchImpl?: typeof fetch;
  now?: () => number;
};

export class DuitkuProvider implements PaymentProvider {
  readonly name = "duitku";
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;

  constructor(private readonly config: DuitkuConfig) {
    this.fetchImpl = config.fetchImpl ?? ((...args) => fetch(...args));
    this.now = config.now ?? Date.now;
  }

  async createCheckout(input: CheckoutInput): Promise<{ redirectUrl: string; providerRef: string }> {
    if (!Number.isInteger(input.amountIdr) || input.amountIdr < DUITKU_MIN_AMOUNT_IDR) {
      throw new Error(`Duitku needs an integer amount of at least ${DUITKU_MIN_AMOUNT_IDR} IDR`);
    }
    const timestamp = String(this.now());
    const signature = await hmacSha256Hex(this.config.apiKey, this.config.merchantCode + timestamp);
    const body = {
      paymentAmount: input.amountIdr,
      merchantOrderId: input.paymentId,
      productDetails: `Langganan ${input.planId}`,
      email: input.customer.email,
      customerVaName: input.customer.name.slice(0, 20),
      // One item equal to the total: Duitku requires item prices to sum to paymentAmount.
      itemDetails: [{ name: `Langganan ${input.planId}`.slice(0, 50), price: input.amountIdr, quantity: 1 }],
      customerDetail: { firstName: input.customer.name.slice(0, 50), email: input.customer.email },
      callbackUrl: input.callbackUrl,
      returnUrl: input.successUrl,
      expiryPeriod: input.expiresInMinutes,
      // POP can't take a subset of methods: empty shows every channel enabled on the Duitku
      // project, so channels are chosen in the Duitku dashboard (docs/DECISIONS.md D-017).
      paymentMethod: "",
    };
    const res = await this.fetchImpl(HOSTS[this.config.mode].invoice, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-duitku-merchantcode": this.config.merchantCode,
        "x-duitku-timestamp": timestamp,
        "x-duitku-signature": signature,
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let json: { paymentUrl?: string; reference?: string; statusCode?: string } = {};
    try {
      json = JSON.parse(text);
    } catch {
      // error bodies aren't documented; keep the raw status
    }
    if (!res.ok || json.statusCode !== "00" || !json.paymentUrl || !json.reference) {
      throw new Error(`Duitku createInvoice failed (HTTP ${res.status}, statusCode ${json.statusCode ?? "-"})`);
    }
    return { redirectUrl: json.paymentUrl, providerRef: json.reference };
  }

  async verifyWebhook(request: Request): Promise<WebhookResult | null> {
    // The callback is application/x-www-form-urlencoded.
    const form = new URLSearchParams(await request.text().catch(() => ""));
    const field = (k: string) => form.get(k) ?? "";
    const merchantCode = field("merchantCode");
    const amount = field("amount"); // raw string, never re-formatted
    const merchantOrderId = field("merchantOrderId");
    const signature = field("signature").toLowerCase();
    if (!merchantCode || !amount || !merchantOrderId || !signature) return null;
    if (merchantCode !== this.config.merchantCode) return null;
    const expected = await hmacSha256Hex(this.config.apiKey, merchantCode + amount + merchantOrderId);
    if (!timingSafeEqual(signature, expected)) return null;

    const resultCode = field("resultCode");
    const reference = field("reference") || null;
    const raw: Record<string, string> = {};
    for (const [k, v] of form.entries()) raw[k] = v;
    return {
      // Retries resend the same payload, so this key repeats and the event is processed once.
      eventKey: `${merchantOrderId}:${resultCode}:${reference ?? ""}`,
      paymentId: merchantOrderId,
      providerRef: reference,
      // Docs disagree on the failure code (01 vs 02); only "00" means paid.
      status: resultCode === "00" ? "paid" : "failed",
      raw,
    };
  }

  /** One call per webhook only: Duitku blocks merchants that poll this endpoint too often. */
  async getStatus(paymentId: string): Promise<ProviderStatus> {
    const signature = await hmacSha256Hex(this.config.apiKey, this.config.merchantCode + paymentId);
    const res = await this.fetchImpl(HOSTS[this.config.mode].status, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ merchantCode: this.config.merchantCode, merchantOrderId: paymentId, signature }),
    });
    if (!res.ok) return "pending";
    const json = (await res.json().catch(() => ({}))) as { statusCode?: string };
    if (json.statusCode === "00") return "paid";
    if (json.statusCode === "02") return "failed";
    return "pending";
  }

  webhookAck(): Response {
    return new Response("OK", { status: 200 });
  }
}
