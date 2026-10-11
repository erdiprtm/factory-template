import { env } from "cloudflare:workers";
import { config } from "@factory/config/product";
import { consents, entitlements, payments, schema, session, user } from "@factory/db";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";
import { fakeProvider } from "../src/core/payments";
import { app } from "../src/index";
import { firstPlan, get, post, signInWithConsent } from "./helpers";

// Akun page API + UU PDP rights (access and erasure), against real local D1.
const db = drizzle(env.DB, { schema });
const uniqueEmail = (tag: string) => `${tag}-${crypto.randomUUID()}@example.com`;

async function buy(cookie: string) {
  const { paymentId } = await (await post("/api/billing/checkout", cookie, { planId: firstPlan.id })).json<{
    paymentId: string;
  }>();
  const hook = fakeProvider().pay(paymentId);
  await app.request(hook.url, hook, env);
  return paymentId;
}

describe("account summary", () => {
  it("shows profile and subscription status", async () => {
    const email = uniqueEmail("summary");
    const cookie = await signInWithConsent(email);
    const before = await (await get("/api/account/summary", cookie)).json<{
      profile: { email: string };
      subscription: { active: boolean; trialUsed: boolean; expiresAt: string | null };
    }>();
    expect(before.profile.email).toBe(email);
    expect(before.subscription).toMatchObject({ active: false, trialUsed: false, expiresAt: null });

    await buy(cookie);
    const after = await (await get("/api/account/summary", cookie)).json<{
      subscription: { active: boolean; source: string; expiresAt: string };
    }>();
    expect(after.subscription).toMatchObject({ active: true, source: "payment" });
    expect(new Date(after.subscription.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("requires a session", async () => {
    expect((await get("/api/account/summary", null)).status).toBe(401);
  });
});

describe("data export (right of access)", () => {
  it("downloads the user's data without secrets", async () => {
    const email = uniqueEmail("export");
    const cookie = await signInWithConsent(email);
    await buy(cookie);
    const res = await get("/api/account/export", cookie);
    // The slug comes from product.config.ts, so this holds in every product repo.
    expect(res.headers.get("content-disposition")).toBe(`attachment; filename="data-${config.slug}.json"`);
    const data = await res.json<Record<string, unknown>>();
    expect(data).toMatchObject({ profile: { email }, product: {} });
    expect((data.payments as unknown[]).length).toBe(1);
    expect((data.consents as unknown[]).length).toBe(2);
    const text = JSON.stringify(data);
    expect(text).not.toMatch(/token|password|raw_?payload/i);
  });
});

describe("account deletion (right to erasure)", () => {
  it("needs the confirmation word", async () => {
    const cookie = await signInWithConsent(uniqueEmail("noconfirm"));
    expect((await post("/api/account/delete", cookie, {})).status).toBe(400);
  });

  it("removes personal data, keeps de-identified payments, and ends the session", async () => {
    const email = uniqueEmail("delete");
    const cookie = await signInWithConsent(email);
    const paymentId = await buy(cookie);
    const u = await db.select().from(user).where(eq(user.email, email)).get();
    const userId = u?.id ?? "";

    const res = await post("/api/account/delete", cookie, { confirm: "HAPUS" });
    expect(res.status).toBe(200);
    expect(res.headers.getSetCookie().some((c) => c.startsWith("better-auth.session_token=;"))).toBe(true);

    expect(await db.select().from(user).where(eq(user.id, userId)).get()).toBeUndefined();
    expect(await db.select().from(session).where(eq(session.userId, userId))).toHaveLength(0);
    expect(await db.select().from(consents).where(eq(consents.userId, userId))).toHaveLength(0);
    expect(await db.select().from(entitlements).where(eq(entitlements.userId, userId))).toHaveLength(0);
    const kept = await db.select().from(payments).where(eq(payments.id, paymentId)).get();
    expect(kept?.userId).toMatch(/^deleted:/);
    expect(kept?.rawPayload).toBeNull();
    expect(kept?.amountIdr).toBe(firstPlan.priceIdr);

    expect((await get("/api/account/summary", cookie)).status).toBe(401);
  });
});
