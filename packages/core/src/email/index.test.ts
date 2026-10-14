import { describe, expect, it, vi } from "vitest";
import { CaptureProvider, capturedEmails, emailProvider, ResendProvider } from "./index";

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

describe("Reply-To (D-067)", () => {
  const sent = () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "1" }), { status: 200 }));
    const body = () => JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    return { fetchMock, body };
  };
  const mail = { to: "u@x.id", subject: "Hi", text: "t" };

  it("Resend gets reply_to when set and no such field when unset", async () => {
    const a = sent();
    await new ResendProvider("k", "f", a.fetchMock).send({ ...mail, replyTo: "halo@brand.id" });
    expect(a.body().reply_to).toBe("halo@brand.id");
    const b = sent();
    await new ResendProvider("k", "f", b.fetchMock).send(mail);
    expect(b.body()).not.toHaveProperty("reply_to");
  });

  it("MAIL_REPLY_TO wins over the default; the default applies when it's unset or empty; none = no header", async () => {
    const capture = capturedEmails();
    const env = { APP_ENV: "test" };
    await emailProvider({ ...env, MAIL_REPLY_TO: "cs@brand.id" }, "halo@brand.id").send(mail);
    expect(capture.last("u@x.id")?.replyTo).toBe("cs@brand.id");
    await emailProvider({ ...env, MAIL_REPLY_TO: "" }, "halo@brand.id").send(mail);
    expect(capture.last("u@x.id")?.replyTo).toBe("halo@brand.id");
    await emailProvider(env).send(mail);
    expect(capture.last("u@x.id")?.replyTo).toBeUndefined();
    // An email that names its own Reply-To keeps it.
    await emailProvider(env, "halo@brand.id").send({ ...mail, replyTo: "billing@brand.id" });
    expect(capture.last("u@x.id")?.replyTo).toBe("billing@brand.id");
  });

  it("the dev log shows it", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await emailProvider({ APP_ENV: "development" }, "halo@brand.id").send(mail);
    expect(log.mock.calls.at(-1)?.[0]).toContain("reply-to=halo@brand.id");
    log.mockRestore();
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
