import { describe, expect, it, vi } from "vitest";
import { PakasirProvider, secretsMatch } from "./pakasir";
import { FakePakasirApi } from "./pakasir-fake";
import { pakasirMethodsFor } from "./pakasir-methods";
import type { CheckoutInput } from "./provider";

// Pakasir API v2 adapter (D-092): request shapes from pakasir.com/p/* (read 2026-10-19), the
// status mapping, and the refusals that keep a forged or mismatched transaction from granting.

const PAYMENT_ID = "pay_0123456789abcdef0123456789abcdef";
const input = (over: Partial<CheckoutInput> = {}): CheckoutInput => ({
  paymentId: PAYMENT_ID,
  amountIdr: 99_000,
  planId: "6m",
  customer: { name: "Budi", email: "budi@example.com" },
  methods: ["qris", "bri_va"],
  successUrl: `https://app.example/billing/return?paymentId=${PAYMENT_ID}`,
  failureUrl: `https://app.example/billing/return?paymentId=${PAYMENT_ID}`,
  callbackUrl: "https://app.example/api/webhooks/pakasir",
  expiresInMinutes: 60,
  method: "qris",
  ...over,
});

function setup(mode: "sandbox" | "live" = "sandbox") {
  const api = new FakePakasirApi("depodomain", "key-123", "whsec-456");
  api.sandbox = mode === "sandbox";
  const fetchImpl = vi.fn(api.fetch);
  const provider = new PakasirProvider({
    slug: "depodomain",
    apiKey: "key-123",
    webhookSecret: "whsec-456",
    mode,
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });
  return { api, provider, fetchImpl };
}

const reply = (body: object, status = 200) => vi.fn(async () => Response.json(body, { status }));
const withFetch = (fetchImpl: ReturnType<typeof reply>, mode: "sandbox" | "live" = "sandbox") =>
  new PakasirProvider({
    slug: "depodomain",
    apiKey: "key-123",
    webhookSecret: "whsec-456",
    mode,
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });

