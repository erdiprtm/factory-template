import { Button, ErrorText, Screen, Text } from "@factory/ui";
import { useEffect, useState } from "react";
import { Platform, View } from "react-native";
import product from "../../../../../product.config";
import { track } from "../../core/analytics";
import { api } from "../../core/api";
import { useMe, useRefreshMe } from "../../core/auth/use-me";
import { PlanCards } from "../../core/billing/plans";
import { useI18n } from "../../core/i18n";

export default function Pricing() {
  const { t } = useI18n();
  const me = useMe();
  const refresh = useRefreshMe();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (Platform.OS !== "web") return;
    track("pricing_view", { surface: "app" });
    track("paywall_view", { surface: "pricing" });
  }, []);

  // Store rules: no web prices or checkout inside native builds (Section 6b).
  if (Platform.OS !== "web") {
    return (
      <Screen>
        <Text variant="lead">{t("pricing.native")}</Text>
      </Screen>
    );
  }

  async function startTrial() {
    setBusy(true);
    const res = await api.api.billing.trial.$post();
    setBusy(false);
    if (res.status === 409) return setMessage(t("pricing.trialUsed"));
    if (!res.ok) return setMessage(t("pricing.error"));
    track("trial_started", { days: product.trial.days });
    await refresh();
  }

  return (
    <Screen>
      <View className="gap-2">
        <Text variant="h1">{t("pricing.title")}</Text>
        <Text variant="lead">{t("pricing.subtitle")}</Text>
      </View>
      <PlanCards />
      {product.trial.enabled && !me.data?.access ? (
        <Button variant="ghost" onPress={startTrial} disabled={busy}>
          <Text>{`${t("pricing.trial")} (${product.trial.days} ${t("pricing.trialDays")})`}</Text>
        </Button>
      ) : null}
      {message ? <ErrorText>{message}</ErrorText> : null}
    </Screen>
  );
}
