import { magicLinkClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { apiBaseUrl } from "../api-base";

// Web: same origin, cookie session. Native (Phase 10) adds @better-auth/expo's expoClient for
// secure-storage sessions; the server endpoints stay the same.
export const authClient = createAuthClient({
  baseURL: apiBaseUrl(),
  basePath: "/api/auth",
  fetchOptions: { credentials: "include" },
  plugins: [magicLinkClient()],
});
