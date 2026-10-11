import { useRouter } from "expo-router";
import { Platform, Text } from "react-native";
import { t } from "../i18n";
import { Button, Screen, styles } from "../ui";

/** Shown when a paid feature returns 402. Moves to packages/ui in Phase 5. */
export function Paywall() {
  const router = useRouter();
  return (
    <Screen>
      <Text role="heading" style={styles.title}>
        {t("paywall.title")}
      </Text>
      {Platform.OS === "web" ? (
        <>
          <Text style={styles.body}>{t("paywall.body")}</Text>
          <Button label={t("paywall.cta")} onPress={() => router.push("/pricing")} />
        </>
      ) : (
        <Text style={styles.body}>{t("pricing.native")}</Text>
      )}
    </Screen>
  );
}
