import { consents, type consentType } from "@factory/db";
import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "../entitlements";

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
