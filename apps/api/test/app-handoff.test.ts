import { describe, expect, it } from "vitest";
import { HANDOFF_ALPHABET, HANDOFF_LENGTH, normalizeHandoffCode } from "../src/core/app-handoff";
import { nativeTrustedOrigins } from "../src/core/auth";
import { get, post, signInWithConsent } from "./helpers";

// D-120: the web→app code. Signed in on the web → a code → the app redeems it for a NEW session.
const sessionCookie = (res: Response) => res.headers.get("set-cookie")?.match(/better-auth\.session_token=[^;]+/)?.[0];

async function createCode(cookie: string) {
  const res = await post("/api/auth/app-handoff/create", cookie, {});
  expect(res.status).toBe(200);
  return res.json<{ code: string; expiresAt: string }>();
}

describe("app hand-off code", () => {
  it("signed in: a code redeems once for a new session of the same account", async () => {
    const email = `handoff-${crypto.randomUUID()}@example.com`;
    const web = await signInWithConsent(email);
    const { code, expiresAt } = await createCode(web);
    expect(code).toHaveLength(HANDOFF_LENGTH);
    expect([...code].every((ch) => HANDOFF_ALPHABET.includes(ch))).toBe(true);
    expect(new Date(expiresAt).getTime() - Date.now()).toBeGreaterThan(9 * 60_000);

    // Typed loosely in the app: lower case, a dash, spaces.
    const typed = `${code.slice(0, 4).toLowerCase()}- ${code.slice(4)}`;
    const redeemed = await post("/api/auth/app-handoff/redeem", null, { code: typed });
    expect(redeemed.status).toBe(200);
    const app = sessionCookie(redeemed);
    expect(app).toBeTruthy();
    expect(app).not.toBe(web);
    const me = await (await get("/api/me", app as string)).json<{ user: { email: string } }>();
    expect(me.user.email).toBe(email);

    // Single use.
    expect((await post("/api/auth/app-handoff/redeem", null, { code })).status).toBe(400);
  });

  it("a new code replaces the open one; wrong codes and no session are refused", async () => {
    const web = await signInWithConsent(`handoff-${crypto.randomUUID()}@example.com`);
    const first = await createCode(web);
    const second = await createCode(web);
    expect((await post("/api/auth/app-handoff/redeem", null, { code: first.code })).status).toBe(400);
    expect((await post("/api/auth/app-handoff/redeem", null, { code: "AAAAAAAA" })).status).toBe(400);
    expect((await post("/api/auth/app-handoff/redeem", null, { code: second.code })).status).toBe(200);
    expect((await post("/api/auth/app-handoff/create", null, {})).status).toBe(401);
  });

  it("codes compare without case, spaces or dashes", () => {
    expect(normalizeHandoffCode(" ab3d-ef9h ")).toBe("AB3DEF9H");
  });
});

describe("native origins (D-120)", () => {
  it("the app scheme is trusted only once the product has a native id, never exp://", () => {
    expect(nativeTrustedOrigins({ androidPackage: null, iosBundleId: null })).toEqual([]);
    const [origin] = nativeTrustedOrigins({ androidPackage: "id.example.app", iosBundleId: null });
    expect(origin).toMatch(/^[a-z0-9]+:\/\/$/);
    expect(origin?.startsWith("exp")).toBe(false);
  });
});
