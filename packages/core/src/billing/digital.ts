import { attributions, consents, downloadLinks, downloads, payments, paymentTracking } from "@factory/db";
import { and, desc, eq, gt, inArray, lt } from "drizzle-orm";
import type { Db } from "../entitlements";

// One-time digital purchases (D-130), e.g. an ebook PDF. Bought without an account: the buyer
// gives an email, pays through the configured hosted-page provider, and gets a download link that
// works for DOWNLOAD_HOURS and at most DOWNLOAD_MAX_USES downloads (Erdi, 2026-11-21). A new link
// can always be sent to the same email. No account is created: the payment keeps the email only.

export const DOWNLOAD_HOURS = 72;
export const DOWNLOAD_MAX_USES = 5;

export type DigitalPrice = {
  /** What is charged now. */
  priceIdr: number;
  /** The normal price while a sale runs (to strike through), else null. */
  listPriceIdr: number | null;
  saleUntil: string | null;
  saleLabel: string | null;
};

/**
 * A digital product's price right now (D-136): the sale price until `sale.until`, then the normal
 * price. The one place checkout, the catalog and the buy page take it from; never the browser.
 */
export function currentDigitalPrice(
  product: { priceIdr: number; sale?: { priceIdr: number; until: string; label?: string } },
  now = new Date(),
): DigitalPrice {
  const sale = product.sale;
  if (sale && now.getTime() <= Date.parse(sale.until))
    return {
      priceIdr: sale.priceIdr,
      listPriceIdr: product.priceIdr,
      saleUntil: sale.until,
      saleLabel: sale.label ?? null,
    };
  return { priceIdr: product.priceIdr, listPriceIdr: null, saleUntil: null, saleLabel: null };
}

/** The payment's user_id for a purchase without an account: its consents and attribution hang on it. */
export const guestId = () => `guest_${crypto.randomUUID().replaceAll("-", "")}`;
export const isGuestId = (userId: string) => userId.startsWith("guest_");

export type Download = typeof downloads.$inferSelect;

/**
 * Grants a paid purchase's download, once per payment (unique payment_id): a replayed webhook or a
 * racing status check gets the same row back. `created` is true only for the call that made it.
 */
export async function grantDownload(
  db: Db,
  payment: { id: string; planId: string; buyerEmail: string },
  now = new Date(),
): Promise<{ download: Download; created: boolean }> {
  const inserted = await db
    .insert(downloads)
    .values({
      id: crypto.randomUUID(),
      paymentId: payment.id,
      productId: payment.planId,
      email: payment.buyerEmail,
      createdAt: now,
    })
    .onConflictDoNothing()
    .returning();
  if (inserted[0]) return { download: inserted[0], created: true };
  const row = await db.select().from(downloads).where(eq(downloads.paymentId, payment.id)).get();
  if (!row) throw new Error(`download for ${payment.id} missing after conflict`);
  return { download: row, created: false };
}

// --- Signed tokens: HMAC-SHA256 over a purpose and an id, keyed with a Worker secret ---------------

const enc = new TextEncoder();
const b64url = (bytes: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
function fromB64url(s: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(s)) return null;
  const bin = atob(s.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - (s.length % 4)) % 4));
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const hmacKey = (secret: string) =>
  crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);

async function sign(secret: string, purpose: string, id: string): Promise<string> {
  return b64url(await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(`${purpose}:${id}`)));
}
/** Constant-time (crypto.subtle.verify). */
async function verify(secret: string, purpose: string, id: string, sig: string): Promise<boolean> {
  const bytes = fromB64url(sig);
  if (!bytes) return false;
  return crypto.subtle.verify("HMAC", await hmacKey(secret), bytes, enc.encode(`${purpose}:${id}`));
}

/**
 * The thank-you page's key for one payment (D-130): the buyer has no session, so the return URL
 * carries `k`, which only the server can make. It shows that payment's status and download only.
 */
export const purchaseKey = (secret: string, paymentId: string) => sign(secret, "purchase", paymentId);
export const checkPurchaseKey = (secret: string, paymentId: string, key: string) =>
  verify(secret, "purchase", paymentId, key);

/** A download link's token from its id: `<link id>.<hmac>`. */
export const downloadLinkToken = async (secret: string, id: string) => `${id}.${await sign(secret, "download", id)}`;

/** A new download link for a granted purchase. The token is `<link id>.<hmac>`. */
export async function createDownloadLink(
  db: Db,
  secret: string,
  downloadId: string,
  now = new Date(),
): Promise<{ token: string; expiresAt: Date }> {
  const id = crypto.randomUUID().replaceAll("-", "");
  const expiresAt = new Date(now.getTime() + DOWNLOAD_HOURS * 3_600_000);
  await db.insert(downloadLinks).values({
    id,
    downloadId,
    expiresAt,
    uses: 0,
    maxUses: DOWNLOAD_MAX_USES,
    createdAt: now,
  });
  return { token: await downloadLinkToken(secret, id), expiresAt };
}

