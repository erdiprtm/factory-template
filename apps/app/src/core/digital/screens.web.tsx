import { Button, Card, CardContent, Checkbox, ErrorText, Input, Loading, Screen, Text } from "@factory/ui";
import { Redirect, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Platform, View } from "react-native";
import { api } from "../api";
import { currentTouch } from "../attribution";
import { ConsentChecks } from "../auth/consent-checks";
import { showsWebPrices } from "../billing/web-prices";
import { formatIdr } from "../format";
import { useI18n } from "../i18n";

// One-time digital purchases (D-130), web only like every web price: screens.tsx (native) sends
// home. The buy
// page takes an email and the terms + privacy consent, then hands over to the provider's hosted
// page; the provider returns to the thank-you page, which polls until paid and shows the download.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BUY_CONSENTS = ["terms", "privacy"] as const;

type Product = { id: string; label: string; priceIdr: number };

/** /beli/<id>: the product, the buyer's email, the consents, and "Bayar". */
export function BuyScreen() {
  const { t } = useI18n();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [product, setProduct] = useState<Product | null | undefined>(undefined);
  const [email, setEmail] = useState("");
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [marketing, setMarketing] = useState(false);
  const [state, setState] = useState<"idle" | "paying" | "error" | "badEmail">("idle");

  useEffect(() => {
    void api.api.products
      .$get()
      .then((r) => r.json())
      .then((r) => setProduct(r.products.find((p) => p.id === id) ?? null))
      .catch(() => setProduct(null));
  }, [id]);

  if (!showsWebPrices(Platform.OS)) return <Redirect href="/" />;
  if (product === undefined) return <Loading label={t("common.loading")} />;
  if (product === null)
    return (
      <Screen className="max-w-xl">
        <Text variant="h2" role="heading">
          {t("digital.notFound")}
        </Text>
      </Screen>
    );

  const ready = BUY_CONSENTS.every((c) => checked[c]) && email.trim() !== "";
  async function pay() {
    if (!product) return;
    const address = email.trim();
    if (!EMAIL.test(address)) return setState("badEmail");
    setState("paying");
    const touch = currentTouch();
    // The route reads its JSON itself (no validator), so the typed client only knows `param`.
    const input = {
      param: { id: product.id },
      json: {
        email: address,
        accept: [...BUY_CONSENTS, ...(marketing ? (["marketing"] as const) : [])],
        ...(touch ? { touch } : {}),
      },
    };
    const res = await api.api.products[":id"].checkout.$post(input).catch(() => null);
    const body = res?.ok ? await res.json() : null;
    if (!body || !("redirectUrl" in body)) return setState("error");
    window.location.assign(body.redirectUrl);
  }

  return (
    <Screen className="max-w-xl">
      <View className="gap-1">
        <Text variant="h2" role="heading">
          {product.label}
        </Text>
        <Text variant="lead">{formatIdr(product.priceIdr)}</Text>
      </View>
      <View className="gap-2">
        <Text className="font-medium text-foreground">{t("digital.emailLabel")}</Text>
        <Input
          testID="buy-email"
          accessibilityLabel={t("digital.emailLabel")}
          inputMode="email"
          autoCapitalize="none"
          autoComplete="email"
          value={email}
          onChangeText={(v) => {
            setEmail(v);
            if (state === "badEmail") setState("idle");
          }}
        />
        <Text variant="muted">{t("digital.emailHint")}</Text>
        {state === "badEmail" ? <ErrorText>{t("digital.emailInvalid")}</ErrorText> : null}
      </View>
      <ConsentChecks needed={BUY_CONSENTS} checked={checked} onChange={setChecked} />
      <View className="pl-1">
        {/* Optional and never pre-checked, like the consents; it never blocks paying (D-034). */}
        <Checkbox label={t("digital.marketing")} checked={marketing} onCheckedChange={setMarketing} />
      </View>
      {state === "error" ? <ErrorText>{t("digital.payError")}</ErrorText> : null}
      <Button testID="buy-pay" onPress={() => void pay()} disabled={!ready || state === "paying"}>
        <Text>{state === "paying" ? t("digital.paying") : `${t("digital.pay")} ${formatIdr(product.priceIdr)}`}</Text>
      </Button>
    </Screen>
  );
}

type Status = {
  status: "pending" | "paid" | "failed" | "expired";
  product: { id: string; label: string };
  email: string;
  downloadUrl: string | null;
};

const POLL_MS = 3000;
const POLL_FOR_MS = 3 * 60_000;

