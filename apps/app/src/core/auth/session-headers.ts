import { authClient } from "./client";

/** Native: our own API calls carry the stored session cookie by hand (no browser cookie jar, D-120). */
export async function sessionHeaders(): Promise<Record<string, string>> {
  const cookie = await authClient.getCookie();
  return cookie ? { cookie } : {};
}
