import { createHash, createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { DokuProvider, dokuInvoice, dokuSignature, sha256Base64 } from "./doku";

const CLIENT = "BRN-0001-1700000000000";
const SECRET = "SK-sandbox-secret";
const PAYMENT_ID = `pay_${"ab12".repeat(8)}`;
const INVOICE = "ab12".repeat(8);

// Independent reference implementation with Node's crypto (DOKU non-SNAP docs).
const nodeDigest = (body: string) => createHash("sha256").update(body).digest("base64");
const nodeSign = (lines: string[]) =>
  `HMACSHA256=${createHmac("sha256", SECRET).update(lines.join("\n")).digest("base64")}`;

const input = {
  paymentId: PAYMENT_ID,
  amountIdr: 149000,
  planId: "6m",
  customer: { name: "Budi Santoso", email: "budi@example.com" },
  methods: ["QRIS"],
  successUrl: `https://app.example/billing/return?paymentId=${PAYMENT_ID}`,
  failureUrl: `https://app.example/billing/return?paymentId=${PAYMENT_ID}`,
  callbackUrl: "https://app.example/api/webhooks/doku",
  expiresInMinutes: 60,
};

const provider = (fetchImpl: typeof fetch = vi.fn()) =>
  new DokuProvider({
    clientId: CLIENT,
    secretKey: SECRET,
    mode: "sandbox",
    fetchImpl,
    now: () => Date.parse("2026-10-11T06:30:00.123Z"),
    requestId: () => "req-1",
  });

/** A notification exactly as DOKU would sign it for our /api/webhooks/doku path. */
function notification(body: object, opts: { secret?: string; path?: string; tamper?: boolean } = {}) {
  const raw = JSON.stringify(body);
  const lines = [
    `Client-Id:${CLIENT}`,
    "Request-Id:notif-1",
    "Request-Timestamp:2026-10-11T06:31:00Z",
    `Request-Target:${opts.path ?? "/api/webhooks/doku"}`,
    `Digest:${nodeDigest(raw)}`,
  ];
  const signature = `HMACSHA256=${createHmac("sha256", opts.secret ?? SECRET)
    .update(lines.join("\n"))
    .digest("base64")}`;
  return new Request("https://app.example/api/webhooks/doku", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "Client-Id": CLIENT,
      "Request-Id": "notif-1",
      "Request-Timestamp": "2026-10-11T06:31:00Z",
      Signature: signature,
    },
    body: opts.tamper ? raw.replace("149000", "1000") : raw,
  });
}

const paid = (status = "SUCCESS") => ({
  order: { invoice_number: INVOICE, amount: 149000 },
  transaction: { status, date: "2026-10-11T06:31:00Z", original_request_id: "req-1" },
  service: { id: "VIRTUAL_ACCOUNT" },
  channel: { id: "VIRTUAL_ACCOUNT_BCA" },
  extra_new_field: true,
});

describe("DOKU signature helpers", () => {
  it("digest and signature match Node's SHA-256 / HMAC-SHA256 base64", async () => {
    expect(await sha256Base64('{"a":1}')).toBe(nodeDigest('{"a":1}'));
    const parts = { clientId: CLIENT, requestId: "r", timestamp: "2026-10-11T06:30:00Z", target: "/x" };
    expect(await dokuSignature(SECRET, { ...parts, digest: "d" })).toBe(
      nodeSign([
        `Client-Id:${CLIENT}`,
        "Request-Id:r",
        "Request-Timestamp:2026-10-11T06:30:00Z",
        "Request-Target:/x",
        "Digest:d",
      ]),
    );
    // GET requests: no Digest line.
    expect(await dokuSignature(SECRET, parts)).toBe(
      nodeSign([`Client-Id:${CLIENT}`, "Request-Id:r", "Request-Timestamp:2026-10-11T06:30:00Z", "Request-Target:/x"]),
    );
  });

  it("invoice number is the alphanumeric part of our payment id", () => {
    expect(dokuInvoice(PAYMENT_ID)).toBe(INVOICE);
    expect(dokuInvoice(PAYMENT_ID)).toMatch(/^[a-z0-9]{1,64}$/);
  });
});

