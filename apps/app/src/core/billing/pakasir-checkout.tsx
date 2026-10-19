import { methodLabel } from "@factory/core/pricing";
import { Button, Card, CardContent, CardHeader, CardTitle, ErrorText, Separator, Text } from "@factory/ui";
import { ActivityIndicator, View } from "react-native";
import { formatIdr } from "../format";
import { useI18n } from "../i18n";
import { QrCode } from "./qr-code";

/** "4:05" or "1:02:09": what's left to pay, never negative. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

export type PakasirCheckoutProps = {
  method: string;
  qrString: string | null;
  vaNumber: string | null;
  amountIdr: number;
  feeIdr: number;
  totalIdr: number;
  isSandbox: boolean;
  /** ms until our expiry; ≤ 0 shows the expired state. */
  remainingMs: number;
  checking: boolean;
  /** Set after a manual "Cek status" that found nothing yet. */
  stillPending: boolean;
  copied: boolean;
  onCheck: () => void;
  onCopy: () => void;
  onChangeMethod: () => void;
  onAgain: () => void;
};

/**
 * The app's own checkout for Pakasir (D-092): the QR drawn on the device, or the VA number with
 * copy; the plan price, the provider's fee and the total to pay; a countdown; "Cek status"
 * (the screen also polls by itself). Pure: the screen (signed-in/billing-pay.tsx) owns the data.
 */
export function PakasirCheckout(props: PakasirCheckoutProps) {
  const { t } = useI18n();
  const expired = props.remainingMs <= 0;
  const name = methodLabel(props.method);

  if (expired) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("billing.pay.title")}</CardTitle>
        </CardHeader>
        <CardContent className="gap-4">
          <Text accessibilityLiveRegion="polite">{t("billing.pay.expired")}</Text>
          <Button onPress={props.onAgain}>
            <Text>{t("billing.pay.again")}</Text>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("billing.pay.with").replace("{name}", name)}</CardTitle>
      </CardHeader>
      <CardContent className="gap-4">
        {props.isSandbox ? <Text variant="muted">{t("billing.pay.sandbox")}</Text> : null}
        {props.qrString ? (
          <View className="items-center gap-2">
            <QrCode value={props.qrString} label={t("billing.pay.qrLabel")} />
            <Text className="text-center">{t("billing.pay.scanQris")}</Text>
          </View>
        ) : null}
        {props.vaNumber ? (
          <View className="gap-2">
            <Text>{t("billing.pay.vaIntro")}</Text>
            <Text variant="muted">{t("billing.pay.vaNumber")}</Text>
            <Text testID="va-number" selectable className="text-2xl font-extrabold tracking-wider text-foreground">
              {props.vaNumber}
            </Text>
            <Button variant="outline" onPress={props.onCopy}>
              <Text>{props.copied ? t("billing.pay.copied") : t("billing.pay.copy")}</Text>
            </Button>
          </View>
        ) : null}
        <Separator />
        <View className="gap-1">
          <View className="flex-row justify-between">
            <Text variant="muted">{t("billing.pay.price")}</Text>
            <Text>{formatIdr(props.amountIdr)}</Text>
          </View>
          <View className="flex-row justify-between">
            <Text variant="muted">{t("billing.pay.fee")}</Text>
            <Text>{formatIdr(props.feeIdr)}</Text>
          </View>
          <View className="flex-row justify-between">
            <Text className="font-semibold text-foreground">{t("billing.pay.total")}</Text>
            <Text testID="total-to-pay" className="text-xl font-extrabold text-foreground">
              {formatIdr(props.totalIdr)}
            </Text>
          </View>
          <Text variant="muted">{t("billing.pay.exact")}</Text>
        </View>
        <View className="flex-row items-center justify-between">
          <Text variant="muted">{t("billing.pay.timeLeft")}</Text>
          <Text testID="countdown" className="font-semibold text-foreground">
            {formatCountdown(props.remainingMs)}
          </Text>
        </View>
        <View className="flex-row items-center gap-2">
          <ActivityIndicator />
          <Text variant="muted" className="flex-1">
            {t("billing.pay.waiting")}
          </Text>
        </View>
        {props.stillPending ? <ErrorText>{t("billing.pay.stillPending")}</ErrorText> : null}
        <Button onPress={props.onCheck} disabled={props.checking}>
          <Text>{props.checking ? t("billing.pay.checking") : t("billing.pay.check")}</Text>
        </Button>
        <Button variant="ghost" onPress={props.onChangeMethod} disabled={props.checking}>
          <Text>{t("billing.pay.changeMethod")}</Text>
        </Button>
      </CardContent>
    </Card>
  );
}
