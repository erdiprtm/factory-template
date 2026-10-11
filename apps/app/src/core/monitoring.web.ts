// Web error monitoring: Sentry (FACTORY_BLUEPRINT.md Section 9). Native has a no-op
// (monitoring.ts) until Phase 10.
//
// Loaded on the FIRST ERROR, not at startup: a tiny listener catches errors from page start and
// only then fetches the ~1 MB SDK chunk (Metro doesn't tree-shake). Sessions without errors pay
// nothing, which kept the app's Lighthouse score (loading it after idle still cost ~20 points).
// Reports only from production/preview. Privacy: every personal-data collector off, no tracing,
// replay or breadcrumbs from before the error, events scrubbed (@factory/core/monitoring),
// user = opaque id.
import { PRIVATE_DATA_COLLECTION, scrubBreadcrumb, scrubEvent } from "@factory/core/monitoring";
import product from "../../../../product.config";
import { deployInfo } from "./deploy-env";

type SentryModule = typeof import("@sentry/browser");

const MAX_BUFFERED = 10;
let buffered: unknown[] = [];
let userId: string | null = null;
let sentry: SentryModule | null = null;
let loading: Promise<SentryModule | null> | null = null;
let listening = false;

function onWindowError(e: ErrorEvent) {
  report(e.error ?? new Error(e.message));
}
function onRejection(e: PromiseRejectionEvent) {
  report(e.reason);
}

/** Starts listening for errors (cheap). The SDK itself loads only when one happens. */
export function initMonitoring(): Promise<void> {
  if (!listening && product.monitoring.sentryDsn) {
    listening = true;
    window.addEventListener("error", onWindowError);
    window.addEventListener("unhandledrejection", onRejection);
  }
  return Promise.resolve();
}

function load(): Promise<SentryModule | null> {
  loading ??= (async () => {
    const dsn = product.monitoring.sentryDsn;
    if (!dsn) return null;
    const { env, commit } = await deployInfo();
    if (env !== "production" && env !== "preview") return null;
    const Sentry = await import("@sentry/browser");
    Sentry.init({
      dsn,
      environment: env,
      release: commit,
      dataCollection: PRIVATE_DATA_COLLECTION,
      // No session tracking (sends the IP); Sentry's own global handlers take over from ours.
      integrations: (defaults) => defaults.filter((i) => i.name !== "BrowserSession"),
      beforeSend: (event) => scrubEvent(event as never) as typeof event,
      beforeBreadcrumb: (crumb) => scrubBreadcrumb(crumb as never) as typeof crumb,
    });
    window.removeEventListener("error", onWindowError);
    window.removeEventListener("unhandledrejection", onRejection);
    Sentry.setUser(userId ? { id: userId } : null);
    sentry = Sentry;
    return Sentry;
  })().catch(() => null);
  return loading;
}

function report(err: unknown) {
  if (sentry) {
    sentry.captureException(err);
    return;
  }
  if (buffered.length < MAX_BUFFERED) buffered.push(err);
  void load().then((s) => {
    const pending = buffered;
    buffered = [];
    for (const e of pending) s?.captureException(e);
  });
}

/** Opaque user id only (never email or name); null on sign-out. Applied when Sentry loads. */
export function setMonitoringUser(id: string | null): void {
  userId = id;
  sentry?.setUser(id ? { id } : null);
}

/** Errors caught by React error boundaries (window.onerror never sees them). */
export function captureError(err: unknown): void {
  report(err);
}
