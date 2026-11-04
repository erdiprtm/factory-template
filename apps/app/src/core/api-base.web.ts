// Web: deployed, the Worker serves the app and the API on one origin.
// In local dev EXPO_PUBLIC_API_URL points at wrangler dev (see package.json "dev").
export function apiBaseUrl(): string {
  return process.env.EXPO_PUBLIC_API_URL || window.location.origin;
}

/** Web: the session cookie flows, also across origins in local dev (Expo :8081 → API :8787). */
export const fetchCredentials: RequestCredentials = "include";

/**
 * Where an auth flow returns to: a path on this app. In local dev the app (:8081) and the API
 * (:8787) are different origins, so the path gets the app's origin (trusted in development only,
 * D-061); deployed, they share one origin and the path stays relative.
 */
export function appReturnUrl(path: string): string {
  return process.env.EXPO_PUBLIC_API_URL ? `${window.location.origin}${path}` : path;
}
