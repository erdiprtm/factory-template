import { Button, Card, CardContent, ErrorText, Input, Loading, Screen, Text } from "@factory/ui";
import { Redirect, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Platform, ScrollView, View } from "react-native";
import { slots } from "../../features/slots";
import { api } from "../api";
import { currentTouch, trackFunnel } from "../attribution";
import { legalUrls } from "../auth/legal-links";
import { showsWebPrices } from "../billing/web-prices";
import { formatIdr } from "../format";
import { useI18n } from "../i18n";
import { fbIds, marketingChoice } from "../marketing";
import type { DigitalBuyState } from "../slots";

// One-time digital purchases (D-130), web only like every web price: screens.tsx (native) sends
// home. The buy page takes an email, then hands over to the provider's hosted page; the provider
// returns to the thank-you page, which polls until paid and shows the download.
//
// Slots (D-131): a product draws both pages (digitalBuy, digitalThanks) around core's own pieces:
// the email field, the "Bayar <price>" button and the "Dengan klik Bayar, kamu setuju…" line on the
// buy page; the download and the resend form on the thank-you page. Core keeps the logic, and a
// test in every product checks its slot still shows those pieces.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BUY_CONSENTS = ["terms", "privacy"] as const;

type Product = { id: string; label: string; priceIdr: number };

/** /beli/<id>: the product, the buyer's email, the consents, and "Bayar". */
export function BuyScreen() {
  const { t } = useI18n();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [product, setProduct] = useState<Product | null | undefined>(undefined);
  const [email, setEmail] = useState("");
  const [state, setState] = useState<DigitalBuyState>("idle");

  useEffect(() => {
    void api.api.products
      .$get()
      .then((r) => r.json())
      .then((r) => {
        const found = r.products.find((p) => p.id === id) ?? null;
        setProduct(found);
        // D-133: the buy page was shown, first-party with its path, for a lander → /beli funnel.
        if (found) trackFunnel("buy_view");
      })
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

  const ready = email.trim() !== "";
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
        // "Dengan klik Bayar, kamu setuju…" under the button is the agreement (as in Ratio's
        // checkout); marketing only when this device already said yes to the ads banner (D-034).
        accept: [...BUY_CONSENTS, ...(marketingChoice() === "granted" ? (["marketing"] as const) : [])],
        ...(touch ? { touch } : {}),
        ...fbIds(),
      },
    };
    const res = await api.api.products[":id"].checkout.$post(input).catch(() => null);
    const body = res?.ok ? await res.json() : null;
    if (!body || !("redirectUrl" in body)) return setState("error");
    window.location.assign(body.redirectUrl);
  }

  const priceText = formatIdr(product.priceIdr);
  const emailField = (
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
  );
  const payButton = (
    <View className="gap-2">
      {state === "error" ? <ErrorText>{t("digital.payError")}</ErrorText> : null}
      <Button
        testID="buy-pay"
        className={slots.digitalPayClassName}
        onPress={() => void pay()}
        disabled={!ready || state === "paying"}
      >
        <Text className={slots.digitalPayTextClassName}>
          {state === "paying" ? t("digital.paying") : `${t("digital.pay")} ${priceText}`}
        </Text>
      </Button>
    </View>
  );
  const agree = (
    <Text variant="muted" className="text-sm" testID="buy-agree">
      {`${t("digital.agree")} `}
      <Doc href={legalUrls.terms} label={t("consent.termsDoc")} />
      {` ${t("digital.and")} `}
      <Doc href={legalUrls.privacy} label={t("consent.privacyDoc")} />
      {"."}
    </Text>
  );
  const Slot = slots.digitalBuy;
  if (Slot)
    return (
      <SlotScroll>
        <Slot
          product={{ id: product.id, label: product.label, priceIdr: product.priceIdr, priceText }}
          state={state}
          emailField={emailField}
          payButton={payButton}
          agree={agree}
          t={t}
        />
      </SlotScroll>
    );
  return (
    <Screen className="max-w-xl">
      <View className="gap-1">
        <Text variant="h2" role="heading">
          {product.label}
        </Text>
        <Text variant="lead">{priceText}</Text>
      </View>
      {emailField}
      {payButton}
      {agree}
    </Screen>
  );
}

/**
 * The page's scroll container around a product's slot (D-131). The web export locks
 * `body { overflow: hidden }` (expo-reset), so without it a long page can't scroll on iPhone Safari
 * (desktop Chromium scrolls anyway, which is how it slipped past E2E). Slots need no ScrollView of their own.
 */
function SlotScroll({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView testID="digital-scroll" className="flex-1 bg-background" contentContainerClassName="grow">
      {children}
    </ScrollView>
  );
}

function Doc({ href, label }: { href: string; label: string }) {
  return (
    <Text
      role="link"
      className="text-sm text-link underline"
      {...({ href, hrefAttrs: { target: "_blank", rel: "noopener" } } as object)}
    >
      {label}
    </Text>
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

  const Slot = slots.digitalThanks;
  if (Slot && data)
    return (
      <SlotScroll>
        <Slot
          status={data.status}
          slow={slow}
          product={data.product}
          email={data.email}
          download={data.status === "paid" ? <DownloadBlock data={data} /> : null}
          resend={data.status === "paid" ? <ResendForm /> : null}
          t={t}
        />
      </SlotScroll>
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
            <DownloadBlock data={data} />
          </CardContent>
        </Card>
      ) : (
        <Text variant="lead">{t("digital.thanks.failed")}</Text>
      )}
      {data?.status === "paid" ? <ResendForm /> : null}
    </Screen>
  );
}

/** Core's download piece: the button (or "link used up") and "also sent to <email>". */
function DownloadBlock({ data }: { data: Status }) {
  const { t } = useI18n();
  return (
    <View className="gap-3">
      {data.downloadUrl ? (
        <Button testID="download" onPress={() => window.location.assign(data.downloadUrl ?? "")}>
          <Text>{t("digital.thanks.download")}</Text>
        </Button>
      ) : (
        <Text variant="muted">{t("digital.thanks.linkUsed")}</Text>
      )}
      <Text variant="muted" testID="download-emailed">{`${t("digital.thanks.emailed")} ${data.email}`}</Text>
    </View>
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
