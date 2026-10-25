import { deleteUserData } from "@factory/core/account";
import { deleteUserFiles } from "@factory/core/files";
import { schema } from "@factory/db";
import { drizzle } from "drizzle-orm/d1";
import { deleteProductData } from "../features/user-data";
import type { Bindings } from "../index";

/**
 * UU PDP right to erasure, the one path for every deletion (the user's own in Akun, an admin's on
 * request, D-110): the product's data first (its hook), then uploaded files, then core's rows,
 * the account and its sessions last.
 */
export async function eraseAccount(env: Bindings, userId: string): Promise<void> {
  const db = drizzle(env.DB, { schema });
  await deleteProductData(db, userId);
  if (env.FILES) await deleteUserFiles(db, env.FILES, userId);
  await deleteUserData(db, userId);
}
