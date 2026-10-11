// Web: deployed, the Worker serves the app and the API on one origin.
// In local dev EXPO_PUBLIC_API_URL points at wrangler dev (see package.json "dev").
export function apiBaseUrl(): string {
  return process.env.EXPO_PUBLIC_API_URL || window.location.origin;
}
