import { Button, CenteredScreen, Text } from "@factory/ui";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator } from "react-native";
import { api } from "../../../core/api";
import { useRefreshMe } from "../../../core/auth/use-me";
import { useI18n } from "../../../core/i18n";

const POLL_MS = 2000;
const TIMEOUT_MS = 90_000;

/** Back from the provider. Polls our API (never trusts the redirect's resultCode). */
export default function BillingReturn() {
  const { t } = useI18n();
  const { paymentId } = useLocalSearchParams<{ paymentId?: string }>();
  const router = useRouter();
  const refreshMe = useRefreshMe();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);

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
  useEffect(() => {
    if (state === "paid") refreshMe();
    // payment_paid / payment_failed are sent by the server when the webhook lands (D-030).
  }, [state, refreshMe]);

  let text = t("billing.return.checking");
  if (state === "paid") text = t("billing.return.paid");
  else if (state === "failed" || state === "expired") text = t("billing.return.failed");
  else if (timedOut) text = t("billing.return.timeout");
  const done = state && state !== "pending";

  return (
    <CenteredScreen className="items-center">
      {!done && !timedOut ? <ActivityIndicator /> : null}
      <Text variant={state === "paid" ? "h2" : "lead"} accessibilityLiveRegion="polite" className="text-center">
        {text}
      </Text>
      {done ? (
        <Button onPress={() => router.replace("/")}>
          <Text>{t("billing.return.home")}</Text>
        </Button>
      ) : null}
    </CenteredScreen>
  );
}
