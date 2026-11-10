import { Button, ErrorText, Text } from "@factory/ui";
import { useCallback, useState } from "react";
import { View } from "react-native";
import { api } from "../api";
import { useRefreshMe } from "../auth/use-me";
import { useI18n } from "../i18n";

export type PaymentCheckResult = {
  paymentId: string | null;
  status: string | null;
  /** False: this provider is only told by webhook (Duitku), nothing was asked. */
  checked: boolean;
  accessUntil: string | null;
  retryAfterSec: number | null;
};

/**
 * "Saya sudah bayar, cek status" (D-128): asks the provider now (throttled per payment on the
 * server) and settles a paid payment like its webhook would. Without `paymentId` it checks the
 * user's newest unpaid payments of the last day. Products' pending cards call this before
 * offering a new checkout, so a buyer whose payment we missed isn't sent to pay again.
 */
export function usePaymentCheck() {
  const refreshMe = useRefreshMe();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PaymentCheckResult | null>(null);
  const [failed, setFailed] = useState(false);
  const check = useCallback(
    async (paymentId?: string): Promise<PaymentCheckResult | null> => {
      setBusy(true);
      setFailed(false);
      try {
        const res = await api.api.billing.check.$post({ json: paymentId ? { paymentId } : {} });
        if (!res.ok) throw new Error(`check ${res.status}`);
        const body = (await res.json()) as PaymentCheckResult;
        setResult(body);
        if (body.status === "paid") refreshMe();
        return body;
      } catch {
        setFailed(true);
        return null;
      } finally {
        setBusy(false);
      }
    },
    [refreshMe],
  );
  return { check, busy, result, failed };
}

/** The message for a check's answer, for products that render their own button. */
export function paymentCheckMessage(t: ReturnType<typeof useI18n>["t"], r: PaymentCheckResult): string {
  if (r.status === "paid") return t("billing.check.paid");
  if (!r.paymentId) return t("billing.check.none");
  if (!r.checked) return t("billing.check.webhookOnly");
  if (r.retryAfterSec) return t("billing.check.wait").replace("{seconds}", String(r.retryAfterSec));
  return t("billing.check.pending");
}

/** The ready-made button + message. `onPaid` runs once the check found the payment paid. */
export function PaymentCheckButton({
  paymentId,
  onPaid,
  variant = "default",
}: {
  paymentId?: string;
  onPaid?: (r: PaymentCheckResult) => void;
  variant?: "default" | "outline";
}) {
  const { t } = useI18n();
  const { check, busy, result, failed } = usePaymentCheck();
  async function press() {
    const r = await check(paymentId);
    if (r?.status === "paid") onPaid?.(r);
  }
  return (
    <View className="gap-2">
      <Button testID="billing-check" variant={variant} onPress={press} disabled={busy}>
        <Text>{t(busy ? "billing.check.checking" : "billing.check.button")}</Text>
      </Button>
      {failed ? <ErrorText>{t("common.error")}</ErrorText> : null}
      {result && !busy ? (
        <Text variant="muted" accessibilityLiveRegion="polite" className="text-center">
          {paymentCheckMessage(t, result)}
        </Text>
      ) : null}
    </View>
  );
}
