import { Button, Card, CardDescription, CardHeader, CardTitle, Text } from "@factory/ui";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import product from "../../../../../product.config";
import { track } from "../analytics";
import { productMessage, useI18n } from "../i18n";
import { appLink, copyText, dismissOffer, offerDismissed, promptInstall, useInstallKind } from "./install";
import type { InstallKind } from "./rules";

// "Pasang di HP" (D-080), web only: install-card.tsx renders nothing on native. One calm card at
// the moment the product picked (pwa.promptAfter), and a link in Akun for later. Nothing shows
// where installing isn't possible: already installed, desktop Firefox, Chrome before its event.

export type InstallPlacement = "payment" | "first_result";

const withName = (s: string) => s.replaceAll("{name}", product.name);

/** The guide (iOS) or the open-in-browser note (in-app browsers) under the card's sentence. */
function Steps({ kind }: { kind: InstallKind }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  if (kind === "ios") {
    return (
      <View className="gap-2" testID="pwa-ios-guide">
        <Text className="font-semibold">{t("pwa.ios.title")}</Text>
        {(["pwa.ios.step1", "pwa.ios.step2", "pwa.ios.step3"] as const).map((key, i) => (
          <View key={key} className="flex-row gap-2">
            <Text className="font-semibold">{i + 1}.</Text>
            <Text className="flex-1">{withName(t(key))}</Text>
          </View>
        ))}
        <Text variant="muted">{t("pwa.ios.signIn")}</Text>
      </View>
    );
  }
  if (kind === "inapp") {
    return (
      <View className="gap-3" testID="pwa-inapp">
        <Text>{t("pwa.inappHint")}</Text>
        <Text selectable className="text-muted-foreground">
          {appLink()}
        </Text>
        <Button
          className="min-h-11"
          onPress={async () => {
            setCopied(await copyText(appLink()));
          }}
        >
          <Text>{t("pwa.copy")}</Text>
        </Button>
        {copied ? (
          <Text variant="muted" accessibilityLiveRegion="polite">
            {t("pwa.copied")}
          </Text>
        ) : null}
      </View>
    );
  }
  return null;
}

/**
 * The offer card, when pwa.promptAfter is this placement: "payment" (core's payment success screen)
 * or "first_result" (core's UpgradePrompt, under the product's first result). Products may render
 * it elsewhere too. "Nanti saja" hides it for 14 days.
 */
export function InstallOffer({ placement }: { placement: InstallPlacement }) {
  const { t, locale } = useI18n();
  const kind = useInstallKind();
  const [hidden, setHidden] = useState(() => offerDismissed());
  const [guide, setGuide] = useState(false);
  const show = product.pwa.promptAfter === placement && kind !== null && !hidden;
  const shown = useRef(false);
  useEffect(() => {
    if (!show || shown.current) return;
    shown.current = true;
    track("pwa_prompt_shown", { kind, placement });
  }, [show, kind, placement]);
  if (!show || !kind) return null;

  const later = () => {
    dismissOffer();
    setHidden(true);
    track("pwa_prompt_dismissed", { kind, placement });
  };
  const install = async () => {
    track("pwa_prompt_accepted", { kind, placement });
    if (kind !== "prompt") return setGuide(true);
    const outcome = await promptInstall();
    // Declined in the browser's dialog: same as "Nanti saja" (Chrome won't ask again soon either).
    if (outcome === "dismissed") later();
  };

  return (
    <Card testID="pwa-offer" className="w-full">
      <CardHeader>
        <CardTitle>{withName(productMessage("productPwa.offer", locale) ?? t("pwa.offer"))}</CardTitle>
        {kind === "inapp" ? <CardDescription>{t("pwa.inapp")}</CardDescription> : null}
      </CardHeader>
      {kind === "inapp" || guide ? <Steps kind={kind} /> : null}
      <View className="gap-2">
        {kind === "inapp" || guide ? null : (
          <Button className="min-h-11" onPress={install}>
            <Text>{t("pwa.install")}</Text>
          </Button>
        )}
        <Button variant="ghost" className="min-h-11" onPress={later}>
          <Text>{t("pwa.later")}</Text>
        </Button>
      </View>
    </Card>
  );
}

/** "Pasang di HP" in Akun: always there where installing is possible, whatever was dismissed. */
export function InstallAccountLink() {
  const { t } = useI18n();
  const kind = useInstallKind();
  const [open, setOpen] = useState(false);
  if (!kind) return null;
  return (
    <Card testID="pwa-account">
      <Button
        variant="outline"
        className="min-h-11"
        onPress={async () => {
          track("pwa_prompt_accepted", { kind, placement: "account" });
          if (kind === "prompt") await promptInstall();
          else setOpen(true);
        }}
      >
        <Text>{t("pwa.account")}</Text>
      </Button>
      {open ? (
        <View className="gap-2">
          {kind === "inapp" ? <Text className="font-semibold">{t("pwa.inapp")}</Text> : null}
          <Steps kind={kind} />
        </View>
      ) : null}
    </Card>
  );
}
