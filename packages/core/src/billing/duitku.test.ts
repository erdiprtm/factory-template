import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { DuitkuProvider, hmacSha256Hex } from "./duitku";

const MERCHANT = "DS12345";
const KEY = "sandbox-api-key";
const nodeHmac = (msg: string) => createHmac("sha256", KEY).update(msg).digest("hex");

const input = {
  paymentId: "pay_abc",
  amountIdr: 149000,
  planId: "6m",
  customer: { name: "Budi Santoso", email: "budi@example.com" },
  methods: ["QRIS"],
  successUrl: "https://app.example/billing/return?paymentId=pay_abc",
  failureUrl: "https://app.example/billing/return?paymentId=pay_abc",
  callbackUrl: "https://app.example/api/webhooks/duitku",
  expiresInMinutes: 60,
};

function callback(fields: Record<string, string>) {
  return new Request("https://app.example/api/webhooks/duitku", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
  });
}

describe("hmacSha256Hex", () => {
  it("matches Node's HMAC-SHA256 lowercase hex", async () => {
    expect(await hmacSha256Hex(KEY, "DS123451773728479616")).toBe(nodeHmac("DS123451773728479616"));
  });
});

describe("DuitkuProvider.createCheckout", () => {
  it("signs merchantCode+timestamp and sends a POP invoice", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            merchantCode: MERCHANT,
            reference: "DS1234524ABC",
            paymentUrl: "https://app-sandbox.duitku.com/redirect_checkout?reference=DS1234524ABC",
            statusCode: "00",
            statusMessage: "SUCCESS",
          }),
        ),
    );
    const p = new DuitkuProvider({
      merchantCode: MERCHANT,
      apiKey: KEY,
      mode: "sandbox",
      fetchImpl,
      now: () => 1773728479616,
    });
    const out = await p.createCheckout(input);
    expect(out).toEqual({
      redirectUrl: "https://app-sandbox.duitku.com/redirect_checkout?reference=DS1234524ABC",
      providerRef: "DS1234524ABC",
    });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api-sandbox.duitku.com/api/merchant/createInvoice");
    const headers = init.headers as Record<string, string>;
    expect(headers["x-duitku-timestamp"]).toBe("1773728479616");
    expect(headers["x-duitku-signature"]).toBe(nodeHmac(`${MERCHANT}1773728479616`));
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      paymentAmount: 149000,
      merchantOrderId: "pay_abc",
      callbackUrl: input.callbackUrl,
      returnUrl: input.successUrl,
      expiryPeriod: 60,
      paymentMethod: "",
      itemDetails: [{ price: 149000, quantity: 1 }],
    });
  });

  it("rejects amounts below Duitku's minimum before calling the API", async () => {
    const fetchImpl = vi.fn();
    const p = new DuitkuProvider({ merchantCode: MERCHANT, apiKey: KEY, mode: "sandbox", fetchImpl });
    await expect(p.createCheckout({ ...input, amountIdr: 9000 })).rejects.toThrow(/at least 10000/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("throws on a non-success response", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ Message: "Wrong signature" }), { status: 401 }));
    const p = new DuitkuProvider({ merchantCode: MERCHANT, apiKey: KEY, mode: "production", fetchImpl });
    await expect(p.createCheckout(input)).rejects.toThrow(/HTTP 401/);
  });
});

describe("DuitkuProvider.verifyWebhook", () => {
  const p = new DuitkuProvider({ merchantCode: MERCHANT, apiKey: KEY, mode: "sandbox" });
  const base = { merchantCode: MERCHANT, amount: "149000", merchantOrderId: "pay_abc", reference: "DS1234524ABC" };

  it("accepts a correctly signed success callback", async () => {
    const signature = nodeHmac(`${MERCHANT}149000pay_abc`);
    const r = await p.verifyWebhook(callback({ ...base, resultCode: "00", signature }));
    expect(r).toMatchObject({ paymentId: "pay_abc", providerRef: "DS1234524ABC", status: "paid" });
    expect(r?.eventKey).toBe("pay_abc:00:DS1234524ABC");
  });

  it("rejects a wrong signature, a tampered amount, or another merchant", async () => {
    const good = nodeHmac(`${MERCHANT}149000pay_abc`);
    expect(await p.verifyWebhook(callback({ ...base, resultCode: "00", signature: "deadbeef" }))).toBeNull();
    expect(await p.verifyWebhook(callback({ ...base, amount: "1000", resultCode: "00", signature: good }))).toBeNull();
    expect(
      await p.verifyWebhook(callback({ ...base, merchantCode: "DS99999", resultCode: "00", signature: good })),
    ).toBeNull();
  });

  it("treats any non-00 result as not paid", async () => {
    const signature = nodeHmac(`${MERCHANT}149000pay_abc`);
    expect((await p.verifyWebhook(callback({ ...base, resultCode: "01", signature })))?.status).toBe("failed");
    expect((await p.verifyWebhook(callback({ ...base, resultCode: "02", signature })))?.status).toBe("failed");
  });
});

describe("DuitkuProvider.getStatus", () => {
  it("signs merchantCode+merchantOrderId and maps status codes", async () => {
    const codes: Record<string, string> = { a: "00", b: "01", c: "02" };
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      const { merchantOrderId } = JSON.parse(init.body as string);
      return new Response(JSON.stringify({ statusCode: codes[merchantOrderId] }));
    });
    const p = new DuitkuProvider({
      merchantCode: MERCHANT,
      apiKey: KEY,
      mode: "sandbox",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(await p.getStatus("a")).toBe("paid");
    expect(await p.getStatus("b")).toBe("pending");
    expect(await p.getStatus("c")).toBe("failed");
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://sandbox.duitku.com/webapi/api/merchant/transactionStatus");
    expect(JSON.parse(init.body as string).signature).toBe(nodeHmac(`${MERCHANT}a`));
  });
});
