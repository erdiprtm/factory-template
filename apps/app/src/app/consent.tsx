import { Redirect, useRouter } from "expo-router";
import { useState } from "react";
import { Switch, Text } from "react-native";
import { acceptConsents } from "../core/api";
import { useMe, useRefreshMe } from "../core/auth/use-me";
import { type MessageKey, t } from "../core/i18n";
import { Button, Loading, Screen, styles } from "../core/ui";

type Consent = "terms" | "privacy" | "sensitive_data";

export default function ConsentScreen() {
  const me = useMe();
  const refresh = useRefreshMe();
  const router = useRouter();
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [failed, setFailed] = useState(false);

  if (me.isPending) return <Loading />;
  if (!me.data?.user) return <Redirect href="/sign-in" />;
  const needed = me.data.missingConsents as Consent[];
  if (needed.length === 0) return <Redirect href="/" />;

  const allChecked = needed.every((c) => checked[c]);

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
    <Screen>
      <Text role="heading" style={styles.title}>
        {t("consent.title")}
      </Text>
      <Text style={styles.body}>{t("consent.subtitle")}</Text>
      {needed.map((c) => (
        <Text key={c} style={styles.row}>
          <Switch
            accessibilityLabel={t(`consent.${c}` as MessageKey)}
            value={Boolean(checked[c])}
            onValueChange={(v) => setChecked((s) => ({ ...s, [c]: v }))}
          />
          <Text style={styles.body}>{t(`consent.${c}` as MessageKey)}</Text>
        </Text>
      ))}
      {failed ? <Text style={styles.error}>{t("consent.error")}</Text> : null}
      <Button label={t("consent.continue")} onPress={submit} disabled={!allChecked} />
    </Screen>
  );
}
