import type { ProductConfig } from "@factory/config";

/**
 * One domain (D-068): where a signed-out visitor at `path` goes instead of sign-in. Only "/" on the
 * production domain, and only when domain.anonymousHome is set; every other screen keeps sign-in.
 * The same rule as the Worker's redirect (apps/api/src/core/anonymous-home.ts).
 */
export function anonymousHomeFor(path: string, host: string, domain: ProductConfig["domain"]): string | null {
  if (!domain.anonymousHome || !domain.app || host !== domain.app) return null;
  return path === "/" ? domain.anonymousHome : null;
}
