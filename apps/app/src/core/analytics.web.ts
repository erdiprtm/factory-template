// Web analytics: OpenPanel (FACTORY_BLUEPRINT.md Section 9). Native has its own no-op
// (analytics.ts) until Phase 10. Events are sent only when the API reports env "production",
// so previews, local dev and E2E never reach OpenPanel. Names are checked and PII scrubbed
// by @factory/core/analytics; users are identified by their opaque id, never email or name.
import {
  type AnalyticsEvent,
  createAnalytics,
  type EventProps,
  noopAnalytics,
  openPanelProvider,
} from "@factory/core/analytics";
import { OpenPanel } from "@openpanel/web";
import product from "../../../../product.config";
import { deployInfo } from "./deploy-env";

let analytics = createAnalytics(noopAnalytics);
let op: OpenPanel | null = null;
let ready: Promise<void> | null = null;
let flushed = false;
let queue: [AnalyticsEvent, EventProps | undefined][] = [];

/** Starts analytics once (root layout). Events tracked before it resolves are queued. */
export function initAnalytics(): Promise<void> {
  ready ??= (async () => {
    const clientId = product.analytics.openpanelClientId;
    const env = clientId ? (await deployInfo()).env : undefined;
    if (clientId && env === "production") {
      op = new OpenPanel({ clientId, trackScreenViews: true });
      analytics = createAnalytics(openPanelProvider(op));
    }
    for (const [event, props] of queue) analytics.track(event, props);
    queue = [];
    flushed = true;
  })();
  return ready;
}

export function track(event: AnalyticsEvent, props?: EventProps): void {
  if (!flushed) {
    queue.push([event, props]);
    return;
  }
  analytics.track(event, props);
}

/** Ties later events to the signed-in user (opaque id only). */
export function identify(userId: string): void {
  void initAnalytics().then(() => op?.identify({ profileId: userId }));
}

/** Sign-out / account deletion: forget the profile on this device. */
export function resetAnalytics(): void {
  op?.clear();
}
