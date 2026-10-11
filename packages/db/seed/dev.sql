-- Local development seed (pnpm db:seed:local). Never runs against remote databases.
-- Times are UTC epoch milliseconds. Re-runnable: rows are replaced by id.
INSERT OR REPLACE INTO payments (id, user_id, provider, provider_ref, plan_id, amount_idr, status, created_at, expires_at, paid_at, raw_payload)
VALUES ('seed-payment-1', 'seed-user-paid', 'duitku', 'SEED-REF-1', '12m', 249000, 'paid', 1791676800000, 1791680400000, 1791676800000, NULL);

INSERT OR REPLACE INTO entitlements (id, user_id, source, plan_id, starts_at, expires_at, payment_id, created_at) VALUES
  -- active paid user (12 months from 2026-10-11)
  ('seed-ent-paid', 'seed-user-paid', 'payment', '12m', 1791676800000, 1823212800000, 'seed-payment-1', 1791676800000),
  -- trial user whose trial already expired (paywall case)
  ('seed-ent-trial', 'seed-user-expired', 'trial', NULL, 1788998400000, 1789603200000, NULL, 1788998400000);
