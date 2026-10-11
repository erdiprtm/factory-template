import type { APIRoute } from "astro";

// Previews must not be indexed; production allows everything and points to the sitemap.
export const GET: APIRoute = ({ site }) => {
  const production = import.meta.env.PUBLIC_APP_ENV === "production";
  const body = production
    ? `User-agent: *\nAllow: /\n\nSitemap: ${new URL("sitemap-index.xml", site).href}\n`
    : "User-agent: *\nDisallow: /\n";
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8" } });
};
