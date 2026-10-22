// The port E2E's own `wrangler dev` listens on (D-097). Each product repo gets its own, derived from
// its slug, so two repos' E2E runs on one laptop (the template's and a product's, or two products')
// don't fight over one port. E2E_PORT overrides it. Never `pnpm dev`'s 8787 (D-051), and never the
// Node/workerd inspector's default 9229.

const FIRST = 8800;
const SPAN = 1000;
const RESERVED = new Set([8787, 9229]);

/** 32-bit FNV-1a, the same small hash as @factory/core/experiments. */
function fnv1a(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** 8800–9799 from the slug (stable per repo), or E2E_PORT when it's a usable port. */
export function e2ePort(slug, override = process.env.E2E_PORT) {
  if (override !== undefined && override !== "") {
    const port = Number(override);
    if (!Number.isInteger(port) || port < 1024 || port > 65535 || RESERVED.has(port))
      throw new Error(`E2E_PORT must be a free port from 1024 to 65535, not 8787 or 9229 (got "${override}")`);
    return port;
  }
  let port = FIRST + (fnv1a(slug) % SPAN);
  while (RESERVED.has(port)) port++;
  return port;
}
