import type { schema } from "@factory/db";
import type { DrizzleD1Database } from "drizzle-orm/d1";

// PRODUCT-OWNED: the product's share of the UU PDP rights. Core handles account, consents,
// subscription and payment data (@factory/core/account); add every product table here.
type Db = DrizzleD1Database<typeof schema>;

/** Right of access: the user's product data, added to /api/account/export under "product". */
export async function exportProductData(_db: Db, _userId: string): Promise<Record<string, unknown>> {
  return {};
}

/**
 * Right to erasure: delete the user's product data. Runs before core deletes the account.
 * (A product table with ON DELETE CASCADE to user.id is also removed by core's delete.)
 */
export async function deleteProductData(_db: Db, _userId: string): Promise<void> {}

/**
 * "Pay for proof" (D-042): results a visitor created before signing up (stored with their device
 * id, `anonIdOf(c)` in src/core/access.ts) move to the new account here. Called once the app
 * attaches the device to the signed-in user. Example: update meal_scans set user_id = userId
 * where anon_id = anonId and user_id is null.
 */
export async function claimAnonymousData(_db: Db, _userId: string, _anonId: string): Promise<void> {}
