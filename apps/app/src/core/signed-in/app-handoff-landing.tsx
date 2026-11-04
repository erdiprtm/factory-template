import { CenteredScreen, Text } from "@factory/ui";
import { Redirect, useLocalSearchParams } from "expo-router";
import { Platform, View } from "react-native";
import { HandoffForm } from "../auth/handoff-form";
import { useMe } from "../auth/use-me";
import { useI18n } from "../i18n";

/**
 * /app/masuk?c=<code> (D-120). In the app (opened by an App Link, a universal link or the scheme):
 * the code filled in, one tap to sign in. On the web (the app isn't installed): Akun, where the
 * "Lanjut di aplikasi" card has the store links and a fresh code.
 */
export function AppHandoffLanding() {
  const { t } = useI18n();
  const me = useMe();
  const { c } = useLocalSearchParams<{ c?: string }>();
  if (Platform.OS === "web") return <Redirect href="/account" />;
  if (me.data?.user) return <Redirect href="/" />;
  return (
    <CenteredScreen>
      <View className="gap-2">
        <Text variant="h1">{t("account.app.title")}</Text>
      </View>
      <HandoffForm initialCode={typeof c === "string" ? c : ""} />
    </CenteredScreen>
  );
}
