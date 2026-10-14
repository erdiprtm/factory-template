import { Checkbox, Text } from "@factory/ui";
import { Linking, Platform, View } from "react-native";
import product from "../../../../../product.config";
import { type MessageKey, productMessage, useI18n } from "../i18n";
import type { ConsentType } from "./consent-rules";
import { legalUrls } from "./legal-links";

/** "single" (D-074): one box for every required consent; "separate": one per document. */
export const consentStyle = product.legal.consentStyle;

/**
 * The consent checkboxes and links to the documents, core-owned wherever they're shown (/consent,
 * the pre-signup screen, the inline quiz row): slots can't render or skip them (UU PDP, D-054).
 * Never pre-checked. With "single", one tick checks every needed type, so canAccept and the
 * server record each document at its version, as before.
 */
export function ConsentChecks({
  needed,
  checked,
  onChange,
}: {
  needed: readonly ConsentType[];
  checked: Readonly<Record<string, boolean>>;
  onChange: (next: Record<string, boolean>) => void;
}) {
  const { t, locale } = useI18n();
  const boxes =
    consentStyle === "single" ? (
      <Checkbox
        label={singleSentence(needed, locale, t)}
        checked={needed.every((c) => checked[c] === true)}
        onCheckedChange={(v) => onChange(Object.fromEntries(needed.map((c) => [c, v])))}
      />
    ) : (
      needed.map((c) => (
        <Checkbox
          key={c}
          label={t(`consent.${c}` as MessageKey)}
          checked={Boolean(checked[c])}
          onCheckedChange={(v) => onChange({ ...checked, [c]: v })}
        />
      ))
    );
  return (
    <View className="gap-1">
      {boxes}
      <View className="flex-row flex-wrap gap-x-3 gap-y-1 pl-9">
        <Text variant="muted">{t("consent.read")}</Text>
        <DocLink href={legalUrls.terms} label={t("consent.termsDoc")} />
        <DocLink href={legalUrls.privacy} label={t("consent.privacyDoc")} />
      </View>
    </View>
  );
}

/**
 * The one sentence. With health data it must name the data and the purpose in plain words: the
 * product's own `productConsent.single` (features/messages.ts) when it has one, else core's.
 */
export function singleSentence(
  needed: readonly ConsentType[],
  locale: "id" | "en",
  t: (key: MessageKey) => string,
): string {
  const sensitive = needed.includes("sensitive_data");
  return (
    productMessage(sensitive ? "productConsent.single" : "productConsent.singleNoHealth", locale) ??
    t(sensitive ? "consent.singleSensitive" : "consent.single")
  );
}

function DocLink({ href, label }: { href: string; label: string }) {
  return (
    <Text
      role="link"
      className="text-primary underline"
      // Web: a real link that opens a new tab, so the quiz stays where it is. Native: the browser.
      {...(Platform.OS === "web"
        ? ({ href, hrefAttrs: { target: "_blank", rel: "noopener" } } as object)
        : { onPress: () => void Linking.openURL(href) })}
    >
      {label}
    </Text>
  );
}