export type LinkUse =
  /** Not a token we made (bad format or signature): 403. */
  | { kind: "invalid" }
  /** Ours, but expired or used up: 410, and the page offers a new link by email. */
  | { kind: "gone" }
  | { kind: "ok"; productId: string };

/** Spends one use of a download link, atomically (one conditional UPDATE), if it is still valid. */
export async function useDownloadLink(db: Db, secret: string, token: string, now = new Date()): Promise<LinkUse> {
  const [id, sig] = token.split(".");
  if (!id || !sig || !/^[0-9a-f]{32}$/.test(id) || !(await verify(secret, "download", id, sig)))
    return { kind: "invalid" };
  const link = await db.select().from(downloadLinks).where(eq(downloadLinks.id, id)).get();
  if (!link) return { kind: "invalid" };
  const spent = await db
    .update(downloadLinks)
    .set({ uses: link.uses + 1 })
    .where(
      and(
        eq(downloadLinks.id, id),
        eq(downloadLinks.uses, link.uses),
        lt(downloadLinks.uses, link.maxUses),
        gt(downloadLinks.expiresAt, now),
      ),
    )
    .returning({ id: downloadLinks.id });
  if (spent.length === 0) {
    // Lost a race for the same use: read again once, then give up as gone.
    const again = await db.select().from(downloadLinks).where(eq(downloadLinks.id, id)).get();
    if (!again || again.uses >= again.maxUses || again.expiresAt <= now) return { kind: "gone" };
    return useDownloadLink(db, secret, token, now);
  }
  const download = await db
    .select({ productId: downloads.productId })
    .from(downloads)
    .where(eq(downloads.id, link.downloadId))
    .get();
  return download ? { kind: "ok", productId: download.productId } : { kind: "invalid" };
}

/** The download granted by a payment, if it is paid. */
export async function downloadForPayment(db: Db, paymentId: string): Promise<Download | null> {
  return (await db.select().from(downloads).where(eq(downloads.paymentId, paymentId)).get()) ?? null;
}

/** "Kirim ulang link": the purchases made with this email, newest first (one per product). */
export async function downloadsForEmail(db: Db, email: string): Promise<Download[]> {
  const rows = await db
    .select()
    .from(downloads)
    .where(eq(downloads.email, email.toLowerCase()))
    .orderBy(desc(downloads.createdAt))
    .limit(20);
  const seen = new Set<string>();
  return rows.filter((r) => !seen.has(r.productId) && seen.add(r.productId));
}

/** UU PDP access: the purchases made with this email (also before the account existed). */
export async function exportPurchases(db: Db, email: string) {
  return db
    .select({
      paymentId: payments.id,
      productId: payments.planId,
      amountIdr: payments.amountIdr,
      status: payments.status,
      createdAt: payments.createdAt,
      paidAt: payments.paidAt,
    })
    .from(payments)
    .where(eq(payments.buyerEmail, email.toLowerCase()));
}

/**
 * UU PDP erasure for an email's purchases: the links and the email go; the payment rows stay for
 * financial records, de-identified like an account's (D-130, as deleteUserData does for payments).
 */
export async function forgetPurchases(db: Db, email: string): Promise<void> {
  const mail = email.toLowerCase();
  // The purchases' guest ids hold their consents and ad attribution: those go too.
  const rows = await db
    .select({ id: payments.id, userId: payments.userId })
    .from(payments)
    .where(eq(payments.buyerEmail, mail));
  const guests = rows.flatMap((r) => (isGuestId(r.userId) ? [r.userId] : []));
  if (guests.length > 0) {
    await db.delete(consents).where(inArray(consents.userId, guests));
    await db.delete(attributions).where(inArray(attributions.userId, guests));
  }
  if (rows.length > 0)
    await db.delete(paymentTracking).where(
      inArray(
        paymentTracking.paymentId,
        rows.map((r) => r.id),
      ),
    );
  const ids = (await db.select({ id: downloads.id }).from(downloads).where(eq(downloads.email, mail))).map((r) => r.id);
  if (ids.length > 0) {
    await db.delete(downloadLinks).where(inArray(downloadLinks.downloadId, ids));
    await db.update(downloads).set({ email: "deleted" }).where(inArray(downloads.id, ids));
  }
  await db
    .update(payments)
    .set({ buyerEmail: null, rawPayload: null, fbclid: null })
    .where(eq(payments.buyerEmail, mail));
}
