// Provider-agnostic email (docs/DECISIONS.md D-004). Resend now; a Cloudflare Email Service
// provider can be added later behind the same interface.

/** `replyTo`: where a customer's reply goes when the sender is a no-inbox domain (D-067). */
export type Email = { to: string; subject: string; text: string; html?: string; replyTo?: string };

export interface EmailProvider {
  send(email: Email): Promise<void>;
}

/** Sends through Resend's HTTP API. Without a verified domain, Resend only delivers to the account owner. */
export class ResendProvider implements EmailProvider {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    // Wrapped, never the bare global: Workers throw "Illegal invocation" when fetch is called
    // as a method of another object (this.fetchImpl(...)). Caught in production, not by mocks.
    private readonly fetchImpl: typeof fetch = (...args) => fetch(...args),
  ) {}

  async send(email: Email): Promise<void> {
    const res = await this.fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: this.from,
        to: email.to,
        subject: email.subject,
        text: email.text,
        html: email.html,
        // Resend's field (POST /emails, read 2026-10-14). Left out when unset.
        ...(email.replyTo ? { reply_to: email.replyTo } : {}),
      }),
    });
    if (!res.ok) {
      // Never log the recipient or body (PII); status is enough to debug.
      throw new Error(`Resend rejected the email (HTTP ${res.status})`);
    }
  }
}

/** Keeps emails in memory instead of sending. Local dev and tests only. */
export class CaptureProvider implements EmailProvider {
  readonly sent: Email[] = [];
  constructor(private readonly printToLog = false) {}
  async send(email: Email): Promise<void> {
    this.sent.push(email);
    // Local dev only: print so the developer can click the magic link from the wrangler log.
    if (this.printToLog) {
      const replyTo = email.replyTo ? ` reply-to=${email.replyTo}` : "";
      console.log(`[dev email] to=${email.to}${replyTo} subject=${email.subject}\n${email.text}`);
    }
  }
  last(to?: string): Email | undefined {
    return [...this.sent].reverse().find((e) => to === undefined || e.to === to);
  }
}

export type EmailEnv = { APP_ENV: string; RESEND_API_KEY?: string; MAIL_FROM?: string; MAIL_REPLY_TO?: string };

const capture = new CaptureProvider();
const devCapture = new CaptureProvider(true);

/**
 * Production and preview must send real email; a missing key there is a configuration error.
 * Development and test capture emails (readable via capturedEmails()).
 *
 * Every email gets a Reply-To (D-067): MAIL_REPLY_TO, else `defaultReplyTo` (the API passes the
 * product's legal.contactEmail), else none. An email that sets its own replyTo keeps it.
 */
export function emailProvider(env: EmailEnv, defaultReplyTo?: string): EmailProvider {
  const provider = baseProvider(env);
  const replyTo = env.MAIL_REPLY_TO || defaultReplyTo;
  if (!replyTo) return provider;
  return { send: (email) => provider.send({ ...email, replyTo: email.replyTo ?? replyTo }) };
}

function baseProvider(env: EmailEnv): EmailProvider {
  if (env.RESEND_API_KEY) return new ResendProvider(env.RESEND_API_KEY, env.MAIL_FROM ?? "onboarding@resend.dev");
  if (env.APP_ENV === "development") return devCapture;
  if (env.APP_ENV === "test") return capture;
  throw new Error(`RESEND_API_KEY is not set for APP_ENV=${env.APP_ENV}`);
}

export function capturedEmails(): CaptureProvider {
  return capture;
}

/** Emails captured by `wrangler dev` (APP_ENV=development). */
export function capturedDevEmails(): CaptureProvider {
  return devCapture;
}
