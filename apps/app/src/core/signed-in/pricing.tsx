import { methodChips } from "@factory/core/pricing";
import { Button, ErrorText, Screen, Text } from "@factory/ui";
import { useEffect, useState } from "react";
import { Platform, View } from "react-native";
import product from "../../../../../product.config";
import { slots } from "../../features/slots";
import { track } from "../analytics";
import { api } from "../api";
import { useMe, useRefreshMe } from "../auth/use-me";
import { PlanCards } from "../billing/plans";
import { useI18n } from "../i18n";

export function Pricing() {
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

  const Intro = slots.pricingIntro;
  // payments.showTerms false (D-109): no "Bayar sekali · tanpa perpanjangan otomatis" subtitle.
  const subtitle = product.payments.showTerms ? t("pricing.subtitle") : "";
  const Footer = slots.pricingFooter;
  return (
    <Screen>
      {Intro ? (
        <Intro title={t("pricing.title")} subtitle={subtitle} />
      ) : (
        <View className="gap-2">
          <Text variant="h1">{t("pricing.title")}</Text>
          {subtitle ? <Text variant="lead">{subtitle}</Text> : null}
        </View>
      )}
      <PlanCards />
      {/* Under the plans (D-098), so the buy buttons stay on a small screen. Web only, like the plans. */}
      {Footer ? (
        <Footer methods={methodChips(product.payments.methods)} hasAccess={Boolean(me.data?.access)} t={t} />
      ) : null}
      {product.trial.enabled && !me.data?.access ? (
        <Button variant="ghost" onPress={startTrial} disabled={busy}>
          <Text>{`${t("pricing.trial")} (${product.trial.days} ${t("pricing.trialDays")})`}</Text>
        </Button>
      ) : null}
      {message ? <ErrorText>{message}</ErrorText> : null}
    </Screen>
  );
}
