import { CenteredScreen, Loading, Screen, Text } from "@factory/ui";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { api } from "../api";
import { PakasirCheckout } from "../billing/pakasir-checkout";
import { showsWebPrices } from "../billing/web-prices";
import { useI18n } from "../i18n";
import { copyText } from "../pwa/install";

// Pakasir allows one status request per transaction every 4 s; the API throttles per payment
// too (D-092). 5 s keeps the screen's own polls under that.
export const PAY_POLL_MS = 5000;

/**
 * The app's own checkout for Pakasir (D-092): /billing/pay?paymentId=… after a method was picked
 * on /pricing. Polls our status endpoint (which asks Pakasir, throttled); once paid it hands over
 * to /billing/return, which shows the success and fires the deduplicated Pixel event. When the
 * countdown ends, or the buyer picks another method, the transaction is cancelled at Pakasir.
 */
export function BillingPay() {
  const { t } = useI18n();
  const { paymentId } = useLocalSearchParams<{ paymentId?: string }>();
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  const [copied, setCopied] = useState(false);
  const [stillPending, setStillPending] = useState(false);
  const [manual, setManual] = useState(false);
  const cancelled = useRef(false);

  const charge = useQuery({
    queryKey: ["billing-charge", paymentId],
    enabled: Boolean(paymentId),
    queryFn: async () => {
      const res = await api.api.billing.charge.$get({ query: { paymentId: paymentId ?? "" } });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`charge ${res.status}`);
      return res.json();
    },
  });
  const expiresAt = charge.data ? new Date(charge.data.expiresAt).getTime() : null;
  const remainingMs = expiresAt === null ? 1 : expiresAt - now;
  const open = Boolean(charge.data) && charge.data?.status === "pending" && remainingMs > 0;

  const status = useQuery({
    queryKey: ["billing-status", paymentId],
    enabled: Boolean(paymentId) && Boolean(charge.data),
    queryFn: async () => {
      const res = await api.api.billing.status.$get({ query: { paymentId: paymentId ?? "" } });
      if (!res.ok) throw new Error(`status ${res.status}`);
      return res.json();
    },
    refetchInterval: (q) => (open && (q.state.data?.status ?? "pending") === "pending" ? PAY_POLL_MS : false),
  });
  const state = status.data?.status ?? charge.data?.status;

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Paid (by the webhook or our poll): the return page shows it and sends the Pixel event.
  useEffect(() => {
    if (state === "paid" && paymentId) router.replace(`/billing/return?paymentId=${paymentId}`);
  }, [state, paymentId, router]);

  async function cancel() {
    if (!paymentId || cancelled.current) return null;
    cancelled.current = true;
    const res = await api.api.billing.cancel.$post({ json: { paymentId } });
    return res.ok ? (await res.json()).status : null;
  }

  // Countdown over: close the transaction at Pakasir so the QR / VA can't be paid any more.
  useEffect(() => {
    if (expiresAt !== null && remainingMs <= 0 && state === "pending") {
      void cancel().then(() => status.refetch());
    }
  });

  if (!showsWebPrices(Platform.OS)) {
    // Store rules: no web checkout in native builds (Section 6b).
    return (
      <Screen>
        <Text variant="lead">{t("pricing.native")}</Text>
      </Screen>
    );
  }
  if (charge.isPending) return <Loading label={t("billing.return.checking")} />;
  if (!charge.data) {
    return (
      <CenteredScreen>
        <Text variant="lead">{t("billing.pay.notFound")}</Text>
      </CenteredScreen>
    );
  }
  const data = charge.data;
  const over = state === "expired" || state === "failed" || remainingMs <= 0;

  return (
    <Screen>
      <Text variant="h1">{t("billing.pay.title")}</Text>
      <PakasirCheckout
        method={data.method}
        qrString={data.qrString}
        vaNumber={data.vaNumber}
        amountIdr={data.amountIdr}
        feeIdr={data.feeIdr}
        totalIdr={data.totalIdr}
        isSandbox={data.isSandbox}
        remainingMs={over ? 0 : remainingMs}
        checking={manual}
        stillPending={stillPending}
        copied={copied}
        onCheck={async () => {
          setManual(true);
          const next = await status.refetch();
          setManual(false);
          setStillPending(next.data?.status === "pending");
        }}
        onCopy={async () => setCopied(data.vaNumber ? await copyText(data.vaNumber) : false)}
        onChangeMethod={async () => {
          const after = await cancel();
          if (after === "paid") return status.refetch();
          router.replace("/pricing");
        }}
        onAgain={() => router.replace("/pricing")}
      />
    </Screen>
  );
}
