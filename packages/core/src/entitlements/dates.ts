const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Adds calendar months in UTC, clamping to the last day of the target month
 * (Jan 31 + 1 month = Feb 28/29), so a paid month is never shorter or longer than the calendar.
 */
export function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/**
 * Purchase extends, never overlaps (Section 5): a new period starts at the later of now and the
 * latest current expiry, so buying early never loses days.
 */
export function nextPeriod(
  now: Date,
  latestExpiresAt: Date | null,
  length: { months: number } | { days: number },
): { startsAt: Date; expiresAt: Date } {
  const startsAt = latestExpiresAt && latestExpiresAt > now ? latestExpiresAt : now;
  const expiresAt = "months" in length ? addMonths(startsAt, length.months) : addDays(startsAt, length.days);
  return { startsAt, expiresAt };
}
