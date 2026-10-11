import type { AppType } from "@factory/api";
import { hc } from "hono/client";
import { track } from "./analytics";
import { apiBaseUrl } from "./api-base";

// Typed RPC client for apps/api. Same origin on web, EXPO_PUBLIC_API_URL on native/dev.
// credentials: include so the session cookie also flows in local dev (Expo :8081 → API :8787).
export const api = hc<AppType>(apiBaseUrl(), { init: { credentials: "include" } });

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
