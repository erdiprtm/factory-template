import { Button, Card, CardDescription, CardHeader, CardTitle, Screen, Text } from "@factory/ui";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { Platform } from "react-native";
import { track } from "../analytics";
import { useI18n } from "../i18n";

/** Shown when a paid feature returns 402. Native builds show no prices or checkout links. */
export function Paywall() {
  const { t } = useI18n();
  const router = useRouter();
  useEffect(() => track("paywall_shown"), []);
  return (
    <Screen className="justify-center">
      <Card>
        <CardHeader>
          <CardTitle>{t("paywall.title")}</CardTitle>
          <CardDescription>{Platform.OS === "web" ? t("paywall.body") : t("pricing.native")}</CardDescription>
        </CardHeader>
        {Platform.OS === "web" ? (
          <Button onPress={() => router.push("/pricing")}>
            <Text>{t("paywall.cta")}</Text>
          </Button>
        ) : null}
      </Card>
    </Screen>
  );
}
