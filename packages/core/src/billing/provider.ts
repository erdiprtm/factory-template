// Provider-agnostic payments (FACTORY_BLUEPRINT.md Section 6). Duitku, DOKU and Pakasir (D-092);
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
  /** The one method the buyer picked in our own checkout (Pakasir, D-092). Hosted pages ignore it. */
  method?: string;
};

/**
 * What the buyer needs to pay in our own checkout screen (Pakasir, D-092): the QR string or the
 * VA number, and the total with the provider's fee. Hosted-page providers return none.
 */
export type Charge = {
  method: string;
  feeIdr: number;
  totalIdr: number;
  qrString: string | null;
  vaNumber: string | null;
  providerExpiresAt: Date;
  isSandbox: boolean;
};

/** What a status check needs besides our payment id (Pakasir asks by its own transaction id). */
export type PaymentRef = { providerRef: string | null; amountIdr: number };

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
  createCheckout(input: CheckoutInput): Promise<{ redirectUrl: string; providerRef: string; charge?: Charge }>;
  /** Verifies the signature. Returns null for a bad signature (the route answers 401). */
  verifyWebhook(request: Request): Promise<WebhookResult | null>;
  /** Asks the provider directly; never grant access on the webhook body alone. */
  getStatus(paymentId: string, ref?: PaymentRef): Promise<ProviderStatus>;
  /**
   * Set when the provider allows status polling (Pakasir: once per transaction every 4 s). The
   * status endpoint then asks the provider too, at most once per this many ms per payment.
   * Unset (Duitku, DOKU): only the webhook asks, because Duitku blocks merchants that poll.
   */
  readonly statusIntervalMs?: number;
  /** True when the buyer picks one method in the app's own checkout first (Pakasir, D-092). */
  readonly needsMethod?: boolean;
  /** Cancels an unpaid transaction at the provider (Pakasir). True when the provider confirmed. */
  cancel?(paymentId: string, ref: PaymentRef): Promise<boolean>;
  /** HTTP response body the provider expects after a processed webhook. */
  webhookAck(): Response;
}
