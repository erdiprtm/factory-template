import { describe, expect, it, vi } from "vitest";
import { CaptureProvider, emailProvider, ResendProvider } from "./index";

describe("emailProvider", () => {
  it("captures in development and test", () => {
    expect(emailProvider({ APP_ENV: "development" })).toBeInstanceOf(CaptureProvider);
    expect(emailProvider({ APP_ENV: "test" })).toBeInstanceOf(CaptureProvider);
  });
  it("refuses to silently drop email in production or preview", () => {
    expect(() => emailProvider({ APP_ENV: "production" })).toThrow(/RESEND_API_KEY/);
    expect(() => emailProvider({ APP_ENV: "preview" })).toThrow(/RESEND_API_KEY/);
  });
  it("uses Resend when a key is set", () => {
    expect(emailProvider({ APP_ENV: "production", RESEND_API_KEY: "re_x" })).toBeInstanceOf(ResendProvider);
  });
});

describe("ResendProvider", () => {
  it("posts to the Resend API with a bearer key", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "1" }), { status: 200 }));
    await new ResendProvider("re_key", "App <a@b.c>", fetchMock).send({ to: "u@x.id", subject: "Hi", text: "t" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer re_key");
    expect(JSON.parse(init.body as string)).toMatchObject({ from: "App <a@b.c>", to: "u@x.id", subject: "Hi" });
  });
  it("throws without leaking the recipient on failure", async () => {
    const fetchMock = vi.fn(async () => new Response("bad", { status: 422 }));
    await expect(
      new ResendProvider("k", "f", fetchMock).send({ to: "secret@x.id", subject: "s", text: "t" }),
    ).rejects.toThrow(/^Resend rejected the email \(HTTP 422\)$/);
  });

  it("calls the global fetch unbound by default (Workers reject fetch with a foreign `this`)", async () => {
    // Emulates workerd: fetch throws when its `this` isn't the global scope.
    const strictFetch = vi.fn(function (this: unknown) {
      if (this !== undefined && this !== globalThis) throw new TypeError("Illegal invocation");
      return Promise.resolve(new Response(JSON.stringify({ id: "1" }), { status: 200 }));
    });
    vi.stubGlobal("fetch", strictFetch);
    try {
      await new ResendProvider("re_key", "App <a@b.c>").send({ to: "u@x.id", subject: "Hi", text: "t" });
      expect(strictFetch).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
