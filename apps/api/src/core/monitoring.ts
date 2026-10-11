import { config } from "@factory/config/product";
import { PRIVATE_DATA_COLLECTION, scrubBreadcrumb, scrubEvent } from "@factory/core/monitoring";
import * as Sentry from "@sentry/cloudflare";

type MonitoringEnv = { APP_ENV: string; COMMIT_SHA?: string };

/**
 * Sentry for the Worker (FACTORY_BLUEPRINT.md Section 9). Only deployed environments report;
 * local dev and tests get no client. Privacy: Sentry v11 collects user info, cookies, headers,
 * bodies and queries by default, so all of it is switched off here and scrubbed again in
 * beforeSend (@factory/core/monitoring). No tracing.
 */
export function sentryOptions(
  env: MonitoringEnv,
  dsn: string | null = config.monitoring.sentryDsn,
): Sentry.CloudflareOptions | undefined {
  if (!dsn || (env.APP_ENV !== "production" && env.APP_ENV !== "preview")) return undefined;
  return {
    dsn,
    environment: env.APP_ENV,
    release: env.COMMIT_SHA,
    dataCollection: PRIVATE_DATA_COLLECTION,
    beforeSend: (event) => scrubEvent(event as never) as typeof event,
    beforeBreadcrumb: (crumb) => scrubBreadcrumb(crumb as never) as typeof crumb,
  };
}

export function withMonitoring<T extends object>(handler: T): T {
  return Sentry.withSentry((env: MonitoringEnv) => sentryOptions(env), handler as never) as T;
}

export function captureError(err: unknown): void {
  Sentry.captureException(err);
}
