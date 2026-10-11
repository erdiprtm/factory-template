import { Button, CenteredScreen, ErrorText, Input, Text } from "@factory/ui";
import { Redirect } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import product from "../../../../product.config";
import { track } from "../core/analytics";
import { authClient } from "../core/auth/client";
import { useMe } from "../core/auth/use-me";
import { useI18n } from "../core/i18n";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignIn() {
  const { t } = useI18n();
  const me = useMe();
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
    const { error } = await authClient.signIn.magicLink({ email: value, callbackURL: "/" });
    setState(error ? "error" : "sent");
  }

  return (
    <CenteredScreen>
      <View className="gap-2">
        <Text variant="small" className="font-semibold uppercase tracking-wide">
          {product.name}
        </Text>
        <Text variant="h1">{t("auth.signIn.title")}</Text>
        <Text variant="lead">{t("auth.signIn.subtitle")}</Text>
      </View>
      {state === "sent" ? (
        <Text accessibilityLiveRegion="polite" className="rounded-lg bg-accent p-4 text-accent-foreground">
          {t("auth.signIn.checkEmail")}
        </Text>
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
                onPress={() => authClient.signIn.social({ provider: "google", callbackURL: "/" })}
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
