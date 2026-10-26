import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// D-111: a product's center action sits in the middle of the bottom bar (tabs split around it), and
// in the wide web bar after the links. It's not a tab. Slots mocked (D-103), core keys only.
vi.mock("expo-router", () => ({ usePathname: () => "/", useRouter: () => ({ push: () => {} }) }));
vi.mock("nativewind", () => ({ useColorScheme: () => ({ colorScheme: "light" }) }));
vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ bottom: 0, top: 0, left: 0, right: 0 }),
}));
vi.mock("../src/core/auth/use-me", () => ({ useMe: () => ({ data: { isAdmin: false } }) }));
const mock = vi.hoisted(() => ({ placements: [] as string[] }));
vi.mock("../src/features/slots", () => ({
  slots: {
    centerAction: ({ placement }: { placement: string }) => {
      mock.placements.push(placement);
      return (
        <button type="button" data-testid="camera" aria-label="Foto makanan">
          +
        </button>
      );
    },
  },
}));
vi.mock("../src/features/nav", () => ({
  productTabs: [
    { href: "/", label: "nav.home" },
    { href: "/nutrition", label: "nav.home" },
    { href: "/gym", label: "nav.home" },
  ],
}));

const { BottomNav, TopNav } = await import("../src/core/nav/product-nav");
const { I18nProvider } = await import("../src/core/i18n");

describe("center action", () => {
  it("bottom bar: in the middle, tabs split two and two, and not counted as a tab", () => {
    const view = render(
      <I18nProvider>
        <BottomNav />
      </I18nProvider>,
    );
    const order = [...view.container.querySelectorAll("[data-testid]")]
      .map((el) => el.getAttribute("data-testid"))
      .filter((id) => id?.startsWith("nav-") || id === "camera");
    // Beranda · Nutrisi · [center] · Gym · Akun (Akun is added by core).
    expect(order).toEqual(["nav-home", "nav-nutrition", "nav-center", "camera", "nav-gym", "nav-account"]);
    expect(screen.getAllByRole("tab")).toHaveLength(4);
    expect(screen.getByTestId("camera").getAttribute("role")).not.toBe("tab");
    expect(mock.placements.at(-1)).toBe("bottom");
    view.unmount();
  });

  it("top bar: after the links, told it's the top placement", () => {
    render(
      <I18nProvider>
        <TopNav />
      </I18nProvider>,
    );
    const ids = [...document.querySelectorAll("[data-testid]")].map((el) => el.getAttribute("data-testid"));
    expect(ids.indexOf("camera")).toBeGreaterThan(ids.indexOf("nav-account"));
    expect(mock.placements.at(-1)).toBe("top");
  });
});
