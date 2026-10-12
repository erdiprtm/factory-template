import { env } from "cloudflare:workers";
import { config } from "@factory/config/product";
import {
  ANONYMOUS_CONSENT_DAYS,
  missingConsents,
  purgeAnonymousConsents,
  recordConsents,
  requiredConsents,
} from "@factory/core/consents";
import { anonKey } from "@factory/core/quota";
import { schema } from "@factory/db";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";
import { ANON_CONSENTS, BASE, CORE_ANON_CONSENT, call, signIn } from "./helpers";

// Consent before signup (D-043): "pay for proof" processes a visitor's data before there is an
// account, so the consent is recorded per device and moves to the account at sign-in.
const db = drizzle(env.DB, { schema });
const anon = () => crypto.randomUUID().replaceAll("-", "");
const ip = () => `203.0.113.${Math.floor(Math.random() * 250)}-${crypto.randomUUID().slice(0, 4)}`;
const required = requiredConsents(config.legal);

const consent = (anonId: string | null, accept: string[]) =>
  call("/api/anonymous-consents", {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE, ...(anonId ? { "x-anon-id": anonId } : {}) },
    body: JSON.stringify({ accept }),
  });

describe("consent before signup", () => {
  it("records the required consents for a device, and refuses a partial or anonymous-less one", async () => {
    const anonId = anon();
    expect((await consent(null, required)).status).toBe(400);
    if (required.length > 1) expect((await consent(anonId, required.slice(1))).status).toBe(400);
    expect((await consent(anonId, required)).status).toBe(200);
    expect(await missingConsents(db, anonKey(anonId), required)).toEqual([]);
  });

  it("reports what a visitor still has to accept in /me", async () => {
    const anonId = anon();
    const me = async () =>
      (await call("/api/me", { headers: { "x-anon-id": anonId } })).json<{ missingConsents: string[] }>();
    expect((await me()).missingConsents).toEqual(required);
    await consent(anonId, required);
    expect((await me()).missingConsents).toEqual([]);
  });

  it("gates an anonymous use on the device's consent", async () => {
    const anonId = anon();
    const run = () =>
      call(CORE_ANON_CONSENT, {
        method: "POST",
        headers: { "content-type": "application/json", origin: BASE, "x-anon-id": anonId, "cf-connecting-ip": ip() },
        body: "{}",
      });
    const refused = await run();
    expect(refused.status).toBe(403);
    expect(await refused.json()).toEqual({ error: "consent_required", missing: [...ANON_CONSENTS] });
    await recordConsents(db, anonKey(anonId), [...ANON_CONSENTS]);
    expect((await run()).status).toBe(200);
  });

  it("moves the device's consent to the account at sign-in, so it isn't asked twice", async () => {
    const anonId = anon();
    await consent(anonId, required);
    const cookie = await signIn(`anon-consent-${crypto.randomUUID()}@example.com`);
    const me = await (await call("/api/me", { headers: { cookie, "x-anon-id": anonId } })).json<{
      user: { id: string };
      missingConsents: string[];
    }>();
    expect(me.missingConsents).toEqual([]);
    expect(await missingConsents(db, me.user.id, required)).toEqual([]);
    expect(await missingConsents(db, anonKey(anonId), required)).toEqual(required);
  });

  it("drops consents no account claimed after the retention period", async () => {
    const old = anon();
    const fresh = anon();
    const now = new Date();
    await recordConsents(
      db,
      anonKey(old),
      ["terms"],
      new Date(now.getTime() - (ANONYMOUS_CONSENT_DAYS + 1) * 86_400_000),
    );
    await recordConsents(db, anonKey(fresh), ["terms"], now);
    await purgeAnonymousConsents(db, now);
    expect(await missingConsents(db, anonKey(old), ["terms"])).toEqual(["terms"]);
    expect(await missingConsents(db, anonKey(fresh), ["terms"])).toEqual([]);
  });
});
