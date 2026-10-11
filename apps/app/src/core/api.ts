import type { AppType } from "@factory/api";
import { hc } from "hono/client";
import { apiBaseUrl } from "./api-base";

// Typed RPC client for apps/api. Same origin on web, EXPO_PUBLIC_API_URL on native/dev.
export const api = hc<AppType>(apiBaseUrl());

export async function fetchHealth() {
  const res = await api.api.health.$get();
  if (!res.ok) throw new Error(`health ${res.status}`);
  return res.json();
}
