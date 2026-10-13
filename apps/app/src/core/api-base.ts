// Native: the API runs elsewhere, so the base URL must be configured.
export function apiBaseUrl(): string {
  const url = process.env.EXPO_PUBLIC_API_URL;
  if (!url) throw new Error("EXPO_PUBLIC_API_URL is not set");
  return url;
}

/** Where an auth flow returns to (native: the path; deep links come with native sign-in, Phase 10). */
export function appReturnUrl(path: string): string {
  return path;
}
