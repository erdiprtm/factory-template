import { Card, CardDescription, CardHeader, CardTitle, Text } from "@factory/ui";
import { useEffect } from "react";
import { Platform, View } from "react-native";
import { track } from "../analytics";
import { useMe } from "../auth/use-me";
import { useI18n } from "../i18n";
import { paywallPlacement } from "./placement";
import { PlanCards } from "./plans";

/**
 * The offer under a product's first result (placement "after_first_result", D-037). Renders
 * nothing for users with access, on native (no web prices), or for other placements. Shows how
 * many free uses are left.
 */
export function UpgradePrompt() {
  const { t } = useI18n();
  const me = useMe();
  const show = Platform.OS === "web" && paywallPlacement === "after_first_result" && me.data?.user && !me.data.access;
  useEffect(() => {
    if (show) track("paywall_view", { surface: "first_result" });
  }, [show]);
  if (!show || !me.data) return null;
  const left = Math.max(0, me.data.freeUses.limit - me.data.freeUses.used);
  return (
    <View className="gap-4">
      <Card className="bg-accent">
        <CardHeader>
          <CardTitle>{t("upgrade.title")}</CardTitle>
          <CardDescription>
            {left > 0 ? `${t("upgrade.freeLeft")} ${left}.` : t("upgrade.freeUsed")} {t("upgrade.body")}
          </CardDescription>
        </CardHeader>
      </Card>
      <PlanCards />
      <Text variant="muted" className="text-center">
        {t("pricing.subtitle")}
      </Text>
    </View>
  );
}
