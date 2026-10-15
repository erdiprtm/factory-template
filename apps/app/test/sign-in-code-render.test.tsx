import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CodeForm, codeDigits, RESEND_SECONDS } from "../src/core/auth/code-form";
import { I18nProvider, t } from "../src/core/i18n";

// D-079: the 6-digit code on "Cek email kamu". Numeric with one-time-code autofill, paste works,
// resend waits for a cooldown, and wrong or locked codes say so.
function setup(signIn = vi.fn(async (_c: string) => null as string | null), resend = vi.fn(async () => true)) {
  const changeEmail = vi.fn();
  render(
    <I18nProvider>
      <CodeForm email="a@example.com" signIn={signIn} resend={resend} changeEmail={changeEmail} />
    </I18nProvider>,
  );
  return { signIn, resend, changeEmail, input: screen.getByTestId("sign-in-code") as HTMLInputElement };
}

afterEach(() => vi.useRealTimers());

describe("sign-in code form", () => {
  it("is a numeric one-time-code field of 6 digits, showing where the email went", () => {
    const { input } = setup();
    expect(input.getAttribute("inputmode")).toBe("numeric");
    expect(input.getAttribute("autocomplete")).toBe("one-time-code");
    expect(input.getAttribute("maxlength")).toBe("6");
    expect(screen.getByText(/a@example\.com/)).toBeTruthy();
    expect(codeDigits("Kode: 482 913")).toBe("482913");
  });

  it("a pasted code signs in at once; typing waits for 6 digits", async () => {
    const { input, signIn } = setup();
    fireEvent.change(input, { target: { value: "48" } });
    expect(signIn).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "482 913" } });
    await vi.waitFor(() => expect(signIn).toHaveBeenCalledWith("482913"));
  });

  it("says when the code is wrong, and when there were too many tries", async () => {
    const answers = ["INVALID_OTP", "TOO_MANY_ATTEMPTS"];
    const { input } = setup(vi.fn(async () => answers.shift() ?? null));
    fireEvent.change(input, { target: { value: "111111" } });
    await vi.waitFor(() => expect(screen.getByText(t("auth.signIn.codeWrong"))).toBeTruthy());
    fireEvent.change(input, { target: { value: "222222" } });
    await vi.waitFor(() => expect(screen.getByText(t("auth.signIn.codeLocked"))).toBeTruthy());
  });

  it("resend waits for the cooldown, then sends again and restarts it", async () => {
    vi.useFakeTimers();
    const { resend } = setup();
    const button = screen.getByTestId("resend-code");
    expect(button.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(button);
    expect(resend).not.toHaveBeenCalled();
    for (let i = 0; i < RESEND_SECONDS; i++) await act(async () => vi.advanceTimersByTime(1000));
    expect(button.getAttribute("aria-disabled")).not.toBe("true");
    await act(async () => fireEvent.click(button));
    expect(resend).toHaveBeenCalledTimes(1);
    expect(button.getAttribute("aria-disabled")).toBe("true");
  });

  it("'Ganti email' goes back to the email field", () => {
    const { changeEmail } = setup();
    fireEvent.click(screen.getByTestId("change-email"));
    expect(changeEmail).toHaveBeenCalled();
  });
});
