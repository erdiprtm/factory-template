import { Button, CenteredScreen, Text } from "@factory/ui";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator } from "react-native";
import { slots } from "../../features/slots";
import { api } from "../api";
import { useRefreshMe } from "../auth/use-me";
import { formatDate } from "../format";
import { useI18n } from "../i18n";
import { metaTrack } from "../marketing";
import { InstallOffer } from "../pwa/install-card";

const POLL_MS = 2000;
const TIMEOUT_MS = 90_000;

/** Back from the provider. Polls our API (never trusts the redirect's resultCode). */
export function BillingReturn() {
  const { t, locale } = useI18n();
  const { paymentId } = useLocalSearchParams<{ paymentId?: string }>();
  const router = useRouter();
  const refreshMe = useRefreshMe();
  // Without a payment id there is nothing to check: straight to the way out (D-124).
  const [timedOut, setTimedOut] = useState(!paymentId);
  const [offering, setOffering] = useState(false);

  // A new wait each time "Cek lagi" clears the timeout.
  useEffect(() => {
    if (!paymentId || timedOut) return;
    const timer = setTimeout(() => setTimedOut(true), TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [paymentId, timedOut]);

  const status = useQuery({
    queryKey: ["billing-status", paymentId],
    enabled: Boolean(paymentId),
    queryFn: async () => {
      const res = await api.api.billing.status.$get({ query: { paymentId: paymentId ?? "" } });
      if (!res.ok) throw new Error(`status ${res.status}`);
      return res.json();
    },
    refetchInterval: (q) => (q.state.data?.status === "pending" && !timedOut ? POLL_MS : false),
  });

  const state = status.data?.status;
  const event = status.data?.event;
  const amountIdr = status.data?.amountIdr;
  const untilIso = state === "paid" ? (status.data?.accessUntil ?? null) : null;
  const until = untilIso ? formatDate(untilIso, locale) : null;
  useEffect(() => {
    if (state === "paid") refreshMe();
    // purchase / renewal / payment_failed are sent by the server when the webhook lands (D-030).
    // The Pixel gets the same event with the payment id, deduplicated against the CAPI one (D-034).
    if (state === "paid" && event && paymentId) metaTrack(event, { value: amountIdr, currency: "IDR" }, paymentId);
  }, [state, event, amountIdr, paymentId, refreshMe]);

  let text = t("billing.return.checking");
  if (state === "paid") text = t("billing.return.paid");
  else if (state === "failed" || state === "expired") text = t("billing.return.failed");
  else if (timedOut) text = t("billing.return.timeout");
  const done = Boolean(state && state !== "pending");
  // Still pending after the wait, or no payment id: never a dead end (D-124). "Cek lagi" polls for
  // another round; "Ke beranda" leaves, and Akun shows the payment once the provider confirms it.
  const stuck = timedOut && !done;
  const retry =
    stuck && paymentId
      ? () => {
          setTimedOut(false);
          void status.refetch();
        }
      : null;
  const goHome = () => router.replace("/");
  const Slot = slots.billingReturn;
  if (Slot) {
    const shown =
      state === "paid"
        ? "paid"
        : state === "failed" || state === "expired"
          ? "failed"
          : timedOut
            ? "timeout"
            : "checking";
    return (
      <CenteredScreen className="items-center">
        <Slot
          state={shown}
          text={text}
          done={done}
          showHome={done || stuck}
          homeLabel={t("billing.return.home")}
          onHome={goHome}
          onRetry={retry}
          retryLabel={t("billing.return.retry")}
          accessUntil={until}
          accessUntilIso={untilIso}
        />
        {state === "paid" ? <InstallOffer placement="payment" onShownChange={setOffering} /> : null}
      </CenteredScreen>
    );
  }

  return (
    <CenteredScreen className="items-center">
      {!done && !timedOut ? <ActivityIndicator /> : null}
      <Text variant={state === "paid" ? "h2" : "lead"} accessibilityLiveRegion="polite" className="text-center">
        {text}
      </Text>
      {until ? <Text variant="muted" className="text-center">{`${t("billing.return.until")} ${until}`}</Text> : null}
      {retry ? (
        <Button testID="billing-retry" onPress={retry}>
          <Text>{t("billing.return.retry")}</Text>
        </Button>
      ) : null}
      {done || stuck ? (
        // With the install card (or "Cek lagi") on screen, that is the one filled button (D-081).
        <Button testID="billing-home" variant={offering || retry ? "outline" : "default"} onPress={goHome}>
          <Text>{t("billing.return.home")}</Text>
        </Button>
      ) : null}
      {/* pwa.promptAfter "payment" (D-080): "Pasang di HP", right after the success. */}
      {state === "paid" ? <InstallOffer placement="payment" onShownChange={setOffering} /> : null}
    </CenteredScreen>
  );
}
