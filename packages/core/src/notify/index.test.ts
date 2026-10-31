import { describe, expect, it } from "vitest";
import { dailySummaryText, maskEmail, paidText, refundText, sendTelegram } from "./index";
import { summaryDue, yesterdayWib } from "./summary";

// D-112: owner alerts on Telegram. Minimal data, never in the way of a webhook.
describe("message text", () => {
  it("masks the email, or leaves it out", () => {
    expect(maskEmail("erdi@gmail.com")).toBe("er***@gmail.com");
    expect(maskEmail("a@x.id")).toBe("a***@x.id");
    expect(maskEmail("not an email")).toBe("***");
    const base = {
      event: "purchase" as const,
      product: "Myna Fit",
      plan: "12 bulan",
      amountIdr: 249000,
      provider: "pakasir",
      paymentId: "pay_1",
      email: "erdi@gmail.com",
      campaign: "c-quiz",
      source: "meta",
    };
    const masked = paidText({ ...base, emailMode: "masked" });
    expect(masked).toContain("Pembelian baru · Myna Fit");
    expect(masked).toContain("12 bulan · Rp249.000 · pakasir");
    expect(masked).toContain("Iklan: meta / c-quiz");
    expect(masked).toContain("Pembeli: er***@gmail.com");
    expect(masked).not.toContain("erdi@gmail.com");
    const omitted = paidText({ ...base, event: "renewal", emailMode: "omit", campaign: null, source: null });
    expect(omitted).toContain("Perpanjangan");
    expect(omitted).not.toMatch(/Pembeli|Iklan|@/);
    expect(refundText({ product: "P", plan: "6 bulan", amountIdr: 149000, paymentId: "pay_2" })).toContain("Rp149.000");
    expect(
      dailySummaryText("P", {
        day: "2026-10-30",
        purchases: 3,
        renewals: 1,
        revenueIdr: 900000,
        refunds: 0,
        quizStarts: 40,
        firstResults: 22,
      }),
    ).toBe("📊 P · 2026-10-30\nPembelian 3 · perpanjangan 1 · Rp900.000\nMulai kuis 40 → hasil pertama 22");
  });
});

describe("sendTelegram", () => {
  const cfg = { token: "123:ABC", chatId: "42" };
  it("posts plain text to sendMessage with link previews off", async () => {
    const calls: [string, RequestInit][] = [];
    const ok = await sendTelegram(cfg, "halo", {
      fetchImpl: (async (url: string, init: RequestInit) => {
        calls.push([url, init]);
        return new Response(JSON.stringify({ ok: true, result: {} }));
      }) as typeof fetch,
    });
    expect(ok).toBe(true);
    expect(calls[0]?.[0]).toBe("https://api.telegram.org/bot123:ABC/sendMessage");
    expect(JSON.parse(String(calls[0]?.[1].body))).toEqual({
      chat_id: "42",
      text: "halo",
      link_preview_options: { is_disabled: true },
    });
  });

  it("never throws: an HTTP error, Telegram's ok:false or a failing fetch are just false", async () => {
    const reply = (body: unknown, status = 200) =>
      (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
    expect(await sendTelegram(cfg, "x", { fetchImpl: reply({ ok: false, description: "chat not found" }, 400) })).toBe(
      false,
    );
    expect(await sendTelegram(cfg, "x", { fetchImpl: reply({ ok: false }) })).toBe(false);
    expect(
      await sendTelegram(cfg, "x", {
        fetchImpl: (async () => {
          throw new Error("down");
        }) as typeof fetch,
      }),
    ).toBe(false);
  });

  it("cuts text to Telegram's 4096 characters", async () => {
    let sent = "";
    await sendTelegram(cfg, "a".repeat(5000), {
      fetchImpl: (async (_u: string, init: RequestInit) => {
        sent = JSON.parse(String(init.body)).text;
        return new Response(JSON.stringify({ ok: true }));
      }) as typeof fetch,
    });
    expect(sent).toHaveLength(4096);
  });
});

describe("daily summary timing", () => {
  it("is due on the first half-hour of the Jakarta hour, once a day", () => {
    // 08:00 and 08:30 WIB = 01:00 and 01:30 UTC.
    expect(summaryDue(new Date("2026-10-31T01:00:00Z"), 8)).toBe(true);
    expect(summaryDue(new Date("2026-10-31T01:29:59Z"), 8)).toBe(true);
    expect(summaryDue(new Date("2026-10-31T01:30:00Z"), 8)).toBe(false);
    expect(summaryDue(new Date("2026-10-31T02:00:00Z"), 8)).toBe(false);
  });

  it("reports yesterday in Jakarta", () => {
    expect(yesterdayWib(new Date("2026-10-31T01:00:00Z"))).toBe("2026-10-30");
    // 23:30 UTC on the 30th is already the 31st in Jakarta.
    expect(yesterdayWib(new Date("2026-10-30T23:30:00Z"))).toBe("2026-10-30");
  });
});
