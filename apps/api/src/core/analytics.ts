import { config } from "@factory/config/product";
import { noopServerAnalytics, openPanelServer, type ServerAnalytics } from "@factory/core/analytics";

export type AnalyticsEnv = {
  APP_ENV: string;
  /** OpenPanel client secret (Worker secret). Server events are sent only with it, from production. */
  OPENPANEL_CLIENT_SECRET?: string;
};

/** Server-side standard events (Section 9): payment results and reminders, which the browser can miss. */
export function serverAnalytics(env: AnalyticsEnv): ServerAnalytics {
  const clientId = config.analytics.openpanelClientId;
  if (!clientId || !env.OPENPANEL_CLIENT_SECRET || env.APP_ENV !== "production") return noopServerAnalytics;
  return openPanelServer({ clientId, clientSecret: env.OPENPANEL_CLIENT_SECRET });
}
