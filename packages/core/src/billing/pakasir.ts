import { pakasirMethod } from "./pakasir-methods";
import type { Charge, CheckoutInput, PaymentProvider, PaymentRef, ProviderStatus, WebhookResult } from "./provider";

// Pakasir API v2 (D-092). Docs read 2026-10-19: pakasir.com/p/create-transaction,
// /p/transaction-status, /p/cancel-transaction, /p/webhook, /p/get-started. v1 ends 2026-10-20.
// - One host for sandbox and live: a project starts in sandbox and goes live after Project KYC,
//   so the mode is a property of the project. `is_sandbox` on every transaction tells them apart.
// - Auth: `X-Api-Key` header. Create and cancel: 2 requests/s. Status: once per transaction every 4 s.
// - The webhook (one URL per project, set in its dashboard) carries the project's secret in
//   `X-Secret`. It is only sent for a completed payment; we confirm with the status API anyway.

export const PAKASIR_API = "https://app.pakasir.com/api/v2";
/** Pakasir: "1 request setiap 4 detik per transaksi" for transaction-status. */
export const PAKASIR_STATUS_INTERVAL_MS = 4000;

export type PakasirConfig = {
  slug: string;
  apiKey: string;
  webhookSecret: string;
  /** "sandbox" unless the human switched the product live (PAKASIR_MODE, Operating rule 7). */
  mode: "sandbox" | "live";
  fetchImpl?: typeof fetch;
  baseUrl?: string;
};

type CreateResponse = {
  txn_id?: string;
  order_id?: string;
  amount?: number;
  fee?: number;
  total_payment?: number;
  payment_method?: string;
  qr_string?: string;
  va_number?: string;
  expired_at?: string;
  is_sandbox?: boolean;
};

type StatusResponse = {
  txn_id?: string;
  order_id?: string;
  amount?: number;
  is_sandbox?: boolean;
  status?: string;
  completed_at?: string;
};

const encoder = new TextEncoder();

/** Constant-time string comparison: both sides are hashed first, so length leaks nothing either. */
export async function secretsMatch(given: string, expected: string): Promise<boolean> {
  if (!expected) return false;
  const hash = async (s: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(s)));
  const a = await hash(given);
  const b = await hash(expected);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

const seg = (s: string) => encodeURIComponent(s);

export class PakasirProvider implements PaymentProvider {
  readonly name = "pakasir";
  readonly statusIntervalMs = PAKASIR_STATUS_INTERVAL_MS;
  readonly needsMethod = true;
  private readonly fetchImpl: typeof fetch;
  private readonly base: string;

  constructor(private readonly config: PakasirConfig) {
    this.fetchImpl = config.fetchImpl ?? ((...args) => fetch(...args));
    this.base = config.baseUrl ?? PAKASIR_API;
  }

