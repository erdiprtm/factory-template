import type { ComponentType } from "react";

// Product navigation (D-048). A product lists its main screens in src/features/nav.ts; core renders
// them as a bottom tab bar on phones and native, and as a top bar on wide web screens. Pure helpers
// here so they're testable without React Native.

/** An icon the tab bar can tint: e.g. a react-native-svg component taking color and size. */
export type TabIcon = ComponentType<{ color: string; size: number }>;

export type ProductTab<K extends string = string> = {
  /** App path, e.g. "/" or "/nutrition". */
  href: string;
  /** i18n key for the label. */
  label: K;
  icon?: TabIcon;
};

export type NavTab<K extends string = string> = ProductTab<K> & { core?: "account" | "admin" };

/** Most tabs a bottom bar holds before labels get unreadable on a 360 px phone. */
export const MAX_TABS = 5;

/**
 * The tabs to show: the product's, then Akun unless the product already links /account, then Admin
 * for admins. Without product tabs: core's default (Beranda, Akun, Admin).
 */
export function navTabs<K extends string>(
  product: ProductTab<K>[],
  opts: { isAdmin: boolean; home: K; account: K; admin: K },
): NavTab<K>[] {
  const tabs: NavTab<K>[] = product.length > 0 ? [...product] : [{ href: "/", label: opts.home }];
  if (!tabs.some((t) => t.href === "/account")) tabs.push({ href: "/account", label: opts.account, core: "account" });
  if (opts.isAdmin) tabs.push({ href: "/admin", label: opts.admin, core: "admin" });
  return tabs;
}

/** Whether a tab is the current screen: "/" only on the home screen, others on their subpaths too. */
export function isActiveTab(path: string, href: string): boolean {
  if (href === "/") return path === "/";
  return path === href || path.startsWith(`${href}/`);
}

/** What's wrong with a product's tab list (empty = fine). Checked by a test in every product repo. */
export function tabProblems(product: ProductTab[]): string[] {
  const problems: string[] = [];
  if (product.length > MAX_TABS - 1) problems.push(`at most ${MAX_TABS - 1} product tabs (Akun is added)`);
  const hrefs = product.map((t) => t.href);
  if (new Set(hrefs).size !== hrefs.length) problems.push("tab paths must be unique");
  for (const t of product) if (!/^\/[a-z0-9/-]*$/.test(t.href)) problems.push(`tab path "${t.href}" is invalid`);
  return problems;
}

/**
 * Icons for the tabs core adds (D-058): the default Beranda (no product tabs), Akun and Admin. A
 * product tab keeps its own icon.
 */
export function withCoreIcons<K extends string>(
  tabs: NavTab<K>[],
  icons: Partial<Record<"home" | "account" | "admin", TabIcon>>,
): NavTab<K>[] {
  return tabs.map((t) => {
    if (t.icon) return t;
    const kind = t.core ?? (t.href === "/" ? "home" : undefined);
    const icon = kind ? icons[kind] : undefined;
    return icon ? { ...t, icon } : t;
  });
}

/**
 * A tab's test id from its target, never its label (D-087): "/" → "nav-home", "/account" →
 * "nav-account". The label of /account (and every product tab) is the product's choice.
 */
export function navTestId(href: string): string {
  const slug = href.replace(/^\/+|\/+$/g, "").replaceAll("/", "-");
  return `nav-${slug || "home"}`;
}
