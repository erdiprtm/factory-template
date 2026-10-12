import { consents, type consentType } from "@factory/db";
import { and, eq, isNull, like, lt } from "drizzle-orm";
import type { Db } from "../entitlements";
import { anonKey } from "../quota";

export type ConsentType = (typeof consentType)[number];

/**
 * Current versions of the legal documents. Bump a version when the text of the policy changes;
 * users who consented to an older version are asked again. Dates match apps/site legal pages (Phase 6).
 */
export const CONSENT_VERSIONS = {
  terms: "2026-10-11",
  privacy: "2026-10-11",
  sensitive_data: "2026-10-11",
  marketing: "2026-10-11",
} as const satisfies Record<ConsentType, string>;

/** Consents required at signup. sensitive_data only when product.config.ts turns it on (UU PDP). */
export function requiredConsents(opts: { sensitiveDataConsent: boolean }): ConsentType[] {
  return opts.sensitiveDataConsent ? ["terms", "privacy", "sensitive_data"] : ["terms", "privacy"];
}

/** Records the given consents at their current versions. Skips ones already granted at that version. */
export async function recordConsents(db: Db, userId: string, types: ConsentType[], now = new Date()): Promise<void> {
  const missing = await missingConsents(db, userId, types);
  if (missing.length === 0) return;
  await db.insert(consents).values(
    missing.map((type) => ({
      id: crypto.randomUUID(),
      userId,
      type,
      version: CONSENT_VERSIONS[type],
      grantedAt: now,
      revokedAt: null,
    })),
  );
}

/** Consents the user has not granted (or has revoked) at the current version. */
export async function missingConsents(db: Db, userId: string, types: ConsentType[]): Promise<ConsentType[]> {
  const rows = await db
    .select({ type: consents.type, version: consents.version })
    .from(consents)
    .where(and(eq(consents.userId, userId), isNull(consents.revokedAt)));
  return types.filter((type) => !rows.some((r) => r.type === type && r.version === CONSENT_VERSIONS[type]));
}

/** Revokes a consent (UU PDP right to withdraw), e.g. marketing. */
export async function revokeConsent(db: Db, userId: string, type: ConsentType, now = new Date()): Promise<void> {
  await db
    .update(consents)
    .set({ revokedAt: now })
    .where(and(eq(consents.userId, userId), eq(consents.type, type), isNull(consents.revokedAt)));
}

// ---- Consent before signup (D-043) ----------------------------------------------------------
// "Pay for proof" (D-042) processes data before the visitor has an account: health products send a
// photo to an AI provider and ask body data in the quiz. UU PDP needs explicit consent BEFORE that,
// so it is recorded under the device id (`anon:<anonId>`, like free_usage) and moves to the account
// at sign-in, keeping its original time as the record of when it was given.

/** Days an unclaimed visitor's consent is kept. Products delete a visitor's results by then too. */
export const ANONYMOUS_CONSENT_DAYS = 90;

/** Moves a device's consents to the account. Safe to call on every sign-in check. */
export async function claimAnonymousConsents(db: Db, userId: string, anonId: string): Promise<void> {
  await db
    .update(consents)
    .set({ userId })
    .where(eq(consents.userId, anonKey(anonId)));
}

/** Drops visitors' consents that were never claimed by an account (cron). */
export async function purgeAnonymousConsents(db: Db, now = new Date()): Promise<void> {
  await db
    .delete(consents)
    .where(
      and(
        like(consents.userId, "anon:%"),
        lt(consents.grantedAt, new Date(now.getTime() - ANONYMOUS_CONSENT_DAYS * 86_400_000)),
      ),
    );
}