describe("DokuProvider.createCheckout", () => {
  it("signs the exact body sent and returns the hosted checkout URL", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            message: ["SUCCESS"],
            response: {
              payment: {
                url: "https://sandbox.doku.com/checkout-link-v2/abc",
                token_id: "tok-abc",
                expired_date: "20261011143000",
              },
            },
          }),
        ),
    );
    const out = await provider(fetchImpl).createCheckout(input);
    expect(out).toEqual({ redirectUrl: "https://sandbox.doku.com/checkout-link-v2/abc", providerRef: "tok-abc" });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api-sandbox.doku.com/checkout/v1/payment");
    const headers = init.headers as Record<string, string>;
    const body = init.body as string;
    expect(headers["Request-Timestamp"]).toBe("2026-10-11T06:30:00Z");
    expect(headers.Signature).toBe(
      nodeSign([
        `Client-Id:${CLIENT}`,
        "Request-Id:req-1",
        "Request-Timestamp:2026-10-11T06:30:00Z",
        "Request-Target:/checkout/v1/payment",
        `Digest:${nodeDigest(body)}`,
      ]),
    );
    expect(JSON.parse(body)).toMatchObject({
      order: {
        amount: 149000,
        invoice_number: INVOICE,
        callback_url: input.successUrl,
        line_items: [{ price: 149000, quantity: 1 }],
      },
      payment: { payment_due_date: 60 },
      customer: { email: "budi@example.com" },
    });
  });

  it("throws with DOKU's error messages on failure", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ error_messages: ["order.invoice_number must be filled"] }), { status: 400 }),
    );
    await expect(provider(fetchImpl).createCheckout(input)).rejects.toThrow(/invoice_number must be filled/);
  });

  it("rejects non-integer amounts before calling the API", async () => {
    const fetchImpl = vi.fn();
    await expect(provider(fetchImpl).createCheckout({ ...input, amountIdr: 1.5 })).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("DokuProvider.verifyWebhook", () => {
  it("accepts a correctly signed notification and maps it to our payment", async () => {
    const event = await provider().verifyWebhook(notification(paid()));
    expect(event).toMatchObject({ paymentId: PAYMENT_ID, status: "paid", eventKey: `${INVOICE}:SUCCESS:req-1` });
  });

  it("rejects a wrong secret, a tampered body, another path or another client id", async () => {
    expect(await provider().verifyWebhook(notification(paid(), { secret: "nope" }))).toBeNull();
    expect(await provider().verifyWebhook(notification(paid(), { tamper: true }))).toBeNull();
    expect(await provider().verifyWebhook(notification(paid(), { path: "/other" }))).toBeNull();
    const req = notification(paid());
    const headers = new Headers(req.headers);
    headers.set("Client-Id", "BRN-other");
    expect(
      await provider().verifyWebhook(new Request(req.url, { method: "POST", headers, body: await req.text() })),
    ).toBeNull();
  });

  it("rejects requests without signature headers", async () => {
    const req = new Request("https://app.example/api/webhooks/doku", { method: "POST", body: "{}" });
    expect(await provider().verifyWebhook(req)).toBeNull();
  });

  it("treats FAILED as not final: the customer may still pay with another channel", async () => {
    const failed = await provider().verifyWebhook(notification(paid("FAILED")));
    expect(failed?.status).toBe("pending");
    // A later SUCCESS for the same invoice is a distinct event (not dropped as a duplicate).
    const success = await provider().verifyWebhook(notification(paid("SUCCESS")));
    expect(success?.eventKey).not.toBe(failed?.eventKey);
  });
});

describe("DokuProvider.getStatus", () => {
  const statusFetch = (status: number, body: object) =>
    vi.fn(async () => new Response(JSON.stringify(body), { status }));

  it("GETs the order status with a no-digest signature", async () => {
    const fetchImpl = statusFetch(200, { transaction: { status: "SUCCESS" } });
    expect(await provider(fetchImpl).getStatus(PAYMENT_ID)).toBe("paid");
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://api-sandbox.doku.com/orders/v1/status/${INVOICE}`);
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>).Signature).toBe(
      nodeSign([
        `Client-Id:${CLIENT}`,
        "Request-Id:req-1",
        "Request-Timestamp:2026-10-11T06:30:00Z",
        `Request-Target:/orders/v1/status/${INVOICE}`,
      ]),
    );
  });

  it.each([
    ["SUCCESS", "paid"],
    ["EXPIRED", "expired"],
    ["FAILED", "pending"],
    ["PENDING", "pending"],
    ["TIMEOUT", "pending"],
    ["REFUNDED", "failed"],
  ])("maps %s to %s", async (doku, ours) => {
    expect(await provider(statusFetch(200, { transaction: { status: doku } })).getStatus(PAYMENT_ID)).toBe(ours);
  });

  it("Not Found (no transaction yet) is pending", async () => {
    expect(await provider(statusFetch(404, { error: "not found" })).getStatus(PAYMENT_ID)).toBe("pending");
  });
});
