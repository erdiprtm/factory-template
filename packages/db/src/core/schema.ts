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

// refunded: set by an admin after refunding at the provider (D-038); access ends at that moment.
export const paymentStatus = ["pending", "paid", "failed", "expired", "refunded"] as const;
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
    // The buyer's first-touch ad attribution, copied at checkout (sell engine, D-033).
    utmSource: text("utm_source"),
    utmMedium: text("utm_medium"),
    utmCampaign: text("utm_campaign"),
    utmContent: text("utm_content"),
    fbclid: text("fbclid"),
  },
  (t) => [
    uniqueIndex("payments_provider_ref_unique").on(t.provider, t.providerRef),
    index("payments_user_idx").on(t.userId),
    index("payments_status_expires_idx").on(t.status, t.expiresAt),
    index("payments_utm_campaign_idx").on(t.utmCampaign),
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

/**
 * First-touch ad attribution, one row per user (sell engine, D-033). Captured on the device's
 * first visit (UTM tags, fbclid) and attached at signup. anon_id is the device's random id, which
 * ties the user's pre-signup funnel events to them.
 */
export const attributions = sqliteTable(
  "attributions",
  {
    id: id(),
    userId: text("user_id").notNull(),
    anonId: text("anon_id"),
    utmSource: text("utm_source"),
    utmMedium: text("utm_medium"),
    utmCampaign: text("utm_campaign"),
    utmContent: text("utm_content"),
    fbclid: text("fbclid"),
    landingPath: text("landing_path"),
    firstSeenAt: timestamp("first_seen_at").notNull(),
    createdAt: timestamp("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("attributions_user_unique").on(t.userId),
    index("attributions_anon_idx").on(t.anonId),
    index("attributions_utm_campaign_idx").on(t.utmCampaign),
  ],
);

/**
 * First-party funnel events (the standard funnel names in @factory/core/analytics), for /admin's
 * funnel and per-campaign numbers. Browser steps are keyed by anon_id; purchase, renewal and
 * refund are written by the server only. No personal data: ids are random, values are integer IDR.
 */
export const funnelEvents = sqliteTable(
  "funnel_events",
  {
    id: id(),
    event: text("event").notNull(),
    anonId: text("anon_id"),
    userId: text("user_id"),
    step: integer("step"),
    utmSource: text("utm_source"),
    utmCampaign: text("utm_campaign"),
    valueIdr: integer("value_idr"),
    // The device's A/B arm when the event happened (D-094), derived by the API from anonId.
    experiment: text("experiment"),
    variant: text("variant"),
    createdAt: timestamp("created_at").notNull(),
  },
  (t) => [
    index("funnel_events_event_created_idx").on(t.event, t.createdAt),
    index("funnel_events_experiment_created_idx").on(t.experiment, t.createdAt),
    index("funnel_events_campaign_created_idx").on(t.utmCampaign, t.createdAt),
    index("funnel_events_anon_idx").on(t.anonId),
    index("funnel_events_user_idx").on(t.userId),
  ],
);

/**
 * Browser context saved at checkout for the Meta Conversions API (D-034): the webhook has no
 * browser, and Meta needs the buyer's user agent (plus fbp/fbc/IP for matching). Written only with
 * marketing consent, deleted once the event is sent, and after 7 days at the latest.
 */
export const paymentTracking = sqliteTable(
  "payment_tracking",
  {
    paymentId: text("payment_id")
      .primaryKey()
      .references(() => payments.id),
    fbp: text("fbp"),
    fbc: text("fbc"),
    clientIp: text("client_ip"),
    userAgent: text("user_agent"),
    sourceUrl: text("source_url").notNull(),
    createdAt: timestamp("created_at").notNull(),
  },
  (t) => [index("payment_tracking_created_idx").on(t.createdAt)],
);

/**
 * What the buyer pays in our own checkout screen (Pakasir, D-092), one row per payment: the
 * method, the provider's fee and total, the QR string or VA number, the provider's expiry and its
 * sandbox flag. `status_checked_at` throttles status calls (Pakasir: once per transaction per 4 s).
 * Hosted-page providers (Duitku, DOKU) write none.
 */
export const paymentCharges = sqliteTable("payment_charges", {
  paymentId: text("payment_id")
    .primaryKey()
    .references(() => payments.id),
  method: text("method").notNull(),
  feeIdr: integer("fee_idr").notNull(),
  totalIdr: integer("total_idr").notNull(),
  qrString: text("qr_string"),
  vaNumber: text("va_number"),
  providerExpiresAt: timestamp("provider_expires_at").notNull(),
  isSandbox: integer("is_sandbox", { mode: "boolean" }).notNull(),
  statusCheckedAt: timestamp("status_checked_at"),
  createdAt: timestamp("created_at").notNull(),
});

/**
 * Quiz onboarding answers (sell engine Module 4, D-036), one row per user and quiz. Answered on
 * the device before signup, attached after sign-in and consent; a retake replaces the answers.
 * Products read them to personalize (apps/api/src/features). JSON, validated on write.
 */
export const quizResponses = sqliteTable(
  "quiz_responses",
  {
    id: id(),
    userId: text("user_id").notNull(),
    quizId: text("quiz_id").notNull(),
    answers: text("answers").notNull(),
    completedAt: timestamp("completed_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (t) => [uniqueIndex("quiz_responses_user_quiz_unique").on(t.userId, t.quizId)],
);

/**
 * Free uses of the product's core action before the paywall (sell engine Module 5, D-037).
 * Server-enforced: one row per user and action, incremented atomically up to the product's limit.
 */
export const freeUsage = sqliteTable(
  "free_usage",
  {
    id: id(),
    userId: text("user_id").notNull(),
    action: text("action").notNull(),
    used: integer("used").notNull().default(0),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (t) => [uniqueIndex("free_usage_user_action_unique").on(t.userId, t.action)],
);

/**
 * Ad spend per day, channel and campaign (sell engine Module 6, D-038), entered by hand or
 * imported from an Ads Manager CSV. `campaign` must equal the ads' utm_campaign, which is how
 * spend joins to buyers. One row per (day, channel, campaign): a re-import replaces the amount.
 */
export const adSpend = sqliteTable(
  "ad_spend",
  {
    id: id(),
    /** Asia/Jakarta calendar day, YYYY-MM-DD. */
    day: text("day").notNull(),
    channel: text("channel").notNull(),
    campaign: text("campaign").notNull(),
    amountIdr: integer("amount_idr").notNull(),
    /** manual | csv | api (a future Marketing API sync, AdSpendSource). */
    source: text("source").notNull(),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("ad_spend_day_channel_campaign_unique").on(t.day, t.channel, t.campaign),
    index("ad_spend_day_idx").on(t.day),
  ],
);

/**
 * One row per AI call (D-045): an account, or `anon:<anonId>` for a visitor (D-042). Per-user daily
 * caps, the global anonymous budget and cost tracking read it. Failed calls are logged too.
 */
export const aiUsage = sqliteTable(
  "ai_usage",
  {
    id: id(),
    userId: text("user_id").notNull(),
    feature: text("feature").notNull(),
    model: text("model").notNull(),
    tier: text("tier").notNull(),
    ok: integer("ok", { mode: "boolean" }).notNull(),
    error: text("error"),
    latencyMs: integer("latency_ms").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    cachedInputTokens: integer("cached_input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    // Micro-USD (1e-6 USD) from the provider's list prices; null for a model without a known price.
    costMicroUsd: integer("cost_micro_usd"),
    createdAt: timestamp("created_at").notNull(),
  },
  (t) => [index("ai_usage_user_time_idx").on(t.userId, t.createdAt), index("ai_usage_time_idx").on(t.createdAt)],
);

/**
 * Files a product stores for a user, e.g. a meal photo thumbnail (D-049). The bytes live in the
 * R2 bucket bound as FILES under `f/<id>`; this row says who owns them (an account, or
 * `anon:<anonId>` for a visitor, D-042), so access, export, deletion and retention work by owner.
 */
export const files = sqliteTable(
  "files",
  {
    id: id(),
    userId: text("user_id").notNull(),
    feature: text("feature").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    createdAt: timestamp("created_at").notNull(),
  },
  (t) => [index("files_user_idx").on(t.userId, t.createdAt)],
);
