import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import {
  apiBodyLimit,
  bodyLimitFor,
  DEFAULT_BODY_BYTES,
  MAX_UPLOAD_BYTES,
  readImageUpload,
  sniffImage,
} from "../src/core/uploads";
import { BASE, call } from "./helpers";

// Upload routes (D-044): every /api route takes a small body, except the paths a product lists.
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
const WEBP = new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ");

function testApp() {
  const app = new Hono();
  app.use("/api/*", apiBodyLimit({ "/api/photo": 256 * 1024 }));
  app.post("/api/photo", async (c) => {
    const image = await readImageUpload(c);
    return image ? c.json({ type: image.type, size: image.bytes.length }) : c.json({ error: "bad_image" }, 400);
  });
  app.post("/api/other", (c) => c.json({ ok: true }));
  return app;
}

const form = (bytes: Uint8Array, type = "image/jpeg") => {
  const f = new FormData();
  f.append("image", new File([bytes], "meal.jpg", { type }));
  return f;
};

describe("upload limits", () => {
  it("keeps the default for unlisted paths and caps listed ones", () => {
    expect(bodyLimitFor("/api/me", {})).toBe(DEFAULT_BODY_BYTES);
    expect(bodyLimitFor("/api/scan", { "/api/scan": 2 * 1024 * 1024 })).toBe(2 * 1024 * 1024);
    expect(bodyLimitFor("/api/scan", { "/api/scan": 50 * 1024 * 1024 })).toBe(MAX_UPLOAD_BYTES);
    expect(bodyLimitFor("/api/scan/other", { "/api/scan": 2 * 1024 * 1024 })).toBe(DEFAULT_BODY_BYTES);
  });

  it("lets a listed route take a photo and refuses it elsewhere", async () => {
    const app = testApp();
    const photo = new Uint8Array(200 * 1024);
    photo.set(JPEG);
    const ok = await app.request("/api/photo", { method: "POST", body: form(photo) });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ type: "image/jpeg", size: photo.length });
    const elsewhere = await app.request("/api/other", { method: "POST", body: form(photo) });
    expect(elsewhere.status).toBe(413);
    const tooBig = new Uint8Array(300 * 1024);
    tooBig.set(JPEG);
    expect((await app.request("/api/photo", { method: "POST", body: form(tooBig) })).status).toBe(413);
  });

  it("trusts the file's bytes, not its claimed type", async () => {
    expect(sniffImage(JPEG)).toBe("image/jpeg");
    expect(sniffImage(PNG)).toBe("image/png");
    expect(sniffImage(WEBP)).toBe("image/webp");
    expect(sniffImage(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
    const app = testApp();
    const fake = await app.request("/api/photo", {
      method: "POST",
      body: form(new TextEncoder().encode("<html>"), "image/jpeg"),
    });
    expect(fake.status).toBe(400);
    expect((await app.request("/api/photo", { method: "POST", body: new FormData() })).status).toBe(400);
  });

  it("refuses a large body on the real API's default routes", async () => {
    const res = await call("/api/events", {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE },
      body: JSON.stringify({ pad: "x".repeat(DEFAULT_BODY_BYTES + 1) }),
    });
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "body_too_large" });
  });
});