describe("PakasirProvider.createCheckout", () => {
  it("POSTs {method, amount} to /api/v2/create-transaction/{slug}/{order_id} with X-Api-Key", async () => {
    const { provider, fetchImpl } = setup();
    const out = await provider.createCheckout(input());
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://app.pakasir.com/api/v2/create-transaction/depodomain/${PAYMENT_ID}`);
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "X-Api-Key": "key-123", "Content-Type": "application/json" });
    expect(JSON.parse(init.body as string)).toEqual({ method: "qris", amount: 99_000 });
    expect(out.redirectUrl).toBe(`https://app.example/billing/pay?paymentId=${PAYMENT_ID}`);
    expect(out.providerRef).toMatch(/^ftx/);
    expect(out.charge).toMatchObject({ method: "qris", vaNumber: null, isSandbox: true });
    expect(out.charge.qrString).toMatch(/^000201/);
    expect(out.charge.totalIdr).toBe(99_000 + out.charge.feeIdr);
    expect(out.charge.feeIdr).toBeGreaterThan(0);
  });

  it("returns the VA number for a VA method", async () => {
    const { provider } = setup();
    const out = await provider.createCheckout(input({ method: "bri_va" }));
    expect(out.charge).toMatchObject({ method: "bri_va", qrString: null, feeIdr: 3500, totalIdr: 102_500 });
    expect(out.charge.vaNumber).toMatch(/^\d+$/);
  });

  it("refuses a method that isn't configured, unknown, or outside its amount limits, before any call", async () => {
    const { provider, fetchImpl } = setup();
    await expect(provider.createCheckout(input({ method: "bni_va" }))).rejects.toThrow(/configured method/);
    await expect(
      provider.createCheckout(input({ method: "payment_link", methods: ["payment_link"] })),
    ).rejects.toThrow();
    await expect(provider.createCheckout(input({ method: undefined }))).rejects.toThrow();
    await expect(provider.createCheckout(input({ method: "bri_va", amountIdr: 9_999 }))).rejects.toThrow(/10000/);
    await expect(provider.createCheckout(input({ amountIdr: 99_000.5 }))).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses a response for another order or amount, or without the QR", async () => {
    const base = {
      txn_id: "t1",
      order_id: PAYMENT_ID,
      amount: 99_000,
      fee: 1003,
      total_payment: 100_003,
      payment_method: "qris",
      qr_string: "000201",
      va_number: "",
      expires_at: "2026-10-20T01:00:00Z",
      is_sandbox: true,
    };
    for (const bad of [
      { order_id: "pay_other" },
      { amount: 1_000 },
      { total_payment: 500 },
      { qr_string: "" },
      { payment_method: "bri_va" },
      { expires_at: "not a date" },
      { expires_at: undefined },
    ]) {
      await expect(withFetch(reply({ ...base, ...bad })).createCheckout(input()), JSON.stringify(bad)).rejects.toThrow(
        /create-transaction failed/,
      );
    }
    await expect(withFetch(reply({ error: "x" }, 400)).createCheckout(input())).rejects.toThrow(/HTTP 400/);
    expect((await withFetch(reply(base)).createCheckout(input())).charge.feeIdr).toBe(1003);
  });

  it("reads the expiry from `expires_at` (the live API) or `expired_at` (the docs' example)", async () => {
    // The shape a real sandbox project returned on 2026-10-21 (qr_string is a placeholder there).
    const live = {
      txn_id: "g8iq16miq",
      project: "depodomain",
      order_id: PAYMENT_ID,
      amount: 99_000,
      fee: 990,
      total_payment: 99_990,
      payment_method: "qris",
      qr_string: "qris-placeholder-for-g8iq16miq-depodomain",
      expires_at: "2026-10-21T10:25:24.896842796Z",
      is_sandbox: true,
    };
    const fromLive = await withFetch(reply(live)).createCheckout(input());
    expect(fromLive.charge.providerExpiresAt?.toISOString()).toBe("2026-10-21T10:25:24.896Z");
    const { expires_at, ...rest } = live;
    const fromDocs = await withFetch(reply({ ...rest, expired_at: expires_at })).createCheckout(input());
    expect(fromDocs.charge.providerExpiresAt?.toISOString()).toBe("2026-10-21T10:25:24.896Z");
  });

  it("cancels and refuses a sandbox transaction in live mode, and a live one in sandbox mode", async () => {
    for (const [mode, apiSandbox] of [
      ["live", true],
      ["sandbox", false],
    ] as const) {
      const { api, provider } = setup(mode);
      api.sandbox = apiSandbox;
      await expect(provider.createCheckout(input())).rejects.toThrow(/transaction in/);
      expect(api.txnFor(PAYMENT_ID)?.status).toBe("canceled");
    }
  });
});

describe("PakasirProvider.getStatus", () => {
  const status = (over: object = {}) => ({
    txn_id: "t1",
    order_id: PAYMENT_ID,
    amount: 99_000,
    is_sandbox: true,
    status: "completed",
    completed_at: "2026-10-19T01:18:49Z",
    ...over,
  });
  const ref = { providerRef: "t1", amountIdr: 99_000 };

  it("GETs /api/v2/transaction-status/{slug}/{txn_id} with X-Api-Key and no body", async () => {
    const fetchImpl = reply(status());
    expect(await withFetch(fetchImpl).getStatus(PAYMENT_ID, ref)).toBe("paid");
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://app.pakasir.com/api/v2/transaction-status/depodomain/t1");
    expect(init.method).toBe("GET");
    expect(init.headers).toEqual({ "X-Api-Key": "key-123" });
    expect(init.body).toBeUndefined();
  });

  it.each([
    ["completed", "paid"],
    ["pending", "pending"],
    ["canceled", "expired"],
    ["something_new", "pending"],
  ])("maps %s to %s", async (theirs, ours) => {
    expect(await withFetch(reply(status({ status: theirs }))).getStatus(PAYMENT_ID, ref)).toBe(ours);
  });

  it("never pays on a mismatch: another order, amount or transaction is 'failed'", async () => {
    expect(await withFetch(reply(status({ order_id: "pay_other" }))).getStatus(PAYMENT_ID, ref)).toBe("failed");
    expect(await withFetch(reply(status({ amount: 99_001 }))).getStatus(PAYMENT_ID, ref)).toBe("failed");
    expect(await withFetch(reply(status({ txn_id: "t2" }))).getStatus(PAYMENT_ID, ref)).toBe("failed");
    expect(await withFetch(reply(status({ amount: "99000" }))).getStatus(PAYMENT_ID, ref)).toBe("failed");
  });

  it("live mode never pays a sandbox transaction; sandbox mode pays its own", async () => {
    expect(await withFetch(reply(status({ is_sandbox: true })), "live").getStatus(PAYMENT_ID, ref)).toBe("failed");
    expect(await withFetch(reply(status({ is_sandbox: false })), "live").getStatus(PAYMENT_ID, ref)).toBe("paid");
    expect(await withFetch(reply(status({ is_sandbox: true }))).getStatus(PAYMENT_ID, ref)).toBe("paid");
  });

  it("errors, rate limits and a missing transaction id are 'pending' (asked again later)", async () => {
    expect(await withFetch(reply({ error: "slow down" }, 429)).getStatus(PAYMENT_ID, ref)).toBe("pending");
    expect(await withFetch(reply({ error: "x" }, 500)).getStatus(PAYMENT_ID, ref)).toBe("pending");
    const none = reply(status());
    expect(await withFetch(none).getStatus(PAYMENT_ID, { providerRef: null, amountIdr: 99_000 })).toBe("pending");
    expect(await withFetch(none).getStatus(PAYMENT_ID)).toBe("pending");
    expect(none).not.toHaveBeenCalled();
  });
});

