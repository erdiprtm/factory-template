import { env } from "cloudflare:workers";
import { config } from "@factory/config/product";
import { DOWNLOAD_HOURS, DOWNLOAD_MAX_USES } from "@factory/core/billing";
import { capturedEmails } from "@factory/core/email";
import { consents, downloadLinks, downloads, funnelEvents, payments, schema } from "@factory/db";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fakeProvider } from "../src/core/payments";
import { app } from "../src/index";
import { BASE, call, get, post, signInWithConsent } from "./helpers";

// D-130: one-time digital purchases without an account, end to end on the FakeProvider and the
// local D1 + R2: checkout → signed webhook → one download + one email → the file, with the
// link's limits. The product is added to the loaded config for this file only (D-078 style).
const db = drizzle(env.DB, { schema });
const EBOOK = { id: "test-ebook", label: "Ebook Uji", priceIdr: 149_000, fileKey: "test/ebook-uji.pdf" };
const PDF = new TextEncoder().encode("%PDF-1.4 test ebook");
/** A visitor's POST, each from its own IP: guest checkout and resend are limited per IP. */
const guestPost = (path: string, body: unknown) =>
  call(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "cf-connecting-ip": `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
    },
    body: JSON.stringify(body),
  });
const uniqueEmail = (tag: string) => `${tag}-${crypto.randomUUID()}@example.com`;
const products = config.digitalProducts as (typeof EBOOK)[];

beforeAll(async () => {
  products.push(EBOOK);
  await env.FILES?.put(EBOOK.fileKey, PDF);
});
afterAll(() => {
  products.splice(products.indexOf(EBOOK), 1);
});

async function buy(email: string, accept = ["terms", "privacy"]) {
  const res = await guestPost(`/api/products/${EBOOK.id}/checkout`, { email, accept });
  return { res, body: await res.json<{ paymentId: string; redirectUrl: string; error?: string }>() };
}
const pay = (paymentId: string, eventId = `evt-${crypto.randomUUID()}`) => {
  const hook = fakeProvider().pay(paymentId, eventId);
  return app.request(hook.url, hook, env);
};
/** The link in the newest email to this address. */
const emailedLink = (email: string) =>
  capturedEmails()
    .last(email)
    ?.text.match(/https?:\/\/\S+\/api\/downloads\/\S+/)?.[0];
const download = (url: string, accept = "application/pdf") =>
  app.request(url.replace(/^https?:\/\/[^/]+/, BASE), { headers: { accept } }, env);

describe("digital product checkout (D-130)", () => {
  it("needs terms and privacy, a valid email and a known product", async () => {
    expect((await buy(uniqueEmail("x"), ["terms"])).res.status).toBe(400);
    expect(
      (await guestPost(`/api/products/${EBOOK.id}/checkout`, { email: "nope", accept: ["terms", "privacy"] })).status,
    ).toBe(400);
    expect(
      (await guestPost("/api/products/nothing/checkout", { email: uniqueEmail("x"), accept: ["terms", "privacy"] }))
        .status,
    ).toBe(404);
  });

  it("starts a guest payment at the config's price, with consents under a guest id and no account", async () => {
    const email = uniqueEmail("Guest").replace("Guest", "GUEST");
    const { res, body } = await buy(email, ["terms", "privacy", "marketing"]);
    expect(res.status).toBe(200);
    const row = await db.select().from(payments).where(eq(payments.id, body.paymentId)).get();
    expect(row).toMatchObject({
      planId: EBOOK.id,
      amountIdr: EBOOK.priceIdr,
      status: "pending",
      buyerEmail: email.toLowerCase(),
    });
    expect(row?.userId).toMatch(/^guest_[0-9a-f]{32}$/);
    const given = await db
      .select()
      .from(consents)
      .where(eq(consents.userId, row?.userId ?? ""));
    expect(given.map((c) => c.type).sort()).toEqual(["marketing", "privacy", "terms"]);
    // The provider sends the buyer back to the thank-you page with its key.
    const back = fakeProvider().checkouts.find((c) => c.paymentId === body.paymentId);
    expect(back?.successUrl).toMatch(/\/beli\/terima-kasih\?paymentId=pay_[0-9a-f]{32}&k=/);
    expect(back?.itemName).toBe(EBOOK.label);
  });
});

describe("a time-limited sale (D-136)", () => {
  type Sale = { priceIdr: number; until: string; label?: string };
  const withSale = (sale: Sale | undefined) => {
    (EBOOK as typeof EBOOK & { sale?: Sale }).sale = sale;
  };

  it("the catalog and checkout charge the sale price until it ends, then the normal price", async () => {
    withSale({ priceIdr: 89_000, until: new Date(Date.now() + 3_600_000).toISOString(), label: "Diskon akhir tahun" });
    const catalog = await (await get("/api/products", null)).json<{ products: Record<string, unknown>[] }>();
    expect(catalog.products.find((p) => p.id === EBOOK.id)).toMatchObject({
      priceIdr: 89_000,
      listPriceIdr: EBOOK.priceIdr,
      saleLabel: "Diskon akhir tahun",
    });
    const onSale = await buy(uniqueEmail("sale"));
    expect((await db.select().from(payments).where(eq(payments.id, onSale.body.paymentId)).get())?.amountIdr).toBe(
      89_000,
    );

    withSale({ priceIdr: 89_000, until: new Date(Date.now() - 1000).toISOString() });
    const after = await buy(uniqueEmail("after"));
    expect((await db.select().from(payments).where(eq(payments.id, after.body.paymentId)).get())?.amountIdr).toBe(
      EBOOK.priceIdr,
    );
    withSale(undefined);
  });
});

describe("paid: one download, one email, the file (D-130)", () => {
  it("settles once on a replayed webhook, emails one link, and the thank-you page shows the same link", async () => {
    const email = uniqueEmail("buyer");
    const { body } = await buy(email);
    const thanks = fakeProvider().checkouts.find((c) => c.paymentId === body.paymentId)?.successUrl ?? "";
    const statusUrl = `/api/products/status?${new URL(thanks).searchParams.toString()}`;
    expect(await (await get(statusUrl, null)).json()).toMatchObject({ status: "pending", downloadUrl: null });

    // A forged webhook is refused; the real one settles; a replay (same or new event) changes nothing.
    const forged = fakeProvider().webhook(body.paymentId, "paid", "evt-forged", "wrong");
    expect((await app.request(forged.url, forged, env)).status).toBe(401);
    const sentBefore = capturedEmails().sent.length;
    expect((await pay(body.paymentId, "evt-same")).status).toBe(200);
    expect((await pay(body.paymentId, "evt-same")).status).toBe(200);
    expect((await pay(body.paymentId)).status).toBe(200);
    expect(await db.select().from(downloads).where(eq(downloads.paymentId, body.paymentId))).toHaveLength(1);
    expect(
      capturedEmails()
        .sent.slice(sentBefore)
        .filter((e) => e.to === email),
    ).toHaveLength(1);
    const purchase = await db.select().from(funnelEvents).where(eq(funnelEvents.event, "purchase"));
    expect(purchase.filter((e) => e.valueIdr === EBOOK.priceIdr).length).toBeGreaterThanOrEqual(1);

    const mail = capturedEmails().last(email);
    expect(mail?.text).toContain(`${DOWNLOAD_HOURS} jam`);
    const link = emailedLink(email) ?? "";
    const status = await (await get(statusUrl, null)).json<{ status: string; downloadUrl: string }>();
    expect(status.status).toBe("paid");
    expect(link.endsWith(status.downloadUrl)).toBe(true);

    const file = await download(link);
    expect(file.status).toBe(200);
    expect(file.headers.get("content-disposition")).toContain("attachment");
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(PDF);
  });

  it("a link works DOWNLOAD_MAX_USES times, then 410; a wrong signature 403; a person goes to the resend page", async () => {
    const email = uniqueEmail("limits");
    const { body } = await buy(email);
    await pay(body.paymentId);
    const link = emailedLink(email) ?? "";
    for (let i = 0; i < DOWNLOAD_MAX_USES; i++) expect((await download(link)).status).toBe(200);
    expect((await download(link)).status).toBe(410);
    const page = await download(link, "text/html");
    expect(page.status).toBe(302);
    expect(page.headers.get("location")).toBe("/beli/unduh?link=gone");
    const [id] = link.split("/").at(-1)?.split(".") ?? [];
    expect((await download(`${BASE}/api/downloads/${id}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`)).status).toBe(
      403,
    );
    expect((await download(`${BASE}/api/downloads/garbage`)).status).toBe(403);
  });

  it("an expired link is refused, and 'kirim ulang' emails a fresh one to the buyer only", async () => {
    const email = uniqueEmail("expired");
    const { body } = await buy(email);
    await pay(body.paymentId);
    const old = emailedLink(email) ?? "";
    const grant = await db.select().from(downloads).where(eq(downloads.paymentId, body.paymentId)).get();
    await db
      .update(downloadLinks)
      .set({ expiresAt: new Date(Date.now() - 1000), createdAt: new Date(Date.now() - 3_600_000) })
      .where(eq(downloadLinks.downloadId, grant?.id ?? ""));
    expect((await download(old)).status).toBe(410);

    const stranger = uniqueEmail("stranger");
    expect((await guestPost("/api/products/resend", { email: stranger })).status).toBe(200);
    expect(capturedEmails().last(stranger)).toBeUndefined();
    expect((await guestPost("/api/products/resend", { email: email.toUpperCase() })).status).toBe(200);
    const fresh = emailedLink(email) ?? "";
    expect(fresh).not.toBe(old);
    expect((await download(fresh)).status).toBe(200);
  });

  it("belongs to an account made later with the same email: history, export, and erasure", async () => {
    const email = uniqueEmail("later");
    const { body } = await buy(email);
    await pay(body.paymentId);
    const cookie = await signInWithConsent(email);
    const history = await (await get("/api/billing/history", cookie)).json<{ payments: { id: string }[] }>();
    expect(history.payments.map((p) => p.id)).toContain(body.paymentId);
    const exported = await (await get("/api/account/export", cookie)).json<{ purchases: { paymentId: string }[] }>();
    expect(exported.purchases.map((p) => p.paymentId)).toContain(body.paymentId);

    expect((await post("/api/account/delete", cookie, { confirm: "HAPUS" })).status).toBe(200);
    const kept = await db.select().from(payments).where(eq(payments.id, body.paymentId)).get();
    expect(kept).toMatchObject({ status: "paid", amountIdr: EBOOK.priceIdr, buyerEmail: null });
    expect(
      await db
        .select()
        .from(consents)
        .where(eq(consents.userId, kept?.userId ?? "")),
    ).toHaveLength(0);
    const grant = await db.select().from(downloads).where(eq(downloads.paymentId, body.paymentId)).get();
    expect(grant?.email).toBe("deleted");
    expect(
      await db
        .select()
        .from(downloadLinks)
        .where(eq(downloadLinks.downloadId, grant?.id ?? "")),
    ).toHaveLength(0);
  });

  it("the thank-you key only opens its own payment", async () => {
    const { body } = await buy(uniqueEmail("a"));
    const other = await buy(uniqueEmail("b"));
    const thanks = fakeProvider().checkouts.find((c) => c.paymentId === body.paymentId)?.successUrl ?? "";
    const k = new URL(thanks).searchParams.get("k") ?? "";
    expect(
      (await get(`/api/products/status?paymentId=${other.body.paymentId}&k=${encodeURIComponent(k)}`, null)).status,
    ).toBe(404);
  });
});
