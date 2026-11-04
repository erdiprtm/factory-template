import { emailOTPClient, magicLinkClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { apiBaseUrl } from "../api-base";

// Web: same origin, cookie session. Native has its own client (client.ts, D-120); the server
// endpoints are the same.
export const authClient = createAuthClient({
  baseURL: apiBaseUrl(),
  basePath: "/api/auth",
  fetchOptions: { credentials: "include" },
  // emailOTPClient: signing in with the code from the sign-in email (D-079).
  plugins: [magicLinkClient(), emailOTPClient()],
});