/** /beli/terima-kasih?paymentId&k: waits for the payment, then the download and "sent to <email>". */
export function ThankYouScreen() {
  const { t } = useI18n();
  const { paymentId, k } = useLocalSearchParams<{ paymentId?: string; k?: string }>();
  const [data, setData] = useState<Status | null>(null);
  const [missing, setMissing] = useState(false);
  const [slow, setSlow] = useState(false);
  const started = useRef(Date.now());

  useEffect(() => {
    if (!paymentId || !k) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      const res = await api.api.products.status.$get({ query: { paymentId, k } }).catch(() => null);
      if (stop) return;
      if (res?.status === 404) return setMissing(true);
      const body = res?.ok ? ((await res.json()) as Status) : null;
      if (body) setData(body);
      if (body && body.status !== "pending") return;
      if (Date.now() - started.current > POLL_FOR_MS) return setSlow(true);
      timer = setTimeout(() => void tick(), POLL_MS);
    };
    void tick();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [paymentId, k]);

  if (!showsWebPrices(Platform.OS)) return <Redirect href="/" />;
  if (!paymentId || !k || missing)
    return (
      <Screen className="max-w-xl">
        <Text variant="lead">{t("digital.thanks.badLink")}</Text>
        <ResendForm />
      </Screen>
    );

  return (
    <Screen className="max-w-xl">
      <Text variant="h1" role="heading">
        {data?.status === "paid" ? t("digital.thanks.title") : (data?.product.label ?? t("digital.thanks.title"))}
      </Text>
      {!data || data.status === "pending" ? (
        <View className="gap-3">
          {slow ? (
            <Text variant="lead">{t("digital.thanks.slow")}</Text>
          ) : (
            <Loading label={t("digital.thanks.checking")} />
          )}
        </View>
      ) : data.status === "paid" ? (
        <Card>
          <CardContent className="gap-3">
            <Text className="font-medium text-foreground">{`${t("digital.thanks.paid")} ${data.product.label}`}</Text>
            {data.downloadUrl ? (
              <Button testID="download" onPress={() => window.location.assign(data.downloadUrl ?? "")}>
                <Text>{t("digital.thanks.download")}</Text>
              </Button>
            ) : (
              <Text variant="muted">{t("digital.thanks.linkUsed")}</Text>
            )}
            <Text variant="muted" testID="download-emailed">{`${t("digital.thanks.emailed")} ${data.email}`}</Text>
          </CardContent>
        </Card>
      ) : (
        <Text variant="lead">{t("digital.thanks.failed")}</Text>
      )}
      {data?.status === "paid" ? <ResendForm /> : null}
    </Screen>
  );
}

/** /beli/unduh?link=gone|invalid: where an old or unknown download link lands; asks for a new one. */
export function DownloadHelpScreen() {
  const { t } = useI18n();
  const { link } = useLocalSearchParams<{ link?: string }>();
  if (!showsWebPrices(Platform.OS)) return <Redirect href="/" />;
  return (
    <Screen className="max-w-xl">
      {link === "gone" || link === "invalid" ? (
        <Text variant="lead" testID="link-state">
          {t(link === "gone" ? "digital.link.gone" : "digital.link.invalid")}
        </Text>
      ) : null}
      <ResendForm />
    </Screen>
  );
}

/** "Kirim ulang link": the same answer whatever the email (the server never says who bought). */
function ResendForm() {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "badEmail" | "error">("idle");
  async function send() {
    const address = email.trim();
    if (!EMAIL.test(address)) return setState("badEmail");
    setState("sending");
    const res = await api.api.products.resend.$post({ json: { email: address } }).catch(() => null);
    setState(res?.ok ? "sent" : "error");
  }
  return (
    <Card>
      <CardContent className="gap-3">
        <Text className="font-medium text-foreground">{t("digital.resend.title")}</Text>
        <Text variant="muted">{t("digital.resend.body")}</Text>
        <Input
          testID="resend-email"
          accessibilityLabel={t("digital.emailLabel")}
          inputMode="email"
          autoCapitalize="none"
          autoComplete="email"
          value={email}
          onChangeText={(v) => {
            setEmail(v);
            setState("idle");
          }}
        />
        {state === "badEmail" ? <ErrorText>{t("digital.emailInvalid")}</ErrorText> : null}
        {state === "error" ? <ErrorText>{t("digital.payError")}</ErrorText> : null}
        {state === "sent" ? <Text testID="resend-sent">{t("digital.resend.sent")}</Text> : null}
        <Button
          testID="resend-send"
          variant="outline"
          onPress={() => void send()}
          disabled={email.trim() === "" || state === "sending"}
        >
          <Text>{t("digital.resend.send")}</Text>
        </Button>
      </CardContent>
    </Card>
  );
}
