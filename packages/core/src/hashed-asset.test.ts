import { describe, expect, it } from "vitest";
import { hashedAssetResponse, IMMUTABLE } from "./hashed-asset";

// D-138: only a real hashed file is cached for a year; a miss during a deploy is never cached.
const res = (status: number, type: string, body = "x") =>
  new Response(status === 304 ? null : body, { status, headers: { "content-type": type } });

describe("hashedAssetResponse", () => {
  it("a real file: a year, immutable", async () => {
    const r = hashedAssetResponse(res(200, "text/css", "a{}"));
    expect([r.status, r.headers.get("cache-control"), await r.text()]).toEqual([200, IMMUTABLE, "a{}"]);
    expect(hashedAssetResponse(res(200, "application/javascript")).headers.get("cache-control")).toBe(IMMUTABLE);
  });

  it("a 404 page is never cached", () => {
    const r = hashedAssetResponse(res(404, "text/html"));
    expect([r.status, r.headers.get("cache-control")]).toEqual([404, "no-store"]);
  });

  it("the SPA's index.html for a missing file becomes an empty 404, never cached", async () => {
    const r = hashedAssetResponse(res(200, "text/html; charset=utf-8", "<html>"));
    expect([r.status, r.headers.get("cache-control"), await r.text()]).toEqual([404, "no-store", ""]);
  });

  it("other answers (304, 500) keep their status and aren't cached", () => {
    expect(hashedAssetResponse(res(304, "text/css")).headers.get("cache-control")).toBe("no-store");
    expect(hashedAssetResponse(res(500, "text/plain")).status).toBe(500);
  });
});
