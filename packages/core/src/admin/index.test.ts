import { describe, expect, it } from "vitest";
import { isAdminEmail, jakartaMonth } from "./index";

describe("admin helpers", () => {
  it("matches admins from config or ADMIN_EMAILS, case-insensitively", () => {
    expect(isAdminEmail("Boss@Example.com", ["boss@example.com"])).toBe(true);
    expect(isAdminEmail("ops@example.com", [], " ops@example.com , x@y.z")).toBe(true);
    expect(isAdminEmail("user@example.com", ["boss@example.com"], "")).toBe(false);
    expect(isAdminEmail(null, ["boss@example.com"])).toBe(false);
  });

  it("buckets revenue in the Jakarta month", () => {
    expect(jakartaMonth(new Date("2026-10-31T16:59:59Z"))).toBe("2026-10"); // 23:59 WIB
    expect(jakartaMonth(new Date("2026-10-31T17:00:00Z"))).toBe("2026-11"); // 00:00 WIB
  });
});