  private request(method: "GET" | "POST", path: string, body?: unknown) {
    return this.fetchImpl(`${this.base}${path}`, {
      method,
      headers: {
        "X-Api-Key": this.config.apiKey,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  async createCheckout(input: CheckoutInput): Promise<{ redirectUrl: string; providerRef: string; charge: Charge }> {
    const method = input.method ? pakasirMethod(input.method) : undefined;
    if (!method || !input.methods.includes(method.code)) throw new Error("Pakasir needs one configured method");
    const amount = input.amountIdr;
    if (!Number.isInteger(amount) || amount < method.minIdr || amount > method.maxIdr) {
      throw new Error(`Pakasir ${method.code} takes ${method.minIdr}–${method.maxIdr} IDR`);
    }
    // "Find or create": repeating the same order id and body returns the same transaction.
    const res = await this.request("POST", `/create-transaction/${seg(this.config.slug)}/${seg(input.paymentId)}`, {
      method: method.code,
      amount,
    });
    const json = (await res.json().catch(() => ({}))) as CreateResponse;
    const qr = json.qr_string || null;
    const va = json.va_number || null;
    const expires = json.expired_at ? new Date(json.expired_at) : null;
    const total = json.total_payment ?? Number.NaN;
    if (
      !res.ok ||
      !json.txn_id ||
      json.order_id !== input.paymentId ||
      json.amount !== amount ||
      json.payment_method !== method.code ||
      !Number.isInteger(total) ||
      total < amount ||
      !expires ||
      Number.isNaN(expires.getTime()) ||
      (method.kind === "qris" ? !qr : !va)
    ) {
      throw new Error(`Pakasir create-transaction failed (HTTP ${res.status})`);
    }
    const isSandbox = json.is_sandbox === true;
    // Sandbox mode never takes real money (previews, CI, before the human goes live), and live
    // mode never sells access for a sandbox transaction. A mismatch is cancelled at once.
    if (isSandbox !== (this.config.mode === "sandbox")) {
      await this.cancel(input.paymentId, { providerRef: json.txn_id, amountIdr: amount }).catch(() => false);
      throw new Error(`Pakasir returned a ${isSandbox ? "sandbox" : "live"} transaction in ${this.config.mode} mode`);
    }
    const origin = new URL(input.successUrl).origin;
    return {
      redirectUrl: `${origin}/billing/pay?paymentId=${input.paymentId}`,
      providerRef: json.txn_id,
      charge: {
        method: method.code,
        feeIdr: total - amount,
        totalIdr: total,
        qrString: method.kind === "qris" ? qr : null,
        vaNumber: method.kind === "va" ? va : null,
        providerExpiresAt: expires,
        isSandbox,
      },
    };
  }

  async verifyWebhook(request: Request): Promise<WebhookResult | null> {
    if (!(await secretsMatch(request.headers.get("x-secret") ?? "", this.config.webhookSecret))) return null;
    const body = (await request.json().catch(() => ({}))) as StatusResponse;
    const orderId = typeof body.order_id === "string" ? body.order_id : "";
    const txnId = typeof body.txn_id === "string" ? body.txn_id : "";
    return {
      // A retry repeats the body, so it repeats this key and is processed once.
      eventKey: `${orderId}:${txnId}:${body.status ?? ""}`,
      paymentId: orderId,
      providerRef: txnId || null,
      // Only a hint: handleWebhook grants on the status API's answer, never on this body.
      status: body.status === "completed" ? "paid" : "pending",
      raw: body,
    };
  }

  /**
   * Paid only when the status API says `completed` for this exact transaction, order id and
   * amount, and (live mode) it isn't a sandbox transaction. Any mismatch is "failed": logged,
   * never granted. Errors and rate limits are "pending" (asked again later).
   */
  async getStatus(paymentId: string, ref?: PaymentRef): Promise<ProviderStatus> {
    if (!ref?.providerRef) return "pending";
    const res = await this.request("GET", `/transaction-status/${seg(this.config.slug)}/${seg(ref.providerRef)}`);
    if (!res.ok) return "pending";
    const json = (await res.json().catch(() => ({}))) as StatusResponse;
    if (json.txn_id !== ref.providerRef || json.order_id !== paymentId || json.amount !== ref.amountIdr) {
      console.warn("pakasir status mismatch", { paymentId, txn: ref.providerRef });
      return "failed";
    }
    if (this.config.mode === "live" && json.is_sandbox !== false) {
      console.warn("pakasir sandbox transaction in live mode", { paymentId });
      return "failed";
    }
    if (json.status === "completed") return "paid";
    // "canceled": from the dashboard, by us, or after 1×24 hours.
    if (json.status === "canceled") return "expired";
    return "pending";
  }

  async cancel(_paymentId: string, ref: PaymentRef): Promise<boolean> {
    if (!ref.providerRef) return false;
    const res = await this.request("POST", `/cancel-transaction/${seg(this.config.slug)}/${seg(ref.providerRef)}`);
    return res.ok;
  }

  webhookAck(): Response {
    return new Response("OK", { status: 200 });
  }
}
