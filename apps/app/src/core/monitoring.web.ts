// Web error monitoring: Sentry (FACTORY_BLUEPRINT.md Section 9). Native has a no-op
// (monitoring.ts) until Phase 10. Loaded lazily and only on production/preview, so local dev,
// E2E and the first paint never pay for it. Privacy: every personal-data collector off, no
// tracing or replay, events and breadcrumbs scrubbed (@factory/core/monitoring), user = opaque id.
import { PRIVATE_DATA_COLLECTION, scrubBreadcrumb, scrubEvent } from "@factory/core/monitoring";
import product from "../../../../product.config";
import { deployInfo } from "./deploy-env";

type SentryModule = typeof import("@sentry/browser");
let sentry: SentryModule | null = null;
let started: Promise<void> | null = null;

function afterLoadIdle(): Promise<void> {
  return new Promise((resolve) => {
    const idle = () =>
      "requestIdleCallback" in window ? window.requestIdleCallback(() => resolve()) : setTimeout(resolve, 1000);
    if (document.readyState === "complete") idle();
    else window.addEventListener("load", idle, { once: true });
  });
}

export function initMonitoring(): Promise<void> {
  started ??= (async () => {
    const dsn = product.monitoring.sentryDsn;
    if (!dsn) return;
    const { env, commit } = await deployInfo();
    if (env !== "production" && env !== "preview") return;
    // ~1 MB chunk (Metro doesn't tree-shake): fetch it after load, when the browser is idle,
    // so it never competes with the first screen. Errors in the first seconds aren't reported.
    await afterLoadIdle();
    const Sentry = await import("@sentry/browser");
    Sentry.init({
      dsn,
      environment: env,
      release: commit,
      dataCollection: PRIVATE_DATA_COLLECTION,
      // No session tracking (it sends the IP for release health); default error handlers stay.
      integrations: (defaults) => defaults.filter((i) => i.name !== "BrowserSession"),
      beforeSend: (event) => scrubEvent(event as never) as typeof event,
      beforeBreadcrumb: (crumb) => scrubBreadcrumb(crumb as never) as typeof crumb,
    });
    sentry = Sentry;
  })();
  return started;
}

/** Opaque user id only (never email or name); null on sign-out. */
export function setMonitoringUser(userId: string | null): void {
  void initMonitoring().then(() => sentry?.setUser(userId ? { id: userId } : null));
}

export function captureError(err: unknown): void {
  void initMonitoring().then(() => sentry?.captureException(err));
}
