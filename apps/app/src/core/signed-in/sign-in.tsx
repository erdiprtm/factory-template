import { Button, CenteredScreen, ErrorText, Input, Text } from "@factory/ui";
import { Redirect } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import product from "../../../../../product.config";
import { slots } from "../../features/slots";
import { track } from "../analytics";
import { appReturnUrl } from "../api-base";
import { authClient } from "../auth/client";
import { CodeForm } from "../auth/code-form";
import { useMe, useRefreshMe } from "../auth/use-me";
import { useI18n } from "../i18n";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function SignIn() {
  const { t } = useI18n();
  const me = useMe();
  const refreshMe = useRefreshMe();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "invalid" | "error">("idle");

  // Render the form at once (no spinner while /api/me loads: it was the page's LCP); a signed-in
  // visitor is redirected as soon as the answer arrives.
  if (me.data?.user) return <Redirect href="/" />;

  async function sendLink() {
    const value = email.trim();
    if (!EMAIL.test(value)) return setState("invalid");
    setState("sending");
    track("signup_started", { method: "magic_link" });
    const ok = await requestEmail(value);
    setState(ok ? "sent" : "error");
  }

  // One email with the link and, with auth.emailCode, the code (D-079): a resend is the same request.
  async function requestEmail(value: string) {
    const { error } = await authClient.signIn.magicLink({ email: value, callbackURL: appReturnUrl("/") });
    return !error;
  }

  // Signed in in this browser: /api/me now has the user, and the redirect above continues exactly
  // as after the link (the protected area's afterSignIn, consent, claiming anonymous data).
  async function signInWithCode(code: string): Promise<string | null> {
    const { error } = await authClient.signIn.emailOtp({ email: email.trim(), otp: code });
    if (error) return error.code ?? "INVALID_OTP";
    await refreshMe();
    return null;
  }

  const Header = slots.signInHeader;
  return (
    <CenteredScreen>
      {Header ? (
        <Header productName={product.name} title={t("auth.signIn.title")} subtitle={t("auth.signIn.subtitle")} />
      ) : (
        <View className="gap-2">
          <Text variant="small" className="font-semibold uppercase tracking-wide">
            {product.name}
          </Text>
          <Text variant="h1">{t("auth.signIn.title")}</Text>
          <Text variant="lead">{t("auth.signIn.subtitle")}</Text>
        </View>
      )}
      {state === "sent" ? (
        <View className="gap-4">
          <Text accessibilityLiveRegion="polite" className="rounded-lg bg-accent p-4 text-accent-foreground">
            {product.auth.emailCode ? t("auth.signIn.checkEmailCode") : t("auth.signIn.checkEmail")}
          </Text>
          {product.auth.emailCode ? (
            <CodeForm
              email={email.trim()}
              signIn={signInWithCode}
              resend={() => requestEmail(email.trim())}
              changeEmail={() => setState("idle")}
            />
          ) : null}
        </View>
      ) : (
        <View className="gap-3">
          <Input
            accessibilityLabel={t("auth.signIn.emailLabel")}
            placeholder={t("auth.signIn.emailPlaceholder")}
            autoCapitalize="none"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChangeText={setEmail}
            onSubmitEditing={sendLink}
          />
          {state === "invalid" ? <ErrorText>{t("auth.signIn.invalidEmail")}</ErrorText> : null}
          {state === "error" ? <ErrorText>{t("auth.signIn.error")}</ErrorText> : null}
          <Button onPress={sendLink} disabled={state === "sending"}>
            <Text>{state === "sending" ? t("auth.signIn.sending") : t("auth.signIn.sendLink")}</Text>
          </Button>
          {me.data?.providers.google ? (
            <>
              <Text variant="muted" className="text-center">
                {t("auth.signIn.or")}
              </Text>
              <Button
                variant="outline"
                onPress={() => authClient.signIn.social({ provider: "google", callbackURL: appReturnUrl("/") })}
              >
                <Text>{t("auth.signIn.google")}</Text>
              </Button>
            </>
          ) : null}
        </View>
      )}
    </CenteredScreen>
  );
}
