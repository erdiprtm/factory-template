// Web → app hand-off (Phase 10, D-120). Signed in on the web, the user gets a short code; typed
// (or arriving through a universal link) in the native app, it signs the app in with a NEW session.
// The web cookie is never copied and no long-lived token ever travels in a URL.
//
// - The code: 8 characters from an alphabet without look-alikes (no 0/O, 1/I/L), ~40 bits.
// - Stored hashed (SHA-256) in Better Auth's verification table, for 10 minutes, single use.
// - One open code per account: a new one replaces the old.
// - Redeeming is rate-limited per IP (auth.ts customRules), so guessing 40 bits is hopeless.
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint, sessionMiddleware } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import * as z from "zod";

export const HANDOFF_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const HANDOFF_LENGTH = 8;
export const HANDOFF_MINUTES = 10;

/** Upper-case, without spaces or dashes: "abcd-efgh" and "ABCD EFGH" are the same code. */
export const normalizeHandoffCode = (code: string) => code.toUpperCase().replace(/[\s-]/g, "");

function newHandoffCode(): string {
  const n = HANDOFF_ALPHABET.length;
  const limit = Math.floor(256 / n) * n; // rejection sampling: no modulo bias
  let out = "";
  while (out.length < HANDOFF_LENGTH) {
    for (const b of crypto.getRandomValues(new Uint8Array(16))) {
      if (b < limit && out.length < HANDOFF_LENGTH) out += HANDOFF_ALPHABET[b % n];
    }
  }
  return out;
}

async function sha256(text: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  return btoa(String.fromCharCode(...digest))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

const codeId = (hash: string) => `app-handoff-${hash}`;
const userId = (id: string) => `app-handoff-user-${id}`;

export const appHandoff = () =>
  ({
    id: "app-handoff",
    endpoints: {
      /** Signed in (the web): a fresh code for this account, replacing any open one. */
      createHandoffCode: createAuthEndpoint(
        "/app-handoff/create",
        { method: "POST", use: [sessionMiddleware] },
        async (ctx) => {
          const adapter = ctx.context.internalAdapter;
          const owner = ctx.context.session.user.id;
          const previous = await adapter.findVerificationValue(userId(owner));
          if (previous) await adapter.deleteVerificationByIdentifier(codeId(previous.value));
          await adapter.deleteVerificationByIdentifier(userId(owner));
          const code = newHandoffCode();
          const hash = await sha256(code);
          const expiresAt = new Date(Date.now() + HANDOFF_MINUTES * 60_000);
          await adapter.createVerificationValue({ identifier: codeId(hash), value: owner, expiresAt });
          await adapter.createVerificationValue({ identifier: userId(owner), value: hash, expiresAt });
          return ctx.json({ code, expiresAt: expiresAt.toISOString() });
        },
      ),
      /** The app: a valid code → a new session for its account (cookie stored by the Expo client). */
      redeemHandoffCode: createAuthEndpoint(
        "/app-handoff/redeem",
        { method: "POST", body: z.object({ code: z.string().min(1).max(32) }) },
        async (ctx) => {
          const adapter = ctx.context.internalAdapter;
          const hash = await sha256(normalizeHandoffCode(ctx.body.code));
          const row = await adapter.findVerificationValue(codeId(hash));
          // Single use: gone before anything else, whatever happens next.
          if (row) await adapter.deleteVerificationByIdentifier(codeId(hash));
          if (!row || row.expiresAt < new Date()) throw new APIError("BAD_REQUEST", { message: "invalid_code" });
          await adapter.deleteVerificationByIdentifier(userId(row.value));
          const user = await adapter.findUserById(row.value);
          if (!user) throw new APIError("BAD_REQUEST", { message: "invalid_code" });
          const session = await adapter.createSession(user.id);
          if (!session) throw new APIError("INTERNAL_SERVER_ERROR", { message: "session_failed" });
          await setSessionCookie(ctx, { session, user });
          return ctx.json({ ok: true as const });
        },
      ),
    },
  }) satisfies BetterAuthPlugin;
