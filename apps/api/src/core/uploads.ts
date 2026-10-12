import type { Context, MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";

/** Every route that isn't listed takes at most this much (a small JSON or form body). */
export const DEFAULT_BODY_BYTES = 64 * 1024;
/** No route may raise its limit above this (Workers accept 100 MB; we never need that). */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** Larger bodies for exact API paths, e.g. { "/api/scan": 2 * 1024 * 1024 } (product-owned list). */
export type UploadLimits = Readonly<Record<string, number>>;

/** The body limit for a path: the listed one (capped at MAX_UPLOAD_BYTES), else the default. */
export function bodyLimitFor(path: string, uploads: UploadLimits): number {
  const listed = uploads[path];
  return listed === undefined ? DEFAULT_BODY_BYTES : Math.min(Math.max(listed, DEFAULT_BODY_BYTES), MAX_UPLOAD_BYTES);
}

/** The /api/* body limit middleware: 413 { error: "body_too_large" } past the path's limit. */
export function apiBodyLimit(uploads: UploadLimits): MiddlewareHandler {
  const onError = (c: Context) => c.json({ error: "body_too_large" as const }, 413);
  const limiters = new Map<number, MiddlewareHandler>();
  return (c, next) => {
    const max = bodyLimitFor(c.req.path, uploads);
    let limiter = limiters.get(max);
    if (!limiter) {
      limiter = bodyLimit({ maxSize: max, onError });
      limiters.set(max, limiter);
    }
    return limiter(c, next);
  };
}

export type ImageType = "image/jpeg" | "image/png" | "image/webp";

/** The image type from the file's first bytes (never from the client's claimed type), or null. */
export function sniffImage(bytes: Uint8Array): ImageType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 8 && png.every((b, i) => bytes[i] === b)) return "image/png";
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}

export type ImageUpload = { bytes: Uint8Array; type: ImageType };

/**
 * Reads one image from a multipart form field (default "image"). Returns null when the field is
 * missing, empty or not a JPEG/PNG/WebP. HEIC isn't accepted: apps convert to JPEG before sending.
 * The route's size limit comes from its entry in UploadLimits.
 */
export async function readImageUpload(c: Context, field = "image"): Promise<ImageUpload | null> {
  const form = await c.req.formData().catch(() => null);
  const file = form?.get(field);
  if (!file || typeof file === "string" || file.size === 0) return null;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffImage(bytes);
  return type ? { bytes, type } : null;
}
