import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// D-058: the consent rule proven by rendering core's form WITH a product slot filled (D-054).
// Separate boxes, whatever this product's legal.consentStyle: the single box is single-consent.test.tsx.
vi.mock("../../../product.config", async (orig) => {
  const real = ((await orig()) as { default: { legal: object } }).default;
  return { default: { ...real, legal: { ...real.legal, consentStyle: "separate" } } };
});
vi.mock("../src/features/slots", () => ({
  slots: {
    consentHeader: ({ title }: { title: string }) => <span data-testid="custom-header">{`★ ${title}`}</span>,
  },
}));

const { ConsentForm } = await import("../src/core/auth/consent-form");
const { I18nProvider } = await import("../src/core/i18n");

describe("ConsentForm with a product's header slot", () => {
  it("renders the slot, keeps core's checkboxes, and disables accept until all are checked", async () => {
    const onAccept = vi.fn(async () => {});
    render(
      <I18nProvider>
        <ConsentForm
          needed={["terms", "privacy", "sensitive_data"]}
          where="account"
          onAccept={onAccept}
          testID="accept"
        />
      </I18nProvider>,
    );
    expect(screen.getByTestId("custom-header").textContent).toContain("★");
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(3);
    const accept = screen.getByTestId("accept");
    const disabled = () => accept.getAttribute("aria-disabled") === "true";

    expect(disabled()).toBe(true);
    fireEvent.click(accept);
    fireEvent.click(boxes[0] as HTMLElement);
    fireEvent.click(boxes[1] as HTMLElement);
    expect(disabled()).toBe(true);
    fireEvent.click(accept);
    expect(onAccept).not.toHaveBeenCalled();

    fireEvent.click(boxes[2] as HTMLElement);
    expect(disabled()).toBe(false);
    fireEvent.click(accept);
    await vi.waitFor(() => expect(onAccept).toHaveBeenCalledTimes(1));
  });
});
