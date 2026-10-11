import { describe, expect, it } from "vitest";
import { redactText, scrubBreadcrumb, scrubEvent, stripUrl } from "./index";

describe("monitoring scrubbers", () => {
  it("strips query strings and fragments (magic-link tokens, payment ids)", () => {
    expect(stripUrl("https://app.example/api/auth/magic-link/verify?token=abc&callbackURL=%2F")).toBe(
      "https://app.example/api/auth/magic-link/verify",
    );
    expect(stripUrl("https://app.example/billing/return#x")).toBe("https://app.example/billing/return");
  });

  it("redacts emails, phone numbers and key=secret pairs in text", () => {
    expect(redactText("user budi@example.com failed, call 081234567890, token=abc123")).toBe(
      "user [email] failed, call [phone], token=[filtered]",
    );
  });

  it("keeps only an opaque user id and the request method + bare URL", () => {
    const event = scrubEvent({
      user: { id: "u_1", email: "budi@example.com", ip_address: "203.0.113.7", username: "Budi" },
      request: {
        method: "POST",
        url: "https://app.example/api/billing/checkout?paymentId=pay_1",
        headers: { cookie: "better-auth.session_token=secret", authorization: "Bearer x" },
        cookies: { a: "b" },
        data: '{"email":"budi@example.com"}',
        query_string: "paymentId=pay_1",
      },
      extra: { body: "anything" },
      contexts: { request: { x: 1 }, os: { name: "x" } },
      message: "Checkout failed for budi@example.com",
      exception: { values: [{ value: "Bad token=xyz for 081234567890" }] },
    } as Parameters<typeof scrubEvent>[0] & { message: string; exception: { values: { value: string }[] } });
    expect(event.user).toEqual({ id: "u_1" });
    expect(event.request).toEqual({ method: "POST", url: "https://app.example/api/billing/checkout" });
    expect(event.extra).toBeUndefined();
    expect(event.contexts).toEqual({ os: { name: "x" } });
    expect(event.message).toBe("Checkout failed for [email]");
    expect(event.exception.values[0]?.value).toBe("Bad token=[filtered] for [phone]");
  });

  it("drops a user without an id entirely", () => {
    expect(scrubEvent({ user: { email: "a@b.co" } }).user).toBeNull();
  });

  it("cleans breadcrumbs: no bodies, URLs without queries", () => {
    const crumb = scrubBreadcrumb({
      message: "POST for budi@example.com",
      data: { url: "https://x.dev/api/me?email=a@b.co", method: "POST", request_body: "{}", status_code: 500 },
    });
    expect(crumb).toEqual({
      message: "POST for [email]",
      data: { url: "https://x.dev/api/me", method: "POST", status_code: 500 },
    });
  });
});
