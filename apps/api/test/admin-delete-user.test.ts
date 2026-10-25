import { env } from "cloudflare:workers";
import { schema } from "@factory/db";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";
import { app } from "../src/index";
import { BASE, get, post, signInWithConsent, startTrial } from "./helpers";

// D-110: an admin deletes a user's account by email (support requests, test accounts), through the
// same erasure as Akun → Hapus akun. The email is typed twice; never an admin's account.
const db = drizzle(env.DB, { schema });
const uniqueEmail = (tag: string) => `${tag}-${crypto.randomUUID()}@example.com`;
const del = (cookie: string | null, email: string, confirm = email) =>
  post("/api/admin/delete-user", cookie, { email, confirm });
const userRow = (email: string) => db.select().from(schema.user).where(eq(schema.user.email, email)).get();

describe("POST /api/admin/delete-user", () => {
  it("only admins: signed out 401, a member 403", async () => {
    const target = uniqueEmail("keep");
    const member = await signInWithConsent(uniqueEmail("member"));
    await signInWithConsent(target);
    expect((await del(null, target)).status).toBe(401);
    expect((await del(member, target)).status).toBe(403);
    expect(await userRow(target)).toBeTruthy();
  });

  it("erases the account, its access and sessions, like the user's own delete", async () => {
    const admin = await signInWithConsent("admin@example.com");
    const target = uniqueEmail("gone");
    const cookie = await signInWithConsent(target);
    await startTrial(cookie);
    const id = (await userRow(target))?.id as string;
    expect((await del(admin, target.toUpperCase(), ` ${target} `)).status).toBe(200);
    expect(await userRow(target)).toBeUndefined();
    expect(await db.select().from(schema.entitlements).where(eq(schema.entitlements.userId, id))).toEqual([]);
    expect(await db.select().from(schema.session).where(eq(schema.session.userId, id))).toEqual([]);
    // The deleted person's old session no longer works.
    expect(((await (await get("/api/me", cookie)).json()) as { user: unknown }).user).toBeNull();
  });

  it("refuses a mismatched confirmation, an unknown email, the admin's own account and another admin", async () => {
    const admin = await signInWithConsent("admin@example.com");
    const target = uniqueEmail("typo");
    await signInWithConsent(target);
    expect((await del(admin, target, uniqueEmail("other"))).status).toBe(400);
    expect((await del(admin, uniqueEmail("nobody"))).status).toBe(404);
    expect((await del(admin, "admin@example.com")).status).toBe(409);
    // A second admin (ADMIN_EMAILS) can't be deleted from /admin either.
    const twoAdmins = { ...env, ADMIN_EMAILS: `admin@example.com,${target}` };
    const res = await app.request(
      `${BASE}/api/admin/delete-user`,
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie: admin },
        body: JSON.stringify({ email: target, confirm: target }),
      },
      twoAdmins,
    );
    expect(res.status).toBe(409);
    expect(await userRow(target)).toBeTruthy();
  });
});
