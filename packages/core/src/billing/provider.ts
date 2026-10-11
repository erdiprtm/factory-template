// Provider-agnostic payments (FACTORY_BLUEPRINT.md Section 6). Duitku and DOKU;
// Xendit/Midtrans later need only a new class implementing this and a config switch.

export type CheckoutInput = {
  paymentId: string;
  amountIdr: number;
  planId: string;
  customer: { name: string; email: string };
  methods: string[];
  successUrl: string;
  failureUrl: string;
  callbackUrl: string;
  expiresInMinutes: number;
};

export type WebhookResult = {
  /** Unique per provider event; webhook_events.event_key makes processing idempotent. */
  eventKey: string;
  /** Our payment id as echoed by the provider (Duitku: merchantOrderId). */
  paymentId: string;
  providerRef: string | null;
  status: "paid" | "failed" | "expired" | "pending";
  raw: unknown;
};

export type ProviderStatus = "paid" | "pending" | "failed" | "expired";

export interface PaymentProvider {
  readonly name: string;
  createCheckout(input: CheckoutInput): Promise<{ redirectUrl: string; providerRef: string }>;
  /** Verifies the signature. Returns null for a bad signature (the route answers 401). */
  verifyWebhook(request: Request): Promise<WebhookResult | null>;
  /** Asks the provider directly; never grant access on the webhook body alone. */
  getStatus(paymentId: string): Promise<ProviderStatus>;
  /** HTTP response body the provider expects after a processed webhook. */
  webhookAck(): Response;
}