describe("PakasirProvider.cancel", () => {
  it("POSTs /api/v2/cancel-transaction/{slug}/{txn_id} with X-Api-Key and no body", async () => {
    const fetchImpl = reply({ message: "Berhasil batalkan transaksi" });
    expect(await withFetch(fetchImpl).cancel(PAYMENT_ID, { providerRef: "t1", amountIdr: 99_000 })).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://app.pakasir.com/api/v2/cancel-transaction/depodomain/t1");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "X-Api-Key": "key-123" });
    expect(init.body).toBeUndefined();
    expect(await withFetch(reply({}, 400)).cancel(PAYMENT_ID, { providerRef: "t1", amountIdr: 1 })).toBe(false);
  });
});

describe("PakasirProvider.verifyWebhook", () => {
  it("rejects a missing or wrong X-Secret", async () => {
    const { api, provider } = setup();
    expect(await provider.verifyWebhook(api.webhook(PAYMENT_ID, { secret: null }))).toBeNull();
    expect(await provider.verifyWebhook(api.webhook(PAYMENT_ID, { secret: "whsec-45" }))).toBeNull();
    expect(await provider.verifyWebhook(api.webhook(PAYMENT_ID, { secret: "whsec-4567" }))).toBeNull();
    expect(await provider.verifyWebhook(api.webhook(PAYMENT_ID, { secret: "" }))).toBeNull();
  });

  it("with the right secret, reads order_id and txn_id; the key repeats for a retry", async () => {
    const { api, provider } = setup();
    await provider.createCheckout(input());
    const txn = api.complete(PAYMENT_ID);
    const first = await provider.verifyWebhook(api.webhook(PAYMENT_ID));
    expect(first).toMatchObject({ paymentId: PAYMENT_ID, providerRef: txn?.txn_id, status: "paid" });
    expect((await provider.verifyWebhook(api.webhook(PAYMENT_ID)))?.eventKey).toBe(first?.eventKey);
    const odd = await provider.verifyWebhook(api.webhook(PAYMENT_ID, { body: { order_id: 5, status: "pending" } }));
    expect(odd).toMatchObject({ paymentId: "", status: "pending" });
  });

  it("an empty configured secret never matches", async () => {
    expect(await secretsMatch("", "")).toBe(false);
    expect(await secretsMatch("a", "a")).toBe(true);
    expect(await secretsMatch("a", "b")).toBe(false);
  });
});

describe("pakasirMethodsFor", () => {
  it("lists QRIS first, keeps config order for VAs, and drops what the amount can't use", () => {
    const codes = ["bri_va", "bni_va", "qris", "nope"];
    expect(pakasirMethodsFor(codes, 99_000).map((m) => m.code)).toEqual(["qris", "bri_va", "bni_va"]);
    expect(pakasirMethodsFor(codes, 5_000).map((m) => m.code)).toEqual(["qris"]);
    expect(pakasirMethodsFor(codes, 20_000_000).map((m) => m.code)).toEqual(["bri_va", "bni_va"]);
  });
});
