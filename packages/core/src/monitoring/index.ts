// Error monitoring privacy rules (FACTORY_BLUEPRINT.md Section 9), shared by the Worker
// (@sentry/cloudflare) and the web app (@sentry/browser). Sentry v11 collects user info,
// cookies, headers, bodies and query strings by default; we turn all of that off in each init
// AND scrub here as a backstop, so a misconfigured option can't leak personal or payment data.
// Typed structurally so this package doesn't depend on Sentry.

type Dict = Record<string, unknown>;

export type ScrubbableEvent = {
  user?: (Dict & { id?: string | number }) | null;
  request?: (Dict & { url?: string }) | null;
  extra?: Dict;
  contexts?: Dict;
  breadcrumbs?: ScrubbableBreadcrumb[];
};

export type ScrubbableBreadcrumb = { message?: string; data?: Dict | null };

const EMAIL = /[^\s@"'<>]+@[^\s@"'<>]+\.[^\s@"'<>]+/g;
const PHONE = /(\+62|\b0)8\d{7,11}\b/g;
const SECRETISH = /(token|secret|password|signature|authorization|cookie|api[_-]?key)=[^&\s]+/gi;

/** Drops query string and fragment: magic-link tokens, payment ids and emails live there. */
export function stripUrl(url: string): string {
  return url.replace(/[?#].*$/, "");
}

/** Replaces emails, Indonesian phone numbers and key=secret pairs inside free text. */
export function redactText(text: string): string {
  return text.replace(EMAIL, "[email]").replace(PHONE, "[phone]").replace(SECRETISH, "$1=[filtered]");
}

/** beforeSend backstop: only an opaque user id survives; no cookies, headers, bodies or queries. */
export function scrubEvent<T extends ScrubbableEvent>(event: T): T {
  if (event.user) event.user = event.user.id === undefined ? null : { id: event.user.id };
  if (event.request) {
    const { url, method } = event.request as { url?: string; method?: string };
    event.request = { ...(method ? { method } : {}), ...(url ? { url: stripUrl(url) } : {}) };
  }
  delete event.extra;
  if (event.contexts) delete event.contexts.request;
  if (event.breadcrumbs) event.breadcrumbs = event.breadcrumbs.map((b) => scrubBreadcrumb(b));
  const ev = event as T & { message?: string; exception?: { values?: { value?: string }[] } };
  if (typeof ev.message === "string") ev.message = redactText(ev.message);
  for (const v of ev.exception?.values ?? []) if (typeof v.value === "string") v.value = redactText(v.value);
  return event;
}

/** beforeBreadcrumb: URLs without queries, messages redacted, no request/response bodies. */
export function scrubBreadcrumb<T extends ScrubbableBreadcrumb>(crumb: T): T {
  if (crumb.message) crumb.message = redactText(crumb.message);
  if (crumb.data) {
    const data: Dict = {};
    for (const [k, v] of Object.entries(crumb.data)) {
      if (/body|input|response|request_body/i.test(k)) continue;
      data[k] = typeof v === "string" ? (["url", "to", "from"].includes(k) ? stripUrl(v) : redactText(v)) : v;
    }
    crumb.data = data;
  }
  return crumb;
}

/** Sentry v11 `dataCollection`: everything that could carry personal data, off. */
export const PRIVATE_DATA_COLLECTION = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [] as never[],
  urlQueryParams: false,
  stackFrameVariables: false,
  databaseQueryData: false,
  queues: false,
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
};
