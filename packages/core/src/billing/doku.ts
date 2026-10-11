import type { CheckoutInput, PaymentProvider, ProviderStatus, WebhookResult } from "./provider";

// DOKU Checkout, non-SNAP API (developers.doku.com, read 2026-10-11):
//   accept-payments/doku-checkout/integration-guide/backend-integration
//   get-started-with-doku-api/signature-component/non-snap/*
//   get-started-with-doku-api/notification/{best-practice,retry-notification}
//   get-started-with-doku-api/check-status-api/non-snap
// Signature = "HMACSHA256=" + base64(HMAC-SHA256(secretKey, components joined by "\n")), where the
// components are Client-Id, Request-Id, Request-Timestamp, Request-Target (path only) and, for
// requests with a body, Digest = base64(SHA-256(body)). GET requests have no Digest line.

const HOSTS = {
  sandbox: "https://api-sandbox.doku.com",
  production: "https://api.doku.com",
} as const;

const CHECKOUT_PATH = "/checkout/v1/payment";
const statusPath = (invoice: string) => `/orders/v1/status/${encodeURIComponent(invoice)}`;

const encoder = new TextEncoder();

function toBase64(bytes: ArrayBuffer): string {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s);
}

export async function sha256Base64(body: string): Promise<string> {
  return toBase64(await crypto.subtle.digest("SHA-256", encoder.encode(body)));
}

export async function dokuSignature(
  secretKey: string,
  parts: { clientId: string; requestId: string; timestamp: string; target: string; digest?: string },
): Promise<string> {
  const lines = [
    `Client-Id:${parts.clientId}`,
    `Request-Id:${parts.requestId}`,
    `Request-Timestamp:${parts.timestamp}`,
    `Request-Target:${parts.target}`,
  ];
  if (parts.digest !== undefined) lines.push(`Digest:${parts.digest}`);
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secretKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(lines.join("\n")));
  return `HMACSHA256=${toBase64(sig)}`;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * DOKU invoice numbers: alphanumeric is safest (some channels reject symbols). Our payment ids are
 * `pay_<32 hex>`, so the invoice is the hex part and maps back without a lookup.
 */
export const dokuInvoice = (paymentId: string) => paymentId.replace(/^pay_/, "");
const paymentIdFromInvoice = (invoice: string) => `pay_${invoice}`;

/**
 * DOKU → our status. FAILED is NOT final in Checkout: the customer can retry with another channel
 * on the same page and a SUCCESS can follow ("you must ignore the transaction.status FAILED").
 * Unpaid checkouts end as EXPIRED (or our own expiry cron).
 */
function mapStatus(status: string | undefined): ProviderStatus {
  switch (status) {
    case "SUCCESS":
      return "paid";
    case "EXPIRED":
      return "expired";
    case "REFUNDED":
    case "VOIDED":
      return "failed";
    default:
      return "pending"; // PENDING, FAILED, REDIRECT, TIMEOUT, unknown
  }
}

export type DokuConfig = {
  clientId: string;
  secretKey: string;
  mode: "sandbox" | "production";
  fetchImpl?: typeof fetch;
  now?: () => number;
  requestId?: () => string;
};

type DokuBody = {
  order?: { invoice_number?: string; amount?: number };
  transaction?: { status?: string; date?: string; original_request_id?: string };
};

export class DokuProvider implements PaymentProvider {
  readonly name = "doku";
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly requestId: () => string;

  constructor(private readonly config: DokuConfig) {
    this.fetchImpl = config.fetchImpl ?? ((...args) => fetch(...args));
    this.now = config.now ?? Date.now;
    this.requestId = config.requestId ?? (() => crypto.randomUUID());
  }

  /** ISO 8601 UTC without milliseconds, e.g. 2026-10-11T06:30:00Z. */
  private timestamp(): string {
    return new Date(this.now()).toISOString().replace(/\.\d{3}Z$/, "Z");
  }

