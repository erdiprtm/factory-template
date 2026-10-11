import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  capiEvent,
  choiceFromParam,
  cleanFbId,
  fbcFromClick,
  GRAPH_API_VERSION,
  loadPixel,
  normalizeEmail,
  pixelTrack,
  readFbCookies,
  sendCapi,
} from "./index";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

describe("capiEvent", () => {
  it("follows Meta's format: hashed email/external_id, raw fbp/fbc/IP/UA, IDR value", async () => {
    const e = await capiEvent({
      event: "purchase",
      eventId: "pay_1",
      eventTime: new Date(1_700_000_000_500),
      eventSourceUrl: "https://app.x.id/pricing",
      email: "  Budi@Example.COM ",
      userId: "u1",
      valueIdr: 99_000,
      fbp: "fb.1.1596403881668.1116446470",
      fbc: "fb.1.1554763741205.IwAR2F4",
      clientIp: "203.0.113.5",
      userAgent: "Mozilla/5.0",
    });
    expect(e).toEqual({
      event_name: "Purchase",
      event_time: 1_700_000_000,
      event_id: "pay_1",
      action_source: "website",
      event_source_url: "https://app.x.id/pricing",
      user_data: {
        em: [sha("budi@example.com")],
        external_id: [sha("u1")],
        client_user_agent: "Mozilla/5.0",
        fbp: "fb.1.1596403881668.1116446470",
        fbc: "fb.1.1554763741205.IwAR2F4",
        client_ip_address: "203.0.113.5",
      },
      custom_data: { value: 99_000, currency: "IDR" },
    });
    expect(normalizeEmail(" A@B.Co ")).toBe("a@b.co");
  });

  it("renewal is a custom event; missing ids are left out", async () => {
    const e = await capiEvent({
      event: "renewal",
      eventId: "pay_2",
      eventTime: new Date(0),
      eventSourceUrl: "https://app.x.id/pricing",
      email: "a@b.co",
      userId: "u1",
      valueIdr: 1,
      userAgent: "UA",
    });
    expect(e.event_name).toBe("Renewal");
    expect(Object.keys(e.user_data).sort()).toEqual(["client_user_agent", "em", "external_id"]);
  });
});

describe("sendCapi", () => {
  it("posts to the pixel's events edge with the token and the test code", async () => {
    const calls: [string, RequestInit][] = [];
    const ok = await sendCapi(
      {
        pixelId: "1234567890",
        accessToken: "tok en",
        testEventCode: "TEST123",
        fetchImpl: async (url, init) => {
          calls.push([String(url), init as RequestInit]);
          return new Response("{}", { status: 200 });
        },
      },
      [],
    );
    expect(ok).toBe(true);
    const [url, init] = calls[0] as [string, RequestInit];
    expect(url).toBe(`https://graph.facebook.com/${GRAPH_API_VERSION}/1234567890/events?access_token=tok%20en`);
    expect(JSON.parse(init.body as string)).toEqual({ data: [], test_event_code: "TEST123" });
  });

  it("never throws, and reports rejection", async () => {
    const down = await sendCapi(
      {
        pixelId: "1",
        accessToken: "t",
        fetchImpl: async () => {
          throw new Error("down");
        },
      },
      [],
    );
    const rejected = await sendCapi(
      { pixelId: "1", accessToken: "t", fetchImpl: async () => new Response("bad", { status: 400 }) },
      [],
    );
    expect([down, rejected]).toEqual([false, false]);
  });
});

describe("fbp / fbc", () => {
  it("builds fbc from a click id without changing its case", () => {
    expect(fbcFromClick("IwAR2F4-dbP0", 1554763741205)).toBe("fb.1.1554763741205.IwAR2F4-dbP0");
  });

  it("reads and validates the Pixel cookies", () => {
    expect(readFbCookies("a=1; _fbp=fb.1.1596403881668.1116446470; _fbc=fb.1.1.AbC")).toEqual({
      fbp: "fb.1.1596403881668.1116446470",
      fbc: "fb.1.1.AbC",
    });
    expect(readFbCookies("_fbp=evil<script>")).toEqual({ fbp: undefined, fbc: undefined });
    expect(cleanFbId("fb.1.2.x y")).toBeUndefined();
  });

  it("parses the consent hand-over parameter", () => {
    expect([choiceFromParam("1"), choiceFromParam("0"), choiceFromParam("yes")]).toEqual(["granted", "denied", null]);
  });
});

describe("Pixel", () => {
  function fakeWindow() {
    const added: { src: string }[] = [];
    const w = {
      document: {
        createElement: () => ({}) as { src: string },
        head: { appendChild: (s: { src: string }) => added.push(s) },
      },
    };
    return { w: w as unknown as Parameters<typeof loadPixel>[1] & object, added };
  }

  it("loads once, inits the pixel and queues calls until fbevents.js arrives", () => {
    const { w, added } = fakeWindow();
    loadPixel("1234567890", w);
    loadPixel("1234567890", w);
    expect(added.map((s) => s.src)).toEqual(["https://connect.facebook.net/en_US/fbevents.js"]);
    pixelTrack("checkout_start", {}, undefined, w);
    pixelTrack("purchase", { value: 99_000, currency: "IDR" }, "pay_1", w);
    pixelTrack("renewal", {}, "pay_2", w);
    pixelTrack("cta_tap", {}, undefined, w);
    const queue = (w as unknown as { fbq: { queue: unknown[][] } }).fbq.queue;
    expect(queue).toEqual([
      ["init", "1234567890"],
      ["track", "PageView"],
      ["track", "InitiateCheckout", {}, undefined],
      ["track", "Purchase", { value: 99_000, currency: "IDR" }, { eventID: "pay_1" }],
      ["trackCustom", "Renewal", {}, { eventID: "pay_2" }],
    ]);
  });

  it("does nothing without consent (Pixel never loaded)", () => {
    const { w } = fakeWindow();
    expect(() => pixelTrack("purchase", {}, "pay_1", w)).not.toThrow();
    expect((w as unknown as { fbq?: unknown }).fbq).toBeUndefined();
  });
});
