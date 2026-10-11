import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// Template-owned core tables (FACTORY_BLUEPRINT.md Section 5). Products add tables in
// src/features/, never by altering these. Portable to Postgres: no SQLite-only types or
// functions. Amounts are integer IDR; timestamps are UTC epoch milliseconds.
//
// user_id columns reference Better Auth's `user` table (added in Phase 3). They are indexed
// but not foreign keys, so adding auth later needs no table rebuild (a contract migration).

const id = () => text("id").primaryKey();
const timestamp = (name: string) => integer(name, { mode: "timestamp_ms" });

export const paymentStatus = ["pending", "paid", "failed", "expired"] as const;
export const entitlementSource = ["trial", "payment", "admin_grant", "app_store", "play_store"] as const;
export const consentType = ["terms", "privacy", "sensitive_data", "marketing"] as const;
export const reminderKind = ["d7", "d1", "expired"] as const;

/** One row per checkout attempt. */
export const payments = sqliteTable(
  "payments",
  {
    id: id(),
    userId: text("user_id").notNull(),
    provider: text("provider").notNull(),
    // Set once the provider returns it; NULLs don't collide under the unique index.
    providerRef: text("provider_ref"),
    planId: text("plan_id").notNull(),
    amountIdr: integer("amount_idr").notNull(),
    status: text("status", { enum: paymentStatus }).notNull().default("pending"),
    createdAt: timestamp("created_at").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    paidAt: timestamp("paid_at"),
    rawPayload: text("raw_payload"),
  },
  (t) => [
    uniqueIndex("payments_provider_ref_unique").on(t.provider, t.providerRef),
    index("payments_user_idx").on(t.userId),
    index("payments_status_expires_idx").on(t.status, t.expiresAt),
  ],
);

/** Access periods. A user has access if any row has expires_at > now. */
export const entitlements = sqliteTable(
  "entitlements",
  {
    id: id(),
    userId: text("user_id").notNull(),
    source: text("source", { enum: entitlementSource }).notNull(),
    planId: text("plan_id"),
    startsAt: timestamp("starts_at").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    paymentId: text("payment_id").references(() => payments.id),
    createdAt: timestamp("created_at").notNull(),
  },
  (t) => [
    index("entitlements_user_expires_idx").on(t.userId, t.expiresAt),
    // A payment grants at most one entitlement (webhook replays can't double-grant).
    uniqueIndex("entitlements_payment_unique").on(t.paymentId),
    // A trial is granted at most once per user, even under concurrent requests.
    uniqueIndex("entitlements_one_trial_per_user").on(t.userId).where(sql`source = 'trial'`),
  ],
);

/** Webhook idempotency: the provider's event key is processed once. */
export const webhookEvents = sqliteTable(
  "webhook_events",
  {
    id: id(),
    provider: text("provider").notNull(),
    eventKey: text("event_key").notNull(),
    receivedAt: timestamp("received_at").notNull(),
    processedAt: timestamp("processed_at"),
    status: text("status").notNull(),
  },
  (t) => [uniqueIndex("webhook_events_provider_key_unique").on(t.provider, t.eventKey)],
);

/** UU PDP consent records. */
export const consents = sqliteTable(
  "consents",
  {
    id: id(),
    userId: text("user_id").notNull(),
    type: text("type", { enum: consentType }).notNull(),
    version: text("version").notNull(),
    grantedAt: timestamp("granted_at").notNull(),
    revokedAt: timestamp("revoked_at"),
  },
  (t) => [index("consents_user_idx").on(t.userId)],
);

/** Prevents duplicate renewal reminder emails. */
export const remindersSent = sqliteTable(
  "reminders_sent",
  {
    id: id(),
    userId: text("user_id").notNull(),
    entitlementId: text("entitlement_id")
      .notNull()
      .references(() => entitlements.id),
    kind: text("kind", { enum: reminderKind }).notNull(),
    sentAt: timestamp("sent_at").notNull(),
  },
  (t) => [uniqueIndex("reminders_sent_entitlement_kind_unique").on(t.entitlementId, t.kind)],
);
