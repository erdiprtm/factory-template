import type { AppType } from "@factory/api";
import { hc } from "hono/client";
import { track } from "./analytics";
import { apiBaseUrl, fetchCredentials } from "./api-base";
import { currentTouch } from "./attribution";
import { sessionHeaders } from "./auth/session-headers";

// Typed RPC client for apps/api. Same origin on web, domain.app (or EXPO_PUBLIC_API_URL) on native.
// The session: the browser's cookie on web (credentials include, also Expo :8081 → API :8787 in
// local dev); on native the stored cookie as a header (D-120).
// x-anon-id: the device's random id, for free uses before signup (D-042). Not personal data.
export const api = hc<AppType>(apiBaseUrl(), {
  init: { credentials: fetchCredentials },
  headers: async (): Promise<Record<string, string>> => {
    const anonId = currentTouch()?.anonId;
    return { ...(await sessionHeaders()), ...(anonId ? { "x-anon-id": anonId } : {}) };
  },
});

export async function fetchHealth() {
  const res = await api.api.health.$get();
  if (!res.ok) throw new Error(`health ${res.status}`);
  return res.json();
}

export async function acceptConsents(accept: ("terms" | "privacy" | "sensitive_data" | "marketing")[]) {
  const res = await api.api.consents.$post({ json: { accept } });
  if (!res.ok) throw new Error(`consents ${res.status}`);
  track("signup_completed");
}

/** Consent before signup (D-043): recorded for this device, moved to the account at sign-in. */
export async function acceptAnonymousConsents(accept: ("terms" | "privacy" | "sensitive_data")[]) {
  const res = await api.api["anonymous-consents"].$post({ json: { accept } });
  if (!res.ok) throw new Error(`anonymous-consents ${res.status}`);
}
