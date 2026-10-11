import { useState } from "react";
import { Platform, Text, View } from "react-native";
import product from "../../../../../product.config";
import { api } from "../../core/api";
import { useMe, useRefreshMe } from "../../core/auth/use-me";
import { openCheckout } from "../../core/billing/open-checkout";
import { t } from "../../core/i18n";
import { Button, Screen, styles } from "../../core/ui";

const idr = (n: number) => `Rp${n.toLocaleString("id-ID")}`;

export default function Pricing() {
  const me = useMe();
  const refresh = useRefreshMe();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Store rules: no web prices or checkout inside native builds (Section 6b).
  if (Platform.OS !== "web") {
    return (
      <Screen>
        <Text style={styles.body}>{t("pricing.native")}</Text>
      </Screen>
    );
  }

  async function buy(planId: string) {
    setBusy(true);
    setMessage(null);
    const res = await api.api.billing.checkout.$post({ json: { planId } });
    if (!res.ok) {
      setBusy(false);
      return setMessage(t("pricing.error"));
    }
    const { redirectUrl } = await res.json();
    openCheckout(redirectUrl);
  }

  async function startTrial() {
    setBusy(true);
    const res = await api.api.billing.trial.$post();
    setBusy(false);
    if (res.status === 409) return setMessage(t("pricing.trialUsed"));
    if (!res.ok) return setMessage(t("pricing.error"));
    await refresh();
  }

  return (
    <Screen>
      <Text role="heading" style={styles.title}>
        {t("pricing.title")}
      </Text>
      <Text style={styles.body}>{t("pricing.subtitle")}</Text>
      {product.plans.map((plan) => (
        <View key={plan.id} style={styles.card}>
          {plan.highlight ? <Text style={styles.badge}>{t("pricing.best")}</Text> : null}
          <Text style={styles.cardTitle}>{plan.label}</Text>
          <Text style={styles.price}>{idr(plan.priceIdr)}</Text>
          <Button label={`${t("pricing.buy")} ${idr(plan.priceIdr)}`} onPress={() => buy(plan.id)} disabled={busy} />
        </View>
      ))}
      {product.trial.enabled && !me.data?.access ? (
        <Button
          variant="ghost"
          label={`${t("pricing.trial")} (${product.trial.days} ${t("pricing.trialDays")})`}
          onPress={startTrial}
          disabled={busy}
        />
      ) : null}
      {message ? <Text style={styles.error}>{message}</Text> : null}
    </Screen>
  );
}
