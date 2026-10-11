import { Button, CenteredScreen, Checkbox, ErrorText, Loading, Text } from "@factory/ui";
import { Redirect, useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { acceptConsents } from "../core/api";
import { useMe, useRefreshMe } from "../core/auth/use-me";
import { type MessageKey, useI18n } from "../core/i18n";

type Consent = "terms" | "privacy" | "sensitive_data";

export default function ConsentScreen() {
  const { t } = useI18n();
  const me = useMe();
  const refresh = useRefreshMe();
  const router = useRouter();
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [failed, setFailed] = useState(false);

  if (me.isPending) return <Loading label={t("common.loading")} />;
  if (!me.data?.user) return <Redirect href="/sign-in" />;
  const needed = me.data.missingConsents as Consent[];
  if (needed.length === 0) return <Redirect href="/" />;

  async function submit() {
    setFailed(false);
    try {
      await acceptConsents(needed);
      await refresh();
      router.replace("/");
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
      <Button onPress={submit} disabled={!needed.every((c) => checked[c])}>
        <Text>{t("consent.continue")}</Text>
      </Button>
    </CenteredScreen>
  );
}
