import { env } from "cloudflare:workers";
import {
  currentPrice,
  FakeProvider,
  founderSlotsLeft,
  grantMonths,
  handleWebhook,
  type Plan,
  startCheckout,
} from "@factory/core/billing";
import { payments, schema } from "@factory/db";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { beforeEach, describe, expect, it } from "vitest";

// D-116: bonus months and the founder price, decided by the server, against real local D1. Each
// test uses its own plan ids, so paid payments from other tests never count toward a limit.
const db = drizzle(env.DB, { schema });
const NOW = new Date("2026-11-01T00:00:00Z");

let provider: FakeProvider;
let tag: string;
beforeEach(() => {
  provider = new FakeProvider();
  tag = crypto.randomUUID().slice(0, 8);
});

const newUser = () => {
  const id = `user-${crypto.randomUUID()}`;
  return { id, name: "Sari", email: `${id}@example.com` };
};

async function buy(plan: Plan, founderPrice: boolean) {
  const { paymentId, amountIdr } = await startCheckout(db, provider, {
    user: newUser(),
    plan,
    methods: ["QRIS"],
    origin: "https://app.example",
    founderPrice,
    now: NOW,
  });
  const outcome = await handleWebhook(db, provider, provider.pay(paymentId, `evt-${paymentId}`), [plan], NOW);
  return { paymentId, amountIdr, outcome };
}

describe("grant length (D-116)", () => {
  it("months + bonusMonths; no bonus = months", () => {
    expect(grantMonths({ months: 12 })).toBe(12);
    expect(grantMonths({ months: 12, bonusMonths: 0 })).toBe(12);
    expect(grantMonths({ months: 12, bonusMonths: 2 })).toBe(14);
  });

  it("a paid plan with a bonus grants the extra months", async () => {
    const plan: Plan = { id: `b-${tag}`, label: "12 bulan", months: 12, priceIdr: 249000, bonusMonths: 2 };
    const { outcome, amountIdr } = await buy(plan, false);
    expect(amountIdr).toBe(249000);
    expect(outcome.kind).toBe("processed");
    if (outcome.kind === "processed")
      expect(outcome.entitlement?.expiresAt.toISOString()).toBe("2028-01-01T00:00:00.000Z");
  });
});

describe("founder price (D-116)", () => {
  const plan = (): Plan => ({
    id: `f-${tag}`,
    label: "12 bulan",
    months: 12,
    priceIdr: 249000,
    founder: { priceIdr: 149000, limit: 2 },
  });

  it("off: the normal price, whatever the plan says", async () => {
    const p = plan();
    expect(await founderSlotsLeft(db, p, false)).toBeNull();
    expect(await currentPrice(db, p, false)).toEqual({ priceIdr: 249000, founder: null });
    const { amountIdr, paymentId } = await buy(p, false);
    expect(amountIdr).toBe(249000);
    expect((await db.select().from(payments).where(eq(payments.id, paymentId)).get())?.amountIdr).toBe(249000);
    expect(provider.checkouts[0]?.amountIdr).toBe(249000);
  });

  it("on: the founder price until `limit` payments are paid at it, then the normal price", async () => {
    const p = plan();
    expect(await currentPrice(db, p, true)).toEqual({ priceIdr: 149000, founder: { left: 2 } });
    // A pending (unpaid) checkout doesn't use a slot.
    await startCheckout(db, provider, {
      user: newUser(),
      plan: p,
      methods: ["QRIS"],
      origin: "https://app.example",
      founderPrice: true,
      now: NOW,
    });
    expect(await founderSlotsLeft(db, p, true)).toBe(2);

    const first = await buy(p, true);
    expect(first.amountIdr).toBe(149000);
    expect(provider.checkouts.at(-1)?.amountIdr).toBe(149000);
    expect(await currentPrice(db, p, true)).toEqual({ priceIdr: 149000, founder: { left: 1 } });
    expect((await buy(p, true)).amountIdr).toBe(149000);

    // Limit reached.
    expect(await currentPrice(db, p, true)).toEqual({ priceIdr: 249000, founder: null });
    const third = await buy(p, true);
    expect(third.amountIdr).toBe(249000);
    expect(third.outcome.kind).toBe("processed");
    // Normal-price payments don't count as founder ones.
    expect(await founderSlotsLeft(db, p, true)).toBe(0);
  });

  it("a plan without a founder price is unaffected by the switch", async () => {
    const p: Plan = { id: `n-${tag}`, label: "6 bulan", months: 6, priceIdr: 149000 };
    expect(await currentPrice(db, p, true)).toEqual({ priceIdr: 149000, founder: null });
  });
});
