import { env } from "cloudflare:workers";
import { config } from "@factory/config/product";
import { missingConsents, recordConsents, requiredConsents, revokeConsent } from "@factory/core/consents";
import { consents, schema } from "@factory/db";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";
import { BASE, call, get, post, signIn } from "./helpers";

const db = drizzle(env.DB, { schema });

describe("consents (UU PDP)", () => {
  it("requires sensitive_data only when the product turns it on", () => {
    expect(requiredConsents({ sensitiveDataConsent: false })).toEqual(["terms", "privacy"]);
    expect(requiredConsents({ sensitiveDataConsent: true })).toEqual(["terms", "privacy", "sensitive_data"]);
  });

  it("records each required consent once, with its version", async () => {
    const user = `user-${crypto.randomUUID()}`;
    expect(await missingConsents(db, user, ["terms", "privacy"])).toEqual(["terms", "privacy"]);
    await recordConsents(db, user, ["terms", "privacy"]);
    await recordConsents(db, user, ["terms", "privacy"]);
    const rows = await db.select().from(consents).where(eq(consents.userId, user));
    expect(rows.map((r) => r.type).sort()).toEqual(["privacy", "terms"]);
    expect(rows.every((r) => r.version.length > 0 && r.revokedAt === null)).toBe(true);
    expect(await missingConsents(db, user, ["terms", "privacy"])).toEqual([]);
  });

  it("treats a revoked consent as missing", async () => {
    const user = `user-${crypto.randomUUID()}`;
    await recordConsents(db, user, ["marketing"]);
    await revokeConsent(db, user, "marketing");
    expect(await missingConsents(db, user, ["marketing"])).toEqual(["marketing"]);
  });
});

// Myna Fit template gap: /consent sends only the missing documents. The API must accept them when
// they complete what's already recorded (e.g. an older account asked for sensitive_data later).
describe("completing an earlier consent", () => {
  it("accepts only the missing documents for a user, and still refuses an incomplete set", async () => {
    const cookie = await signIn(`consent-complete-${crypto.randomUUID()}@example.com`);
    const me = await (await get("/api/me", cookie)).json<{ user: { id: string } }>();
    const required = requiredConsents(config.legal);
    const [first, ...rest] = required;
    await recordConsents(db, me.user.id, [first as (typeof required)[number]]);
    expect((await post("/api/consents", cookie, { accept: [] })).status).toBe(400);
    expect((await post("/api/consents", cookie, { accept: rest })).status).toBe(200);
    const after = await (await get("/api/me", cookie)).json<{ missingConsents: string[] }>();
    expect(after.missingConsents).toEqual([]);
  });

  it("does the same for a visitor's device before signup", async () => {
    const anonId = crypto.randomUUID().replaceAll("-", "");
    const send = (accept: string[]) =>
      call("/api/anonymous-consents", {
        method: "POST",
        headers: { "content-type": "application/json", origin: BASE, "x-anon-id": anonId },
        body: JSON.stringify({ accept }),
      });
    const required = requiredConsents(config.legal);
    const [first, ...rest] = required;
    expect((await send([first as string])).status).toBe(400);
    expect((await send(required)).status).toBe(200);
    expect((await send(rest)).status).toBe(200);
  });
});
