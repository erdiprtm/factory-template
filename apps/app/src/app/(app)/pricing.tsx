import { Badge, Button, Card, CardDescription, CardHeader, CardTitle, ErrorText, Screen, Text } from "@factory/ui";
import { useEffect, useState } from "react";
import { Platform, View } from "react-native";
import product from "../../../../../product.config";
import { track } from "../../core/analytics";
import { api } from "../../core/api";
import { useMe, useRefreshMe } from "../../core/auth/use-me";
import { openCheckout } from "../../core/billing/open-checkout";
import { formatIdr } from "../../core/format";
import { useI18n } from "../../core/i18n";

export default function Pricing() {
  const { t } = useI18n();
  const me = useMe();
  const refresh = useRefreshMe();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (Platform.OS === "web") track("pricing_view", { surface: "app" });
  }, []);

  // Store rules: no web prices or checkout inside native builds (Section 6b).
  if (Platform.OS !== "web") {
    return (
      <Screen>
        <Text variant="lead">{t("pricing.native")}</Text>
      </Screen>
    );
  }

  async function buy(planId: string) {
    setBusy(true);
    setMessage(null);
    track("checkout_started", { plan: planId });
    const res = await api.api.billing.checkout.$post({ json: { planId } });
    if (!res.ok) {
      setBusy(false);
      return setMessage(t(res.status === 503 ? "pricing.unavailable" : "pricing.error"));
    }
    openCheckout((await res.json()).redirectUrl);
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
      {product.plans.map((plan) => (
        <Card key={plan.id} className={plan.highlight ? "border-2 border-primary" : undefined}>
          <CardHeader>
            {plan.highlight ? <Badge>{t("pricing.best")}</Badge> : null}
            <CardTitle>{plan.label}</CardTitle>
            <Text className="text-3xl font-extrabold text-foreground">{formatIdr(plan.priceIdr)}</Text>
            <CardDescription>
              {formatIdr(Math.round(plan.priceIdr / plan.months))} {t("pricing.perMonth")}
            </CardDescription>
          </CardHeader>
          <Button variant={plan.highlight ? "default" : "outline"} onPress={() => buy(plan.id)} disabled={busy}>
            <Text>{`${t("pricing.buy")} ${formatIdr(plan.priceIdr)}`}</Text>
          </Button>
        </Card>
      ))}
      {product.trial.enabled && !me.data?.access ? (
        <Button variant="ghost" onPress={startTrial} disabled={busy}>
          <Text>{`${t("pricing.trial")} (${product.trial.days} ${t("pricing.trialDays")})`}</Text>
        </Button>
      ) : null}
      {message ? <ErrorText>{message}</ErrorText> : null}
    </Screen>
  );
}
