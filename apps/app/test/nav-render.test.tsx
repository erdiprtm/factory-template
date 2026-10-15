import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { navTestId } from "../src/core/nav/tabs";

// D-087: a product may label /account however it likes ("Profil"); tests find tabs by target.
const pushed: string[] = [];
vi.mock("expo-router", () => ({ usePathname: () => "/", useRouter: () => ({ push: (h: string) => pushed.push(h) }) }));
vi.mock("nativewind", () => ({ useColorScheme: () => ({ colorScheme: "light" }) }));
vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ bottom: 0, top: 0, left: 0, right: 0 }),
}));
vi.mock("../src/core/auth/use-me", () => ({ useMe: () => ({ data: { isAdmin: true } }) }));
vi.mock("../src/features/slots", () => ({ slots: {} }));
vi.mock("../src/features/nav", () => ({
  productTabs: [
    { href: "/", label: "nav.home" },
    { href: "/account", label: "account.profile" },
  ],
}));

const { BottomNav, TopNav } = await import("../src/core/nav/product-nav");
const { I18nProvider, t } = await import("../src/core/i18n");

describe("tabs by target, not label", () => {
  it("names test ids from the path", () => {
    expect(navTestId("/")).toBe("nav-home");
    expect(navTestId("/account")).toBe("nav-account");
    expect(navTestId("/admin/")).toBe("nav-admin");
    expect(navTestId("/gym/plan")).toBe("nav-gym-plan");
  });

  for (const [name, Nav] of [
    ["bottom bar", BottomNav],
    ["top bar", TopNav],
  ] as const) {
    it(`${name}: a product label for /account is found by nav-account`, () => {
      pushed.length = 0;
      const view = render(
        <I18nProvider>
          <Nav />
        </I18nProvider>,
      );
      const account = screen.getByTestId("nav-account");
      expect(account.textContent).toBe(t("account.profile"));
      expect(screen.queryByText(t("nav.account"))).toBeNull();
      expect(screen.getByTestId("nav-admin")).toBeTruthy();
      fireEvent.click(account);
      expect(pushed).toEqual(["/account"]);
      view.unmount();
    });
  }
});