  private async headers(target: string, body?: string): Promise<Record<string, string>> {
    const requestId = this.requestId();
    const timestamp = this.timestamp();
    const digest = body === undefined ? undefined : await sha256Base64(body);
    const signature = await dokuSignature(this.config.secretKey, {
      clientId: this.config.clientId,
      requestId,
      timestamp,
      target,
      digest,
    });
    return {
      "Client-Id": this.config.clientId,
      "Request-Id": requestId,
      "Request-Timestamp": timestamp,
      Signature: signature,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    };
  }

  async createCheckout(input: CheckoutInput): Promise<{ redirectUrl: string; providerRef: string }> {
    if (!Number.isInteger(input.amountIdr) || input.amountIdr <= 0) {
      throw new Error("DOKU needs a positive integer IDR amount");
    }
    const name = `Langganan ${input.planId}`;
    const body = JSON.stringify({
      order: {
        amount: input.amountIdr,
        invoice_number: dokuInvoice(input.paymentId),
        currency: "IDR",
        callback_url: input.successUrl,
        callback_url_result: input.successUrl,
        callback_url_cancel: input.failureUrl,
        language: "ID",
        auto_redirect: true,
        line_items: [{ id: input.planId, name: name.slice(0, 255), price: input.amountIdr, quantity: 1 }],
      },
      // payment_method_types omitted: the checkout shows every channel enabled in the DOKU
      // dashboard, like Duitku POP (docs/DECISIONS.md D-017).
      payment: { payment_due_date: input.expiresInMinutes },
      customer: { name: input.customer.name.slice(0, 255), email: input.customer.email.slice(0, 128) },
    });
    // The digest is computed over exactly the bytes sent.
    const res = await this.fetchImpl(`${HOSTS[this.config.mode]}${CHECKOUT_PATH}`, {
      method: "POST",
      headers: await this.headers(CHECKOUT_PATH, body),
      body,
    });
    const json = (await res.json().catch(() => ({}))) as {
      response?: { payment?: { url?: string; token_id?: string } };
      error_messages?: string[];
    };
    const url = json.response?.payment?.url;
    const token = json.response?.payment?.token_id;
    if (!res.ok || !url || !token) {
      const why = json.error_messages?.join("; ") ?? "-";
      throw new Error(`DOKU checkout failed (HTTP ${res.status}: ${why})`);
    }
    return { redirectUrl: url, providerRef: token };
  }

  async verifyWebhook(request: Request): Promise<WebhookResult | null> {
    const h = (k: string) => request.headers.get(k) ?? "";
    const clientId = h("client-id");
    const requestId = h("request-id");
    const timestamp = h("request-timestamp");
    const signature = h("signature");
    if (!clientId || !requestId || !timestamp || !signature) return null;
    if (clientId !== this.config.clientId) return null;

    // Digest over the raw body as received, never a re-serialized copy.
    const raw = await request.text().catch(() => "");
    const expected = await dokuSignature(this.config.secretKey, {
      clientId,
      requestId,
      timestamp,
      target: new URL(request.url).pathname,
      digest: await sha256Base64(raw),
    });
    if (!timingSafeEqual(signature, expected)) return null;

    let body: DokuBody;
    try {
      body = JSON.parse(raw) as DokuBody;
    } catch {
      return null;
    }
    const invoice = body.order?.invoice_number;
    if (!invoice) return null;
    const txStatus = body.transaction?.status ?? "UNKNOWN";
    return {
      // Retries of one notification repeat this key; a later SUCCESS after a FAILED is a new event.
      eventKey: `${invoice}:${txStatus}:${body.transaction?.original_request_id ?? requestId}`,
      paymentId: paymentIdFromInvoice(invoice),
      providerRef: null,
      status: mapStatus(txStatus),
      raw: body,
    };
  }

  async getStatus(paymentId: string): Promise<ProviderStatus> {
    const target = statusPath(dokuInvoice(paymentId));
    const res = await this.fetchImpl(`${HOSTS[this.config.mode]}${target}`, {
      method: "GET",
      headers: await this.headers(target),
    });
    // Not Found until a channel has a transaction for the invoice: still pending.
    if (!res.ok) return "pending";
    const json = (await res.json().catch(() => ({}))) as DokuBody;
    return mapStatus(json.transaction?.status);
  }

  webhookAck(): Response {
    return new Response("OK", { status: 200 });
  }
}
