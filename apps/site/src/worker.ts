import { hashedAssetResponse } from "@factory/core/hashed-asset";

// The site's Worker runs only for /_astro/* (wrangler.jsonc run_worker_first, D-138); every other
// path is served by the assets layer with public/_headers as before.
type Env = { ASSETS: { fetch(request: Request): Promise<Response> } };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const res = hashedAssetResponse(await env.ASSETS.fetch(request));
    // _headers doesn't apply to a Worker's responses: keep the security headers these files need.
    res.headers.set("strict-transport-security", "max-age=31536000; includeSubDomains");
    return res;
  },
};
