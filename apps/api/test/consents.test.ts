import { env } from "cloudflare:workers";
import { missingConsents, recordConsents, requiredConsents, revokeConsent } from "@factory/core/consents";
import { consents, schema } from "@factory/db";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";

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
