import { comparedPlan, highlightedPlan, methodLabel, perWeekIdr, savingVs } from "@factory/core/pricing";
import { Badge, Button, Card, CardDescription, CardHeader, CardTitle, ErrorText, Text } from "@factory/ui";
import { useState } from "react";
import { Platform, View } from "react-native";
import product from "../../../../../product.config";
import { slots } from "../../features/slots";
import { track } from "../analytics";
import { api } from "../api";
import { formatIdr } from "../format";
import { useI18n } from "../i18n";
import { fbIds } from "../marketing";
import { openCheckout } from "./open-checkout";
import { showsWebPrices } from "./web-prices";

/**
 * The plans from product.config.ts with small-unit framing (D-037): price, "≈ Rp…/minggu", the
 * highlighted plan (configured, else the longest) with its saving against the next shorter one,
 * and the real payment methods. Web only: native builds never show prices (Section 6b).
 */
export function PlanCards() {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const best = highlightedPlan(product.plans);
  // Store rules (Section 6b), enforced here too, whatever a product's planCard slot renders.
  if (!showsWebPrices(Platform.OS)) return null;
  const PlanSlot = slots.planCard;

  async function buy(planId: string) {
    setBusy(true);
    setMessage(null);
    track("checkout_start", { plan: planId });
    const res = await api.api.billing.checkout.$post({ json: { planId, ...fbIds() } });
    if (!res.ok) {
      setBusy(false);
      return setMessage(t(res.status === 503 ? "pricing.unavailable" : "pricing.error"));
    }
    openCheckout((await res.json()).redirectUrl);
  }

  return (
    <View className="gap-4">
      {product.plans.map((plan) => {
        const highlighted = plan.id === best?.id;
        const base = highlighted ? comparedPlan(product.plans, plan) : undefined;
        const saving = base ? savingVs(plan, base) : null;
        if (PlanSlot) {
          return (
            <PlanSlot
              key={plan.id}
              plan={{ id: plan.id, label: plan.label, months: plan.months }}
              price={formatIdr(plan.priceIdr)}
              perWeek={`≈ ${formatIdr(perWeekIdr(plan))}${t("pricing.perWeek")}`}
              highlighted={highlighted}
              saving={
                saving && base
                  ? `${t("pricing.save")} ${formatIdr(saving.idr)} (${saving.percent}%) ${t("pricing.vs")} ${base.label}`
                  : null
              }
              bestLabel={t("pricing.best")}
              buyLabel={`${t("pricing.buy")} ${formatIdr(plan.priceIdr)}`}
              onBuy={() => void buy(plan.id)}
              busy={busy}
            />
          );
        }
        return (
          <Card key={plan.id} className={highlighted ? "border-2 border-primary" : undefined}>
            <CardHeader>
              <View className="flex-row flex-wrap gap-2">
                {highlighted ? <Badge>{t("pricing.best")}</Badge> : null}
                {saving && base ? (
                  <Badge className="bg-secondary text-secondary-foreground">
                    {`${t("pricing.save")} ${formatIdr(saving.idr)} (${saving.percent}%) ${t("pricing.vs")} ${base.label}`}
                  </Badge>
                ) : null}
              </View>
              <CardTitle>{plan.label}</CardTitle>
              <Text className="text-3xl font-extrabold text-foreground">{formatIdr(plan.priceIdr)}</Text>
              <CardDescription>{`≈ ${formatIdr(perWeekIdr(plan))}${t("pricing.perWeek")}`}</CardDescription>
            </CardHeader>
            <Button variant={highlighted ? "default" : "outline"} onPress={() => buy(plan.id)} disabled={busy}>
              <Text>{`${t("pricing.buy")} ${formatIdr(plan.priceIdr)}`}</Text>
            </Button>
          </Card>
        );
      })}
      <View className="gap-1">
        <Text variant="muted">{t("pricing.methods")}</Text>
        <View className="flex-row flex-wrap gap-2">
          {product.payments.methods.map((m) => (
            <View key={m} className="rounded-md border border-border px-2 py-1">
              <Text className="text-xs font-semibold text-foreground">{methodLabel(m)}</Text>
            </View>
          ))}
        </View>
      </View>
      {message ? <ErrorText>{message}</ErrorText> : null}
    </View>
  );
}
