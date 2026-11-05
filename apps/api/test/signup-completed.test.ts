import { env } from "cloudflare:workers";
import { config } from "@factory/config/product";
import { signupEventId } from "@factory/core/attribution";
import { requiredConsents } from "@factory/core/consents";
import { capiEvent } from "@factory/core/meta";
import { schema } from "@factory/db";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";
import { BASE, call, post, signIn } from "./helpers";

// D-122: signup_completed comes from the server, once per account, when it first has every
// required consent: on /consent, or from before signup (D-043) when /consent is never shown.
const db = drizzle(env.DB, { schema });
const required = requiredConsents(config.legal);
const anon = () => crypto.randomUUID().replaceAll("-", "");

type Me = { user: { id: string } | null; signupEventId: string | null };
const me = async (cookie: string, anonId?: string) =>
  (await call("/api/me", { headers: { cookie, ...(anonId ? { "x-anon-id": anonId } : {}) } })).json<Me>();
const rows = (userId: string) =>
  db
    .select()
    .from(schema.funnelEvents)
    .where(and(eq(schema.funnelEvents.userId, userId), eq(schema.funnelEvents.event, "signup_completed")));

describe("signup_completed from the server", () => {
  it("consent before signup: the first /me records it once, later ones don't", async () => {
    const anonId = anon();
    await call("/api/anonymous-consents", {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE, "x-anon-id": anonId },
      body: JSON.stringify({ accept: required }),
    });
    const cookie = await signIn(`signup-anon-${crypto.randomUUID()}@example.com`);
    const first = await me(cookie, anonId);
    const userId = first.user?.id as string;
    expect(first.signupEventId).toBe(signupEventId(userId));
    expect((await me(cookie, anonId)).signupEventId).toBeNull();
    const [a, b] = await Promise.all([me(cookie, anonId), me(cookie, anonId)]);
    expect([a.signupEventId, b.signupEventId]).toEqual([null, null]);
    expect(await rows(userId)).toHaveLength(1);
  });

  it("consent on /consent: recorded there, not before and not again", async () => {
    const cookie = await signIn(`signup-screen-${crypto.randomUUID()}@example.com`);
    const before = await me(cookie);
    expect(before.signupEventId).toBeNull();
    const res = await post("/api/consents", cookie, { accept: required });
    const userId = before.user?.id as string;
    expect((await res.json<{ signupEventId: string | null }>()).signupEventId).toBe(signupEventId(userId));
    expect((await me(cookie)).signupEventId).toBeNull();
    const again = await post("/api/consents", cookie, { accept: required });
    expect((await again.json<{ signupEventId: string | null }>()).signupEventId).toBeNull();
    expect(await rows(userId)).toHaveLength(1);
  });

  it("an account from before this change isn't counted as a new signup", async () => {
    const cookie = await signIn(`signup-old-${crypto.randomUUID()}@example.com`);
    const userId = (await me(cookie)).user?.id as string;
    await db
      .update(schema.user)
      .set({ createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) })
      .where(eq(schema.user.id, userId));
    await post("/api/consents", cookie, { accept: required });
    expect((await me(cookie)).signupEventId).toBeNull();
    expect(await rows(userId)).toHaveLength(0);
  });

  it("CompleteRegistration goes to Meta without a value", async () => {
    const event = await capiEvent({
      event: "signup_completed",
      eventId: "signup_completed:u1",
      eventTime: new Date(0),
      eventSourceUrl: `${BASE}/`,
      email: "a@example.com",
      userId: "u1",
      userAgent: "test",
    });
    expect(event.event_name).toBe("CompleteRegistration");
    expect(event.event_id).toBe("signup_completed:u1");
    expect("custom_data" in event).toBe(false);
  });
});
