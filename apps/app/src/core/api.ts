import type { AppType } from "@factory/api";
import { hc } from "hono/client";
import { track } from "./analytics";
import { apiBaseUrl } from "./api-base";
import { currentTouch } from "./attribution";

// Typed RPC client for apps/api. Same origin on web, EXPO_PUBLIC_API_URL on native/dev.
// credentials: include so the session cookie also flows in local dev (Expo :8081 → API :8787).
// x-anon-id: the device's random id, for free uses before signup (D-042). Not personal data.
export const api = hc<AppType>(apiBaseUrl(), {
  init: { credentials: "include" },
  headers: (): Record<string, string> => {
    const anonId = currentTouch()?.anonId;
    return anonId ? { "x-anon-id": anonId } : {};
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
