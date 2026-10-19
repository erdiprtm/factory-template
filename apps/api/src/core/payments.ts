import { config } from "@factory/config/product";
import {
  DokuProvider,
  DuitkuProvider,
  FakePakasirApi,
  FakeProvider,
  PakasirProvider,
  type PaymentProvider,
} from "@factory/core/billing";

export type PaymentEnv = {
  APP_ENV: "production" | "preview" | "development" | "test";
  DUITKU_MERCHANT_CODE?: string;
  DUITKU_API_KEY?: string;
  /** "sandbox" unless the human explicitly switches a product to production (Operating rule 7). */
  DUITKU_MODE?: string;
  DOKU_CLIENT_ID?: string;
  DOKU_SECRET_KEY?: string;
  /** "sandbox" unless the human explicitly switches a product to production (Operating rule 7). */
  DOKU_MODE?: string;
  PAKASIR_SLUG?: string;
  PAKASIR_API_KEY?: string;
  /** The project's webhook secret (Pakasir sends it in X-Secret). */
  PAKASIR_WEBHOOK_SECRET?: string;
  /** "sandbox" unless the human explicitly switches a product live (Operating rule 7, D-092). */
  PAKASIR_MODE?: string;
  /**
   * Tests only (APP_ENV=test, D-093): the provider the test runs on, whatever product.config.ts
   * chose, so the template's billing tests hold in a product on any provider. Ignored elsewhere.
   */
  PAYMENTS_PROVIDER?: string;
};

const PROVIDERS = ["duitku", "doku", "pakasir"] as const;

/** product.config.ts payments.provider, or the test's own choice (APP_ENV=test only, D-093). */
export function providerFor(env: Pick<PaymentEnv, "APP_ENV" | "PAYMENTS_PROVIDER">): (typeof PROVIDERS)[number] {
  const own = env.PAYMENTS_PROVIDER as (typeof PROVIDERS)[number] | undefined;
  return env.APP_ENV === "test" && own && PROVIDERS.includes(own) ? own : config.payments.provider;
}

const fake = new FakeProvider();
const fakePakasirApi = new FakePakasirApi();

/** The configured provider (product.config.ts payments.provider). Local dev and tests use fakes. */
export function getProvider(env: PaymentEnv): PaymentProvider {
  const provider = providerFor(env);
  if (provider === "duitku" && env.DUITKU_MERCHANT_CODE && env.DUITKU_API_KEY) {
    return new DuitkuProvider({
      merchantCode: env.DUITKU_MERCHANT_CODE,
      apiKey: env.DUITKU_API_KEY,
      mode: env.DUITKU_MODE === "production" ? "production" : "sandbox",
    });
  }
  if (provider === "doku" && env.DOKU_CLIENT_ID && env.DOKU_SECRET_KEY) {
    return new DokuProvider({
      clientId: env.DOKU_CLIENT_ID,
      secretKey: env.DOKU_SECRET_KEY,
      mode: env.DOKU_MODE === "production" ? "production" : "sandbox",
    });
  }
  if (provider === "pakasir" && env.PAKASIR_SLUG && env.PAKASIR_API_KEY && env.PAKASIR_WEBHOOK_SECRET) {
    return new PakasirProvider({
      slug: env.PAKASIR_SLUG,
      apiKey: env.PAKASIR_API_KEY,
      webhookSecret: env.PAKASIR_WEBHOOK_SECRET,
      // Only the exact word "live" goes live; anything else stays sandbox.
      mode: env.PAKASIR_MODE === "live" && env.APP_ENV === "production" ? "live" : "sandbox",
    });
  }
  if (env.APP_ENV === "development" || env.APP_ENV === "test") {
    // Pakasir's own checkout screen needs the real provider code: run it against a fake API.
    if (provider === "pakasir") return fakePakasir();
    return fake;
  }
  throw new Error(`Payment provider "${provider}" is not configured for APP_ENV=${env.APP_ENV}`);
}

/** The provider, or null when this environment has no payment credentials yet (answer 503). */
export function configuredProvider(env: PaymentEnv): PaymentProvider | null {
  try {
    return getProvider(env);
  } catch {
    return null;
  }
}

/** Test/dev access to the fake provider (e.g. to simulate a paid webhook). */
export function fakeProvider(): FakeProvider {
  return fake;
}

/** Test/dev access to the in-memory Pakasir API that `fakePakasir()` talks to. */
export function fakePakasirServer(): FakePakasirApi {
  return fakePakasirApi;
}

/** The real PakasirProvider wired to the in-memory API (development and tests only). */
export function fakePakasir(): PakasirProvider {
  return new PakasirProvider({
    slug: fakePakasirApi.slug,
    apiKey: fakePakasirApi.apiKey,
    webhookSecret: fakePakasirApi.webhookSecret,
    mode: "sandbox",
    fetchImpl: fakePakasirApi.fetch,
  });
}
