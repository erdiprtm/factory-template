import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// D-086: the sign-in header slot knows the stage, so a product can hide a "no account yet?" link
// while someone is signing in ("Cek email kamu").
vi.mock("../src/features/slots", () => ({
  slots: {
    signInHeader: ({ title, stage }: { title: string; stage: "email" | "sent" }) => (
      <div>
        <span>{title}</span>
        {stage === "email" ? <span data-testid="try-quiz">Belum punya akun?</span> : null}
      </div>
    ),
  },
}));
vi.mock("../src/core/auth/use-me", () => ({
  useMe: () => ({ isPending: false, data: { user: null, providers: { google: false } } }),
  useRefreshMe: () => async () => {},
}));
vi.mock("../src/core/auth/client", () => ({
  authClient: { signIn: { magicLink: async () => ({ error: null }), emailOtp: async () => ({ error: null }) } },
}));
vi.mock("../src/core/analytics", () => ({ track: vi.fn() }));
vi.mock("expo-router", () => ({ Redirect: () => null }));

const { SignIn } = await import("../src/core/signed-in/sign-in");
const { I18nProvider, t } = await import("../src/core/i18n");

describe("sign-in header slot stage", () => {
  it("is 'email' on the form and 'sent' on Cek email kamu", async () => {
    render(
      <I18nProvider>
        <SignIn />
      </I18nProvider>,
    );
    expect(screen.getByTestId("try-quiz")).toBeTruthy();
    fireEvent.change(screen.getByLabelText(t("auth.signIn.emailLabel")), { target: { value: "a@example.com" } });
    fireEvent.click(screen.getByText(t("auth.signIn.sendLink")));
    await vi.waitFor(() => expect(screen.queryByTestId("try-quiz")).toBeNull());
  });
});
