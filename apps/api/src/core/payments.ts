import { config } from "@factory/config/product";
import { DuitkuProvider, FakeProvider, type PaymentProvider } from "@factory/core/billing";

export type PaymentEnv = {
  APP_ENV: "production" | "preview" | "development" | "test";
  DUITKU_MERCHANT_CODE?: string;
  DUITKU_API_KEY?: string;
  /** "sandbox" unless the human explicitly switches a product to production (Operating rule 7). */
  DUITKU_MODE?: string;
};

const fake = new FakeProvider();

/** The configured provider (product.config.ts payments.provider). Local dev and tests use FakeProvider. */
export function getProvider(env: PaymentEnv): PaymentProvider {
  const provider = config.payments.provider;
  if (provider === "duitku" && env.DUITKU_MERCHANT_CODE && env.DUITKU_API_KEY) {
    return new DuitkuProvider({
      merchantCode: env.DUITKU_MERCHANT_CODE,
      apiKey: env.DUITKU_API_KEY,
      mode: env.DUITKU_MODE === "production" ? "production" : "sandbox",
    });
  }
  if (env.APP_ENV === "development" || env.APP_ENV === "test") return fake;
  throw new Error(`Payment provider "${provider}" is not configured for APP_ENV=${env.APP_ENV}`);
}

/** Test/dev access to the fake provider (e.g. to simulate a paid webhook). */
export function fakeProvider(): FakeProvider {
  return fake;
}
