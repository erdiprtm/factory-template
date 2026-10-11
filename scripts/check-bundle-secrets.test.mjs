import { describe, expect, it } from "vitest";
import { scanText } from "./check-bundle-secrets.mjs";

describe("scanText", () => {
  it("passes ordinary bundle code", () => {
    expect(scanText('var re_x=1;const url=process.env.EXPO_PUBLIC_API_URL||"/api";')).toEqual([]);
  });

  it("flags credential-looking values", () => {
    expect(scanText('const k="re_AbCd1234_abcdefghijklmnopqrstu"')).toContain("Resend API key");
    expect(scanText("sk_live_1234567890abcdef")).toContain("Live secret key");
    expect(scanText("-----BEGIN PRIVATE KEY-----")).toContain("Private key");
    expect(scanText('"GOCSPX-abcdefghijklmnopqrstuvwx"')).toContain("Google OAuth client secret");
  });

  it("flags server-only variable names (server code in a client bundle)", () => {
    expect(scanText("env.BETTER_AUTH_SECRET")).toEqual(["server-only name BETTER_AUTH_SECRET"]);
    expect(scanText("c.env.DUITKU_API_KEY")).toEqual(["server-only name DUITKU_API_KEY"]);
    expect(scanText('{RESEND_API_KEY:"abcdefghijkl"}')).toEqual(["server-only name RESEND_API_KEY"]);
  });

  it("ignores Better Auth's client env getter (a name, no value)", () => {
    expect(scanText('get BETTER_AUTH_SECRET(){return _("BETTER_AUTH_SECRET")}')).toEqual([]);
  });
});
