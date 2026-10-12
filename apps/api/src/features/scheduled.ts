import type { Bindings } from "../index";

// PRODUCT-OWNED: the product's own scheduled jobs (D-046), run by core's cron (every 30 minutes,
// wrangler.jsonc triggers) after the core jobs. Typical uses: retention promised in the privacy
// policy (delete visitors' unclaimed results, data 24 months after a plan lapses, with an email
// first), or a daily summary. Jobs that should run once a day check `now` themselves. Return
// counts for the log, e.g. { anonymousScansDeleted: 3 }. A throw here is reported and doesn't stop
// the core jobs.
export async function runProductScheduled(_env: Bindings, _now: Date): Promise<Record<string, number>> {
  return {};
}
