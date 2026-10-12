import { Button, CenteredScreen, Checkbox, ErrorText, Loading, Text } from "@factory/ui";
import { type ReactNode, useState } from "react";
import { View } from "react-native";
import { acceptAnonymousConsents } from "../api";
import { type MessageKey, useI18n } from "../i18n";
import { useMe, useRefreshMe } from "./use-me";

type Consent = "terms" | "privacy" | "sensitive_data";

/**
 * Consent before signup (D-043). Wrap a PUBLIC screen that processes a visitor's data (the quiz, the
 * product's anonymous entry screen) in it: a visitor who hasn't accepted the required documents on
 * this device sees the checkboxes first. Signed-in users pass straight through (the protected
 * area has its own /consent). The API enforces the same rule (403 consent_required).
 */
export function AnonymousConsentGate({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const me = useMe();
  const refresh = useRefreshMe();
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [failed, setFailed] = useState(false);

  if (me.isPending) return <Loading label={t("common.loading")} />;
  const needed = (me.data?.user ? [] : (me.data?.missingConsents ?? [])) as Consent[];
  if (needed.length === 0) return <>{children}</>;

  async function submit() {
    setFailed(false);
    try {
      await acceptAnonymousConsents(needed);
      await refresh();
    } catch {
      setFailed(true);
    }
  }

  return (
    <CenteredScreen>
      <View className="gap-2">
        <Text variant="h1">{t("consent.title")}</Text>
        <Text variant="lead">{t("consent.subtitle")}</Text>
      </View>
      <View className="gap-1">
        {needed.map((c) => (
          <Checkbox
            key={c}
            label={t(`consent.${c}` as MessageKey)}
            checked={Boolean(checked[c])}
            onCheckedChange={(v) => setChecked((s) => ({ ...s, [c]: v }))}
          />
        ))}
      </View>
      {failed ? <ErrorText>{t("consent.error")}</ErrorText> : null}
      <Button testID="anon-consent-continue" onPress={submit} disabled={!needed.every((c) => checked[c])}>
        <Text>{t("consent.continue")}</Text>
      </Button>
    </CenteredScreen>
  );
}
