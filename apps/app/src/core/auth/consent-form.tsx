import { Button, CenteredScreen, Checkbox, ErrorText, Text } from "@factory/ui";
import { useState } from "react";
import { View } from "react-native";
import { slots } from "../../features/slots";
import { type MessageKey, useI18n } from "../i18n";
import { type ConsentType, canAccept } from "./consent-rules";

/**
 * The required-consent form, shared by /consent and the pre-signup gate (D-043). A product's
 * `consentHeader` slot may restyle the title and subtitle only: the checkboxes, their legal text
 * and the accept button (disabled until all are checked) are always core's (UU PDP, D-054).
 */
export function ConsentForm({
  needed,
  where,
  onAccept,
  testID,
}: {
  needed: ConsentType[];
  where: "account" | "anonymous";
  onAccept: () => Promise<void>;
  testID?: string;
}) {
  const { t } = useI18n();
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [failed, setFailed] = useState(false);
  const Header = slots.consentHeader;
  const title = t("consent.title");
  const subtitle = t("consent.subtitle");

  async function submit() {
    if (!canAccept(needed, checked)) return;
    setFailed(false);
    try {
      await onAccept();
    } catch {
      setFailed(true);
    }
  }

  return (
    <CenteredScreen>
      {Header ? (
        <Header title={title} subtitle={subtitle} where={where} />
      ) : (
        <View className="gap-2">
          <Text variant="h1">{title}</Text>
          <Text variant="lead">{subtitle}</Text>
        </View>
      )}
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
      <Button testID={testID} onPress={submit} disabled={!canAccept(needed, checked)}>
        <Text>{t("consent.continue")}</Text>
      </Button>
    </CenteredScreen>
  );
}
