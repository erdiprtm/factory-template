import type { CheckoutInput, PaymentProvider, ProviderStatus, WebhookResult } from "./provider";

/**
 * In-memory provider for tests and local dev without sandbox credentials. Webhooks are signed
 * with a shared secret in an `x-fake-signature` header so the signature path is exercised too.
 */
export class FakeProvider implements PaymentProvider {
  readonly name = "fake";
  readonly checkouts: CheckoutInput[] = [];
  readonly statuses = new Map<string, ProviderStatus>();
  /** Tests set this to act like DOKU's missed-webhook fallback (D-128); unset acts like Duitku. */
  statusFallbackMs?: number;
  /** How many times getStatus was called, per payment (tests check the throttle). */
  readonly statusCalls = new Map<string, number>();

  constructor(private readonly secret = "fake-secret") {}

  async createCheckout(input: CheckoutInput) {
    this.checkouts.push(input);
    this.statuses.set(input.paymentId, "pending");
    // Local dev "hosted payment page": apps/api serves /api/dev/fake-pay (development + localhost only).
    const origin = new URL(input.successUrl).origin;
    return {
      redirectUrl: `${origin}/api/dev/fake-pay?paymentId=${input.paymentId}`,
      providerRef: `FAKE-${input.paymentId}`,
    };
  }

  async verifyWebhook(request: Request): Promise<WebhookResult | null> {
    if (request.headers.get("x-fake-signature") !== this.secret) return null;
    const body = (await request.json()) as { eventId: string; paymentId: string; status: WebhookResult["status"] };
    return {
      eventKey: body.eventId,
      paymentId: body.paymentId,
      providerRef: `FAKE-${body.paymentId}`,
      status: body.status,
      raw: body,
    };
  }

  async getStatus(paymentId: string): Promise<ProviderStatus> {
    this.statusCalls.set(paymentId, (this.statusCalls.get(paymentId) ?? 0) + 1);
    return this.statuses.get(paymentId) ?? "pending";
  }

  webhookAck(): Response {
    return new Response("OK");
  }

  /** Test helper: mark paid at the "provider" and build the matching signed webhook request. */
  pay(paymentId: string, eventId = crypto.randomUUID()): Request {
    this.statuses.set(paymentId, "paid");
    return this.webhook(paymentId, "paid", eventId);
  }

  webhook(paymentId: string, status: WebhookResult["status"], eventId = crypto.randomUUID(), secret = this.secret) {
    return new Request("https://api.example/api/webhooks/fake", {
      method: "POST",
      headers: { "content-type": "application/json", "x-fake-signature": secret },
      body: JSON.stringify({ eventId, paymentId, status }),
    });
  }
}
