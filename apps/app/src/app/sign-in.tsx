import { Redirect } from "expo-router";
import { useState } from "react";
import { Text, TextInput } from "react-native";
import { authClient } from "../core/auth/client";
import { useMe } from "../core/auth/use-me";
import { t } from "../core/i18n";
import { Button, Loading, Screen, styles } from "../core/ui";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignIn() {
  const me = useMe();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "invalid" | "error">("idle");

  if (me.isPending) return <Loading />;
  if (me.data?.user) return <Redirect href="/" />;

  async function sendLink() {
    const value = email.trim();
    if (!EMAIL.test(value)) return setState("invalid");
    setState("sending");
    const { error } = await authClient.signIn.magicLink({ email: value, callbackURL: "/" });
    setState(error ? "error" : "sent");
  }

  return (
    <Screen>
      <Text role="heading" style={styles.title}>
        {t("auth.signIn.title")}
      </Text>
      <Text style={styles.body}>{t("auth.signIn.subtitle")}</Text>
      {state === "sent" ? (
        <Text accessibilityLiveRegion="polite" style={styles.body}>
          {t("auth.signIn.checkEmail")}
        </Text>
      ) : (
        <>
          <TextInput
            accessibilityLabel={t("auth.signIn.emailLabel")}
            placeholder={t("auth.signIn.emailPlaceholder")}
            autoCapitalize="none"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChangeText={setEmail}
            onSubmitEditing={sendLink}
            style={styles.input}
          />
          {state === "invalid" ? <Text style={styles.error}>{t("auth.signIn.invalidEmail")}</Text> : null}
          {state === "error" ? <Text style={styles.error}>{t("auth.signIn.error")}</Text> : null}
          <Button
            label={state === "sending" ? t("auth.signIn.sending") : t("auth.signIn.sendLink")}
            onPress={sendLink}
            disabled={state === "sending"}
          />
          {me.data?.providers.google ? (
            <>
              <Text style={styles.meta}>{t("auth.signIn.or")}</Text>
              <Button
                variant="ghost"
                label={t("auth.signIn.google")}
                onPress={() => authClient.signIn.social({ provider: "google", callbackURL: "/" })}
              />
            </>
          ) : null}
        </>
      )}
    </Screen>
  );
}
