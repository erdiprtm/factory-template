import { env } from "cloudflare:workers";
import {
  ANONYMOUS_FILE_DAYS,
  claimAnonymousFiles,
  fileKey,
  fileRow,
  purgeAnonymousFiles,
  saveFile,
} from "@factory/core/files";
import { anonKey } from "@factory/core/quota";
import { schema } from "@factory/db";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";
import { BASE, call, post, signInWithConsent } from "./helpers";

// Users' files in R2 (D-049): owner in D1, bytes under an opaque key, served only to the owner.
const db = drizzle(env.DB, { schema });
const bucket = env.FILES;
const anon = () => crypto.randomUUID().replaceAll("-", "");
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const meId = async (cookie: string) =>
  (await (await call("/api/me", { headers: { cookie } })).json<{ user: { id: string } }>()).user.id;

describe("files", () => {
  it("serves a file only to its owner, with its type, never cached publicly", async () => {
    const cookie = await signInWithConsent(`files-${crypto.randomUUID()}@example.com`);
    const id = await saveFile(db, bucket, {
      userId: await meId(cookie),
      feature: "meal_photo",
      bytes: JPEG,
      contentType: "image/jpeg",
    });
    const mine = await call(`/api/files/${id}`, { headers: { cookie } });
    expect(mine.status).toBe(200);
    expect(mine.headers.get("content-type")).toBe("image/jpeg");
    expect(mine.headers.get("cache-control")).toContain("private");
    expect(new Uint8Array(await mine.arrayBuffer())).toEqual(JPEG);

    const other = await signInWithConsent(`files-other-${crypto.randomUUID()}@example.com`);
    expect((await call(`/api/files/${id}`, { headers: { cookie: other } })).status).toBe(404);
    expect((await call(`/api/files/${id}`)).status).toBe(404);
    expect((await call("/api/files/unknown", { headers: { cookie } })).status).toBe(404);
  });

  it("lets a visitor see their own file, then moves it to the account at signup", async () => {
    const anonId = anon();
    const id = await saveFile(db, bucket, {
      userId: anonKey(anonId),
      feature: "meal_photo",
      bytes: JPEG,
      contentType: "image/jpeg",
    });
    expect((await call(`/api/files/${id}`, { headers: { "x-anon-id": anonId } })).status).toBe(200);
    expect((await call(`/api/files/${id}`, { headers: { "x-anon-id": anon() } })).status).toBe(404);
    const cookie = await signInWithConsent(`files-claim-${crypto.randomUUID()}@example.com`);
    await claimAnonymousFiles(db, await meId(cookie), anonId);
    expect((await call(`/api/files/${id}`, { headers: { cookie } })).status).toBe(200);
  });

  it("deletes the account's files with the account, and lists them in the export", async () => {
    const cookie = await signInWithConsent(`files-delete-${crypto.randomUUID()}@example.com`);
    const id = await saveFile(db, bucket, {
      userId: await meId(cookie),
      feature: "meal_photo",
      bytes: JPEG,
      contentType: "image/jpeg",
    });
    const exported = await (await call("/api/account/export", { headers: { cookie } })).json<{
      files: { id: string }[];
    }>();
    expect(exported.files.map((f) => f.id)).toEqual([id]);
    expect((await post("/api/account/delete", cookie, { confirm: "HAPUS" })).status).toBe(200);
    expect(await fileRow(db, id)).toBeNull();
    expect(await bucket.get(fileKey(id))).toBeNull();
  });

  it("drops visitors' unclaimed files after the retention period", async () => {
    const now = new Date();
    const old = await saveFile(
      db,
      bucket,
      { userId: anonKey(anon()), feature: "t", bytes: JPEG, contentType: "image/jpeg" },
      new Date(now.getTime() - (ANONYMOUS_FILE_DAYS + 1) * 86_400_000),
    );
    const fresh = await saveFile(
      db,
      bucket,
      { userId: anonKey(anon()), feature: "t", bytes: JPEG, contentType: "image/jpeg" },
      now,
    );
    await purgeAnonymousFiles(db, bucket, now);
    expect(await fileRow(db, old)).toBeNull();
    expect(await bucket.get(fileKey(old))).toBeNull();
    expect(await fileRow(db, fresh)).not.toBeNull();
  });
});
