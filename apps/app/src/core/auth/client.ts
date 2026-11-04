import { expoClient } from "@better-auth/expo/client";
import { emailOTPClient, magicLinkClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import * as SecureStore from "expo-secure-store";
import product from "../../../../../product.config";
import { appScheme } from "../../../native-config";
import { apiBaseUrl } from "../api-base";

// Native (D-120): @better-auth/expo keeps the session cookie in the device's secure storage and
// sends the app's scheme as its origin (trusted by the API once `native` ids are set). The web
// client is client.web.ts; the server endpoints are the same.
export const authClient = createAuthClient({
  baseURL: apiBaseUrl(),
  basePath: "/api/auth",
  plugins: [
    expoClient({ scheme: appScheme(product.slug), storagePrefix: product.slug, storage: SecureStore }),
    magicLinkClient(),
    emailOTPClient(),
  ],
});
