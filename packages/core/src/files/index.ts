// Files a product stores for its users (D-049): the bytes in an R2 bucket under an opaque key, the
// owner in the `files` table. Owner = an account, or `anon:<anonId>` for a visitor (D-042), so a
// visitor's first meal photo moves to their account at signup without copying any object.
import { files } from "@factory/db";
import { and, desc, eq, inArray, like, lt } from "drizzle-orm";
import type { Db } from "../entitlements";
import { anonKey } from "../quota";

/** The part of Cloudflare's R2Bucket this module uses (typed here, not from Worker globals, D-013). */
export type FileBucket = {
  put(key: string, value: Uint8Array, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  get(key: string): Promise<{ body: ReadableStream } | null>;
  delete(keys: string | string[]): Promise<void>;
};

/** Days a visitor's files are kept when no account claims them (as their consent, D-043). */
export const ANONYMOUS_FILE_DAYS = 90;

export const fileKey = (id: string) => `f/${id}`;

/** Stores the bytes and records the owner. Returns the file id the product keeps in its own row. */
export async function saveFile(
  db: Db,
  bucket: FileBucket,
  input: { userId: string; feature: string; bytes: Uint8Array; contentType: string },
  now = new Date(),
): Promise<string> {
  const id = crypto.randomUUID();
  await bucket.put(fileKey(id), input.bytes, { httpMetadata: { contentType: input.contentType } });
  await db.insert(files).values({
    id,
    userId: input.userId,
    feature: input.feature,
    contentType: input.contentType,
    sizeBytes: input.bytes.length,
    createdAt: now,
  });
  return id;
}

/** The file's row, or null. Callers check the owner before serving it. */
export async function fileRow(db: Db, id: string) {
  return (await db.select().from(files).where(eq(files.id, id)).get()) ?? null;
}

/** Deletes one file (bytes and row), only if `userId` owns it. Returns whether it did. */
export async function deleteFile(db: Db, bucket: FileBucket, userId: string, id: string): Promise<boolean> {
  const row = await fileRow(db, id);
  if (!row || row.userId !== userId) return false;
  await bucket.delete(fileKey(id));
  await db.delete(files).where(eq(files.id, id));
  return true;
}

/** At signup: a visitor's files become the account's. */
export async function claimAnonymousFiles(db: Db, userId: string, anonId: string): Promise<void> {
  await db
    .update(files)
    .set({ userId })
    .where(eq(files.userId, anonKey(anonId)));
}

/** UU PDP access: the account's files (metadata; each is downloadable at /api/files/<id>). */
export async function exportFiles(db: Db, userId: string) {
  return db
    .select({ id: files.id, feature: files.feature, contentType: files.contentType, createdAt: files.createdAt })
    .from(files)
    .where(eq(files.userId, userId))
    .orderBy(desc(files.createdAt));
}

async function deleteRows(db: Db, bucket: FileBucket, ids: string[]): Promise<number> {
  // R2 deletes up to 1,000 keys per call; D1 binds up to 100 parameters per statement.
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    await bucket.delete(batch.map(fileKey));
    await db.delete(files).where(inArray(files.id, batch));
  }
  return ids.length;
}

/** UU PDP erasure: every file of the account. */
export async function deleteUserFiles(db: Db, bucket: FileBucket, userId: string): Promise<number> {
  const rows = await db.select({ id: files.id }).from(files).where(eq(files.userId, userId));
  return deleteRows(
    db,
    bucket,
    rows.map((r) => r.id),
  );
}

/** Drops visitors' files no account claimed (cron). */
export async function purgeAnonymousFiles(db: Db, bucket: FileBucket, now = new Date()): Promise<number> {
  const before = new Date(now.getTime() - ANONYMOUS_FILE_DAYS * 86_400_000);
  const rows = await db
    .select({ id: files.id })
    .from(files)
    .where(and(like(files.userId, "anon:%"), lt(files.createdAt, before)))
    .limit(500);
  return deleteRows(
    db,
    bucket,
    rows.map((r) => r.id),
  );
}
