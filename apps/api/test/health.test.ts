import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("GET /api/health", () => {
  it("reports ok with the deployed commit", async () => {
    const res = await exports.default.fetch("http://example.com/api/health");
    expect(res.status).toBe(200);
    const body = await res.json<{ status: string; env: string; commit: string; version: string }>();
    expect(body).toMatchObject({ status: "ok", env: "test", commit: "dev" });
    expect(body.version).toBeTruthy();
  });

  it("allows CORS only for localhost origins when running locally", async () => {
    const local = await exports.default.fetch("http://localhost/api/health", {
      headers: { origin: "http://localhost:8081" },
    });
    expect(local.headers.get("access-control-allow-origin")).toBe("http://localhost:8081");

    const deployed = await exports.default.fetch("https://factory-template.example.workers.dev/api/health", {
      headers: { origin: "https://evil.example" },
    });
    expect(deployed.headers.get("access-control-allow-origin")).toBeNull();
  });
});
