import { describe, expect, it } from "vitest";
import { isActiveTab, navTabs, splitForCenter, tabProblems } from "../src/core/nav/tabs";
import { productTabs } from "../src/features/nav";

// Product navigation (D-048).
const keys = { home: "nav.home", account: "nav.account", admin: "nav.admin" };

describe("product tabs", () => {
  it("holds in every product repo: the product's tab list is well-formed", () => {
    expect(tabProblems(productTabs)).toEqual([]);
  });

  it("keeps core's default without product tabs, and always adds Akun (and Admin for admins)", () => {
    expect(navTabs([], { ...keys, isAdmin: false }).map((t) => t.href)).toEqual(["/", "/account"]);
    const product = [
      { href: "/", label: "nav.home" },
      { href: "/gym", label: "gym" },
    ];
    expect(navTabs(product, { ...keys, isAdmin: true }).map((t) => t.href)).toEqual([
      "/",
      "/gym",
      "/account",
      "/admin",
    ]);
    const withProfile = [...product, { href: "/account", label: "profile" }];
    expect(navTabs(withProfile, { ...keys, isAdmin: false }).map((t) => t.label)).toEqual([
      "nav.home",
      "gym",
      "profile",
    ]);
  });

  it("marks home only on the home screen, other tabs on their subpaths", () => {
    expect(isActiveTab("/", "/")).toBe(true);
    expect(isActiveTab("/gym", "/")).toBe(false);
    expect(isActiveTab("/gym/progress", "/gym")).toBe(true);
    expect(isActiveTab("/gymnastics", "/gym")).toBe(false);
  });

  it("refuses too many tabs, duplicates and bad paths", () => {
    const tab = (href: string) => ({ href, label: "x" });
    expect(tabProblems(["/", "/a", "/b", "/c", "/d"].map(tab))).toHaveLength(1);
    expect(tabProblems([tab("/a"), tab("/a")])).toEqual(["tab paths must be unique"]);
    expect(tabProblems([tab("gym")])).toEqual(['tab path "gym" is invalid']);
  });
});

describe("center action and the Admin tab (D-111)", () => {
  it("splits tabs around a center action, the extra one on the left", () => {
    expect(splitForCenter([1, 2, 3, 4])).toEqual([
      [1, 2],
      [3, 4],
    ]);
    expect(splitForCenter([1, 2, 3, 4, 5])).toEqual([
      [1, 2, 3],
      [4, 5],
    ]);
    expect(splitForCenter([1])).toEqual([[1], []]);
    expect(splitForCenter([])).toEqual([[], []]);
  });

  it("adminTab false: admins get no Admin tab (they reach it from Akun)", () => {
    const keys = { home: "h", account: "a", admin: "ad" };
    expect(navTabs([], { ...keys, isAdmin: true, adminTab: false }).map((t) => t.href)).toEqual(["/", "/account"]);
    expect(navTabs([], { ...keys, isAdmin: true }).map((t) => t.href)).toEqual(["/", "/account", "/admin"]);
  });
});
